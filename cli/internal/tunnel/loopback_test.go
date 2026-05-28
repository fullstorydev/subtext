package tunnel

import (
	"context"
	"net"
	"testing"

	"github.com/fullstory/subtext/cli/internal/fstesting"
)

func stubLookup(addrs []net.IPAddr) lookupFunc {
	return func(_ context.Context, _ string) ([]net.IPAddr, error) {
		return addrs, nil
	}
}

func TestResolveLoopbackOrigin(t *testing.T) {
	cases := []struct {
		name       string
		origin     string
		addrs      []net.IPAddr
		wantIP     string
		wantFamily int
		wantIPURL  string
		wantHost   string
	}{
		{
			name:       "IPv4 literal",
			origin:     "http://127.0.0.1:3000",
			wantIP:     "127.0.0.1",
			wantFamily: 4,
			wantIPURL:  "http://127.0.0.1:3000",
		},
		{
			name:       "IPv6 literal",
			origin:     "http://[::1]:3000",
			wantIP:     "::1",
			wantFamily: 6,
			wantIPURL:  "http://[::1]:3000",
		},
		{
			// Intercom regression: OS returns ::1 first on dual-stack hosts, but
			// the dev server only binds 127.0.0.1 — the sort must correct that.
			name:   "IPv4 preferred over IPv6 on dual-stack",
			origin: "http://localhost:3000",
			addrs: []net.IPAddr{
				{IP: net.ParseIP("::1")},
				{IP: net.ParseIP("127.0.0.1")},
			},
			wantIP:     "127.0.0.1",
			wantFamily: 4,
		},
		{
			name:       "IPv6 only fallback",
			origin:     "http://localhost:3000",
			addrs:      []net.IPAddr{{IP: net.ParseIP("::1")}},
			wantIP:     "::1",
			wantFamily: 6,
		},
		{
			// Hostname must be preserved for virtual-host routing (Traefik, Intercom).
			// IPURL must use the pinned IP to prevent DNS rebinding.
			name:   "Host header preserved, IPURL uses IP",
			origin: "http://localhost:8043",
			addrs: []net.IPAddr{
				{IP: net.ParseIP("::1")},
				{IP: net.ParseIP("127.0.0.1")},
			},
			wantIP:     "127.0.0.1",
			wantFamily: 4,
			wantHost:   "localhost",
			wantIPURL:  "http://127.0.0.1:8043",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			res, err := resolveLoopbackOriginWith(context.Background(), tc.origin, stubLookup(tc.addrs))
			fstesting.Ok(t, err, "resolveLoopbackOriginWith(%q)", tc.origin)
			fstesting.Equals(t, tc.wantIP, res.ResolvedIP, "ResolvedIP")
			fstesting.Equals(t, tc.wantFamily, res.Family, "Family")
			if tc.wantIPURL != "" {
				fstesting.Equals(t, tc.wantIPURL, res.IPURL, "IPURL")
			}
			if tc.wantHost != "" {
				fstesting.Equals(t, tc.wantHost, res.Hostname, "Hostname")
				if res.IPURL == tc.origin {
					t.Error("IPURL still uses hostname; DNS-rebinding defense failed")
				}
			}
		})
	}
}

func TestResolveLoopbackOrigin_Errors(t *testing.T) {
	cases := []struct {
		name   string
		origin string
		addrs  []net.IPAddr
	}{
		{
			name:   "non-loopback hostname",
			origin: "http://example.com:80",
			addrs:  []net.IPAddr{{IP: net.ParseIP("1.2.3.4")}},
		},
		{
			name:   "non-loopback IP literal",
			origin: "http://192.168.1.1:80",
		},
		{
			name:   "missing port",
			origin: "http://localhost",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := resolveLoopbackOriginWith(context.Background(), tc.origin, stubLookup(tc.addrs))
			fstesting.Assert(t, err != nil, "expected error for %q, got nil", tc.origin)
		})
	}
}
