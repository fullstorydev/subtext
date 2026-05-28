package mcpclient_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/fullstorydev/subtext/cli/internal/mcpclient"
)

// mockTool is the single tool served by newMockServer.
var mockTool = mcpclient.Tool{
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

// newMockServer returns an httptest.Server that speaks MCP JSON-RPC.
// It serves tools/list with mockTool and tools/call with a text response.
func newMockServer(t *testing.T) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.Header.Get("Authorization"), "Bearer ") {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		var req struct {
			Method string `json:"method"`
			ID     int    `json:"id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		switch req.Method {
		case "tools/list":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"jsonrpc": "2.0",
				"id":      req.ID,
				"result":  map[string]any{"tools": []any{mockTool}},
			})
		case "tools/call":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"jsonrpc": "2.0",
				"id":      req.ID,
				"result": map[string]any{
					"content": []any{
						map[string]any{"type": "text", "text": "Clicked element matching 'button'."},
					},
					"isError": false,
				},
			})
		default:
			http.Error(w, "unknown method", http.StatusNotFound)
		}
	}))
	t.Cleanup(srv.Close)
	return srv
}

func newClient(t *testing.T, srv *httptest.Server) *mcpclient.Client {
	t.Helper()
	return mcpclient.New(srv.URL, "test-key", "subtext-test/1.0")
}

func TestListTools(t *testing.T) {
	srv := newMockServer(t)
	c := newClient(t, srv)

	tools, err := c.ListTools(context.Background())
	if err != nil {
		t.Fatalf("ListTools: %v", err)
	}
	if len(tools) != 1 {
		t.Fatalf("got %d tools, want 1", len(tools))
	}
	if tools[0].Name != "live-act-click" {
		t.Errorf("Name: got %q, want %q", tools[0].Name, "live-act-click")
	}
	if tools[0].Description != "Click on an element in the browser." {
		t.Errorf("Description: got %q", tools[0].Description)
	}
	sel, ok := tools[0].InputSchema.Properties["selector"]
	if !ok {
		t.Fatal("missing 'selector' in InputSchema.Properties")
	}
	if sel.Type != "string" {
		t.Errorf("selector type: got %q, want %q", sel.Type, "string")
	}
	if len(tools[0].InputSchema.Required) != 1 || tools[0].InputSchema.Required[0] != "selector" {
		t.Errorf("Required: got %v, want [selector]", tools[0].InputSchema.Required)
	}
}

func TestGetTool_Found(t *testing.T) {
	srv := newMockServer(t)
	c := newClient(t, srv)

	tool, err := c.GetTool(context.Background(), "live-act-click")
	if err != nil {
		t.Fatalf("GetTool: %v", err)
	}
	if tool.Name != "live-act-click" {
		t.Errorf("Name: got %q, want %q", tool.Name, "live-act-click")
	}
}

func TestGetTool_NotFound(t *testing.T) {
	srv := newMockServer(t)
	c := newClient(t, srv)

	_, err := c.GetTool(context.Background(), "nonexistent")
	if err == nil {
		t.Fatal("expected error for unknown tool, got nil")
	}
	var mcpErr *mcpclient.MCPError
	if !errors.As(err, &mcpErr) {
		t.Fatalf("expected *MCPError, got %T: %v", err, err)
	}
	if mcpErr.StatusCode != 404 {
		t.Errorf("StatusCode: got %d, want 404", mcpErr.StatusCode)
	}
	if mcpErr.Code != "tool_not_found" {
		t.Errorf("Code: got %q, want %q", mcpErr.Code, "tool_not_found")
	}
}

// TestGetTool_EndpointNotFound verifies that an HTTP 404 from the server (wrong
// endpoint path) is distinguishable from a client-synthesized tool-not-found
// error. The server 404 must NOT carry Code "tool_not_found" so callers can
// print a more helpful "check your --endpoint path" message.
func TestGetTool_EndpointNotFound(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.NotFound(w, r)
	}))
	t.Cleanup(srv.Close)

	c := mcpclient.New(srv.URL, "test-key", "subtext-test/1.0")
	_, err := c.GetTool(context.Background(), "live-tunnel")
	if err == nil {
		t.Fatal("expected error for HTTP 404 endpoint, got nil")
	}
	var mcpErr *mcpclient.MCPError
	if !errors.As(err, &mcpErr) {
		t.Fatalf("expected *MCPError, got %T: %v", err, err)
	}
	if mcpErr.StatusCode != 404 {
		t.Errorf("StatusCode: got %d, want 404", mcpErr.StatusCode)
	}
	if mcpErr.Code == "tool_not_found" {
		t.Errorf("Code should not be %q for a server-side HTTP 404; callers use this to distinguish wrong path from missing tool", mcpErr.Code)
	}
}

func TestCallTool(t *testing.T) {
	srv := newMockServer(t)
	c := newClient(t, srv)

	contents, err := c.CallTool(context.Background(), "live-act-click", map[string]any{"selector": "button"})
	if err != nil {
		t.Fatalf("CallTool: %v", err)
	}
	if len(contents) != 1 {
		t.Fatalf("got %d content blocks, want 1", len(contents))
	}
	if contents[0].Type != "text" {
		t.Errorf("Type: got %q, want %q", contents[0].Type, "text")
	}
	if !strings.Contains(contents[0].Text, "button") {
		t.Errorf("Text %q does not reference 'button'", contents[0].Text)
	}
}

func TestCall_Unauthorized(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	}))
	t.Cleanup(srv.Close)

	c := mcpclient.New(srv.URL, "bad-key", "subtext-test/1.0")
	_, err := c.ListTools(context.Background())
	if err == nil {
		t.Fatal("expected error for 401, got nil")
	}
	var mcpErr *mcpclient.MCPError
	if !errors.As(err, &mcpErr) || mcpErr.StatusCode != 401 {
		t.Errorf("expected MCPError{StatusCode:401}, got: %v", err)
	}
}

func TestCall_WS1Envelope(t *testing.T) {
	// Server returns a WS1 envelope {ok:true, data:{tools:[...]}}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0",
			"id":      1,
			"result": map[string]any{
				"ok":   true,
				"data": map[string]any{"tools": []any{mockTool}},
			},
		})
	}))
	t.Cleanup(srv.Close)

	c := mcpclient.New(srv.URL, "test-key", "subtext-test/1.0")
	tools, err := c.ListTools(context.Background())
	if err != nil {
		t.Fatalf("ListTools with WS1 envelope: %v", err)
	}
	if len(tools) != 1 || tools[0].Name != "live-act-click" {
		t.Errorf("unexpected tools: %+v", tools)
	}
}
