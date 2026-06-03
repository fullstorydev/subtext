package cli

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/fullstorydev/subtext/cli/internal/config"
	"github.com/spf13/cobra"
)

// stubMCPServer starts an httptest server that answers tools/list with a single
// doc-list tool and tools/call with "dispatched-ok". sawCallTool is set to
// true when tools/call is received.
func stubMCPServer(t *testing.T) (srv *httptest.Server, sawCallTool *bool) {
	t.Helper()
	called := false
	sawCallTool = &called
	srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		var req struct {
			Method string `json:"method"`
		}
		_ = json.Unmarshal(body, &req)
		w.Header().Set("Content-Type", "application/json")
		switch req.Method {
		case "tools/list":
			io.WriteString(w, `{"jsonrpc":"2.0","id":1,"result":{"tools":[`+
				`{"name":"doc-list","description":"List docs","inputSchema":{"type":"object","properties":{},"required":[]}}]}}`)
		case "tools/call":
			*sawCallTool = true
			io.WriteString(w, `{"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"dispatched-ok"}],"isError":false}}`)
		default:
			http.Error(w, "unexpected method "+req.Method, http.StatusBadRequest)
		}
	}))
	t.Cleanup(srv.Close)
	return srv, sawCallTool
}

// dispatchDoc configures globalFlags to point at srv, then runs namespaceRunE
// for the doc namespace with the given args. Returns captured stdout and any
// error. Uses a local cobra.Command to avoid mutating the global docCmd.
func dispatchDoc(t *testing.T, srv *httptest.Server, args []string) (string, error) {
	t.Helper()
	t.Setenv("SUBTEXT_ALLOW_INSECURE_ENDPOINT", "1")
	saveGlobalFlags(t)
	globalFlags.endpoint = srv.URL
	globalFlags.apiKey = "test-key"
	globalFlags.format = "json"
	globalConfig = config.File{}

	cmd := &cobra.Command{Use: "doc"}
	cmd.SetContext(context.Background())

	var err error
	out := captureStdout(t, func() {
		err = namespaceRunE(cmd, args)
	})
	return out, err
}

// TestNamespaceDispatchCallsTool drives the real namespace dispatcher
// (namespaceRunE -> runCall) against a stub MCP server. This exercises the
// cmd.Context() -> HTTP path that unit tests against individual functions
// never reach. The test asserts the dispatcher completes a real
// tools/list + tools/call round trip.
func TestNamespaceDispatchCallsTool(t *testing.T) {
	srv, sawCallTool := stubMCPServer(t)

	// Separately track tools/list to assert GetTool was reached.
	sawListTools := false
	origHandler := srv.Config.Handler
	srv.Config.Handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		r.Body = io.NopCloser(strings.NewReader(string(body)))
		var req struct{ Method string }
		_ = json.Unmarshal(body, &req)
		if req.Method == "tools/list" {
			sawListTools = true
		}
		origHandler.ServeHTTP(w, r)
	})

	out, err := dispatchDoc(t, srv, []string{"list"})

	if err != nil {
		t.Fatalf("namespace dispatch returned error: %v", err)
	}
	if !sawListTools {
		t.Error("server never received tools/list (GetTool path not exercised)")
	}
	if !*sawCallTool {
		t.Error("server never received tools/call")
	}
	if !strings.Contains(out, "dispatched-ok") {
		t.Errorf("expected tool output in stdout, got: %q", out)
	}
}

// TestNamespaceDispatchGlobalFlagBeforeTool covers a global flag positioned
// before the tool subcommand (e.g. "subtext --format=text doc list"). Because
// the namespace command uses DisableFlagParsing, cobra hands the leading
// --format through as args[0]; without extraction the dispatcher glues it onto
// the tool name ("doc---format=text") and the lookup 404s. The dispatcher must
// instead consume it as a global and resolve the real tool.
func TestNamespaceDispatchGlobalFlagBeforeTool(t *testing.T) {
	srv, sawCallTool := stubMCPServer(t)

	out, err := dispatchDoc(t, srv, []string{"--format=text", "list"})

	if err != nil {
		t.Fatalf("namespace dispatch with leading global flag returned error: %v", err)
	}
	if !*sawCallTool {
		t.Error("server never received tools/call; leading --format was likely glued onto the tool name")
	}
	if globalFlags.format != "text" {
		t.Errorf("leading --format=text was not consumed as a global flag; got format=%q", globalFlags.format)
	}
	// text format renders the content directly (no JSON wrapping).
	if !strings.Contains(out, "dispatched-ok") {
		t.Errorf("expected text-rendered tool output, got: %q", out)
	}
}
