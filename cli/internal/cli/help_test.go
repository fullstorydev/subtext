package cli

import (
	"strings"
	"testing"

	"fs/services/lidar/main/subtext/internal/mcpclient"
)

func TestPrintToolHelp(t *testing.T) {
	tool := mcpclient.Tool{
		Name:        "live-act-click",
		Description: "Click on an element in the browser.",
		InputSchema: mcpclient.InputSchema{
			Type: "object",
			Properties: map[string]mcpclient.PropertySchema{
				"selector": {Type: "string", Description: "CSS selector to click"},
			},
			Required: []string{"selector"},
		},
	}

	got := captureStdout(t, func() { printToolHelp(tool) })
	checkGolden(t, "help_live_act_click", got)
}

func TestPrintToolHelp_OptionalAndRequired(t *testing.T) {
	tool := mcpclient.Tool{
		Name:        "live-act-fill",
		Description: "Type text into an input.",
		InputSchema: mcpclient.InputSchema{
			Type: "object",
			Properties: map[string]mcpclient.PropertySchema{
				"selector": {Type: "string", Description: "CSS selector"},
				"text":     {Type: "string", Description: "Text to type"},
				"delay":    {Type: "integer", Description: "Delay between keystrokes in ms"},
			},
			Required: []string{"selector", "text"},
		},
	}

	got := captureStdout(t, func() { printToolHelp(tool) })

	for _, want := range []string{"Required:", "Optional:", "--selector", "--text", "--delay"} {
		if !strings.Contains(got, want) {
			t.Errorf("output missing %q:\n%s", want, got)
		}
	}
}
