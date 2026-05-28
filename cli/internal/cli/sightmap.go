package cli

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/spf13/cobra"

	"github.com/fullstorydev/subtext/cli/internal/sightmap"
)

var sightmapCmd = &cobra.Command{
	Use:   "sightmap",
	Short: "Upload .sightmap/ component definitions",
	Long: `Upload .sightmap/ definitions to a live Subtext session so the hosted
browser can resolve component names to CSS selectors.

The upload URL is returned by 'subtext live tunnel':
  URL=$(subtext live tunnel --format json | jq -r .data.sightmapUploadUrl)
  subtext sightmap upload --url "$URL"`,
}

var sightmapUploadFlags struct {
	url  string
	root string
}

var sightmapUploadCmd = &cobra.Command{
	Use:   "upload",
	Short: "Upload .sightmap/ definitions to a live session",
	RunE:  runSightmapUpload,
}

func init() {
	f := sightmapUploadCmd.Flags()
	f.StringVar(&sightmapUploadFlags.url, "url", "", "Sightmap upload URL (from: subtext live tunnel --format json | jq -r .data.sightmapUploadUrl)")
	f.StringVar(&sightmapUploadFlags.root, "root", "", "Directory containing .sightmap/ (auto-detected if omitted)")
	_ = sightmapUploadCmd.MarkFlagRequired("url")

	sightmapCmd.AddCommand(sightmapUploadCmd)
}

func runSightmapUpload(cmd *cobra.Command, _ []string) error {
	root := sightmapUploadFlags.root
	if root == "" {
		cwd, err := os.Getwd()
		if err != nil {
			return fmt.Errorf("getwd: %w", err)
		}
		root, err = sightmap.FindRoot(cwd, globalConfig.SightmapRoot)
		if err != nil {
			return err
		}
	}

	payload, err := sightmap.Collect(root)
	if err != nil {
		return err
	}
	if len(payload.Sightmap) == 0 && len(payload.Memory) == 0 {
		if globalFlags.format == "json" {
			return json.NewEncoder(os.Stdout).Encode(map[string]any{"ok": true, "components": 0, "message": "No sightmap definitions found"})
		}
		fmt.Println("No sightmap definitions found")
		return nil
	}

	n, err := sightmap.Upload(cmd.Context(), sightmapUploadFlags.url, payload)
	if err != nil {
		return err
	}

	if globalFlags.format == "json" {
		return json.NewEncoder(os.Stdout).Encode(map[string]any{"ok": true, "components": n})
	}
	fmt.Printf("Uploaded %d sightmap component(s).\n", n)
	return nil
}
