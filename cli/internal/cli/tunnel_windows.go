//go:build windows

package cli

import (
	"fmt"

	"github.com/spf13/cobra"
)

// tunnelCmd is a stub on Windows. The tunnel daemon uses Unix process management
// that is not available on Windows.
var tunnelCmd = &cobra.Command{
	Use:   "tunnel",
	Short: "Manage reverse tunnels (not supported on Windows)",
	RunE: func(cmd *cobra.Command, args []string) error {
		return fmt.Errorf("tunnel is not supported on Windows")
	},
}
