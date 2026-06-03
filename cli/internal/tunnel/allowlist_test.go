package tunnel

import (
	"testing"

	"github.com/fullstorydev/subtext/cli/internal/fstesting"
)

func TestParseOriginPattern(t *testing.T) {
	cases := []struct {
		input     string
		wantHost  string
		wantPort  string
		wantIsIP  bool
		wantError bool
	}{
		// tld+1 collapse: three-label DNS -> last two labels
		{"www.fullstory.test:8043", "fullstory.test", "8043", false, false},
		{"sub.a.fullstory.test:8043", "fullstory.test", "8043", false, false},
		// bare two-label host unchanged
		{"fullstory.test:3000", "fullstory.test", "3000", false, false},
		// single-label localhost
		{"localhost:3000", "localhost", "3000", false, false},
		// IPv4 loopback literal
		{"127.0.0.1:3000", "127.0.0.1", "3000", true, false},
		// IPv6 loopback literal (bracketed)
		{"[::1]:3000", "::1", "3000", true, false},
		// error cases
		{"", "", "", false, true},
		{"192.168.1.1:80", "", "", false, true},
		{"example.com:80", "", "", false, true},
		{"localhost", "", "", false, true},
		{"localhost:abc", "", "", false, true},
	}

	for _, tc := range cases {
		t.Run(tc.input, func(t *testing.T) {
			p, err := ParseOriginPattern(tc.input)
			if tc.wantError {
				fstesting.Assert(t, err != nil, "expected error, got nil")
				return
			}
			fstesting.Ok(t, err, "ParseOriginPattern(%q)", tc.input)
			fstesting.Equals(t, tc.wantHost, p.Host, "Host")
			fstesting.Equals(t, tc.wantPort, p.Port, "Port")
			fstesting.Equals(t, tc.wantIsIP, p.IsIP, "IsIP")
		})
	}
}

func TestPatternMatches(t *testing.T) {
	cases := []struct {
		pattern string
		origin  string
		want    bool
	}{
		// exact match
		{"localhost:3000", "http://localhost:3000", true},
		// subdomain matches
		{"fullstory.test:8043", "http://app.fullstory.test:8043", true},
		{"fullstory.test:8043", "http://www.fullstory.test:8043", true},
		// deep subdomain collapses to same tld+1 pattern
		{"fullstory.test:8043", "http://a.b.fullstory.test:8043", true},
		// port mismatch
		{"localhost:3000", "http://localhost:4000", false},
		// different host
		{"localhost:3000", "http://example.test:3000", false},
		// scheme ignored
		{"localhost:3000", "https://localhost:3000", true},
		// IP exact match
		{"127.0.0.1:3000", "http://127.0.0.1:3000", true},
		// IP does not match subdomain
		{"127.0.0.1:3000", "http://foo.127.0.0.1:3000", false},
		// IPv6 exact match
		{"[::1]:3000", "http://[::1]:3000", true},

		// WebSocket schemes (ws:// / wss://) must match the same patterns as
		// http:// / https://. The relay sends a ws:// origin for WebSocket
		// upgrade requests; a host:port that is in the allowlist must not be
		// rejected just because the scheme prefix is ws instead of http.
		{"localhost:3000", "ws://localhost:3000", true},
		{"localhost:3000", "wss://localhost:3000", true},
		{"fullstory.test:8043", "ws://fullstory.test:8043", true},
		{"fullstory.test:8043", "wss://fullstory.test:8043", true},
		{"fullstory.test:8043", "ws://app.fullstory.test:8043", true},
		{"fullstory.test:8043", "wss://app.fullstory.test:8043", true},
		// Port mismatch still rejected for ws/wss.
		{"localhost:3000", "ws://localhost:4000", false},
		// Wrong host rejected.
		{"localhost:3000", "ws://other.test:3000", false},
		// IPv4 literal with ws/wss.
		{"127.0.0.1:3000", "ws://127.0.0.1:3000", true},
		{"127.0.0.1:3000", "wss://127.0.0.1:3000", true},
		// IPv6 literal with wss.
		{"[::1]:443", "wss://[::1]:443", true},
		// Scheme is case-insensitive per RFC 3986.
		{"localhost:3000", "WS://localhost:3000", true},
		{"localhost:3000", "WSS://localhost:3000", true},
	}

	for _, tc := range cases {
		t.Run(tc.pattern+"/"+tc.origin, func(t *testing.T) {
			p, err := ParseOriginPattern(tc.pattern)
			fstesting.Ok(t, err, "ParseOriginPattern(%q)", tc.pattern)
			got := patternMatches(p, tc.origin)
			fstesting.Equals(t, tc.want, got, "patternMatches(%q, %q)", tc.pattern, tc.origin)
		})
	}
}

func TestMatchesAny(t *testing.T) {
	patterns, err := ParseOriginPatterns([]string{"localhost:3000", "fullstory.test:8043"})
	fstesting.Ok(t, err, "ParseOriginPatterns")

	cases := []struct {
		origin string
		want   bool
	}{
		{"http://localhost:3000", true},
		{"http://app.fullstory.test:8043", true},
		{"http://localhost:4000", false},
		{"http://evil.example.com:3000", false},
		// ws/wss schemes iterate through all patterns.
		{"ws://localhost:3000", true},
		{"wss://fullstory.test:8043", true},
		{"ws://localhost:9999", false},
	}

	for _, tc := range cases {
		t.Run(tc.origin, func(t *testing.T) {
			got := MatchesAny(patterns, tc.origin)
			fstesting.Equals(t, tc.want, got, "MatchesAny(%q)", tc.origin)
		})
	}
}

func TestParseOriginPatterns_InvalidEntry(t *testing.T) {
	_, err := ParseOriginPatterns([]string{"localhost:3000", "bad"})
	fstesting.Assert(t, err != nil, "expected error for invalid pattern, got nil")
}
