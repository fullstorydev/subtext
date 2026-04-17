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
 * Convert fetch Headers to wire headers (Record<string, string[]>).
 *
 * Note: Headers.forEach provides comma-joined values per the Fetch spec.
 * This is lossy for headers whose values contain commas internally.
 * Set-Cookie is handled correctly via getSetCookie(). For the tunnel proxy
 * use case this is effectively harmless.
 */
export function headersToWireHeaders(headers) {
    const wire = {};
    const setCookies = headers.getSetCookie();
    if (setCookies.length > 0) {
        wire['set-cookie'] = setCookies;
    }
    headers.forEach((value, name) => {
        if (name.toLowerCase() === 'set-cookie')
            return;
        wire[name] = [value];
    });
    return wire;
}
/**
 * Strip transfer-encoding headers that are invalid after transparent
 * decompression by Node's fetch. Both transports call this after
 * headersToWireHeaders().
 */
export function stripTransferHeaders(wire) {
    delete wire['content-encoding'];
    delete wire['content-length'];
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
