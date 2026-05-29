package mcpclient

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"time"
)

// Client issues JSON-RPC 2.0 requests against the Subtext MCP endpoint.
type Client struct {
	endpoint       string
	apiKey         string
	userAgent      string
	http           *http.Client
	sendJSONFormat bool // send X-MCP-Format header to request structured JSON responses
}

// New returns a Client configured with the given endpoint and API key.
func New(endpoint, apiKey, userAgent string) *Client {
	return &Client{
		endpoint:  endpoint,
		apiKey:    apiKey,
		userAgent: userAgent,
		http:      &http.Client{Timeout: 30 * time.Second},
	}
}

// WithJSONFormat enables the X-MCP-Format: json header on all requests,
// causing the server to return structured JSON instead of prose.
func (c *Client) WithJSONFormat() *Client {
	c.sendJSONFormat = true
	return c
}

type rpcRequest struct {
	JSONRPC string `json:"jsonrpc"`
	ID      int    `json:"id"`
	Method  string `json:"method"`
	Params  any    `json:"params,omitempty"`
}

type rpcResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      int             `json:"id"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// envelope is the WS1 JSON-first wrapper: {ok, data, error}.
type envelope struct {
	OK    bool            `json:"ok"`
	Data  json.RawMessage `json:"data,omitempty"`
	Error *envelopeError  `json:"error,omitempty"`
}

type envelopeError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// MCPError carries a structured error from the server.
type MCPError struct {
	StatusCode int
	Code       string
	Message    string
}

func (e *MCPError) Error() string {
	if e.Code != "" {
		return fmt.Sprintf("server error %s: %s", e.Code, e.Message)
	}
	return fmt.Sprintf("HTTP %d", e.StatusCode)
}

// PropertySchema describes one property in a tool's input schema.
type PropertySchema struct {
	Type        string          `json:"type"` // "string" | "integer" | "number" | "boolean" | "array" | "object"
	Description string          `json:"description"`
	Items       *PropertySchema `json:"items,omitempty"` // element type for "array"
}

// InputSchema is the JSON Schema object that describes a tool's arguments.
type InputSchema struct {
	Type       string                    `json:"type"` // always "object"
	Properties map[string]PropertySchema `json:"properties"`
	Required   []string                  `json:"required"`
}

// Tool is a single entry from a tools/list response.
type Tool struct {
	Name        string      `json:"name"`
	Description string      `json:"description"`
	InputSchema InputSchema `json:"inputSchema"`
}

// Content is one block from a tools/call response.
type Content struct {
	Type     string `json:"type"`           // "text" | "image" | ...
	Text     string `json:"text,omitempty"` // for type "text"
	Data     string `json:"data,omitempty"` // base64 for type "image"
	MimeType string `json:"mimeType,omitempty"`
}

// ListTools calls tools/list and returns the full tool catalog.
func (c *Client) ListTools(ctx context.Context) ([]Tool, error) {
	raw, err := c.Call(ctx, "tools/list", nil)
	if err != nil {
		return nil, err
	}
	var result struct {
		Tools []Tool `json:"tools"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, fmt.Errorf("tools/list: unparseable result: %w", err)
	}
	return result.Tools, nil
}

// GetTool fetches the catalog and returns the tool with the given name.
// Returns an MCPError with StatusCode 404 if the tool is not found.
func (c *Client) GetTool(ctx context.Context, name string) (Tool, error) {
	tools, err := c.ListTools(ctx)
	if err != nil {
		return Tool{}, err
	}
	for _, t := range tools {
		if t.Name == name {
			return t, nil
		}
	}
	return Tool{}, &MCPError{StatusCode: 404, Code: "tool_not_found", Message: fmt.Sprintf("tool %q not found", name)}
}

// CallTool invokes tools/call with the given name and arguments.
func (c *Client) CallTool(ctx context.Context, name string, args map[string]any) ([]Content, error) {
	raw, err := c.Call(ctx, "tools/call", map[string]any{
		"name":      name,
		"arguments": args,
	})
	if err != nil {
		return nil, err
	}
	// tools/call result: {content: [...], isError: bool}
	var result struct {
		Content []Content `json:"content"`
		IsError bool      `json:"isError"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, fmt.Errorf("tools/call: unparseable result: %w", err)
	}
	if result.IsError {
		// Surface the error text from the first text content block.
		msg := "tool reported an error"
		for _, c := range result.Content {
			if c.Type == "text" && c.Text != "" {
				msg = c.Text
				break
			}
		}
		return nil, &MCPError{Message: msg}
	}
	return result.Content, nil
}

// Call issues a JSON-RPC 2.0 request and returns the raw result payload.
// It understands both the WS1 envelope and the legacy isError path.
func (c *Client) Call(ctx context.Context, method string, params any) (json.RawMessage, error) {
	body, err := json.Marshal(rpcRequest{
		JSONRPC: "2.0",
		ID:      1,
		Method:  method,
		Params:  params,
	})
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	if c.sendJSONFormat {
		req.Header.Set("X-MCP-Format", "json; version=1")
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/event-stream")
	req.Header.Set("User-Agent", c.userAgent)

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() {
		_, _ = io.Copy(io.Discard, resp.Body)
		_ = resp.Body.Close()
	}()

	if resp.StatusCode == http.StatusUnauthorized {
		return nil, &MCPError{StatusCode: 401}
	}
	if resp.StatusCode == http.StatusForbidden {
		return nil, &MCPError{StatusCode: 403, Code: "permission_denied"}
	}
	if resp.StatusCode >= 400 {
		return nil, &MCPError{StatusCode: resp.StatusCode}
	}

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var rpc rpcResponse
	if err := json.Unmarshal(raw, &rpc); err != nil {
		return nil, fmt.Errorf("unparseable response: %w", err)
	}
	if rpc.Error != nil {
		return nil, &MCPError{Code: strconv.Itoa(rpc.Error.Code), Message: rpc.Error.Message}
	}

	// Try the WS1 envelope first.
	var env envelope
	if err := json.Unmarshal(rpc.Result, &env); err == nil && (env.OK || env.Error != nil) {
		if !env.OK && env.Error != nil {
			return nil, &MCPError{Code: env.Error.Code, Message: env.Error.Message}
		}
		return env.Data, nil
	}

	// Legacy path: server returned result without WS1 envelope.
	// Check for isError field that WS1 has not yet mapped (jsonformat.go:33).
	var legacy struct {
		IsError bool `json:"isError"`
	}
	if json.Unmarshal(rpc.Result, &legacy) == nil && legacy.IsError {
		fmt.Fprintf(os.Stderr, "debug: server returned isError=true without WS1 envelope; update server to complete WS1 migration\n")
		return nil, &MCPError{Message: "server reported error (pre-WS1 path)"}
	}

	return rpc.Result, nil
}
