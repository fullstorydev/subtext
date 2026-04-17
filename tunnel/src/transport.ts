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

/**
 * Convert fetch Headers to wire headers (Record<string, string[]>).
 *
 * Note: Headers.forEach provides comma-joined values per the Fetch spec.
 * This is lossy for headers whose values contain commas internally.
 * Set-Cookie is handled correctly via getSetCookie(). For the tunnel proxy
 * use case this is effectively harmless.
 */
export function headersToWireHeaders(headers: Headers): WireHeaders {
  const wire: WireHeaders = {};
  const setCookies = headers.getSetCookie();
  if (setCookies.length > 0) {
    wire['set-cookie'] = setCookies;
  }
  headers.forEach((value, name) => {
    if (name.toLowerCase() === 'set-cookie') return;
    wire[name] = [value];
  });
  return wire;
}

/**
 * Strip transfer-encoding headers that are invalid after transparent
 * decompression by Node's fetch. Both transports call this after
 * headersToWireHeaders().
 */
export function stripTransferHeaders(wire: WireHeaders): void {
  delete wire['content-encoding'];
  delete wire['content-length'];
}

/** Parse a host:port string, returning hostname and numeric port. */
export function parseHostPort(
  hostport: string,
  defaultPort = 80,
): {hostname: string; port: number} {
  const lastColon = hostport.lastIndexOf(':');
  if (lastColon >= 0) {
    return {
      hostname: hostport.slice(0, lastColon),
      port: parseInt(hostport.slice(lastColon + 1), 10) || defaultPort,
    };
  }
  return {hostname: hostport, port: defaultPort};
}

/** Maximum size for JSON headers received over the yamux wire format. */
export const MAX_YAMUX_HEADER_BYTES = 1024 * 1024; // 1 MB
