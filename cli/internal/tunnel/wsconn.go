package tunnel

// wsConn is verbatim from lidar/internal/tunnel/wsconn.go with the package
// name changed. It wraps *websocket.Conn as io.ReadWriteCloser for yamux.
//
// Each Write sends exactly one binary WebSocket message; Read reassembles
// binary messages into a continuous byte stream.
//
// Gorilla websocket.Conn requires that writes not be called concurrently.
// yamux serializes all frame writes through a single send goroutine, so
// writeMu only guards the hello→yamux handshake transition.

import (
	"io"
	"sync"

	"github.com/gorilla/websocket"
)

type wsConn struct {
	conn    *websocket.Conn
	writeMu sync.Mutex
	readBuf []byte
}

func newWSConn(conn *websocket.Conn) *wsConn {
	return &wsConn{conn: conn}
}

func (w *wsConn) Read(p []byte) (int, error) {
	for {
		if len(w.readBuf) > 0 {
			n := copy(p, w.readBuf)
			w.readBuf = w.readBuf[n:]
			return n, nil
		}
		msgType, msg, err := w.conn.ReadMessage()
		if err != nil {
			return 0, err
		}
		if msgType != websocket.BinaryMessage || len(msg) == 0 {
			continue
		}
		n := copy(p, msg)
		if n < len(msg) {
			w.readBuf = msg[n:]
		}
		return n, nil
	}
}

func (w *wsConn) Write(p []byte) (int, error) {
	w.writeMu.Lock()
	err := w.conn.WriteMessage(websocket.BinaryMessage, p)
	w.writeMu.Unlock()
	if err != nil {
		return 0, err
	}
	return len(p), nil
}

func (w *wsConn) Close() error {
	return w.conn.Close()
}

var _ io.ReadWriteCloser = (*wsConn)(nil)
