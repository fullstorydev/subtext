package cli

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/spf13/cobra"

	"fs/services/lidar/main/subtext/internal/auth"
	"fs/services/lidar/main/subtext/internal/tunnel"
)

// tunnelCmd replaces the passthrough namespace stub from namespaces.go.
// Its children are hand-written (connect, disconnect, status) instead of
// delegating to the server's tunnel-* MCP tools.
var tunnelCmd = &cobra.Command{
	Use:   "tunnel",
	Short: "Manage reverse tunnels to local dev servers",
	Long: `Connect a local development server to the Subtext relay so the hosted
browser can reach it without exposing it to the public internet.

For workflow guidance:
  https://github.com/fullstorydev/subtext/tree/main/skills/tunnel`,
}

var (
	connectFlags struct {
		relayURL       string
		allowedOrigins []string
		connectionID   string
		detach         bool
	}

	disconnectFlags struct {
		tunnelID string
		all      bool
	}
)

func init() {
	// connect
	cf := tunnelConnectCmd.Flags()
	cf.StringVar(&connectFlags.relayURL, "relay-url", "", "WebSocket relay URL (from: subtext live tunnel --format json | jq -r .data.relayUrl)")
	cf.StringArrayVar(&connectFlags.allowedOrigins, "allowed-origins", nil, "Allowed origin patterns (host:port, repeatable)")
	cf.StringVar(&connectFlags.connectionID, "connection-id", "", "Connection ID for relay affinity routing")
	cf.BoolVar(&connectFlags.detach, "detach", false, "Fork into background; print {tunnel_id,pid} and exit (agent-friendly)")
	_ = tunnelConnectCmd.MarkFlagRequired("relay-url")

	// disconnect
	df := tunnelDisconnectCmd.Flags()
	df.StringVar(&disconnectFlags.tunnelID, "tunnel-id", "", "Tunnel ID to disconnect")
	df.BoolVar(&disconnectFlags.all, "all", false, "Disconnect all tunnels")

	tunnelCmd.AddCommand(tunnelConnectCmd, tunnelDisconnectCmd, tunnelStatusCmd)
}

// ----- tunnel connect -----

var tunnelConnectCmd = &cobra.Command{
	Use:   "connect",
	Short: "Connect a local dev server to the Subtext relay",
	Long: `Open a reverse WebSocket tunnel so the Subtext hosted browser can reach a
local development server.

FOREGROUND (human / shell):
  subtext tunnel connect --relay-url $RELAY
  # Blocks until killed. Use Ctrl-C or kill to stop.

BACKGROUND (agent / CI):
  subtext tunnel connect --relay-url $RELAY --detach
  # Parent exits once the tunnel is ready; prints {tunnel_id, pid, state}.
  # To stop: subtext tunnel disconnect --tunnel-id <id>

The relay URL is obtained from the hosted browser:
  RELAY=$(subtext live tunnel --format json | jq -r .data.relayUrl)`,
	RunE: runTunnelConnect,
}

func runTunnelConnect(_ *cobra.Command, _ []string) error {
	// Daemon mode: child process launched by --detach path.
	if os.Getenv("SUBTEXT_TUNNEL_DAEMON") == "1" {
		return runTunnelDaemon()
	}
	if connectFlags.detach {
		return runTunnelDetach()
	}
	return runTunnelForeground()
}

// newTunnelClient resolves credentials and builds a Client from the current connect flags.
func newTunnelClient() (*tunnel.Client, error) {
	apiKey, err := auth.ResolveAPIKey(globalFlags.apiKey, globalConfig.APIKey)
	if err != nil {
		return nil, err
	}
	origins, err := tunnel.ParseOriginPatterns(connectFlags.allowedOrigins)
	if err != nil {
		return nil, err
	}
	logFn := func(format string, args ...any) { fmt.Fprintf(os.Stderr, "[tunnel] "+format+"\n", args...) }
	return tunnel.NewClient(tunnel.ClientOptions{
		RelayURL:          connectFlags.relayURL,
		ConnectionID:      connectFlags.connectionID,
		AllowedOrigins:    origins,
		AllowedOriginsRaw: connectFlags.allowedOrigins,
		Headers:           http.Header{"Authorization": {"Bearer " + apiKey.Key}},
		Log:               logFn,
	}), nil
}

