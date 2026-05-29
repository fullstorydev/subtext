//go:build windows

package cli

import (
	"fmt"

	"github.com/spf13/cobra"
)

const errWindowsTunnel = "tunnel is not supported on Windows"

// tunnelCmd is a stub on Windows. The tunnel daemon uses Unix process
// management (Setsid, SIGTERM) that is not available on Windows.
var tunnelCmd = &cobra.Command{
	Use:   "tunnel",
	Short: "Manage reverse tunnels to local dev servers",
	Long:  "Manage reverse tunnels to local dev servers.\n\nNot supported on Windows.",
}

var tunnelConnectCmd = &cobra.Command{
	Use:   "connect",
	Short: "Connect a local dev server to the Subtext relay",
	RunE:  func(_ *cobra.Command, _ []string) error { return fmt.Errorf(errWindowsTunnel) },
}

var tunnelDisconnectCmd = &cobra.Command{
	Use:   "disconnect",
	Short: "Disconnect a running tunnel",
	RunE:  func(_ *cobra.Command, _ []string) error { return fmt.Errorf(errWindowsTunnel) },
}

var tunnelStatusCmd = &cobra.Command{
	Use:   "status",
	Short: "Show status of running tunnels",
	RunE:  func(_ *cobra.Command, _ []string) error { return fmt.Errorf(errWindowsTunnel) },
}

func init() {
	tunnelCmd.AddCommand(tunnelConnectCmd, tunnelDisconnectCmd, tunnelStatusCmd)
}
