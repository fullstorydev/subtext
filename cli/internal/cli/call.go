package cli

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"maps"
	"os"
	"slices"
	"strconv"
	"strings"

	"github.com/spf13/cobra"

	"fs/services/lidar/main/subtext/internal/auth"
	"fs/services/lidar/main/subtext/internal/mcpclient"
)

// callCmd is an internal delegation target for namespace commands.
// It is intentionally not registered with rootCmd.
var callCmd = &cobra.Command{
	DisableFlagParsing: true,
	RunE:               runCall,
}

func runCall(cmd *cobra.Command, args []string) error {
	// Strip any leading "--" sentinel cobra may inject.
	if len(args) > 0 && args[0] == "--" {
		args = args[1:]
	}

	// Global flags (--json, --api-key, etc.) are already parsed by cobra before
	// DisableFlagParsing takes effect for the subcommand. However when
	// DisableFlagParsing is set, cobra passes ALL remaining args raw. We scan
	// them to pull out globals so the rest of the code can use globalFlags.
	args = extractGlobalFlags(args)

	// Re-run config load in case --config appeared after the subcommand name
	// (cobra.OnInitialize fires before DisableFlagParsing extraction).
	loadConfig()

	if len(args) == 0 {
		return fmt.Errorf("tool name required; run 'subtext <namespace> --help' to list tools")
	}
	toolName := args[0]

	// Intercept --help/-h before touching the network.
	if toolName == "--help" || toolName == "-h" {
		return cmd.Help()
	}

	rest := args[1:]
	if wantsHelp(rest) {
		return runCallHelp(toolName)
	}

	c, apiKey, _, err := resolveClient()
	if err != nil {
		if errors.Is(err, auth.ErrNoAPIKey) {
			fmt.Fprintln(os.Stderr, "No API key found. Set SUBTEXT_API_KEY or pass --api-key.")
		} else {
			fmt.Fprintf(os.Stderr, "endpoint error: %v\n", err)
		}
		os.Exit(exitUsage)
	}

	tool, err := c.GetTool(context.Background(), toolName)
	if err != nil {
		var mcpErr *mcpclient.MCPError
		if errors.As(err, &mcpErr) {
			if mcpErr.StatusCode == 404 {
				if mcpErr.Code == "tool_not_found" {
					fmt.Fprintf(os.Stderr, "tool %q not found; run 'subtext <namespace> --help' to list tools\n", toolName)
				} else {
					fmt.Fprintf(os.Stderr, "endpoint returned 404; check that --endpoint includes the full path (e.g., https://api.fullstory.com/mcp/subtext)\n")
				}
				os.Exit(exitNotFound)
			}
			if mcpErr.StatusCode == 401 || mcpErr.Code == "permission_denied" {
				fmt.Fprintf(os.Stderr, "Invalid API key (…%s).\n", keyHint(apiKey.Key))
				os.Exit(exitAuth)
			}
		}
		return fmt.Errorf("fetching tool: %w", err)
	}

	arguments, err := parseArgs(rest, tool.InputSchema, toolName)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(exitUsage)
	}

	contents, err := c.CallTool(context.Background(), toolName, arguments)
	if err != nil {
		var mcpErr *mcpclient.MCPError
		if errors.As(err, &mcpErr) {
			if mcpErr.StatusCode == 401 || mcpErr.Code == "permission_denied" {
				fmt.Fprintf(os.Stderr, "Invalid API key (…%s).\n", keyHint(apiKey.Key))
				os.Exit(exitAuth)
			}
		}
		return fmt.Errorf("tools/call: %w", err)
	}

	return renderContents(contents)
}

// runCallHelp fetches the tool schema and prints a human-readable summary.
func runCallHelp(toolName string) error {
	c, _, _, err := resolveClient()
	if err != nil {
		invocation := "subtext " + strings.Replace(toolName, "-", " ", 1)
		fmt.Printf("%s\n\nLog in to see argument details: set SUBTEXT_API_KEY or pass --api-key.\n", invocation)
		return nil
	}
	tool, err := c.GetTool(context.Background(), toolName)
	if err != nil {
		var mcpErr *mcpclient.MCPError
		if errors.As(err, &mcpErr) && mcpErr.StatusCode == 404 {
			fmt.Fprintf(os.Stderr, "tool %q not found\n", toolName)
			os.Exit(exitNotFound)
		}
		return err
	}

	printToolHelp(tool)
	return nil
}

