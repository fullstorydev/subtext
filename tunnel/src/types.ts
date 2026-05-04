// Wire protocol message types for the tunnel relay.
// See docs/design.md for the full protocol specification.

export type WireHeaders = Record<string, string[]>;

// Client → Relay
export interface HelloMessage {
  type: 'hello';
  target: string;
  connectionId?: string;
  protocol?: 'yamux';
  streaming?: boolean;
}

// Relay → Client
export interface ReadyMessage {
  type: 'ready';
  tunnelId: string;
  connectionId: string;
  protocol?: 'yamux';
  streaming?: boolean;
  resumeToken?: string;
  traceId?: string;
}

// Relay → Client
export interface RequestMessage {
  type: 'request';
  requestId: string;
  method: string;
  url: string;
  headers: WireHeaders;
  body: string | null; // base64-encoded
}

// Client → Relay
export interface ResponseMessage {
  type: 'response';
  requestId: string;
  status: number;
  headers: WireHeaders;
  body: string | null; // base64-encoded (gzip-compressed if encoding === 'gzip')
  encoding?: 'gzip';
}

// Client → Relay (when local fetch fails)
export interface ErrorMessage {
  type: 'error';
  requestId: string;
  message: string;
}

// Relay → Client (fatal handshake error, e.g. RotateConnection failure)
export interface ServerErrorMessage {
  type: 'error';
  message: string;
}

// Bidirectional
export interface PingMessage {
  type: 'ping';
}

export interface PongMessage {
  type: 'pong';
}

export type ClientMessage =
  | HelloMessage
  | ResponseMessage
  | ErrorMessage
  | ConnectedMessage
  | StreamDataMessage
  | StreamEndMessage
  | StreamErrorMessage
  | PongMessage;

// Relay → Client: ask client to dial a TCP target for CONNECT tunneling.
export interface ConnectMessage {
  type: 'connect';
  streamId: string;
  host: string; // host:port to dial
}

// Client → Relay: TCP connection established.
export interface ConnectedMessage {
  type: 'connected';
  streamId: string;
}

// Bidirectional: raw bytes for a stream.
export interface StreamDataMessage {
  type: 'data';
  streamId: string;
  data: string; // base64-encoded
}

// Bidirectional: stream closed.
export interface StreamEndMessage {
  type: 'end';
  streamId: string;
}

// Client → Relay: stream dial failed.
export interface StreamErrorMessage {
  type: 'stream_error';
  streamId: string;
  message: string;
}

// Relay → Client: pause reading from the target TCP socket (flow control).
export interface StreamPauseMessage {
  type: 'pause';
  streamId: string;
}

// Relay → Client: resume reading from the target TCP socket.
export interface StreamResumeMessage {
  type: 'resume';
  streamId: string;
}

export type RelayMessage =
  | ReadyMessage
  | RequestMessage
  | ConnectMessage
  | StreamDataMessage
  | StreamEndMessage
  | StreamPauseMessage
  | StreamResumeMessage
  | PingMessage
  | ServerErrorMessage;

// Resume subprotocol: the client sends `${RESUME_SUBPROTOCOL_PREFIX}${token}`
// as a Sec-WebSocket-Protocol; the server echoes the same full string on success.
export const RESUME_SUBPROTOCOL = 'subtext-resume.v1';
export const RESUME_SUBPROTOCOL_PREFIX = RESUME_SUBPROTOCOL + '.';

// Limits
export const MAX_INFLIGHT = 20;
export const MAX_RESPONSE_BODY_BYTES = 200 * 1024 * 1024; // 200 MB
export const REQUEST_TIMEOUT_MS = 30_000; // 30s
export const RECONNECT_BASE_MS = 1_000; // 1s
export const RECONNECT_MAX_MS = 30_000; // 30s
// 90s — if no message at all (yamux frame, ping, ack) arrives within this
// window, we treat the WS as silently dropped and reconnect. Applies to both
// legacy and yamux transports; yamux liveness used to rely solely on
// server-initiated keepalives, which silently failed when intermediate
// infra (linkerd, NATs, LBs) dropped the connection without delivering FIN.
export const STALE_CONNECTION_MS = 90_000;
// 30s — yamux client-initiated PING cadence. Well under STALE_CONNECTION_MS
// so a single missed round-trip doesn't trip the stale timer, but frequent
// enough to keep stateful intermediaries from idling the WS out.
export const YAMUX_PING_INTERVAL_MS = 30_000;

export type TunnelState = 'disconnected' | 'connecting' | 'connected' | 'ready';
