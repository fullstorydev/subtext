package tunnel

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"

	"github.com/gorilla/websocket"
	"github.com/hashicorp/yamux"
)

// transport runs the yamux client session over a WebSocket connection,
// accepting server-opened streams and proxying them to localhost.
type transport struct {
	session    *yamux.Session
	streaming  bool
	origins    []OriginPattern
	httpClient *http.Client
	logFn      func(string, ...any)
}

func (t *transport) log(format string, args ...any) {
	if t.logFn != nil {
		t.logFn(format, args...)
	}
}

// newTransport creates a yamux client session over the already-open WebSocket
// and returns a transport ready to serve incoming streams.
func newTransport(conn *websocket.Conn, streaming bool, origins []OriginPattern, logFn func(string, ...any)) (*transport, error) {
	cfg := yamux.DefaultConfig()
	cfg.LogOutput = io.Discard
	cfg.KeepAliveInterval = yamuxPingInterval
	cfg.ConnectionWriteTimeout = yamuxWriteTimeout
	cfg.MaxStreamWindowSize = yamuxWindowSize

	sess, err := yamux.Client(newWSConn(conn), cfg)
	if err != nil {
		return nil, fmt.Errorf("yamux client: %w", err)
	}

	return &transport{
		session:   sess,
		streaming: streaming,
		origins:   origins,
		// Single shared http.Client for all upstream requests. InsecureSkipVerify
		// is intentional: we're connecting to localhost where the dev server
		// often has self-signed certs (mirrors TS: rejectUnauthorized: false).
		httpClient: &http.Client{
			Transport: &http.Transport{
				TLSClientConfig: &tls.Config{InsecureSkipVerify: true}, //nolint:gosec
			},
			CheckRedirect: func(*http.Request, []*http.Request) error {
				return http.ErrUseLastResponse
			},
		},
		logFn: logFn,
	}, nil
}

// close tears down the yamux session.
func (t *transport) close() {
	_ = t.session.Close()
}

// serve blocks accepting streams until the session closes or ctx is cancelled.
func (t *transport) serve(ctx context.Context) {
	// Close the session when ctx is done so AcceptStream unblocks immediately.
	done := make(chan struct{})
	defer close(done)
	go func() {
		select {
		case <-ctx.Done():
			_ = t.session.Close()
		case <-done:
		}
	}()

	for {
		stream, err := t.session.AcceptStream()
		if err != nil {
			return
		}
		go func() {
			if err := t.handleStream(ctx, stream); err != nil {
				t.log("stream %d error: %v", stream.StreamID(), err)
			}
		}()
	}
}

// handleStream dispatches on the 1-byte type prefix written by the relay.
func (t *transport) handleStream(ctx context.Context, stream net.Conn) error {
	defer func() { _ = stream.Close() }()

	var typeBuf [1]byte
	if _, err := io.ReadFull(stream, typeBuf[:]); err != nil {
		return fmt.Errorf("read stream type: %w", err)
	}
	switch typeBuf[0] {
	case streamTypeRequest:
		return t.handleHTTPStream(ctx, stream)
	case streamTypeConnect:
		return t.handleConnectStream(ctx, stream)
	default:
		return fmt.Errorf("unknown stream type 0x%02x", typeBuf[0])
	}
}

// ----- HTTP stream (streamTypeRequest) -----

type httpRequestHeader struct {
	Method  string      `json:"method"`
	URL     string      `json:"url"`
	Headers WireHeaders `json:"headers"`
	BodyLen int         `json:"bodyLen"`
	Origin  string      `json:"origin"`
}

