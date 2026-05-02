// Public TLDs we explicitly refuse to wildcard. Belt-and-braces on top of the
// loopback-resolution check at fetch time. Anything that could plausibly
// resolve outside loopback gets rejected at parse so it never lives in a
// runtime allowlist.
const PUBLIC_TLD_WILDCARD_DENY = new Set([
    'com',
    'net',
    'org',
    'io',
    'dev',
    'app',
    'co',
    'info',
    'biz',
    'me',
    'local', // mDNS — not loopback
]);
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
function isLoopbackHost(host) {
    if (LOOPBACK_HOSTS.has(host))
        return true;
    if (host.endsWith('.localhost'))
        return true;
    if (host.endsWith('.test'))
        return true;
    // 127.0.0.0/8: any 127.x.x.x literal.
    if (/^127\.\d+\.\d+\.\d+$/.test(host))
        return true;
    return false;
}
function isAllowedWildcardSuffix(suffix) {
    const lc = suffix.toLowerCase();
    if (PUBLIC_TLD_WILDCARD_DENY.has(lc))
        return false;
    if (lc === 'localhost')
        return true;
    if (lc.endsWith('.test') || lc.endsWith('.localhost'))
        return true;
    return false;
}
// Pattern parser: stricter than URL() — no path/query/fragment/userinfo at
// all. Wildcards (*.suffix) are special and would confuse URL() anyway.
const PATTERN_RE = /^(http|https):\/\/([^\/?#@]+)$/;
export function parseOriginPattern(s) {
    if (!s)
        throw new Error('empty origin pattern');
    const m = PATTERN_RE.exec(s);
    if (!m) {
        // Scheme first — that's the primary classification. Only after the
        // scheme is acceptable do we report stricter syntax errors.
        if (!/^https?:\/\//.test(s)) {
            throw new Error(`invalid origin pattern ${JSON.stringify(s)}: scheme must be http or https`);
        }
        // Strip the leading "scheme://" before testing for path/query/userinfo
        // so the `//` doesn't mistrigger.
        const afterScheme = s.replace(/^https?:\/\//, '');
        if (/[\/?#@]/.test(afterScheme)) {
            throw new Error(`invalid origin pattern ${JSON.stringify(s)}: must not include path, query, fragment, or userinfo`);
        }
        throw new Error(`invalid origin pattern ${JSON.stringify(s)}: must be scheme://host:port`);
    }
    const [, scheme, authority] = m;
    const colonIdx = authority.lastIndexOf(':');
    if (colonIdx < 0) {
        throw new Error(`invalid origin pattern ${JSON.stringify(s)}: explicit port required`);
    }
    const host = authority.slice(0, colonIdx).toLowerCase();
    const port = authority.slice(colonIdx + 1);
    if (!host)
        throw new Error(`invalid origin pattern ${JSON.stringify(s)}: missing host`);
    if (!port || !/^\d+$/.test(port)) {
        throw new Error(`invalid origin pattern ${JSON.stringify(s)}: explicit port required`);
    }
    if (host.includes('*')) {
        if (!host.startsWith('*.')) {
            throw new Error(`invalid origin pattern ${JSON.stringify(s)}: only leading '*.' wildcards are supported`);
        }
        const suffix = host.slice(2);
        if (!suffix || suffix.includes('*')) {
            throw new Error(`invalid origin pattern ${JSON.stringify(s)}: bad wildcard suffix`);
        }
        if (!isAllowedWildcardSuffix(suffix)) {
            throw new Error(`invalid origin pattern ${JSON.stringify(s)}: wildcard suffix ${JSON.stringify(suffix)} not allowed (must be localhost, .test, .localhost, or another non-public suffix)`);
        }
        return { scheme: scheme, host: '', port, wildcard: true, suffix };
    }
    if (!isLoopbackHost(host)) {
        throw new Error(`invalid origin pattern ${JSON.stringify(s)}: host must be loopback (localhost, 127.x, ::1, *.localhost, *.test)`);
    }
    return { scheme: scheme, host, port, wildcard: false, suffix: '' };
}
export function parseOriginPatterns(entries) {
    if (!entries || entries.length === 0)
        return [];
    return entries.map(parseOriginPattern);
}
/**
 * Render a pattern back to its canonical form — used in error messages so
 * the user sees what we actually parsed.
 */
export function originPatternString(p) {
    const host = p.wildcard ? `*.${p.suffix}` : p.host;
    return `${p.scheme}://${host}:${p.port}`;
}
/**
 * Matches reports whether `pattern` matches the canonical origin string
 * `scheme://host:port`. Origin must be bare — any explicit path, query, or
 * fragment in the input is treated as a non-match. (The relay always sends
 * canonical bare origins; this guard is defense in depth.)
 *
 * We don't use URL() to parse because it normalizes `:3000` and `:3000/path`
 * the same way (pathname='/'), making "bare vs explicit-path" ambiguous.
 * A regex is simpler and unambiguous for this fixed shape.
 */
const ORIGIN_RE = /^(http|https):\/\/([^\/?#]+)$/;
export function patternMatches(pattern, origin) {
    const m = ORIGIN_RE.exec(origin);
    if (!m)
        return false;
    const [, scheme, authority] = m;
    if (scheme !== pattern.scheme)
        return false;
    const colonIdx = authority.lastIndexOf(':');
    // Require explicit port — patterns always have one and the relay always sends one.
    if (colonIdx < 0)
        return false;
    const host = authority.slice(0, colonIdx).toLowerCase();
    const port = authority.slice(colonIdx + 1);
    if (port !== pattern.port)
        return false;
    // Strip IPv6 brackets if present.
    const bareHost = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
    if (pattern.wildcard) {
        return bareHost.endsWith('.' + pattern.suffix) && bareHost !== pattern.suffix;
    }
    return bareHost === pattern.host;
}
export function matchesAny(patterns, origin) {
    for (const p of patterns) {
        if (patternMatches(p, origin))
            return true;
    }
    return false;
}
