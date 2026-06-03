package tunnel

import (
	"context"
	"fmt"
	"net"
	"sort"
	"strings"
)

// ResolvedOrigin is the result of ResolveLoopbackOrigin.
type ResolvedOrigin struct {
	Scheme     string // "http" or "https"
	Hostname   string // original hostname (for Host header)
	Port       string // numeric port string
	ResolvedIP string // pinned loopback IP literal
	Family     int    // 4 or 6
	IPURL      string // scheme://[ip]:port with no virtual hostname
}

// lookupFunc is the signature for a DNS lookup, injectable for tests.
type lookupFunc func(ctx context.Context, host string) ([]net.IPAddr, error)

// ResolveLoopbackOrigin verifies that origin's hostname resolves to a loopback
// IP and returns the pinned address. Callers MUST connect using IPURL (prevents
// DNS rebinding) and set "Host: Hostname:Port" on the outbound request
// (preserves virtual-host routing for Traefik / Intercom).
func ResolveLoopbackOrigin(ctx context.Context, origin string) (ResolvedOrigin, error) {
	return resolveLoopbackOriginWith(ctx, origin, net.DefaultResolver.LookupIPAddr)
}

// ResolveLoopbackHost is a convenience form for callers that have an already-split
// host and port (e.g. CONNECT streams) and don't need to construct a full URL.
func ResolveLoopbackHost(ctx context.Context, host, port string) (ResolvedOrigin, error) {
	return resolveLoopbackOriginWith(ctx, "http://"+host+":"+port, net.DefaultResolver.LookupIPAddr)
}

// normalizeWSOrigin normalizes ws:// → http:// and wss:// → https:// so that
// WebSocket origins flow through the same HTTP-origin validation paths.
// The scheme comparison is case-insensitive per RFC 3986 §3.1.
func normalizeWSOrigin(origin string) string {
	idx := strings.Index(origin, "://")
	if idx < 0 {
		return origin
	}
	scheme := strings.ToLower(origin[:idx])
	switch scheme {
	case "ws":
		return "http://" + origin[idx+3:]
	case "wss":
		return "https://" + origin[idx+3:]
	default:
		return origin
	}
}

// resolveLoopbackOriginWith is the testable inner implementation. Tests pass a
// stub lookup to avoid real DNS resolution.
//
// IPv4 is preferred over IPv6 on dual-stack hosts. On systems where localhost
// resolves to both 127.0.0.1 and ::1, the OS may return ::1 first even when
// the dev server only binds 127.0.0.1. Sorting family 4 before 6 replicates
// the TypeScript tunnel behaviour (loopback.ts:34-41) and fixes the Intercom
// regression where the server was bound only to 127.0.0.1.
func resolveLoopbackOriginWith(ctx context.Context, origin string, lookup lookupFunc) (ResolvedOrigin, error) {
	normalized := normalizeWSOrigin(origin)
	scheme, host, port, err := parseOriginStrict(normalized)
	if err != nil {
		return ResolvedOrigin{}, err
	}

	var resolvedIP string
	var family int

	if parsed := net.ParseIP(host); parsed != nil {
		// Already an IP literal — still validate loopback; no DNS lookup.
		resolvedIP = parsed.String()
		if parsed.To4() != nil {
			family = 4
		} else {
			family = 6
		}
	} else {
		// Resolve all addresses, then prefer IPv4 over IPv6.
		addrs, err := lookup(ctx, host)
		if err != nil {
			return ResolvedOrigin{}, fmt.Errorf("dns lookup %q: %w", host, err)
		}
		if len(addrs) == 0 {
			return ResolvedOrigin{}, fmt.Errorf("dns lookup %q: no addresses", host)
		}
		sort.SliceStable(addrs, func(i, j int) bool {
			return addrs[i].IP.To4() != nil && addrs[j].IP.To4() == nil
		})
		first := addrs[0].IP
		resolvedIP = first.String()
		if first.To4() != nil {
			family = 4
		} else {
			family = 6
		}
	}

	if !net.ParseIP(resolvedIP).IsLoopback() {
		return ResolvedOrigin{}, fmt.Errorf("loopback check failed: %s resolved to %s, not loopback", host, resolvedIP)
	}

	ipHost := resolvedIP
	if family == 6 {
		ipHost = "[" + resolvedIP + "]"
	}
	return ResolvedOrigin{
		Scheme:     scheme,
		Hostname:   host,
		Port:       port,
		ResolvedIP: resolvedIP,
		Family:     family,
		IPURL:      scheme + "://" + ipHost + ":" + port,
	}, nil
}

// parseOriginStrict parses "scheme://host:port" strictly.
func parseOriginStrict(origin string) (scheme, host, port string, err error) {
	var rest string
	switch {
	case strings.HasPrefix(origin, "https://"):
		scheme, rest = "https", origin[8:]
	case strings.HasPrefix(origin, "http://"):
		scheme, rest = "http", origin[7:]
	default:
		return "", "", "", fmt.Errorf("invalid origin (expected http:// or https://): %q", origin)
	}

	if strings.HasPrefix(rest, "[") {
		closeIdx := strings.Index(rest, "]")
		if closeIdx < 0 {
			return "", "", "", fmt.Errorf("invalid origin (unmatched [): %q", origin)
		}
		host = rest[1:closeIdx]
		after := rest[closeIdx+1:]
		if !strings.HasPrefix(after, ":") {
			return "", "", "", fmt.Errorf("invalid origin (port required): %q", origin)
		}
		port = after[1:]
	} else {
		colonIdx := strings.LastIndex(rest, ":")
		if colonIdx < 0 {
			return "", "", "", fmt.Errorf("invalid origin (port required): %q", origin)
		}
		host = rest[:colonIdx]
		port = rest[colonIdx+1:]
	}

	if !isDigits(port) {
		return "", "", "", fmt.Errorf("invalid origin (numeric port required): %q", origin)
	}
	return scheme, host, port, nil
}

func isDigits(s string) bool {
	if len(s) == 0 {
		return false
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}
