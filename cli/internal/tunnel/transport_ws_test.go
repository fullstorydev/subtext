package tunnel

import (
	"bufio"
	"context"
	"crypto/tls"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/fullstorydev/subtext/cli/internal/fstesting"
	"github.com/gorilla/websocket"
)

// newTestTransport builds a minimal transport for use in unit tests.
// streaming:true matches what the Go CLI always sends in the hello message.
func newTestTransport(origins []OriginPattern) *transport {
	return &transport{
		streaming: true,
		origins:   origins,
		httpClient: &http.Client{
			Transport: &http.Transport{
				TLSClientConfig: &tls.Config{InsecureSkipVerify: true}, //nolint:gosec
			},
			CheckRedirect: func(*http.Request, []*http.Request) error {
				return http.ErrUseLastResponse
			},
		},
	}
}

// readHTTPHeaders reads bytes from conn one at a time until \r\n\r\n.
func readHTTPHeaders(conn net.Conn) (string, error) {
	var buf []byte
	single := make([]byte, 1)
	for {
		n, err := conn.Read(single)
		if n > 0 {
			buf = append(buf, single[:n]...)
			if len(buf) >= 4 && string(buf[len(buf)-4:]) == "\r\n\r\n" {
				return string(buf), nil
			}
		}
		if err != nil {
			return string(buf), err
		}
		if len(buf) > 8192 {
			return string(buf), io.ErrUnexpectedEOF
		}
	}
}

// writeJSONFrame writes a length-prefixed JSON frame to conn (same framing as
// the relay uses for HTTP request headers and the tunnel uses for responses).
func writeJSONFrame(conn net.Conn, v any) error {
	b, err := json.Marshal(v)
	if err != nil {
		return err
	}
	var lenBuf [4]byte
	binary.BigEndian.PutUint32(lenBuf[:], uint32(len(b)))
	_, err = conn.Write(append(lenBuf[:], b...))
	return err
}

// readJSONResponseFrame reads [4-byte len][JSON] from conn and unmarshals it.
func readJSONResponseFrame(conn net.Conn, v any) error {
	var lenBuf [4]byte
	if _, err := io.ReadFull(conn, lenBuf[:]); err != nil {
		return err
	}
	hdrLen := binary.BigEndian.Uint32(lenBuf[:])
	hdrBuf := make([]byte, hdrLen)
	if _, err := io.ReadFull(conn, hdrBuf); err != nil {
		return err
	}
	return json.Unmarshal(hdrBuf, v)
}

// wsEchoServer starts an httptest server that echoes every WebSocket message.
func wsEchoServer(t *testing.T) *httptest.Server {
	t.Helper()
	upgrader := websocket.Upgrader{
		CheckOrigin: func(*http.Request) bool { return true },
	}
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()
		for {
			mt, msg, err := conn.ReadMessage()
			if err != nil {
				return
			}
			if err := conn.WriteMessage(mt, msg); err != nil {
				return
			}
		}
	}))
}