// runTunnelForeground connects and blocks until SIGTERM/SIGINT or relay error.
func runTunnelForeground() error {
	client, err := newTunnelClient()
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer stop()

	onReady := func(info tunnel.ReadyInfo) {
		if globalFlags.format == "json" {
			enc := json.NewEncoder(os.Stdout)
			_ = enc.Encode(map[string]any{
				"tunnel_id":     info.TunnelID,
				"connection_id": info.ConnectionID,
				"state":         tunnel.StateReady,
			})
		} else {
			fmt.Fprintf(os.Stderr, "[tunnel] ready: tunnel_id=%s\n", info.TunnelID)
		}
	}

	if err := client.Run(ctx, onReady); errors.Is(err, tunnel.ErrNeedLiveTunnel) {
		return fmt.Errorf("relay requires a fresh relay URL — run: RELAY=$(subtext live tunnel --format json | jq -r .data.relayUrl)")
	}
	return err
}

// runTunnelDetach forks a daemon child and waits for it to signal ready.
func runTunnelDetach() error {
	exe, err := os.Executable()
	if err != nil {
		return fmt.Errorf("resolve executable: %w", err)
	}

	// Build args for the daemon (same flags minus --detach).
	args := []string{"tunnel", "connect", "--relay-url", connectFlags.relayURL}
	for _, o := range connectFlags.allowedOrigins {
		args = append(args, "--allowed-origins", o)
	}
	if connectFlags.connectionID != "" {
		args = append(args, "--connection-id", connectFlags.connectionID)
	}
	// Forward global flags that affect auth/endpoint resolution.
	if globalFlags.apiKey != "" {
		args = append(args, "--api-key", globalFlags.apiKey)
	}
	if globalFlags.region != "" {
		args = append(args, "--region", globalFlags.region)
	}
	if globalFlags.endpoint != "" {
		args = append(args, "--endpoint", globalFlags.endpoint)
	}

	// Pipe: child writes ready JSON to write-end (fd 3); parent reads.
	readPipe, writePipe, err := os.Pipe()
	if err != nil {
		return fmt.Errorf("create ready pipe: %w", err)
	}

	// Log file for daemon stderr/stdout.
	logDir, err := tunnelStateDir()
	if err != nil {
		return err
	}
	logPath := filepath.Join(logDir, "daemon.log")
	logFile, err := os.OpenFile(logPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0600)
	if err != nil {
		return fmt.Errorf("open daemon log: %w", err)
	}

	cmd := exec.Command(exe, args...)
	cmd.Env = append(os.Environ(), "SUBTEXT_TUNNEL_DAEMON=1", "SUBTEXT_TUNNEL_READY_FD=3")
	cmd.ExtraFiles = []*os.File{writePipe} // fd 3 in child
	cmd.Stdout = logFile
	cmd.Stderr = logFile
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}

	if err := cmd.Start(); err != nil {
		_ = writePipe.Close()
		_ = readPipe.Close()
		_ = logFile.Close()
		return fmt.Errorf("start daemon: %w", err)
	}
	_ = writePipe.Close() // parent doesn't need write end
	_ = logFile.Close()

	// Wait for ready signal (timeout 15s).
	type result struct {
		data []byte
		err  error
	}
	ch := make(chan result, 1)
	go func() {
		data, err := io.ReadAll(readPipe)
		ch <- result{data, err}
	}()

	select {
	case r := <-ch:
		_ = readPipe.Close()
		if r.err != nil {
			return fmt.Errorf("read ready signal: %w", r.err)
		}
		if len(r.data) == 0 {
			return fmt.Errorf("daemon exited before signaling ready (check %s)", logPath)
		}
		var sig daemonSignal
		if err := json.NewDecoder(bytes.NewReader(r.data)).Decode(&sig); err != nil {
			return fmt.Errorf("parse daemon signal: %w", err)
		}
		if !sig.OK {
			return fmt.Errorf("tunnel daemon failed: %s", sig.Error)
		}
		_, _ = os.Stdout.Write(r.data)
		return nil

	case <-time.After(15 * time.Second):
		_ = readPipe.Close()
		// Check whether the child is still alive.
		if cmd.Process != nil {
			_ = cmd.Process.Signal(syscall.Signal(0))
		}
		return fmt.Errorf("timeout waiting for tunnel ready (check %s)", logPath)
	}
}