func (t *transport) handleHTTPStream(ctx context.Context, stream net.Conn) error {
	hdr, err := readJSONHeader[httpRequestHeader](stream)
	if err != nil {
		return err
	}

	var body []byte
	if hdr.BodyLen > 0 {
		body = make([]byte, hdr.BodyLen)
		if _, err := io.ReadFull(stream, body); err != nil {
			return fmt.Errorf("read request body: %w", err)
		}
	}

	if hdr.Origin == "" {
		err := fmt.Errorf("yamux request header missing origin")
		writeHTTPError(stream, err)
		return err
	}

	if len(t.origins) > 0 && !MatchesAny(t.origins, hdr.Origin) {
		err := fmt.Errorf("origin not in allowlist: %s", hdr.Origin)
		writeHTTPError(stream, err)
		return err
	}

	// DNS resolve-and-pin: rebinding defense. ResolveLoopbackOrigin does
	// ONE DNS lookup, asserts loopback, and returns a URL with the resolved
	// IP literal so http.Client doesn't re-resolve. The Host header is reset
	// to the original hostname so virtual-host routing (Traefik, Intercom)
	// still works. Mirrors loopback.ts + transport_yamux.ts:124-128.
	resolved, err := ResolveLoopbackOrigin(ctx, hdr.Origin)
	if err != nil {
		writeHTTPError(stream, err)
		return err
	}

	reqURL := resolved.IPURL + hdr.URL
	var bodyReader io.Reader
	if len(body) > 0 {
		bodyReader = bytes.NewReader(body)
	}
	reqCtx, cancel := context.WithTimeout(ctx, requestTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(reqCtx, hdr.Method, reqURL, bodyReader)
	if err != nil {
		writeHTTPError(stream, err)
		return err
	}

	// Copy wire headers.
	for name, values := range hdr.Headers {
		for _, v := range values {
			req.Header.Add(name, v)
		}
	}
	// Override Host: connect by IP but preserve virtual hostname so
	// Traefik / Intercom-style edge routing still sees the right hostname.
	// This MUST come after copying wire headers (relay's Host would be wrong).
	req.Host = resolved.Hostname + ":" + resolved.Port

	resp, err := t.httpClient.Do(req)
	if err != nil {
		writeHTTPError(stream, err)
		return err
	}
	defer func() { _ = resp.Body.Close() }()

	wireResp := buildWireHeaders(resp.Header)

	if t.streaming {
		hdrJSON, _ := json.Marshal(struct {
			Status  int         `json:"status"`
			Headers WireHeaders `json:"headers"`
		}{resp.StatusCode, wireResp})
		if _, err := stream.Write(frameJSON(hdrJSON, nil)); err != nil {
			return err
		}
		_, err = io.Copy(stream, io.LimitReader(resp.Body, maxResponseBodyBytes))
		return err
	}

	respBody, err := io.ReadAll(io.LimitReader(resp.Body, int64(maxResponseBodyBytes)+1))
	if err != nil {
		writeHTTPError(stream, err)
		return err
	}
	if len(respBody) > maxResponseBodyBytes {
		err := fmt.Errorf("response body too large")
		writeHTTPError(stream, err)
		return err
	}
	hdrJSON, _ := json.Marshal(struct {
		Status  int         `json:"status"`
		Headers WireHeaders `json:"headers"`
		BodyLen int         `json:"bodyLen"`
	}{resp.StatusCode, wireResp, len(respBody)})
	_, err = stream.Write(frameJSON(hdrJSON, respBody))
	return err
}

// buildWireHeaders converts http.Header to WireHeaders, stripping hop-by-hop.
func buildWireHeaders(h http.Header) WireHeaders {
	wire := make(WireHeaders, len(h))
	for name, values := range h {
		name = strings.ToLower(name)
		if name == "transfer-encoding" {
			continue // strip: body is fully buffered/streamed without chunked framing
		}
		wire[name] = values
	}
	return wire
}

// ----- CONNECT stream (streamTypeConnect) -----

type connectHeader struct {
	Host string `json:"host"` // "hostname:port" (no scheme)
}

func (t *transport) handleConnectStream(ctx context.Context, stream net.Conn) error {
	hdr, err := readJSONHeader[connectHeader](stream)
	if err != nil {
		return err
	}
	t.log("CONNECT %s", hdr.Host)

	hostname, portStr, err := net.SplitHostPort(hdr.Host)
	if err != nil {
		return sendConnectError(stream, fmt.Errorf("parse host: %w", err))
	}

	resolved, err := ResolveLoopbackHost(ctx, hostname, portStr)
	if err != nil {
		return sendConnectError(stream, err)
	}

	conn, err := (&net.Dialer{}).DialContext(ctx, "tcp", resolved.ResolvedIP+":"+resolved.Port)
	if err != nil {
		return sendConnectError(stream, err)
	}
	defer func() { _ = conn.Close() }()

	if _, err := stream.Write([]byte{connectStatusOK}); err != nil {
		return err
	}

	// Bidirectional pump.
	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		_, _ = io.Copy(conn, stream)
		if tc, ok := conn.(*net.TCPConn); ok {
			_ = tc.CloseWrite()
		}
	}()
	go func() {
		defer wg.Done()
		_, _ = io.Copy(stream, conn)
		_ = stream.Close()
	}()
	wg.Wait()
	return nil
}

func sendConnectError(stream net.Conn, err error) error {
	buf := append([]byte{connectStatusError}, err.Error()...)
	_, _ = stream.Write(buf)
	return err
}

// ----- Wire framing helpers -----

// readJSONHeader reads the 4-byte length prefix, then the JSON header.
func readJSONHeader[T any](r io.Reader) (T, error) {
	var zero T
	var lenBuf [4]byte
	if _, err := io.ReadFull(r, lenBuf[:]); err != nil {
		return zero, fmt.Errorf("read header length: %w", err)
	}
	hdrLen := binary.BigEndian.Uint32(lenBuf[:])
	if hdrLen > maxYamuxHeaderBytes {
		return zero, fmt.Errorf("header too large: %d bytes (max %d)", hdrLen, maxYamuxHeaderBytes)
	}
	hdrBuf := make([]byte, hdrLen)
	if _, err := io.ReadFull(r, hdrBuf); err != nil {
		return zero, fmt.Errorf("read header body: %w", err)
	}
	var v T
	if err := json.Unmarshal(hdrBuf, &v); err != nil {
		return zero, fmt.Errorf("parse header JSON: %w", err)
	}
	return v, nil
}

// frameJSON builds a length-prefixed JSON frame: [4-byte BE len][hdrJSON][body].
// This is the response framing format the relay expects from the client.
func frameJSON(hdrJSON, body []byte) []byte {
	buf := make([]byte, 4+len(hdrJSON)+len(body))
	binary.BigEndian.PutUint32(buf[:4], uint32(len(hdrJSON)))
	copy(buf[4:], hdrJSON)
	copy(buf[4+len(hdrJSON):], body)
	return buf
}

// writeHTTPError writes a synthetic 502 so the relay reads a valid framed
// response instead of EOF when local HTTP fails after the stream is open.
func writeHTTPError(stream net.Conn, err error) {
	body := []byte(err.Error())
	hdrJSON, _ := json.Marshal(struct {
		Status  int         `json:"status"`
		Headers WireHeaders `json:"headers"`
		BodyLen int         `json:"bodyLen"`
	}{502, WireHeaders{}, len(body)})
	_, _ = stream.Write(frameJSON(hdrJSON, body))
}