// TestConnectStreamWebSocket verifies that a real WebSocket handshake and
// message exchange can flow through the CONNECT (raw TCP pipe) stream path.
func TestConnectStreamWebSocket(t *testing.T) {
	srv := wsEchoServer(t)
	defer srv.Close()

	_, portStr, _ := net.SplitHostPort(srv.Listener.Addr().String())
	host := "127.0.0.1:" + portStr

	tr := newTestTransport(nil) // no origin restriction on CONNECT streams

	relayEnd, streamEnd := net.Pipe()
	defer relayEnd.Close()

	ctx := context.Background()
	errCh := make(chan error, 1)
	go func() {
		errCh <- tr.handleConnectStream(ctx, streamEnd)
	}()

	// Write CONNECT header: {host: "127.0.0.1:PORT"}.
	fstesting.Ok(t, writeJSONFrame(relayEnd, connectHeader{Host: host}), "write CONNECT header")

	// Read success byte.
	statusBuf := make([]byte, 1)
	_, err := io.ReadFull(relayEnd, statusBuf)
	fstesting.Ok(t, err, "read CONNECT status byte")
	fstesting.Equals(t, byte(connectStatusOK), statusBuf[0], "CONNECT status")

	// Send the HTTP/1.1 WebSocket upgrade request through the raw TCP pipe.
	upgradeReq := "GET / HTTP/1.1\r\n" +
		"Host: " + host + "\r\n" +
		"Upgrade: websocket\r\n" +
		"Connection: Upgrade\r\n" +
		"Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n" +
		"Sec-WebSocket-Version: 13\r\n" +
		"\r\n"
	_, err = relayEnd.Write([]byte(upgradeReq))
	fstesting.Ok(t, err, "write HTTP upgrade request")

	// Read 101 Switching Protocols.
	headers, err := readHTTPHeaders(relayEnd)
	fstesting.Ok(t, err, "read HTTP response headers")
	fstesting.Assert(t, strings.HasPrefix(headers, "HTTP/1.1 101"),
		"expected 101 Switching Protocols, got: %.120s", headers)

	// Send a WebSocket text frame "hello".
	// Client→server frames must be masked (RFC 6455). Zero mask = XOR identity.
	payload := []byte("hello")
	wsFrame := make([]byte, 2+4+len(payload))
	wsFrame[0] = 0x81                   // FIN=1, opcode=1 (text)
	wsFrame[1] = 0x80 | byte(len(payload)) // mask bit + payload length
	// wsFrame[2:6] = zero mask bytes (already zero from make)
	copy(wsFrame[6:], payload) // masked payload = payload XOR 0 = payload
	_, err = relayEnd.Write(wsFrame)
	fstesting.Ok(t, err, "write WebSocket frame")

	// Read the echoed frame from the server (server frames are unmasked).
	frameHeader := make([]byte, 2)
	_, err = io.ReadFull(relayEnd, frameHeader)
	fstesting.Ok(t, err, "read WebSocket frame header")
	fstesting.Assert(t, frameHeader[0]&0x0f == 1, "expected text opcode from server")
	fstesting.Assert(t, frameHeader[1]&0x80 == 0, "server frame must be unmasked")

	echoPayload := make([]byte, int(frameHeader[1]&0x7f))
	_, err = io.ReadFull(relayEnd, echoPayload)
	fstesting.Ok(t, err, "read WebSocket echo payload")
	fstesting.Equals(t, "hello", string(echoPayload), "WebSocket echo payload")

	// Close our end — the bidirectional pump in handleConnectStream returns.
	relayEnd.Close()
	<-errCh
}

// TestHTTPStreamWebSocketOrigin verifies that a ws:// origin passes the
// allowlist gate and that the HTTP stream path now fully proxies the WebSocket
// upgrade and supports bidirectional frame exchange — matching the CONNECT path.
func TestHTTPStreamWebSocketOrigin(t *testing.T) {
	srv := wsEchoServer(t)
	defer srv.Close()

	_, portStr, _ := net.SplitHostPort(srv.Listener.Addr().String())
	origin := "ws://127.0.0.1:" + portStr

	patterns, err := ParseOriginPatterns([]string{"127.0.0.1:" + portStr})
	fstesting.Ok(t, err, "ParseOriginPatterns")

	tr := newTestTransport(patterns)

	relayEnd, streamEnd := net.Pipe()
	defer relayEnd.Close()

	ctx := context.Background()
	errCh := make(chan error, 1)
	go func() {
		errCh <- tr.handleHTTPStream(ctx, streamEnd)
	}()

	// Write an HTTP upgrade request with a ws:// origin.
	reqHdr := httpRequestHeader{
		Method: "GET",
		URL:    "/",
		Headers: WireHeaders{
			"upgrade":               {"websocket"},
			"connection":            {"Upgrade"},
			"sec-websocket-key":     {"dGhlIHNhbXBsZSBub25jZQ=="},
			"sec-websocket-version": {"13"},
		},
		BodyLen: 0,
		Origin:  origin,
	}
	fstesting.Ok(t, writeJSONFrame(relayEnd, reqHdr), "write HTTP request header")

	// Read the yamux streaming response frame: [4-byte hdr len][JSON {status, headers}].
	var respHdr struct {
		Status  int         `json:"status"`
		Headers WireHeaders `json:"headers"`
	}
	fstesting.Ok(t, readJSONResponseFrame(relayEnd, &respHdr), "read response frame")

	// The ws:// allowlist gate passes and the upgrade is now fully proxied.
	fstesting.Equals(t, 101, respHdr.Status, "expected 101 Switching Protocols")

	// Exchange a WebSocket message through the HTTP stream path.
	payload := []byte("hello-http-stream")
	wsFrame := make([]byte, 2+4+len(payload))
	wsFrame[0] = 0x81
	wsFrame[1] = 0x80 | byte(len(payload))
	copy(wsFrame[6:], payload)
	_, err = relayEnd.Write(wsFrame)
	fstesting.Ok(t, err, "write WebSocket frame")

	frameHeader := make([]byte, 2)
	_, err = io.ReadFull(relayEnd, frameHeader)
	fstesting.Ok(t, err, "read WebSocket frame header")
	fstesting.Assert(t, frameHeader[0]&0x0f == 1, "expected text opcode")
	fstesting.Assert(t, frameHeader[1]&0x80 == 0, "server frame must be unmasked")

	echoPayload := make([]byte, int(frameHeader[1]&0x7f))
	_, err = io.ReadFull(relayEnd, echoPayload)
	fstesting.Ok(t, err, "read echo payload")
	fstesting.Equals(t, "hello-http-stream", string(echoPayload), "WebSocket echo via HTTP stream path")

	relayEnd.Close()
	<-errCh
}

