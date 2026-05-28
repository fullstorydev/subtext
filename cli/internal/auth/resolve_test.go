package auth_test

import (
	"errors"
	"testing"

	"github.com/fullstorydev/subtext/cli/internal/auth"
)

func TestResolveAPIKey(t *testing.T) {
	allKeyEnvs := []string{"SUBTEXT_API_KEY", "SECRET_SUBTEXT_API_KEY", "FULLSTORY_API_KEY"}

	cases := []struct {
		name      string
		flagValue string
		configKey string
		envs      map[string]string
		wantKey   string
		wantSrc   string
		wantErr   error
	}{
		{
			name:      "flag wins over all sources",
			flagValue: "flag-key",
			envs:      map[string]string{"SUBTEXT_API_KEY": "env-key"},
			configKey: "cfg-key",
			wantKey:   "flag-key",
			wantSrc:   "flag",
		},
		{
			name:      "SUBTEXT_API_KEY beats config",
			envs:      map[string]string{"SUBTEXT_API_KEY": "primary"},
			configKey: "cfg-key",
			wantKey:   "primary",
			wantSrc:   "env:SUBTEXT_API_KEY",
		},
		{
			name:    "SECRET_SUBTEXT_API_KEY is legacy fallback",
			envs:    map[string]string{"SECRET_SUBTEXT_API_KEY": "legacy"},
			wantKey: "legacy",
			wantSrc: "env:SECRET_SUBTEXT_API_KEY",
		},
		{
			name:    "FULLSTORY_API_KEY is legacy fallback",
			envs:    map[string]string{"FULLSTORY_API_KEY": "legacy-fs"},
			wantKey: "legacy-fs",
			wantSrc: "env:FULLSTORY_API_KEY",
		},
		{
			name:      "config key is lowest priority",
			configKey: "cfg-key",
			wantKey:   "cfg-key",
			wantSrc:   "config",
		},
		{
			name:    "no key returns ErrNoAPIKey",
			wantErr: auth.ErrNoAPIKey,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			// Clear all API key env vars so they don't leak between cases.
			for _, k := range allKeyEnvs {
				t.Setenv(k, "")
			}
			for k, v := range tc.envs {
				t.Setenv(k, v)
			}

			got, err := auth.ResolveAPIKey(tc.flagValue, tc.configKey)
			if tc.wantErr != nil {
				if !errors.Is(err, tc.wantErr) {
					t.Errorf("error: got %v, want %v", err, tc.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got.Key != tc.wantKey {
				t.Errorf("Key: got %q, want %q", got.Key, tc.wantKey)
			}
			if got.Source != tc.wantSrc {
				t.Errorf("Source: got %q, want %q", got.Source, tc.wantSrc)
			}
		})
	}
}
