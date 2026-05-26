import * as http from 'node:http';
import * as https from 'node:https';

import type {WebSocket} from './third_party/index.js';
import type {OriginPattern} from './allowlist.js';
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
  log: (msg: string) => void;
  streaming?: boolean;
  // Parsed allowlist. Every per-request origin from the relay must match a
  // pattern or the fetch is refused — defense in depth on top of the relay's
  // own gate. Empty means the transport accepts whatever origin the relay
  // sends (the tunnel hasn't opted into client-side allowlist enforcement).
  allowedOrigins?: OriginPattern[];
  /**
   * Called whenever a message is received from the relay. Used by the client
   * to reset its stale-connection timer. Both transports should invoke this
   * on every inbound frame (including yamux pings/acks).
   */
  onActivity?: () => void;
  /**
   * yamux-only: how often to send client-initiated PING frames to keep the
   * WS alive through stateful intermediaries. Defaults to YAMUX_PING_INTERVAL_MS.
   */
  pingIntervalMs?: number;
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
 * Strip hop-by-hop transfer headers that must not be forwarded verbatim.
 * transfer-encoding is stripped because we buffer or stream the body as raw
 * bytes — the chunked framing has already been decoded by Node's http module.
 * content-encoding and content-length are preserved because http.request()
 * does not auto-decompress, so both headers accurately describe the body.
 */
export function stripTransferHeaders(wire: WireHeaders): void {
  delete wire['transfer-encoding'];
}

export function incomingHeadersToWireHeaders(incoming: http.IncomingHttpHeaders): WireHeaders {
  const wire: WireHeaders = {};
  for (const [name, value] of Object.entries(incoming)) {
    if (value === undefined) continue;
    wire[name.toLowerCase()] = Array.isArray(value) ? value : [value];
  }
  return wire;
}

/**
 * Make an HTTP/HTTPS request using Node's http.request() / https.request()
 * so that the Host header in `headers` is sent verbatim to the upstream.
 *
 * Node's built-in fetch() (undici) silently discards any Host override and
 * derives Host from the request URL — breaking virtual-host routing (e.g.
 * Traefik) where the upstream must see the original hostname, not the resolved
 * IP literal we connect to for DNS-rebinding protection.
 *
 * The caller is responsible for:
 *   - Connecting to the resolved IP (not the hostname) via `ip`
 *   - Setting the Host header to the original virtual hostname before calling
 */
export async function nodeRequest(
  scheme: 'http' | 'https',
  ip: string,
  port: string,
  method: string,
  path: string,
  headers: Headers,
  body: Buffer | undefined,
  signal?: AbortSignal,
): Promise<http.IncomingMessage> {
  const headersObj = Object.fromEntries(headers.entries());

  const baseOptions: http.RequestOptions = {
    hostname: ip,
    port: parseInt(port, 10),
    path,
    method,
    headers: headersObj,
  };

  return new Promise<http.IncomingMessage>((resolve, reject) => {
    const req =
      scheme === 'https'
        ? https.request({...baseOptions, rejectUnauthorized: false}, resolve)
        : http.request(baseOptions, resolve);
    req.on('error', reject);
    if (signal) {
      signal.addEventListener('abort', () => req.destroy(new Error('aborted')), {once: true});
    }
    if (body?.length) req.write(body);
    req.end();
  });
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
