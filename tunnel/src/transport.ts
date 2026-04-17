import type {WebSocket} from './third_party/index.js';
import type {WireHeaders} from './types.js';

/**
 * A TunnelTransport handles all protocol-specific message dispatch after the
 * hello/ready handshake completes. Two implementations exist:
 *
 *  - LegacyTransport: JSON messages with base64-encoded bodies
 *  - YamuxTransport:  binary yamux multiplexing
 *
 * The TunnelClient creates the appropriate transport based on the `protocol`
 * field in the ready message, then calls serve(). When serve() resolves, the
 * transport is done and the client handles reconnection.
 */
export interface TunnelTransport {
  /**
   * Start handling traffic on the WebSocket. Returns a promise that resolves
   * when the transport shuts down (WebSocket close, error, session teardown).
   */
  serve(): Promise<void>;

  /** Tear down the transport immediately. */
  close(): void;
}

/** Options shared by both transport implementations. */
export interface TransportOptions {
  ws: InstanceType<typeof WebSocket>;
  target: string;
  log: (msg: string) => void;
}

/** Convert wire headers (Record<string, string[]>) to fetch Headers. */
export function wireHeadersToHeaders(wire: WireHeaders): Headers {
  const h = new Headers();
  for (const [name, values] of Object.entries(wire)) {
    for (const v of values) {
      h.append(name, v);
    }
  }
  return h;
}

/** Convert fetch Headers to wire headers (Record<string, string[]>). */
export function headersToWireHeaders(headers: Headers): WireHeaders {
  const wire: WireHeaders = {};
  // Use getSetCookie() for Set-Cookie since Headers.entries() merges them
  const setCookies = headers.getSetCookie();
  if (setCookies.length > 0) {
    wire['set-cookie'] = setCookies;
  }
  headers.forEach((value, name) => {
    if (name.toLowerCase() === 'set-cookie') return; // handled above
    wire[name] = [value];
  });
  return wire;
}