// runTunnelDaemon is the child process in --detach mode. It connects the
// tunnel, writes the state file and ready JSON to fd 3, then blocks until
// SIGTERM or the relay closes.
func runTunnelDaemon() error {
	readyFDStr := os.Getenv("SUBTEXT_TUNNEL_READY_FD")
	os.Unsetenv("SUBTEXT_TUNNEL_DAEMON")
	os.Unsetenv("SUBTEXT_TUNNEL_READY_FD")

	var readyPipe *os.File
	if readyFDStr != "" {
		fd, err := strconv.Atoi(readyFDStr)
		if err == nil {
			readyPipe = os.NewFile(uintptr(fd), "ready-pipe")
		}
	}

	client, err := newTunnelClient()
	if err != nil {
		signalDaemonError(readyPipe, err)
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer stop()

	var once sync.Once
	onReady := func(info tunnel.ReadyInfo) {
		once.Do(func() {
			sf := tunnel.StateFile{
				TunnelID:     info.TunnelID,
				PID:          os.Getpid(),
				RelayURL:     connectFlags.relayURL,
				ConnectionID: info.ConnectionID,
				TraceID:      info.TraceID,
				StartedAt:    time.Now().UTC(),
				State:        tunnel.StateReady,
			}

			// Write state file.
			if err := writeStateFile(sf); err != nil {
				fmt.Fprintf(os.Stderr, "[tunnel] state file error: %v\n", err)
			}

			// Install SIGTERM handler to remove state file on clean shutdown.
			go func() {
				<-ctx.Done()
				_ = removeStateFile(info.TunnelID)
			}()

			// Signal parent: write ready envelope to pipe then close.
			writeDaemonSignal(readyPipe, daemonSignal{OK: true, StateFile: &sf})
			readyPipe = nil
		})
	}

	if err := client.Run(ctx, onReady); errors.Is(err, tunnel.ErrNeedLiveTunnel) {
		return fmt.Errorf("relay requires a fresh relay URL")
	}
	return err
}

// daemonSignal is the JSON envelope written to the ready pipe by the daemon child.
// OK=true means the tunnel reached ready and StateFile is populated.
// OK=false means startup failed and Error describes the problem.
type daemonSignal struct {
	OK    bool   `json:"ok"`
	Error string `json:"error,omitempty"`
	*tunnel.StateFile
}

func writeDaemonSignal(pipe *os.File, sig daemonSignal) {
	if pipe == nil {
		return
	}
	data, _ := json.Marshal(sig)
	data = append(data, '\n')
	_, _ = pipe.Write(data)
	_ = pipe.Close()
}

func signalDaemonError(pipe *os.File, err error) {
	writeDaemonSignal(pipe, daemonSignal{Error: err.Error()})
}

// ----- tunnel disconnect -----

var tunnelDisconnectCmd = &cobra.Command{
	Use:   "disconnect",
	Short: "Disconnect a running tunnel daemon",
	Long: `Stop a detached tunnel daemon by tunnel ID.

Examples:
  subtext tunnel disconnect --tunnel-id t_abc123
  subtext tunnel disconnect --all`,
	RunE: runTunnelDisconnect,
}

func runTunnelDisconnect(_ *cobra.Command, _ []string) error {
	dir, err := tunnelStateDir()
	if err != nil {
		return err
	}

	if disconnectFlags.all {
		return disconnectAll(dir)
	}
	if disconnectFlags.tunnelID == "" {
		return fmt.Errorf("--tunnel-id or --all required")
	}
	return disconnectOne(dir, disconnectFlags.tunnelID)
}

func disconnectOne(dir, tunnelID string) error {
	sf, err := readStateFile(dir, tunnelID)
	if err != nil {
		return fmt.Errorf("tunnel %q not found (exit 3)", tunnelID)
	}
	if err := syscall.Kill(sf.PID, syscall.SIGTERM); err != nil {
		if !errors.Is(err, syscall.ESRCH) {
			return fmt.Errorf("signal pid %d: %w", sf.PID, err)
		}
	}
	// Wait up to 5s for state file to disappear (removed by child's shutdown handler).
	path := stateFilePath(dir, tunnelID)
	ticker := time.NewTicker(100 * time.Millisecond)
	deadline := time.NewTimer(5 * time.Second)
	defer ticker.Stop()
	defer deadline.Stop()
wait:
	for {
		if _, err := os.Stat(path); os.IsNotExist(err) {
			break wait
		}
		select {
		case <-ticker.C:
		case <-deadline.C:
			break wait
		}
	}
	_ = os.Remove(path) // clean up in case child didn't

	if globalFlags.format == "json" {
		_ = json.NewEncoder(os.Stdout).Encode(map[string]any{"ok": true, "tunnel_id": tunnelID})
	} else {
		fmt.Println("disconnected:", tunnelID)
	}
	return nil
}

func disconnectAll(dir string) error {
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	var lastErr error
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		id := strings.TrimSuffix(e.Name(), ".json")
		if err := disconnectOne(dir, id); err != nil {
			lastErr = err
		}
	}
	return lastErr
}

