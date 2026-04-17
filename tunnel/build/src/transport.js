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
/** Convert fetch Headers to wire headers (Record<string, string[]>). */
export function headersToWireHeaders(headers) {
    const wire = {};
    // Use getSetCookie() for Set-Cookie since Headers.entries() merges them
    const setCookies = headers.getSetCookie();
    if (setCookies.length > 0) {
        wire['set-cookie'] = setCookies;
    }
    headers.forEach((value, name) => {
        if (name.toLowerCase() === 'set-cookie')
            return; // handled above
        wire[name] = [value];
    });
    return wire;
}