func printToolHelp(tool mcpclient.Tool) {
	// Convert "live-act-click" → "subtext live act-click".
	invocation := "subtext " + strings.Replace(tool.Name, "-", " ", 1)
	fmt.Printf("%s\n\n%s\n", invocation, tool.Description)

	required := make(map[string]bool, len(tool.InputSchema.Required))
	for _, r := range tool.InputSchema.Required {
		required[r] = true
	}

	// Print required first, then optional.
	printProps := func(header string, pred func(name string) bool) {
		var names []string
		for name := range tool.InputSchema.Properties {
			if pred(name) {
				names = append(names, name)
			}
		}
		slices.Sort(names)
		if len(names) == 0 {
			return
		}
		fmt.Printf("\n%s:\n", header)
		nameWidth := 0
		for _, n := range names {
			if len(n) > nameWidth {
				nameWidth = len(n)
			}
		}
		for _, name := range names {
			prop := tool.InputSchema.Properties[name]
			typeSuffix := prop.Type
			if prop.Type == "array" {
				typeSuffix = "[]" + elementType(prop)
			}
			fmt.Printf("  --%-*s  %s  %s\n", nameWidth, name, typeSuffix, prop.Description)
		}
	}

	printProps("Required", func(name string) bool { return required[name] })
	printProps("Optional", func(name string) bool { return !required[name] })

	fmt.Printf("\nUsage:\n  %s [flags]\n", invocation)
	fmt.Println("\nFor complex (nested object) arguments:")
	fmt.Printf("  %s --params-file=args.json\n", invocation)
}

func elementType(p mcpclient.PropertySchema) string {
	if p.Items != nil {
		return p.Items.Type
	}
	return "string"
}

// parseArgs walks the raw flag tokens and builds a map[string]any using the
// tool's input schema for type coercion.
func parseArgs(args []string, schema mcpclient.InputSchema, toolName string) (map[string]any, error) {
	result := map[string]any{}
	arrays := map[string][]any{} // accumulate repeated flags
	var paramsFile string

	i := 0
	for i < len(args) {
		arg := args[i]
		if arg == "--" {
			i++
			continue
		}
		if !strings.HasPrefix(arg, "--") {
			return nil, fmt.Errorf("unexpected argument %q; use --flag=value syntax", arg)
		}
		arg = arg[2:]

		var key, value string
		if k, v, found := strings.Cut(arg, "="); found {
			key, value = k, v
		} else {
			key = arg
			i++
			if i >= len(args) || strings.HasPrefix(args[i], "--") {
				// Boolean flag with no value.
				value = "true"
				i--
			} else {
				value = args[i]
			}
		}
		i++

		if key == "params-file" {
			paramsFile = value
			continue
		}

		prop, knownProp := schema.Properties[key]
		if !knownProp {
			return nil, fmt.Errorf("unknown flag --%s; run 'subtext %s --help' to see valid flags", key, strings.Replace(toolName, "-", " ", 1))
		}

		coerced, err := coerce(value, prop)
		if err != nil {
			return nil, fmt.Errorf("--%s: %w", key, err)
		}
		if prop.Type == "array" {
			arrays[key] = append(arrays[key], coerced)
		} else {
			result[key] = coerced
		}
	}

	// Merge array accumulations.
	for k, v := range arrays {
		result[k] = v
	}

	// Handle --params-file: merge into result (file wins over individual flags for overlapping keys).
	if paramsFile != "" {
		data, err := os.ReadFile(paramsFile)
		if err != nil {
			return nil, fmt.Errorf("--params-file: %w", err)
		}
		var extra map[string]any
		if err := json.Unmarshal(data, &extra); err != nil {
			return nil, fmt.Errorf("--params-file: invalid JSON: %w", err)
		}
		maps.Copy(result, extra)
	}

	// Validate required fields.
	for _, req := range schema.Required {
		if _, ok := result[req]; !ok {
			return nil, fmt.Errorf("missing required flag: --%s", req)
		}
	}

	return result, nil
}

