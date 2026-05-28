package tunnel

import "time"

// HelloMessage is sent client → relay immediately after the WebSocket opens.
type HelloMessage struct {
	Type           string   `json:"type"` // "hello"
	ConnectionID   string   `json:"connectionId,omitempty"`
	Protocol       string   `json:"protocol,omitempty"` // "yamux"
	Streaming      bool     `json:"streaming,omitempty"`
	AllowedOrigins []string `json:"allowedOrigins,omitempty"`
}

// handshakeMessage covers both the ready and error cases in a single unmarshal.
type handshakeMessage struct {
	Type string `json:"type"` // "ready" or "error"
	// error fields
	Message string `json:"message,omitempty"`
	// ready fields
	TunnelID     string `json:"tunnelId,omitempty"`
	ConnectionID string `json:"connectionId,omitempty"`
	Protocol     string `json:"protocol,omitempty"`
	Streaming    bool   `json:"streaming,omitempty"`
	ResumeToken  string `json:"resumeToken,omitempty"`
	TraceID      string `json:"traceId,omitempty"`
}

// WireHeaders is the JSON wire format for HTTP headers: lower-cased name → values.
type WireHeaders map[string][]string

// TunnelState is the lifecycle state of a TunnelClient connection.
type TunnelState string

const (
	StateDisconnected TunnelState = "disconnected"
	StateConnecting   TunnelState = "connecting"
	StateConnected    TunnelState = "connected"
	StateReady        TunnelState = "ready"
)

// StateFile is written by a detached daemon once the tunnel reaches StateReady.
// tunnel status and tunnel disconnect read it from ~/.subtext/tunnels/<id>.json.
type StateFile struct {
	TunnelID     string      `json:"tunnel_id"`
	PID          int         `json:"pid"`
	RelayURL     string      `json:"relay_url"`
	ConnectionID string      `json:"connection_id,omitempty"`
	TraceID      string      `json:"trace_id,omitempty"`
	StartedAt    time.Time   `json:"started_at"`
	State        TunnelState `json:"state"`
}

// Protocol and reconnect timing constants (mirror tunnel/src/types.ts).
const (
	ResumeSubprotocol       = "subtext-resume.v1"
	ResumeSubprotocolPrefix = "subtext-resume.v1."

	reconnectBase  = 1 * time.Second
	reconnectMax   = 30 * time.Second
	requestTimeout = 30 * time.Second

	yamuxPingInterval = 30 * time.Second
	yamuxWriteTimeout = 10 * time.Second
	yamuxWindowSize   = 256 * 1024 // 256 KiB per stream

	maxResponseBodyBytes = 200 * 1024 * 1024 // 200 MiB
	maxYamuxHeaderBytes  = 1 * 1024 * 1024   // 1 MiB JSON header cap
)

// Yamux stream type prefixes: first byte written by the relay on each new stream.
const (
	streamTypeRequest  = byte(0x01)
	streamTypeConnect  = byte(0x02)
	connectStatusOK    = byte(0x00)
	connectStatusError = byte(0x01)
)
