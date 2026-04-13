// Wire protocol message types for the tunnel relay.
// See docs/design.md for the full protocol specification.

export type WireHeaders = Record<string, string[]>;

// Client → Relay
export interface HelloMessage {
  type: 'hello';
  target: string;
  connectionId?: string;
}

// Relay → Client
export interface ReadyMessage {
  type: 'ready';
  tunnelId: string;
  connectionId: string;
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
  body: string | null; // base64-encoded
}

// Client → Relay (when local fetch fails)
export interface ErrorMessage {
  type: 'error';
  requestId: string;
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

export type RelayMessage =
  | ReadyMessage
  | RequestMessage
  | ConnectMessage
  | StreamDataMessage
  | StreamEndMessage
  | PingMessage;

// Limits
export const MAX_INFLIGHT = 20;
export const MAX_RESPONSE_BODY_BYTES = 200 * 1024 * 1024; // 200 MB
export const REQUEST_TIMEOUT_MS = 30_000; // 30s
export const RECONNECT_BASE_MS = 1_000; // 1s
export const RECONNECT_MAX_MS = 30_000; // 30s
export const STALE_CONNECTION_MS = 90_000; // 90s — no messages at all
export const MAX_RECONNECT_ATTEMPTS = 5;

export type TunnelState = 'disconnected' | 'connecting' | 'connected' | 'ready';