func coerce(value string, prop mcpclient.PropertySchema) (any, error) {
	t := prop.Type
	if t == "array" && prop.Items != nil {
		t = prop.Items.Type
	}
	switch t {
	case "integer":
		n, err := strconv.ParseInt(value, 10, 64)
		if err != nil {
			return nil, fmt.Errorf("expected integer, got %q", value)
		}
		return n, nil
	case "number":
		n, err := strconv.ParseFloat(value, 64)
		if err != nil {
			return nil, fmt.Errorf("expected number, got %q", value)
		}
		return n, nil
	case "boolean":
		b, err := strconv.ParseBool(value)
		if err != nil {
			return nil, fmt.Errorf("expected boolean, got %q", value)
		}
		return b, nil
	default:
		return value, nil
	}
}

func renderContents(contents []mcpclient.Content) error {
	if globalFlags.format == "json" {
		// Collect all text blocks and emit a single JSON value. The server
		// sends X-MCP-Format: json responses whose text content is already a
		// JSON string; we print it directly. If the text isn't valid JSON (e.g.
		// a pre-WS1 server or an error message) we wrap it so the output is
		// always valid JSON.
		var sb strings.Builder
		for _, c := range contents {
			if c.Type == "text" {
				sb.WriteString(c.Text)
			}
		}
		text := strings.TrimSpace(sb.String())
		if json.Valid([]byte(text)) {
			_, err := fmt.Fprintln(os.Stdout, text)
			return err
		}
		return json.NewEncoder(os.Stdout).Encode(map[string]any{"data": text})
	}
	for _, c := range contents {
		switch c.Type {
		case "text":
			fmt.Print(c.Text)
			if len(c.Text) > 0 && c.Text[len(c.Text)-1] != '\n' {
				fmt.Println()
			}
		case "image":
			// Estimate decoded byte size from base64 length.
			approxBytes := len(c.Data) * 3 / 4
			fmt.Fprintf(os.Stderr, "<image: ~%dKB %s>\n", approxBytes/1024, c.MimeType)
		default:
			fmt.Fprintf(os.Stderr, "<content type=%q>\n", c.Type)
		}
	}
	return nil
}

// wantsHelp returns true if any token in args is -h or --help.
func wantsHelp(args []string) bool {
	for _, a := range args {
		if a == "--help" || a == "-h" {
			return true
		}
	}
	return false
}

// extractGlobalFlags scans raw args for global flags that cobra would normally
// parse before DisableFlagParsing kicks in, and sets globalFlags accordingly.
// Returns the args with those tokens removed.
func extractGlobalFlags(args []string) []string {
	var out []string
	i := 0
	for i < len(args) {
		arg := args[i]
		switch {
		case arg == "--format" && i+1 < len(args):
			globalFlags.format = args[i+1]
			i++
		case strings.HasPrefix(arg, "--format="):
			globalFlags.format = arg[len("--format="):]
		case arg == "--api-key" && i+1 < len(args):
			globalFlags.apiKey = args[i+1]
			i++
		case strings.HasPrefix(arg, "--api-key="):
			globalFlags.apiKey = arg[len("--api-key="):]
		case arg == "--region" && i+1 < len(args):
			globalFlags.region = args[i+1]
			i++
		case strings.HasPrefix(arg, "--region="):
			globalFlags.region = arg[len("--region="):]
		case arg == "--endpoint" && i+1 < len(args):
			globalFlags.endpoint = args[i+1]
			i++
		case strings.HasPrefix(arg, "--endpoint="):
			globalFlags.endpoint = arg[len("--endpoint="):]
		case arg == "--config" && i+1 < len(args):
			globalFlags.configPath = args[i+1]
			i++
		case strings.HasPrefix(arg, "--config="):
			globalFlags.configPath = arg[len("--config="):]
		default:
			out = append(out, arg)
		}
		i++
	}
	return out
}
