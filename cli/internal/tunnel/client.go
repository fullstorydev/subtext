package tunnel

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math/rand/v2"
	"net/http"
	"net/url"
	"time"

	"github.com/gorilla/websocket"
)

// ErrNeedLiveTunnel is returned when the relay rejects the session (HTTP 401
// or handshake error). The caller must obtain a fresh relay URL via live-tunnel
// before retrying.
var ErrNeedLiveTunnel = errors.New("relay requires a new live-tunnel URL")

// ReadyInfo carries the tunnel identifiers sent back in the ready message.
type ReadyInfo struct {
	TunnelID     string
	ConnectionID string
	TraceID      string
}

// ClientOptions configures a TunnelClient.
type ClientOptions struct {
	RelayURL     string
	ConnectionID string      // optional: affinity routing hint
	Headers      http.Header // extra WebSocket upgrade headers
	// Validated allowlist patterns and their raw string form for the hello msg.
	AllowedOrigins    []OriginPattern
	AllowedOriginsRaw []string
	Log               func(string, ...any)
}

// Client manages the WebSocket tunnel connection lifecycle: connect, handshake,
// reconnect on transient drops, escalate on relay rejection.
type Client struct {
	opts ClientOptions
}

// NewClient returns a new Client.
func NewClient(opts ClientOptions) *Client {
	return &Client{opts: opts}
}

func (c *Client) log(format string, args ...any) {
	if c.opts.Log != nil {
		c.opts.Log(format, args...)
	}
}

// Run connects to the relay and keeps the tunnel open until ctx is cancelled
// or the relay requires a new URL (ErrNeedLiveTunnel). onReady is called each
// time the tunnel transitions to StateReady (including after reconnects).
func (c *Client) Run(ctx context.Context, onReady func(ReadyInfo)) error {
	var (
		resumeToken  string
		connectionID = c.opts.ConnectionID
		attempts     int
		connectedAt  time.Time
	)

	for {
		connectedAt = time.Now()
		err := c.runOnce(ctx, &resumeToken, &connectionID, onReady)

		if ctx.Err() != nil {
			return nil
		}
		if errors.Is(err, ErrNeedLiveTunnel) {
			return ErrNeedLiveTunnel
		}
		if err != nil {
			c.log("connection error: %v", err)
		}

		// Reset backoff if the last session lived >60s.
		if time.Since(connectedAt) > 60*time.Second {
			attempts = 0
		}

		delay := reconnectDelay(attempts)
		attempts++
		c.log("reconnecting in %v (attempt %d)", delay, attempts)

		select {
		case <-ctx.Done():
			return nil
		case <-time.After(delay):
		}
	}
}

// runOnce dials once, completes the hello/ready handshake, runs the transport,
// and returns when the connection drops.
func (c *Client) runOnce(ctx context.Context, resumeToken *string, connectionID *string, onReady func(ReadyInfo)) error {
	wsURL, headers, subprotocols, err := c.buildWSParams(*resumeToken, *connectionID)
	if err != nil {
		return err
	}
	c.log("connecting to %s", wsURL)

	dialer := websocket.Dialer{
		HandshakeTimeout: 15 * time.Second,
		Subprotocols:     subprotocols,
	}
	conn, resp, err := dialer.DialContext(ctx, wsURL, headers)
	if err != nil {
		if resp != nil && resp.StatusCode == http.StatusUnauthorized {
			c.log("relay rejected upgrade: 401")
			*resumeToken = ""
			return ErrNeedLiveTunnel
		}
		return fmt.Errorf("websocket dial: %w", err)
	}
	defer func() { _ = conn.Close() }()

	c.log("websocket open, sending hello")

	hello := HelloMessage{
		Type:      "hello",
		Protocol:  "yamux",
		Streaming: true,
	}
	if len(c.opts.AllowedOriginsRaw) > 0 {
		hello.AllowedOrigins = c.opts.AllowedOriginsRaw
	}
	// Send connectionId in hello only on the initial (non-resume) connect.
	if c.opts.ConnectionID != "" && *resumeToken == "" {
		hello.ConnectionID = c.opts.ConnectionID
	}
	if err := conn.WriteJSON(hello); err != nil {
		return fmt.Errorf("send hello: %w", err)
	}

	// Read the ready (or error) message. Always JSON, regardless of protocol.
	_, data, err := conn.ReadMessage()
	if err != nil {
		return fmt.Errorf("read ready: %w", err)
	}
	var msg handshakeMessage
	if err := json.Unmarshal(data, &msg); err != nil {
		return fmt.Errorf("parse relay message: %w", err)
	}

	switch msg.Type {
	case "error":
		c.log("relay handshake error: %s", msg.Message)
		*resumeToken = ""
		return ErrNeedLiveTunnel
	case "ready":
		// fall through
	default:
		return fmt.Errorf("expected ready, got %q", msg.Type)
	}

	if msg.ResumeToken != "" {
		*resumeToken = msg.ResumeToken
	}
	if msg.ConnectionID != "" {
		*connectionID = msg.ConnectionID
	}

	c.log("tunnel ready: %s (connection %s)", msg.TunnelID, msg.ConnectionID)

	if onReady != nil {
		onReady(ReadyInfo{
			TunnelID:     msg.TunnelID,
			ConnectionID: msg.ConnectionID,
			TraceID:      msg.TraceID,
		})
	}

	t, err := newTransport(conn, msg.Streaming, c.opts.AllowedOrigins, c.opts.Log)
	if err != nil {
		return fmt.Errorf("create transport: %w", err)
	}
	defer t.close()

	t.serve(ctx) // blocks until session closes or ctx cancelled
	return nil
}

// buildWSParams constructs the WebSocket URL, headers, and subprotocol list for
// initial connect or resume.
func (c *Client) buildWSParams(resumeToken, connectionID string) (wsURL string, headers http.Header, subprotocols []string, err error) {
	u, err := url.Parse(c.opts.RelayURL)
	if err != nil {
		return "", nil, nil, fmt.Errorf("invalid relay URL: %w", err)
	}
	q := u.Query()

	if resumeToken != "" {
		// token is sent via the resume subprotocol header, not the query string
		q.Del("token")
		if connectionID != "" {
			q.Set("connection_id", connectionID)
		}
		subprotocols = []string{ResumeSubprotocolPrefix + resumeToken}
	} else if c.opts.ConnectionID != "" {
		q.Set("connection_id", c.opts.ConnectionID)
	}
	u.RawQuery = q.Encode()

	h := c.opts.Headers.Clone()
	if h == nil {
		h = make(http.Header)
	}
	return u.String(), h, subprotocols, nil
}

// reconnectMaxShifts is the number of doublings before d reaches reconnectMax.
// reconnectBase * 2^5 = 32s > reconnectMax(30s), so we never need more shifts.
const reconnectMaxShifts = 5

// reconnectDelay computes exponential backoff with 25% jitter, capped at reconnectMax.
func reconnectDelay(attempts int) time.Duration {
	d := reconnectBase
	for range min(attempts, reconnectMaxShifts) {
		d *= 2
		if d >= reconnectMax {
			d = reconnectMax
			break
		}
	}
	return d + time.Duration(rand.Int64N(int64(d)/4))
}
