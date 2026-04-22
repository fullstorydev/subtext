// Wire protocol message types for the tunnel relay.
// See docs/design.md for the full protocol specification.
// Resume subprotocol: the client sends `${RESUME_SUBPROTOCOL_PREFIX}${token}`
// as a Sec-WebSocket-Protocol; the server echoes RESUME_SUBPROTOCOL on success.
export const RESUME_SUBPROTOCOL = 'subtext-resume.v1';
export const RESUME_SUBPROTOCOL_PREFIX = RESUME_SUBPROTOCOL + '.';
// Limits
export const MAX_INFLIGHT = 20;
export const MAX_RESPONSE_BODY_BYTES = 200 * 1024 * 1024; // 200 MB
export const REQUEST_TIMEOUT_MS = 30_000; // 30s
export const RECONNECT_BASE_MS = 1_000; // 1s
export const RECONNECT_MAX_MS = 30_000; // 30s
export const STALE_CONNECTION_MS = 90_000; // 90s — no messages at all
export const MAX_RECONNECT_ATTEMPTS = 5;