// wsEchoServerTLS is like wsEchoServer but uses TLS.
func wsEchoServerTLS(t *testing.T) *httptest.Server {
	t.Helper()
	upgrader := websocket.Upgrader{
		CheckOrigin: func(*http.Request) bool { return true },
	}
	return httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()
		for {
			mt, msg, err := conn.ReadMessage()
			if err != nil {
				return
			}
			if err := conn.WriteMessage(mt, msg); err != nil {
				return
			}
		}
	}))
}

// TestHTTPStreamWebSocketTLS verifies the wss:// (TLS dial) path through
// handleWebSocketUpgrade against a real TLS WebSocket echo server.
func TestHTTPStreamWebSocketTLS(t *testing.T) {
	srv := wsEchoServerTLS(t)
	defer srv.Close()

	_, portStr, _ := net.SplitHostPort(srv.Listener.Addr().String())
	origin := "wss://127.0.0.1:" + portStr

	patterns, err := ParseOriginPatterns([]string{"127.0.0.1:" + portStr})
	fstesting.Ok(t, err, "ParseOriginPatterns")

	tr := newTestTransport(patterns)

	relayEnd, streamEnd := net.Pipe()
	defer relayEnd.Close()

	ctx := context.Background()
	errCh := make(chan error, 1)
	go func() {
		errCh <- tr.handleHTTPStream(ctx, streamEnd)
	}()

	reqHdr := httpRequestHeader{
		Method: "GET",
		URL:    "/",
		Headers: WireHeaders{
			"upgrade":               {"websocket"},
			"connection":            {"Upgrade"},
			"sec-websocket-key":     {"dGhlIHNhbXBsZSBub25jZQ=="},
			"sec-websocket-version": {"13"},
		},
		BodyLen: 0,
		Origin:  origin,
	}
	fstesting.Ok(t, writeJSONFrame(relayEnd, reqHdr), "write HTTP request header")

	var respHdr struct {
		Status  int         `json:"status"`
		Headers WireHeaders `json:"headers"`
	}
	fstesting.Ok(t, readJSONResponseFrame(relayEnd, &respHdr), "read response frame")
	fstesting.Equals(t, 101, respHdr.Status, "expected 101 from TLS WS server")

	// Exchange a frame to confirm bidirectional pump works over TLS.
	payload := []byte("hello-tls")
	wsFrame := make([]byte, 2+4+len(payload))
	wsFrame[0] = 0x81
	wsFrame[1] = 0x80 | byte(len(payload))
	copy(wsFrame[6:], payload)
	_, err = relayEnd.Write(wsFrame)
	fstesting.Ok(t, err, "write WebSocket frame")

	frameHeader := make([]byte, 2)
	_, err = io.ReadFull(relayEnd, frameHeader)
	fstesting.Ok(t, err, "read WebSocket frame header")
	fstesting.Assert(t, frameHeader[0]&0x0f == 1, "expected text opcode from TLS server")
	fstesting.Assert(t, frameHeader[1]&0x80 == 0, "server frame must be unmasked")

	echoPayload := make([]byte, int(frameHeader[1]&0x7f))
	_, err = io.ReadFull(relayEnd, echoPayload)
	fstesting.Ok(t, err, "read echo payload")
	fstesting.Equals(t, "hello-tls", string(echoPayload), "WebSocket echo via TLS path")

	relayEnd.Close()
	<-errCh
}

