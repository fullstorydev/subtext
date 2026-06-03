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

// TestNamespaceDispatchCallsTool drives the real namespace dispatcher
// (namespaceRunE -> runCall) against a stub MCP server. This exercises the
// cmd.Context() -> HTTP path that unit tests against individual functions
// never reach. The test asserts the dispatcher completes a real
// tools/list + tools/call round trip.
func TestNamespaceDispatchCallsTool(t *testing.T) {
	var sawListTools, sawCallTool bool

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		var req struct {
			Method string `json:"method"`
		}
		_ = json.Unmarshal(body, &req)

		w.Header().Set("Content-Type", "application/json")
		switch req.Method {
		case "tools/list":
			sawListTools = true
			// doc-list has no required arguments, so parseArgs succeeds with none.
			io.WriteString(w, `{"jsonrpc":"2.0","id":1,"result":{"tools":[`+
				`{"name":"doc-list","description":"List docs","inputSchema":{"type":"object","properties":{},"required":[]}}`+
				`]}}`)
		case "tools/call":
			sawCallTool = true
			io.WriteString(w, `{"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"dispatched-ok"}],"isError":false}}`)
		default:
			http.Error(w, "unexpected method "+req.Method, http.StatusBadRequest)
		}
	}))
	t.Cleanup(srv.Close)

	// Point the resolver at the stub. The stub is plain HTTP, so the endpoint
	// validator needs the insecure escape hatch.
	t.Setenv("SUBTEXT_ALLOW_INSECURE_ENDPOINT", "1")
	saveGlobalFlags(t)
	globalFlags.endpoint = srv.URL
	globalFlags.apiKey = "test-key"
	globalFlags.format = "json"
	globalConfig = config.File{}

	// Simulate what cobra's Execute does: set the context on the command before
	// RunE is called. Use a local command to avoid mutating the global docCmd.
	cmd := &cobra.Command{Use: "doc"}
	cmd.SetContext(context.Background())

	var err error
	out := captureStdout(t, func() {
		err = namespaceRunE(cmd, []string{"list"})
	})

	if err != nil {
		t.Fatalf("namespace dispatch returned error: %v", err)
	}
	if !sawListTools {
		t.Error("server never received tools/list (GetTool path not exercised)")
	}
	if !sawCallTool {
		t.Error("server never received tools/call (CallTool path not exercised)")
	}
	if !strings.Contains(out, "dispatched-ok") {
		t.Errorf("expected tool output in stdout, got: %q", out)
	}
}
