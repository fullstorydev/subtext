// Wire protocol message types for the tunnel relay.
// See docs/design.md for the full protocol specification.
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