// TestHTTPStreamWebSocketAllowlistReject verifies that a ws:// origin not
// covered by the configured allowlist produces a 502 error response (not a 101).
func TestHTTPStreamWebSocketAllowlistReject(t *testing.T) {
	// Allowlist covers port 3000 only; the request will use port 9999.
	patterns, err := ParseOriginPatterns([]string{"localhost:3000"})
	fstesting.Ok(t, err, "ParseOriginPatterns")

	tr := newTestTransport(patterns)

	relayEnd, streamEnd := net.Pipe()
	defer relayEnd.Close()

	ctx := context.Background()
	errCh := make(chan error, 1)
	go func() {
		errCh <- tr.handleHTTPStream(ctx, streamEnd)
	}()

	reqHdr := httpRequestHeader{
		Method: "GET",
		URL:    "/",
		Headers: WireHeaders{
			"upgrade":               {"websocket"},
			"connection":            {"Upgrade"},
			"sec-websocket-key":     {"dGhlIHNhbXBsZSBub25jZQ=="},
			"sec-websocket-version": {"13"},
		},
		BodyLen: 0,
		Origin:  "ws://localhost:9999",
	}
	fstesting.Ok(t, writeJSONFrame(relayEnd, reqHdr), "write HTTP request header")

	var respHdr struct {
		Status  int `json:"status"`
		BodyLen int `json:"bodyLen"`
	}
	fstesting.Ok(t, readJSONResponseFrame(relayEnd, &respHdr), "read response frame")
	fstesting.Equals(t, 502, respHdr.Status, "expected 502 from allowlist rejection")

	relayEnd.Close()
	<-errCh
}

// TestHTTPStreamWebSocketNon101Response verifies that when the upstream server
// returns a non-101 status (e.g. 401) the response is forwarded to the relay
// as a streaming frame and no bidirectional pump is started.
func TestHTTPStreamWebSocketNon101Response(t *testing.T) {
	// A plain HTTP server that returns 401 to all requests (including upgrade).
	rejectSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
	}))
	defer rejectSrv.Close()

	_, portStr, _ := net.SplitHostPort(rejectSrv.Listener.Addr().String())
	origin := "ws://127.0.0.1:" + portStr

	patterns, err := ParseOriginPatterns([]string{"127.0.0.1:" + portStr})
	fstesting.Ok(t, err, "ParseOriginPatterns")

	tr := newTestTransport(patterns)

	relayEnd, streamEnd := net.Pipe()
	defer relayEnd.Close()

	ctx := context.Background()
	errCh := make(chan error, 1)
	go func() {
		errCh <- tr.handleHTTPStream(ctx, streamEnd)
	}()

	reqHdr := httpRequestHeader{
		Method: "GET",
		URL:    "/",
		Headers: WireHeaders{
			"upgrade":               {"websocket"},
			"connection":            {"Upgrade"},
			"sec-websocket-key":     {"dGhlIHNhbXBsZSBub25jZQ=="},
			"sec-websocket-version": {"13"},
		},
		BodyLen: 0,
		Origin:  origin,
	}
	fstesting.Ok(t, writeJSONFrame(relayEnd, reqHdr), "write HTTP request header")

	// The 401 must arrive as a streaming response frame, not a buffered one.
	// After the frame the transport closes the stream without pumping further data.
	var respHdr struct {
		Status int `json:"status"`
	}
	fstesting.Ok(t, readJSONResponseFrame(relayEnd, &respHdr), "read response frame")
	fstesting.Equals(t, 401, respHdr.Status, "expected 401 from reject server")

	relayEnd.Close()
	<-errCh
}

