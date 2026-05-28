package mcpclient_test

import (
	"strings"
	"testing"

	"fs/services/lidar/main/subtext/internal/mcpclient"
)

func TestResolveEndpoint(t *testing.T) {
	endpointEnvs := []string{"SUBTEXT_ENDPOINT", "SUBTEXT_REGION", "SUBTEXT_ALLOW_INSECURE_ENDPOINT"}

	cases := []struct {
		name            string
		flagEndpoint    string
		flagRegion      string
		configEndpoint  string
		configRegion    string
		envs            map[string]string
		want            string
		wantErrContains string
	}{
		{
			name:         "flag endpoint wins over all",
			flagEndpoint: "https://flag.example.com",
			envs:         map[string]string{"SUBTEXT_ENDPOINT": "https://env.example.com"},
			want:         "https://flag.example.com",
		},
		{
			name: "SUBTEXT_ENDPOINT env",
			envs: map[string]string{"SUBTEXT_ENDPOINT": "https://env.example.com"},
			want: "https://env.example.com",
		},
		{
			name:           "config endpoint",
			configEndpoint: "https://cfg.example.com",
			want:           "https://cfg.example.com",
		},
		{
			name: "na1 default region",
			want: "https://api.fullstory.com/mcp/subtext",
		},
		{
			name:       "eu1 flag region",
			flagRegion: "eu1",
			want:       "https://api.eu1.fullstory.com/mcp/subtext",
		},
		{
			name: "SUBTEXT_REGION env",
			envs: map[string]string{"SUBTEXT_REGION": "eu1"},
			want: "https://api.eu1.fullstory.com/mcp/subtext",
		},
		{
			name:         "config region",
			configRegion: "eu1",
			want:         "https://api.eu1.fullstory.com/mcp/subtext",
		},
		{
			name:            "unknown region",
			flagRegion:      "xx1",
			wantErrContains: "unknown region",
		},
		{
			name:            "http rejected without env",
			flagEndpoint:    "http://local:8080",
			wantErrContains: "insecure",
		},
		{
			name:         "http allowed with SUBTEXT_ALLOW_INSECURE_ENDPOINT=1",
			flagEndpoint: "http://local:8080",
			envs:         map[string]string{"SUBTEXT_ALLOW_INSECURE_ENDPOINT": "1"},
			want:         "http://local:8080",
		},
		{
			name:            "bare hostname rejected",
			flagEndpoint:    "my-host",
			wantErrContains: "https://",
		},
		{
			// flag > SUBTEXT_ENDPOINT > configEndpoint > region
			name:           "precedence: flag beats env",
			flagEndpoint:   "https://flag.example.com",
			envs:           map[string]string{"SUBTEXT_ENDPOINT": "https://env.example.com"},
			configEndpoint: "https://cfg.example.com",
			want:           "https://flag.example.com",
		},
		{
			// SUBTEXT_ENDPOINT > configEndpoint
			name:           "precedence: env beats config",
			envs:           map[string]string{"SUBTEXT_ENDPOINT": "https://env.example.com"},
			configEndpoint: "https://cfg.example.com",
			want:           "https://env.example.com",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			for _, k := range endpointEnvs {
				t.Setenv(k, "")
			}
			for k, v := range tc.envs {
				t.Setenv(k, v)
			}

			got, err := mcpclient.ResolveEndpoint(tc.flagEndpoint, tc.flagRegion, tc.configEndpoint, tc.configRegion)
			if tc.wantErrContains != "" {
				if err == nil {
					t.Fatalf("expected error containing %q, got nil", tc.wantErrContains)
				}
				if !strings.Contains(err.Error(), tc.wantErrContains) {
					t.Errorf("error %q does not contain %q", err.Error(), tc.wantErrContains)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tc.want {
				t.Errorf("got %q, want %q", got, tc.want)
			}
		})
	}
}
