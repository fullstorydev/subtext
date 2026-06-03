package tunnel

import (
	"fmt"
	"net"
	"strings"
)

// OriginPattern is a validated, canonicalized allowlist entry.
// Grammar: host:port (no scheme). Subdomains are implicit: a DNS pattern
// matches its own host and any subdomain on the same port. IP literals match
// exactly.
type OriginPattern struct {
	Host string // canonical: last-two-labels for DNS, unchanged for IP
	Port string // numeric
	IsIP bool   // exact match when true; suffix match when false
	Raw  string // original input for logging
}

// ParseOriginPattern parses a single allowlist entry.
// Hosts must be loopback-class (localhost, *.localhost, *.test, 127.x, ::1).
// DNS hosts are canonicalized to their last two labels so
// "www.fullstory.test:8043" and "sub.fullstory.test:8043" both collapse to
// "fullstory.test:8043" and match any subdomain of fullstory.test.
func ParseOriginPattern(s string) (OriginPattern, error) {
	if s == "" {
		return OriginPattern{}, fmt.Errorf("empty origin pattern")
	}
	raw := s

	// Parse host:port, handling IPv6 brackets.
	var host, port string
	if strings.HasPrefix(s, "[") {
		closeIdx := strings.Index(s, "]")
		if closeIdx < 0 {
			return OriginPattern{}, fmt.Errorf("invalid origin pattern %q: unmatched [", raw)
		}
		host = s[1:closeIdx]
		rest := s[closeIdx+1:]
		if !strings.HasPrefix(rest, ":") {
			return OriginPattern{}, fmt.Errorf("invalid origin pattern %q: must be host:port", raw)
		}
		port = rest[1:]
	} else {
		colonIdx := strings.LastIndex(s, ":")
		if colonIdx < 0 {
			return OriginPattern{}, fmt.Errorf("invalid origin pattern %q: must be host:port with an explicit port", raw)
		}
		host = s[:colonIdx]
		port = s[colonIdx+1:]
	}

	if !isDigits(port) {
		return OriginPattern{}, fmt.Errorf("invalid origin pattern %q: port must be numeric", raw)
	}

	canonical, isIP, err := canonicalizeHost(host)
	if err != nil {
		return OriginPattern{}, fmt.Errorf("invalid origin pattern %q: %w", raw, err)
	}

	return OriginPattern{Host: canonical, Port: port, IsIP: isIP, Raw: raw}, nil
}

// ParseOriginPatterns parses a list of allowlist entry strings.
func ParseOriginPatterns(entries []string) ([]OriginPattern, error) {
	out := make([]OriginPattern, 0, len(entries))
	for _, e := range entries {
		p, err := ParseOriginPattern(e)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, nil
}

// MatchesAny reports whether any pattern in patterns matches origin.
func MatchesAny(patterns []OriginPattern, origin string) bool {
	for _, p := range patterns {
		if patternMatches(p, origin) {
			return true
		}
	}
	return false
}

// patternMatches reports whether p matches the canonical origin "scheme://host:port".
// Scheme is ignored; port must match exactly; DNS patterns match the bare host
// plus any subdomain; IP patterns are exact-match only.
// ws:// and wss:// are treated as aliases for http:// and https:// so that
// WebSocket origins match the same allowlist patterns as HTTP origins.
func patternMatches(p OriginPattern, origin string) bool {
	normalized := normalizeWSOrigin(origin)
	_, host, port, err := parseOriginStrict(normalized)
	if err != nil {
		return false
	}
	if port != p.Port {
		return false
	}
	host = strings.ToLower(host)
	if p.IsIP {
		return host == p.Host
	}
	return host == p.Host || strings.HasSuffix(host, "."+p.Host)
}

// canonicalizeHost validates and canonicalizes a host for pattern storage.
// DNS hosts collapse to their last two labels.
func canonicalizeHost(host string) (canonical string, isIP bool, err error) {
	lc := strings.ToLower(strings.TrimSpace(host))
	if lc == "" {
		return "", false, fmt.Errorf("missing host")
	}

	// IP literal: validate loopback; normalize IPv6 to "::1".
	if ip := net.ParseIP(lc); ip != nil {
		if !ip.IsLoopback() {
			return "", false, fmt.Errorf("IP %q must be loopback (127.x or ::1)", host)
		}
		if ip.To4() != nil {
			return lc, true, nil
		}
		return "::1", true, nil
	}

	// DNS: must be loopback-class.
	if !isLoopbackClassDNS(lc) {
		return "", false, fmt.Errorf("host %q must be loopback-class (localhost, *.localhost, *.test)", host)
	}
	return lastTwoLabels(lc), false, nil
}

func isLoopbackClassDNS(host string) bool {
	return host == "localhost" || host == "test" ||
		strings.HasSuffix(host, ".localhost") || strings.HasSuffix(host, ".test")
}

// lastTwoLabels returns the last two dot-separated labels of a DNS name,
// or the whole name if it has two or fewer labels.
func lastTwoLabels(host string) string {
	parts := strings.Split(host, ".")
	if len(parts) <= 2 {
		return host
	}
	return strings.Join(parts[len(parts)-2:], ".")
}