// TestHTTPStreamWebSocketHeadBytes verifies that bytes the bufio.Reader
// over-read past the HTTP response headers (i.e. the start of WebSocket data)
// are forwarded to the relay before any client→server frames are pumped.
func TestHTTPStreamWebSocketHeadBytes(t *testing.T) {
	serverPayload := "server-first-frame"

	// A raw TCP listener that fuses the 101 response and a WebSocket frame into
	// a single write, so http.ReadResponse's bufio.Reader will buffer the frame.
	l, err := net.Listen("tcp", "127.0.0.1:0")
	fstesting.Ok(t, err, "listen")
	defer l.Close()

	go func() {
		conn, err := l.Accept()
		if err != nil {
			return
		}
		defer conn.Close()
		// Drain the HTTP upgrade request.
		br := bufio.NewReader(conn)
		for {
			line, err := br.ReadString('\n')
			if err != nil || line == "\r\n" {
				break
			}
		}
		// Build the server-initiated WebSocket frame.
		p := []byte(serverPayload)
		frame := make([]byte, 2+len(p))
		frame[0] = 0x81 // FIN=1 text (server→client, unmasked)
		frame[1] = byte(len(p))
		copy(frame[2:], p)

		// Fuse 101 response + frame so http.ReadResponse buffers the frame.
		response := []byte("HTTP/1.1 101 Switching Protocols\r\n" +
			"Upgrade: websocket\r\n" +
			"Connection: Upgrade\r\n" +
			"Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=\r\n" +
			"\r\n")
		conn.Write(append(response, frame...)) //nolint:errcheck
		// Echo subsequent masked client frames back unmasked.
		clientBuf := make([]byte, 1024)
		for {
			n, err := conn.Read(clientBuf)
			if err != nil || n < 6 {
				break
			}
			payLen := int(clientBuf[1] & 0x7f)
			if n < 6+payLen {
				break
			}
			masked := clientBuf[6 : 6+payLen]
			mask := clientBuf[2:6]
			unmasked := make([]byte, payLen)
			for i := range unmasked {
				unmasked[i] = masked[i] ^ mask[i%4]
			}
			reply := make([]byte, 2+payLen)
			reply[0] = 0x81
			reply[1] = byte(payLen)
			copy(reply[2:], unmasked)
			conn.Write(reply) //nolint:errcheck
		}
	}()

	_, portStr, _ := net.SplitHostPort(l.Addr().String())
	origin := fmt.Sprintf("ws://127.0.0.1:%s", portStr)

	patterns, err := ParseOriginPatterns([]string{"127.0.0.1:" + portStr})
	fstesting.Ok(t, err, "ParseOriginPatterns")

	tr := newTestTransport(patterns)

	relayEnd, streamEnd := net.Pipe()
	defer relayEnd.Close()

	ctx := context.Background()
	errCh := make(chan error, 1)
	go func() {
		errCh <- tr.handleHTTPStream(ctx, streamEnd)
	}()

	reqHdr := httpRequestHeader{
		Method: "GET",
		URL:    "/",
		Headers: WireHeaders{
			"upgrade":               {"websocket"},
			"connection":            {"Upgrade"},
			"sec-websocket-key":     {"dGhlIHNhbXBsZSBub25jZQ=="},
			"sec-websocket-version": {"13"},
		},
		BodyLen: 0,
		Origin:  origin,
	}
	fstesting.Ok(t, writeJSONFrame(relayEnd, reqHdr), "write HTTP request header")

	// Read the streaming 101 response frame.
	var respHdr struct {
		Status int `json:"status"`
	}
	fstesting.Ok(t, readJSONResponseFrame(relayEnd, &respHdr), "read response frame")
	fstesting.Equals(t, 101, respHdr.Status, "expected 101")

	// The head bytes arrive immediately after the response frame without any
	// client→server frames having been sent.
	frameHeader := make([]byte, 2)
	_, err = io.ReadFull(relayEnd, frameHeader)
	fstesting.Ok(t, err, "read head frame header")
	fstesting.Assert(t, frameHeader[0]&0x0f == 1, "head bytes: text opcode")

	echoPayload := make([]byte, int(frameHeader[1]&0x7f))
	_, err = io.ReadFull(relayEnd, echoPayload)
	fstesting.Ok(t, err, "read head frame payload")
	fstesting.Equals(t, serverPayload, string(echoPayload), "head bytes forwarded correctly")

	relayEnd.Close()
	<-errCh
}
