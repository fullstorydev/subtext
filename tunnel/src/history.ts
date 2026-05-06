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

export type TunnelEventKind =
  // Client-driven lifecycle.
  | 'connect-start'
  | 'disconnect-requested'
  | 'reconnect-scheduled'
  // WebSocket transport.
  | 'ws-open'
  | 'hello-sent'
  | 'ws-close'
  | 'ws-error'
  | 'unexpected-response'
  // Handshake outcomes.
  | 'ready'
  | 'handshake-error'
  // Liveness.
  | 'ping-sent'
  | 'stale-fired'
  // Terminal signals out.
  | 'transport-error'
  | 'need-live-tunnel';

export interface TunnelEvent {
  /** Wall-clock ms since epoch — easier to correlate with server logs than relative ts. */
  ts: number;
  kind: TunnelEventKind;
  /** Optional structured detail. Keep small — this lives in a bounded ring. */
  detail?: Record<string, unknown>;
}

/**
 * Fixed-capacity event ring. Push newest at the tail; oldest is dropped when
 * full. `snapshot()` returns a chronologically-ordered copy safe to serialize.
 */
export class EventRing {
  readonly #cap: number;
  readonly #buf: TunnelEvent[] = [];

  constructor(cap = 64) {
    this.#cap = cap;
  }

  push(kind: TunnelEventKind, detail?: Record<string, unknown>): void {
    this.#buf.push({ts: Date.now(), kind, detail});
    if (this.#buf.length > this.#cap) this.#buf.shift();
  }

  snapshot(): TunnelEvent[] {
    return [...this.#buf];
  }

  get length(): number {
    return this.#buf.length;
  }
}
