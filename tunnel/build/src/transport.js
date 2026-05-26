import * as http from 'node:http';
import * as https from 'node:https';
/** Convert wire headers (Record<string, string[]>) to fetch Headers. */
export function wireHeadersToHeaders(wire) {
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
export function stripTransferHeaders(wire) {
    delete wire['transfer-encoding'];
}
export function incomingHeadersToWireHeaders(incoming) {
    const wire = {};
    for (const [name, value] of Object.entries(incoming)) {
        if (value === undefined)
            continue;
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
export async function nodeRequest(scheme, ip, port, method, path, headers, body, signal) {
    const headersObj = Object.fromEntries(headers.entries());
    const baseOptions = {
        hostname: ip,
        port: parseInt(port, 10),
        path,
        method,
        headers: headersObj,
    };
    return new Promise((resolve, reject) => {
        const req = scheme === 'https'
            ? https.request({ ...baseOptions, rejectUnauthorized: false }, resolve)
            : http.request(baseOptions, resolve);
        req.on('error', reject);
        if (signal) {
            signal.addEventListener('abort', () => req.destroy(new Error('aborted')), { once: true });
        }
        if (body?.length)
            req.write(body);
        req.end();
    });
}
/** Parse a host:port string, returning hostname and numeric port. */
export function parseHostPort(hostport, defaultPort = 80) {
    const lastColon = hostport.lastIndexOf(':');
    if (lastColon >= 0) {
        return {
            hostname: hostport.slice(0, lastColon),
            port: parseInt(hostport.slice(lastColon + 1), 10) || defaultPort,
        };
    }
    return { hostname: hostport, port: defaultPort };
}
/** Maximum size for JSON headers received over the yamux wire format. */
export const MAX_YAMUX_HEADER_BYTES = 1024 * 1024; // 1 MB
