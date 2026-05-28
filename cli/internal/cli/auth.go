package cli

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"

	"github.com/spf13/cobra"

	"github.com/fullstorydev/subtext/cli/internal/auth"
	"github.com/fullstorydev/subtext/cli/internal/mcpclient"
)

var authCmd = &cobra.Command{
	Use:   "auth",
	Short: "Manage authentication",
	Long: `Commands for verifying credentials and connectivity against the Subtext MCP API.

For setup instructions:
  https://github.com/fullstorydev/subtext/blob/main/INSTALL.md`,
}

var whoamiCmd = &cobra.Command{
	Use:   "whoami",
	Short: "Verify credentials and print connection info",
	Args:  cobra.NoArgs,
	RunE:  runWhoami,
}

func init() {
	authCmd.AddCommand(whoamiCmd)
}

func runWhoami(cmd *cobra.Command, _ []string) error {
	c, apiKey, endpoint, err := resolveClient()
	if err != nil {
		if errors.Is(err, auth.ErrNoAPIKey) {
			fmt.Fprintln(os.Stderr, "No API key found. Set SUBTEXT_API_KEY or pass --api-key.")
		} else {
			fmt.Fprintf(os.Stderr, "endpoint error: %v\n", err)
		}
		os.Exit(exitUsage)
	}

	raw, err := c.Call(cmd.Context(), "tools/list", nil)
	if err != nil {
		var mcpErr *mcpclient.MCPError
		if errors.As(err, &mcpErr) && (mcpErr.StatusCode == 401 || mcpErr.Code == "permission_denied") {
			fmt.Fprintf(os.Stderr, "Invalid API key (…%s).\n", keyHint(apiKey.Key))
			os.Exit(exitAuth)
		}
		return fmt.Errorf("tools/list: %w", err)
	}

	toolCount := -1
	var result struct {
		Tools []json.RawMessage `json:"tools"`
	}
	if raw != nil {
		if jsonErr := json.Unmarshal(raw, &result); jsonErr == nil {
			toolCount = len(result.Tools)
		}
	}

	if globalFlags.format == "json" {
		out := struct {
			OK        bool   `json:"ok"`
			Endpoint  string `json:"endpoint"`
			KeySource string `json:"key_source"`
			ToolCount int    `json:"tool_count"`
		}{
			OK:        true,
			Endpoint:  endpoint,
			KeySource: apiKey.Source,
			ToolCount: toolCount,
		}
		return json.NewEncoder(os.Stdout).Encode(out)
	}

	if toolCount >= 0 {
		fmt.Printf("OK. Endpoint: %s. Key source: %s. Server reports %d tools.\n", endpoint, apiKey.Source, toolCount)
	} else {
		fmt.Printf("OK. Endpoint: %s. Key source: %s.\n", endpoint, apiKey.Source)
	}
	return nil
}
