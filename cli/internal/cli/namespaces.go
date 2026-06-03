package cli

import (
	"github.com/spf13/cobra"
)

// namespaceRunE is the shared RunE for namespace commands. It prepends the
// namespace prefix to the first arg so that "subtext live act-click" resolves
// to the "live-act-click" tool. DisableFlagParsing must be set on the parent
// command, so --help is intercepted here before delegating.
func namespaceRunE(cmd *cobra.Command, args []string) error {
	if len(args) == 0 || args[0] == "--help" || args[0] == "-h" {
		return cmd.Help()
	}
	toolName := cmd.Use + "-" + args[0]
	return runCall(cmd, append([]string{toolName}, args[1:]...))
}

var liveCmd = &cobra.Command{
	Use:   "live",
	Short: "Drive a hosted browser via live MCP tools",
	Long: `Drive a hosted Subtext browser session: open URLs, observe a viewer,
take screenshots, run JavaScript in the page, and hand off control.

For workflow guidance and tool reference:
  https://github.com/fullstorydev/subtext/tree/main/skills/live`,
	DisableFlagParsing: true,
	RunE:               namespaceRunE,
}

var commentCmd = &cobra.Command{
	Use:   "comment",
	Short: "Create and retrieve session comments",
	Long: `Create and retrieve comments attached to FullStory sessions.
Comments anchor observations to specific moments in a recording.

For workflow guidance and tool reference:
  https://github.com/fullstorydev/subtext/tree/main/skills/comments`,
	DisableFlagParsing: true,
	RunE:               namespaceRunE,
}

var docCmd = &cobra.Command{
	Use:   "doc",
	Short: "Create and manage proof documents",
	Long: `Create proof documents that embed screenshots, session viewers, and code.
Documents are the primary deliverable for sharing agent findings with reviewers.

For workflow guidance and tool reference:
  https://github.com/fullstorydev/subtext/tree/main/skills/docs`,
	DisableFlagParsing: true,
	RunE:               namespaceRunE,
}

// tunnelCmd is declared in tunnel.go (hand-written subcommands).

var artifactCmd = &cobra.Command{
	Use:   "artifact",
	Short: "Upload and retrieve artifacts",
	Long: `Upload files (screenshots, HAR traces, logs) and retrieve them by ID.
Artifacts persist across sessions and can be linked from proof documents.`,
	DisableFlagParsing: true,
	RunE:               namespaceRunE,
}

func init() {
	liveCmd.SetHelpFunc(namespaceHelpFunc("live-",
		"https://github.com/fullstorydev/subtext/tree/main/skills/live"))
	commentCmd.SetHelpFunc(namespaceHelpFunc("comment-",
		"https://github.com/fullstorydev/subtext/tree/main/skills/comments"))
	docCmd.SetHelpFunc(namespaceHelpFunc("doc-",
		"https://github.com/fullstorydev/subtext/tree/main/skills/docs"))
	artifactCmd.SetHelpFunc(namespaceHelpFunc("artifact-", ""))
}
