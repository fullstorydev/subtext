package cli

import (
	"context"
	"fmt"
	"strings"

	"github.com/spf13/cobra"

	"fs/services/lidar/main/subtext/internal/mcpclient"
)

// namespaceHelpFunc returns a cobra help function for a namespace command.
// When credentials are available it fetches tools/list, filters by prefix,
// and prints names + first-line descriptions inline. Falls back to the static
// Long text + skill URL when no key is configured or the server is unreachable.
func namespaceHelpFunc(prefix, skillURL string) func(*cobra.Command, []string) {
	return func(cmd *cobra.Command, _ []string) {
		desc := cmd.Long
		if desc == "" {
			desc = cmd.Short
		}

		// Strip the "For workflow guidance" block from Long — we print it ourselves.
		if i := strings.Index(desc, "\nFor workflow guidance"); i >= 0 {
			desc = strings.TrimRight(desc[:i], "\n")
		}
		fmt.Println(desc)

		tools := fetchToolsForPrefix(prefix)
		if tools != nil {
			ns := strings.TrimSuffix(prefix, "-")
			if len(tools) > 0 {
				fmt.Printf("\nAvailable %s tools:\n", ns)
				printTools(tools, prefix)
			} else {
				fmt.Printf("\nNo tools found for the %q namespace.\n", ns)
			}
		}

		if skillURL != "" {
			fmt.Printf("\nFor workflow guidance:\n  %s\n", skillURL)
		}

		fmt.Printf("\nUsage:\n  %s [flags]\n", cmd.CommandPath())
		fmt.Printf("\nFlags:\n  -h, --help   help for %s\n", cmd.Name())
		fmt.Println("\nGlobal Flags:")
		fmt.Println("      --api-key string    API key (or \"-\" to read from stdin)")
		fmt.Println("      --endpoint string   Override MCP endpoint URL")
		fmt.Println("      --format string     Output format: json (default) or text")
		fmt.Println("      --region string     Region: na1 (default), eu1")
	}
}

// fetchToolsForPrefix resolves credentials + endpoint and returns only the
// tools whose names start with prefix. Returns nil on any error so callers
// can distinguish "no key / network error" from "zero tools".
func fetchToolsForPrefix(prefix string) []mcpclient.Tool {
	c, _, _, err := resolveClient()
	if err != nil {
		return nil
	}
	all, err := c.ListTools(context.Background())
	if err != nil {
		return nil
	}
	var filtered []mcpclient.Tool
	for _, t := range all {
		if strings.HasPrefix(t.Name, prefix) {
			filtered = append(filtered, t)
		}
	}
	return filtered
}

// printTools prints a two-column verb/description table, stripping the
// namespace prefix from each tool name so the display matches what the user
// needs to type (e.g. "act-click" under "subtext live", not "live-act-click").
func printTools(tools []mcpclient.Tool, prefix string) {
	const maxDesc = 72
	nameWidth := 0
	for _, t := range tools {
		verb := strings.TrimPrefix(t.Name, prefix)
		if len(verb) > nameWidth {
			nameWidth = len(verb)
		}
	}
	for _, t := range tools {
		verb := strings.TrimPrefix(t.Name, prefix)
		desc := firstLine(t.Description)
		if len(desc) > maxDesc {
			desc = desc[:maxDesc-1] + "…"
		}
		fmt.Printf("  %-*s  %s\n", nameWidth, verb, desc)
	}
}

func firstLine(s string) string {
	line, _, _ := strings.Cut(s, "\n")
	return line
}
