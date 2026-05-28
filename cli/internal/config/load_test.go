package config_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/fullstorydev/subtext/cli/internal/config"
)

func TestLoad(t *testing.T) {
	cases := []struct {
		name     string
		content  string
		wantFile config.File
		wantErr  bool
	}{
		{
			name:     "empty file returns zero value",
			content:  "",
			wantFile: config.File{},
		},
		{
			name:     "all fields set",
			content:  "api_key: mykey\nregion: eu1\nendpoint: https://example.com\nsightmap_root: /path/to/project\n",
			wantFile: config.File{APIKey: "mykey", Region: "eu1", Endpoint: "https://example.com", SightmapRoot: "/path/to/project"},
		},
		{
			name:     "sightmap_root only",
			content:  "sightmap_root: /my/project\n",
			wantFile: config.File{SightmapRoot: "/my/project"},
		},
		{
			name:     "partial: region only",
			content:  "region: eu1\n",
			wantFile: config.File{Region: "eu1"},
		},
		{
			name:     "partial: api_key only",
			content:  "api_key: fs-abc\n",
			wantFile: config.File{APIKey: "fs-abc"},
		},
		{
			name:    "invalid yaml returns error",
			content: ":\n  - bad:\nyaml:",
			wantErr: true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f, err := os.CreateTemp(t.TempDir(), "config*.yaml")
			if err != nil {
				t.Fatal(err)
			}
			if _, err := f.WriteString(tc.content); err != nil {
				t.Fatal(err)
			}
			f.Close()

			got, err := config.Load(f.Name())
			if tc.wantErr {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tc.wantFile {
				t.Errorf("got %+v, want %+v", got, tc.wantFile)
			}
		})
	}
}

func TestLoad_MissingFile(t *testing.T) {
	got, err := config.Load(filepath.Join(t.TempDir(), "no-such-file.yaml"))
	if err != nil {
		t.Fatalf("missing file should not error, got: %v", err)
	}
	if got != (config.File{}) {
		t.Errorf("expected zero File for missing path, got %+v", got)
	}
}

func TestLoad_EmptyPath_EnvVar(t *testing.T) {
	f, err := os.CreateTemp(t.TempDir(), "config*.yaml")
	if err != nil {
		t.Fatal(err)
	}
	f.WriteString("api_key: from-env\n")
	f.Close()

	t.Setenv("SUBTEXT_CONFIG", f.Name())

	got, err := config.Load("")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.APIKey != "from-env" {
		t.Errorf("APIKey: got %q, want %q", got.APIKey, "from-env")
	}
}

func TestLoad_EmptyPath_DefaultXDG(t *testing.T) {
	// Provide an XDG_CONFIG_HOME pointing at a temp dir with a config file.
	dir := t.TempDir()
	subtextDir := filepath.Join(dir, "subtext")
	if err := os.MkdirAll(subtextDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(subtextDir, "config.yaml"), []byte("region: eu1\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	t.Setenv("SUBTEXT_CONFIG", "")
	t.Setenv("XDG_CONFIG_HOME", dir)

	got, err := config.Load("")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Region != "eu1" {
		t.Errorf("Region: got %q, want %q", got.Region, "eu1")
	}
}
