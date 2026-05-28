package cli

import (
	"testing"

	"github.com/fullstory/subtext/cli/internal/mcpclient"
)

var testSchema = mcpclient.InputSchema{
	Type: "object",
	Properties: map[string]mcpclient.PropertySchema{
		"selector": {Type: "string", Description: "CSS selector to click"},
		"count":    {Type: "integer", Description: "Number of clicks"},
		"force":    {Type: "boolean", Description: "Force click"},
		"ratio":    {Type: "number", Description: "Click pressure"},
		"tags":     {Type: "array", Items: &mcpclient.PropertySchema{Type: "string"}, Description: "Labels"},
	},
	Required: []string{"selector"},
}

func TestCoerce(t *testing.T) {
	cases := []struct {
		name    string
		value   string
		prop    mcpclient.PropertySchema
		want    any
		wantErr bool
	}{
		{"string passthrough", "hello", mcpclient.PropertySchema{Type: "string"}, "hello", false},
		{"integer ok", "42", mcpclient.PropertySchema{Type: "integer"}, int64(42), false},
		{"integer bad", "abc", mcpclient.PropertySchema{Type: "integer"}, nil, true},
		{"number ok", "3.14", mcpclient.PropertySchema{Type: "number"}, float64(3.14), false},
		{"number bad", "abc", mcpclient.PropertySchema{Type: "number"}, nil, true},
		{"boolean true", "true", mcpclient.PropertySchema{Type: "boolean"}, true, false},
		{"boolean false", "false", mcpclient.PropertySchema{Type: "boolean"}, false, false},
		{"boolean bad", "yes", mcpclient.PropertySchema{Type: "boolean"}, nil, true},
		{"array item string", "foo", mcpclient.PropertySchema{Type: "array", Items: &mcpclient.PropertySchema{Type: "string"}}, "foo", false},
		{"array item int", "5", mcpclient.PropertySchema{Type: "array", Items: &mcpclient.PropertySchema{Type: "integer"}}, int64(5), false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := coerce(tc.value, tc.prop)
			if (err != nil) != tc.wantErr {
				t.Fatalf("coerce(%q, %q): err=%v, wantErr=%v", tc.value, tc.prop.Type, err, tc.wantErr)
			}
			if !tc.wantErr && got != tc.want {
				t.Errorf("got %v (%T), want %v (%T)", got, got, tc.want, tc.want)
			}
		})
	}
}

func TestWantsHelp(t *testing.T) {
	cases := []struct {
		name string
		args []string
		want bool
	}{
		{"empty", nil, false},
		{"--help", []string{"--help"}, true},
		{"-h", []string{"-h"}, true},
		{"mixed with --help", []string{"--selector=btn", "--help"}, true},
		{"no help flags", []string{"--selector=btn"}, false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := wantsHelp(tc.args)
			if got != tc.want {
				t.Errorf("wantsHelp(%v) = %v, want %v", tc.args, got, tc.want)
			}
		})
	}
}

