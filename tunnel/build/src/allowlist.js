const LOOPBACK_V4_RE = /^127\.\d+\.\d+\.\d+$/;
const IPV4_RE = /^\d+\.\d+\.\d+\.\d+$/;
function isLoopbackIP(host) {
    if (host === '::1' || host === '0:0:0:0:0:0:0:1')
        return true;
    return LOOPBACK_V4_RE.test(host);
}
function isLoopbackClassDNS(host) {
    if (host === 'localhost' || host === 'test')
        return true;
    return host.endsWith('.localhost') || host.endsWith('.test');
}
function isAllDigits(s) {
    return s.length > 0 && /^\d+$/.test(s);
}
/**
 * lastTwoLabels collapses a multi-label DNS host to its last two labels.
 * Single-label hosts (like `localhost`) are returned unchanged.
 */
function lastTwoLabels(host) {
    const parts = host.split('.');
    if (parts.length <= 2)
        return host;
    return parts.slice(-2).join('.');
}
/**
 * canonicalizeHost validates a host and returns its canonical form. DNS
 * hosts collapse to the last two labels (or stay as-is for bare `test` /
 * `localhost`). IP literals must be loopback and are returned unchanged.
 */
function canonicalizeHost(host) {
    const lc = host.toLowerCase();
    if (!lc)
        throw new Error('missing host');
    // IPv6 (contains a colon outside brackets) or IPv4: classify and validate.
    if (lc === '::1' || lc === '0:0:0:0:0:0:0:1') {
        return { canonical: '::1', isIP: true };
    }
    if (IPV4_RE.test(lc)) {
        if (!isLoopbackIP(lc)) {
            throw new Error(`IP ${JSON.stringify(host)} must be loopback (127.x or ::1)`);
        }
        return { canonical: lc, isIP: true };
    }
    if (!isLoopbackClassDNS(lc)) {
        throw new Error(`host ${JSON.stringify(host)} must be loopback-class (localhost, *.localhost, *.test)`);
    }
    return { canonical: lastTwoLabels(lc), isIP: false };
}
/**
 * parseOriginPattern parses a single allowlist entry. Accepts the canonical
 * "host:port" grammar. For transitional compatibility it also strips a
 * leading "scheme://" and a "*." wildcard prefix — both are no-ops under
 * the new rules (scheme is ignored, subdomains are implicit) and we prefer
 * to canonicalize quietly rather than reject inputs that mean the same
 * thing.
 */
export function parseOriginPattern(s) {
    if (!s)
        throw new Error('empty origin pattern');
    const raw = s;
    // Tolerate legacy "scheme://" prefix.
    const schemeIdx = s.indexOf('://');
    if (schemeIdx >= 0)
        s = s.slice(schemeIdx + 3);
    // Tolerate legacy "*." wildcard prefix.
    if (s.startsWith('*.'))
        s = s.slice(2);
    if (s.includes('*')) {
        throw new Error(`invalid origin pattern ${JSON.stringify(raw)}: '*' is no longer supported; subdomains are implicit`);
    }
    if (/[/?#@]/.test(s)) {
        throw new Error(`invalid origin pattern ${JSON.stringify(raw)}: must be host:port (no path, query, fragment, or userinfo)`);
    }
    let host;
    let port;
    if (s.startsWith('[')) {
        // IPv6 bracketed form: [::1]:443
        const closeIdx = s.indexOf(']');
        if (closeIdx < 0) {
            throw new Error(`invalid origin pattern ${JSON.stringify(raw)}: unmatched '[' in IPv6 host`);
        }
        host = s.slice(1, closeIdx);
        const rest = s.slice(closeIdx + 1);
        if (!rest.startsWith(':')) {
            throw new Error(`invalid origin pattern ${JSON.stringify(raw)}: must be host:port with an explicit numeric port`);
        }
        port = rest.slice(1);
    }
    else {
        const colonIdx = s.lastIndexOf(':');
        if (colonIdx < 0) {
            throw new Error(`invalid origin pattern ${JSON.stringify(raw)}: must be host:port with an explicit numeric port`);
        }
        host = s.slice(0, colonIdx);
        port = s.slice(colonIdx + 1);
    }
    if (!isAllDigits(port)) {
        throw new Error(`invalid origin pattern ${JSON.stringify(raw)}: must be host:port with an explicit numeric port`);
    }
    let canonical;
    let isIP;
    try {
        ({ canonical, isIP } = canonicalizeHost(host));
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`invalid origin pattern ${JSON.stringify(raw)}: ${msg}`);
    }
    return { host: canonical, port, isIP, raw };
}
export function parseOriginPatterns(entries) {
    if (!entries || entries.length === 0)
        return [];
    return entries.map(parseOriginPattern);
}
/**
 * originPatternString renders a pattern back to its canonical "host:port"
 * form, bracketing IPv6 hosts. Used in error messages and log output so the
 * user sees what was actually accepted.
 */
export function originPatternString(p) {
    if (p.isIP && p.host.includes(':'))
        return `[${p.host}]:${p.port}`;
    return `${p.host}:${p.port}`;
}
/**
 * canonicalizedFrom returns the original input if it differs from the
 * canonical form. Returns undefined when the input was already canonical.
 * MCP callers surface this back to agents so they see what was accepted.
 */
export function canonicalizedFrom(p) {
    if (!p.raw || p.raw === originPatternString(p))
        return undefined;
    return p.raw;
}
/**
 * patternMatches reports whether pattern matches the canonical origin string
 * `scheme://host:port`. Scheme is ignored; port must match exactly. DNS
 * patterns match the bare host plus any subdomain; IP patterns match exactly.
 */
const ORIGIN_RE = /^(?:http|https):\/\/([^/?#]+)$/;
export function patternMatches(pattern, origin) {
    const m = ORIGIN_RE.exec(origin);
    if (!m)
        return false;
    const authority = m[1];
    let host;
    let port;
    if (authority.startsWith('[')) {
        const closeIdx = authority.indexOf(']');
        if (closeIdx < 0)
            return false;
        host = authority.slice(1, closeIdx).toLowerCase();
        const rest = authority.slice(closeIdx + 1);
        if (!rest.startsWith(':'))
            return false;
        port = rest.slice(1);
    }
    else {
        const colonIdx = authority.lastIndexOf(':');
        if (colonIdx < 0)
            return false;
        host = authority.slice(0, colonIdx).toLowerCase();
        port = authority.slice(colonIdx + 1);
    }
    if (port !== pattern.port)
        return false;
    if (pattern.isIP)
        return host === pattern.host;
    return host === pattern.host || host.endsWith('.' + pattern.host);
}
export function matchesAny(patterns, origin) {
    for (const p of patterns) {
        if (patternMatches(p, origin))
            return true;
    }
    return false;
}
