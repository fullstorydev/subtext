package cli

import (
	"fmt"
	"os"
	"runtime/debug"

	"github.com/spf13/cobra"

	"github.com/fullstorydev/subtext/cli/internal/auth"
	"github.com/fullstorydev/subtext/cli/internal/config"
	"github.com/fullstorydev/subtext/cli/internal/mcpclient"
)

const (
	exitUsage    = 2
	exitNotFound = 3
	exitAuth     = 4
)

// globalFlags holds the persistent flag values bound to rootCmd.
var globalFlags struct {
	apiKey     string
	region     string
	endpoint   string
	format     string
	configPath string
}

// globalConfig holds the loaded config file, available after cobra's OnInitialize fires.
var globalConfig config.File

var rootCmd = &cobra.Command{
	Use:   "subtext",
	Short: "Subtext — drive the Subtext MCP API from the command line",
	Long: `subtext is a CLI for the Subtext MCP API.

Run 'subtext <command> --help' for command usage and skill references.`,
	SilenceUsage:  true,
	SilenceErrors: true,
}

// Execute is the entry point called from main.
func Execute() error {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		return err
	}
	return nil
}

func init() {
	pf := rootCmd.PersistentFlags()
	pf.StringVar(&globalFlags.apiKey, "api-key", "", "API key (or \"-\" to read from stdin)")
	pf.StringVar(&globalFlags.region, "region", "", "Region: na1 (default), eu1")
	pf.StringVar(&globalFlags.endpoint, "endpoint", "", "Override MCP endpoint URL")
	pf.StringVar(&globalFlags.format, "format", "json", `Output format: json (default) or text`)
	pf.StringVar(&globalFlags.configPath, "config", "", "Config file path (default: ~/.config/subtext/config.yaml)")

	cobra.OnInitialize(loadConfig)
	rootCmd.CompletionOptions.HiddenDefaultCmd = true

	rootCmd.AddCommand(versionCmd)
	rootCmd.AddCommand(authCmd)
	rootCmd.AddCommand(liveCmd)
	rootCmd.AddCommand(commentCmd)
	rootCmd.AddCommand(docCmd)
	rootCmd.AddCommand(tunnelCmd)
	rootCmd.AddCommand(artifactCmd)
	rootCmd.AddCommand(sightmapCmd)
	rootCmd.AddCommand(privacyCmd)
	rootCmd.AddCommand(reviewCmd)
}

func loadConfig() {
	cfg, err := config.Load(globalFlags.configPath)
	if err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(exitUsage)
	}
	globalConfig = cfg
}

// resolveClient resolves auth and endpoint from global flags and config,
// returning an MCP client, the resolved API key, and the endpoint URL.
func resolveClient() (*mcpclient.Client, auth.Resolved, string, error) {
	apiKey, err := auth.ResolveAPIKey(globalFlags.apiKey, globalConfig.APIKey)
	if err != nil {
		return nil, auth.Resolved{}, "", err
	}
	endpoint, err := mcpclient.ResolveEndpoint(globalFlags.endpoint, globalFlags.region, globalConfig.Endpoint, globalConfig.Region)
	if err != nil {
		return nil, auth.Resolved{}, "", err
	}
	c := mcpclient.New(endpoint, apiKey.Key, "subtext-cli/"+binaryVersion())
	if globalFlags.format == "json" {
		c.WithJSONFormat()
	}
	return c, apiKey, endpoint, nil
}

func keyHint(key string) string {
	if len(key) <= 8 {
		return key
	}
	return key[len(key)-8:]
}

// Version is set at build time via ldflags:
//
//	-X github.com/fullstorydev/subtext/cli/internal/cli.Version=v1.2.3
var Version string

func binaryVersion() string {
	if Version != "" {
		return Version
	}
	if info, ok := debug.ReadBuildInfo(); ok && info.Main.Version != "(devel)" && info.Main.Version != "" {
		return info.Main.Version
	}
	return "dev"
}
