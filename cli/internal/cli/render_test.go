package cli

import (
	"testing"

	"github.com/fullstory/subtext/cli/internal/mcpclient"
)

var textContent = []mcpclient.Content{
	{Type: "text", Text: "Clicked element matching 'button'."},
}

func TestRenderContents_Text(t *testing.T) {
	saveGlobalFlags(t)
	globalFlags.format = "text"

	got := captureStdout(t, func() {
		if err := renderContents(textContent); err != nil {
			t.Fatal(err)
		}
	})

	checkGolden(t, "render_text", got)
}

func TestRenderContents_JSON(t *testing.T) {
	saveGlobalFlags(t)
	globalFlags.format = "json"

	got := captureStdout(t, func() {
		if err := renderContents(textContent); err != nil {
			t.Fatal(err)
		}
	})

	checkGolden(t, "render_json", got)
}

func TestRenderContents_MultipleTextBlocks(t *testing.T) {
	saveGlobalFlags(t)
	globalFlags.format = "text"

	contents := []mcpclient.Content{
		{Type: "text", Text: "line one"},
		{Type: "text", Text: "line two\n"},
	}
	got := captureStdout(t, func() {
		if err := renderContents(contents); err != nil {
			t.Fatal(err)
		}
	})

	checkGolden(t, "render_text_multi_block", got)
}

// TestRenderContents_TextSessionData covers the realistic shape of a live-tool
// response: a single text block containing a <session-data> envelope with
// structured fields. In text mode the content passes through verbatim so the
// agent can parse the YAML-ish payload.
func TestRenderContents_TextSessionData(t *testing.T) {
	saveGlobalFlags(t)
	globalFlags.format = "text"

	contents := []mcpclient.Content{
		{Type: "text", Text: "<session-data>\nconnection_id: abc-123\ncurrent_view: view_1\ntrace_id: XYZ789\ntrace_url: https://app.fullstory.com/subtext/o-ORG/trace/XYZ789\nCreated view view_1 (now current)\n</session-data>\n"},
	}
	got := captureStdout(t, func() {
		if err := renderContents(contents); err != nil {
			t.Fatal(err)
		}
	})

	checkGolden(t, "render_text_session_data", got)
}

// TestRenderContents_TextSessionDataJSON covers responses where the server
// embeds JSON inside a <session-data> envelope — e.g. live-tunnel output.
// Text mode passes the envelope through unchanged; the caller can jq it.
func TestRenderContents_TextSessionDataJSON(t *testing.T) {
	saveGlobalFlags(t)
	globalFlags.format = "text"

	contents := []mcpclient.Content{
		{Type: "text", Text: "<session-data>\n{\"relayUrl\":\"wss://st.fullstory.com/tunnel?token=abc\",\"connectionId\":\"conn-1\",\"traceId\":\"T1\"}\n</session-data>\n"},
	}
	got := captureStdout(t, func() {
		if err := renderContents(contents); err != nil {
			t.Fatal(err)
		}
	})

	checkGolden(t, "render_text_session_data_json", got)
}

// ----- JSON format snapshots -----
// When --format json is active, the CLI sends X-MCP-Format: json; version=1
// and the server returns structured JSON. renderContents extracts the text
// content, validates it as JSON, and prints it directly. Non-JSON text
// (e.g. from servers that haven't migrated) is wrapped as {"data":"..."}.

// TestRenderContents_JSONMultiBlock shows the {"data":"..."} fallback: multiple
// text blocks that concatenate to a non-JSON string.
func TestRenderContents_JSONMultiBlock(t *testing.T) {
	saveGlobalFlags(t)
	globalFlags.format = "json"

	contents := []mcpclient.Content{
		{Type: "text", Text: "line one"},
		{Type: "text", Text: "line two\n"},
	}
	got := captureStdout(t, func() {
		if err := renderContents(contents); err != nil {
			t.Fatal(err)
		}
	})

	checkGolden(t, "render_json_multi_block", got)
}

// TestRenderContents_JSONSessionData shows valid JSON passing through unchanged.
// This is the expected shape when the server honors X-MCP-Format and returns
// structured data (e.g. a live-view-new response).
func TestRenderContents_JSONSessionData(t *testing.T) {
	saveGlobalFlags(t)
	globalFlags.format = "json"

	contents := []mcpclient.Content{
		{Type: "text", Text: `{"connectionId":"abc-123","currentView":"view_1","traceId":"XYZ789","traceUrl":"https://app.fullstory.com/subtext/o-ORG/trace/XYZ789"}`},
	}
	got := captureStdout(t, func() {
		if err := renderContents(contents); err != nil {
			t.Fatal(err)
		}
	})

	checkGolden(t, "render_json_session_data", got)
}

// TestRenderContents_JSONSessionDataJSON shows valid JSON passing through
// unchanged for a tunnel-tool response shape.
func TestRenderContents_JSONSessionDataJSON(t *testing.T) {
	saveGlobalFlags(t)
	globalFlags.format = "json"

	contents := []mcpclient.Content{
		{Type: "text", Text: `{"relayUrl":"wss://st.fullstory.com/tunnel?token=abc","connectionId":"conn-1","traceId":"T1"}`},
	}
	got := captureStdout(t, func() {
		if err := renderContents(contents); err != nil {
			t.Fatal(err)
		}
	})

	checkGolden(t, "render_json_session_data_json", got)
}
