import { promises as dns } from 'node:dns';
import * as net from 'node:net';
/**
 * resolveLoopbackOrigin verifies that `hostname` resolves to a loopback IP
 * and returns the resolved address along with a fetch-friendly URL.
 *
 * The returned `ipUrl` rewrites the host portion to the resolved IP literal
 * so the subsequent fetch() does NOT do its own DNS lookup. This is the
 * load-bearing defense against DNS rebinding: by pinning the IP after the
 * loopback check, an attacker can no longer flip the resolution between
 * "check" and "fetch."
 *
 * The Host: header should be reset to the original hostname:port by the
 * caller so virtual-host routing on the upstream still works.
 *
 * Throws if:
 *   - DNS lookup fails entirely
 *   - The resolved IP is not in 127.0.0.0/8 or ::1
 */
export async function resolveLoopbackOrigin(origin) {
    const u = parseOriginStrict(origin);
    const { scheme, host, port } = u;
    // If the host is already an IP literal, we still validate it before letting
    // it through. Avoids the case where a malicious relay sends an Origin like
    // "http://10.0.0.1:80/" expecting fetch() to skip resolution.
    let ip;
    let family;
    if (net.isIP(host)) {
        ip = host;
        family = net.isIP(host) === 6 ? 6 : 4;
    }
    else {
        const result = await dns.lookup(host, { family: 0, all: false });
        ip = result.address;
        family = result.family;
    }
    if (!isLoopbackIP(ip)) {
        throw new Error(`loopback check failed: ${host} resolved to ${ip}, not loopback`);
    }
    // Rewrite the URL to the IP literal so fetch() doesn't re-resolve. Bracket
    // IPv6 addresses for URL syntax.
    const ipHost = family === 6 ? `[${ip}]` : ip;
    const ipUrl = `${scheme}://${ipHost}:${port}`;
    return { scheme, hostname: host, port, resolvedIp: ip, family, ipUrl };
}
const LOOPBACK_V4_RE = /^127\.\d+\.\d+\.\d+$/;
export function isLoopbackIP(ip) {
    if (LOOPBACK_V4_RE.test(ip))
        return true;
    // IPv6 ::1 has multiple representations after normalization.
    if (ip === '::1' || ip === '0:0:0:0:0:0:0:1')
        return true;
    return false;
}
const ORIGIN_RE = /^(http|https):\/\/([^\/?#]+)$/;
function parseOriginStrict(origin) {
    const m = ORIGIN_RE.exec(origin);
    if (!m)
        throw new Error(`invalid origin: ${origin}`);
    const [, scheme, authority] = m;
    let host;
    let port;
    if (authority.startsWith('[')) {
        // IPv6 bracketed form: [::1]:8080
        const closeIdx = authority.indexOf(']');
        if (closeIdx < 0)
            throw new Error(`invalid origin: ${origin}`);
        host = authority.slice(1, closeIdx);
        const rest = authority.slice(closeIdx + 1);
        if (!rest.startsWith(':'))
            throw new Error(`invalid origin: ${origin}`);
        port = rest.slice(1);
    }
    else {
        const colonIdx = authority.lastIndexOf(':');
        if (colonIdx < 0)
            throw new Error(`invalid origin: ${origin} (port required)`);
        host = authority.slice(0, colonIdx);
        port = authority.slice(colonIdx + 1);
    }
    if (!port || !/^\d+$/.test(port))
        throw new Error(`invalid origin: ${origin} (port required)`);
    return { scheme: scheme, host, port };
}
