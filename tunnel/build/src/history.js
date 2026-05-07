/**
 * Per-client event ring for tunnel diagnostics.
 *
 * Captures the WS lifecycle a tunnel went through (connect, ws-open, ready,
 * ping-sent, ws-close, stale-fired, reconnect-scheduled, need-live-tunnel,
 * handshake-error, etc.) so callers — especially MCP agents that have no
 * other way to inspect the tunnel client process — can answer questions like
 * "did the stale timer fire?" or "did pings actually go out during the quiet
 * period?" without kubectl access.
 *
 * Bounded ring (default 64). Events older than the cap are dropped; this is
 * a debug aid, not an audit log.
 */
/**
 * Fixed-capacity event ring. Push newest at the tail; oldest is dropped when
 * full. `snapshot()` returns a chronologically-ordered copy safe to serialize.
 */
export class EventRing {
    #cap;
    #buf = [];
    constructor(cap = 64) {
        this.#cap = cap;
    }
    push(kind, detail) {
        this.#buf.push({ ts: Date.now(), kind, detail });
        if (this.#buf.length > this.#cap)
            this.#buf.shift();
    }
    snapshot() {
        return [...this.#buf];
    }
    get length() {
        return this.#buf.length;
    }
}