// ----- tunnel status -----

var tunnelStatusCmd = &cobra.Command{
	Use:   "status",
	Short: "List running tunnel daemons",
	RunE:  runTunnelStatus,
}

func runTunnelStatus(_ *cobra.Command, _ []string) error {
	dir, err := tunnelStateDir()
	if err != nil {
		return err
	}
	pruneStaleTunnels(dir)

	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			entries = nil
		} else {
			return err
		}
	}

	type statusEntry struct {
		tunnel.StateFile
		PIDAlive bool `json:"pid_alive"`
	}

	var rows []statusEntry
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		id := strings.TrimSuffix(e.Name(), ".json")
		sf, err := readStateFile(dir, id)
		if err != nil {
			continue
		}
		alive := pidAlive(sf.PID)
		rows = append(rows, statusEntry{sf, alive})
	}

	if globalFlags.format == "json" {
		if rows == nil {
			rows = []statusEntry{}
		}
		return json.NewEncoder(os.Stdout).Encode(rows)
	}

	if len(rows) == 0 {
		fmt.Println("no tunnels running")
		return nil
	}
	fmt.Printf("%-30s %-8s %-10s %s\n", "TUNNEL_ID", "PID", "STATE", "RELAY_URL")
	for _, r := range rows {
		alive := "yes"
		if !r.PIDAlive {
			alive = "dead"
		}
		fmt.Printf("%-30s %-8d %-10s %s\n", r.TunnelID, r.PID, alive, r.RelayURL)
	}
	return nil
}

// ----- State file helpers -----

func tunnelStateDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("home dir: %w", err)
	}
	dir := filepath.Join(home, ".subtext", "tunnels")
	if err := os.MkdirAll(dir, 0700); err != nil {
		return "", fmt.Errorf("create state dir: %w", err)
	}
	return dir, nil
}

func stateFilePath(dir, tunnelID string) string {
	return filepath.Join(dir, tunnelID+".json")
}

func writeStateFile(sf tunnel.StateFile) error {
	dir, err := tunnelStateDir()
	if err != nil {
		return err
	}
	data, err := json.Marshal(sf)
	if err != nil {
		return err
	}
	return os.WriteFile(stateFilePath(dir, sf.TunnelID), data, 0600)
}

func readStateFile(dir, tunnelID string) (tunnel.StateFile, error) {
	data, err := os.ReadFile(stateFilePath(dir, tunnelID))
	if err != nil {
		return tunnel.StateFile{}, err
	}
	var sf tunnel.StateFile
	if err := json.Unmarshal(data, &sf); err != nil {
		return tunnel.StateFile{}, err
	}
	return sf, nil
}

func removeStateFile(tunnelID string) error {
	dir, err := tunnelStateDir()
	if err != nil {
		return err
	}
	err = os.Remove(stateFilePath(dir, tunnelID))
	if os.IsNotExist(err) {
		return nil
	}
	return err
}

// pruneStaleTunnels removes state files whose PID is no longer alive.
func pruneStaleTunnels(dir string) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		id := strings.TrimSuffix(e.Name(), ".json")
		sf, err := readStateFile(dir, id)
		if err != nil {
			continue
		}
		if !pidAlive(sf.PID) {
			_ = os.Remove(stateFilePath(dir, id))
		}
	}
}

// pidAlive reports whether a process with the given PID is running.
func pidAlive(pid int) bool {
	if pid <= 0 {
		return false
	}
	return syscall.Kill(pid, 0) == nil
}