func TestParseArgs(t *testing.T) {
	cases := []struct {
		name    string
		args    []string
		wantErr bool
		check   func(t *testing.T, got map[string]any)
	}{
		{
			name: "required flag provided",
			args: []string{"--selector=button"},
			check: func(t *testing.T, got map[string]any) {
				if got["selector"] != "button" {
					t.Errorf("selector: got %v, want %q", got["selector"], "button")
				}
			},
		},
		{
			name:    "missing required flag",
			args:    []string{},
			wantErr: true,
		},
		{
			name: "integer coercion",
			args: []string{"--selector=btn", "--count=3"},
			check: func(t *testing.T, got map[string]any) {
				if got["count"] != int64(3) {
					t.Errorf("count: got %v (%T), want int64(3)", got["count"], got["count"])
				}
			},
		},
		{
			name: "boolean flag",
			args: []string{"--selector=btn", "--force=true"},
			check: func(t *testing.T, got map[string]any) {
				if got["force"] != true {
					t.Errorf("force: got %v, want true", got["force"])
				}
			},
		},
		{
			name: "number coercion",
			args: []string{"--selector=btn", "--ratio=1.5"},
			check: func(t *testing.T, got map[string]any) {
				if got["ratio"] != float64(1.5) {
					t.Errorf("ratio: got %v (%T), want float64(1.5)", got["ratio"], got["ratio"])
				}
			},
		},
		{
			name: "repeated array flag",
			args: []string{"--selector=btn", "--tags=ux", "--tags=p1"},
			check: func(t *testing.T, got map[string]any) {
				tags, ok := got["tags"].([]any)
				if !ok || len(tags) != 2 || tags[0] != "ux" || tags[1] != "p1" {
					t.Errorf("tags: got %v, want [ux p1]", got["tags"])
				}
			},
		},
		{
			name:    "unknown flag",
			args:    []string{"--selector=btn", "--bogus=x"},
			wantErr: true,
		},
		{
			name:    "unexpected positional",
			args:    []string{"positional"},
			wantErr: true,
		},
		{
			name: "space-separated value",
			args: []string{"--selector", "button"},
			check: func(t *testing.T, got map[string]any) {
				if got["selector"] != "button" {
					t.Errorf("selector: got %v, want %q", got["selector"], "button")
				}
			},
		},
		{
			name: "double-dash sentinel skipped",
			args: []string{"--", "--selector=btn"},
			check: func(t *testing.T, got map[string]any) {
				if got["selector"] != "btn" {
					t.Errorf("selector: got %v, want %q", got["selector"], "btn")
				}
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := parseArgs(tc.args, testSchema, "live-act-click")
			if (err != nil) != tc.wantErr {
				t.Fatalf("parseArgs: err=%v, wantErr=%v", err, tc.wantErr)
			}
			if !tc.wantErr && tc.check != nil {
				tc.check(t, got)
			}
		})
	}
}

func TestExtractGlobalFlags(t *testing.T) {
	cases := []struct {
		name       string
		args       []string
		wantArgs   []string
		wantFormat string
		wantAPIKey string
		wantRegion string
	}{
		{
			name:       "--format=json consumed",
			args:       []string{"--format=json", "tool-name"},
			wantArgs:   []string{"tool-name"},
			wantFormat: "json",
		},
		{
			name:       "--format json consumed",
			args:       []string{"--format", "json", "tool-name"},
			wantArgs:   []string{"tool-name"},
			wantFormat: "json",
		},
		{
			name:       "--api-key= form",
			args:       []string{"--api-key=fs-abc", "tool-name"},
			wantArgs:   []string{"tool-name"},
			wantAPIKey: "fs-abc",
		},
		{
			name:       "--api-key space form",
			args:       []string{"--api-key", "fs-def", "tool-name"},
			wantArgs:   []string{"tool-name"},
			wantAPIKey: "fs-def",
		},
		{
			name:       "--region= form",
			args:       []string{"--region=eu1", "tool-name"},
			wantArgs:   []string{"tool-name"},
			wantRegion: "eu1",
		},
		{
			name:     "passthrough unknown flags",
			args:     []string{"--selector=btn"},
			wantArgs: []string{"--selector=btn"},
		},
		{
			name:       "mixed: format + unknown",
			args:       []string{"--format=json", "--selector=btn"},
			wantArgs:   []string{"--selector=btn"},
			wantFormat: "json",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			saveGlobalFlags(t)
			globalFlags.format = "text"
			globalFlags.apiKey = ""
			globalFlags.region = ""

			got := extractGlobalFlags(tc.args)

			if len(got) != len(tc.wantArgs) {
				t.Fatalf("remaining args: got %v, want %v", got, tc.wantArgs)
			}
			for i, v := range tc.wantArgs {
				if got[i] != v {
					t.Errorf("remaining[%d]: got %q, want %q", i, got[i], v)
				}
			}
			if tc.wantFormat != "" && globalFlags.format != tc.wantFormat {
				t.Errorf("format: got %q, want %q", globalFlags.format, tc.wantFormat)
			}
			if tc.wantAPIKey != "" && globalFlags.apiKey != tc.wantAPIKey {
				t.Errorf("apiKey: got %q, want %q", globalFlags.apiKey, tc.wantAPIKey)
			}
			if tc.wantRegion != "" && globalFlags.region != tc.wantRegion {
				t.Errorf("region: got %q, want %q", globalFlags.region, tc.wantRegion)
			}
		})
	}
}
