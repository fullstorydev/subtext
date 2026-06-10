package cli

import (
	"github.com/spf13/cobra"
)

// namespaceRunE is the shared RunE for namespace commands. It prepends the
// namespace prefix to the first arg so that "subtext live act-click" resolves
// to the "live-act-click" tool. DisableFlagParsing must be set on the parent
// command, so --help is intercepted here before delegating.
func namespaceRunE(cmd *cobra.Command, args []string) error {
	// DisableFlagParsing passes any leading global flag through as args[0];
	// pull them out before building the tool name or it gets glued in.
	args = extractGlobalFlags(args)
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
  https://github.com/fullstorydev/subtext/blob/main/cli/skills/live/SKILL.md`,
	DisableFlagParsing: true,
	RunE:               namespaceRunE,
}

var commentCmd = &cobra.Command{
	Use:   "comment",
	Short: "Create and retrieve session comments",
	Long: `Create and retrieve comments attached to Fullstory sessions.
Comments anchor observations to specific moments in a recording.

For workflow guidance and tool reference:
  https://github.com/fullstorydev/subtext/blob/main/cli/skills/comments/SKILL.md`,
	DisableFlagParsing: true,
	RunE:               namespaceRunE,
}

var docCmd = &cobra.Command{
	Use:   "doc",
	Short: "Create and manage proof documents",
	Long: `Create proof documents that embed screenshots, session viewers, and code.
Documents are the primary deliverable for sharing agent findings with reviewers.

For workflow guidance and tool reference:
  https://github.com/fullstorydev/subtext/blob/main/cli/skills/docs/SKILL.md`,
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

var privacyCmd = &cobra.Command{
	Use:   "privacy",
	Short: "Detect PII and manage element-block privacy rules",
	Long: `Propose CSS selectors for PII elements in a session, persist them as
element-block rules, and manage their lifecycle (list, delete, promote).

Rules are created in preview scope (PREVIEW_SESSIONS_ONLY) and must be
explicitly promoted to apply to all sessions. Only mask and exclude rules
are supported — unmask rules cannot be created or deleted via this tool.

For workflow guidance and tool reference:
  https://github.com/fullstorydev/subtext/blob/main/cli/skills/privacy/SKILL.md`,
	DisableFlagParsing: true,
	RunE:               namespaceRunE,
}

var reviewCmd = &cobra.Command{
	Use:   "review",
	Short: "Deep-review a recorded Fullstory session",
	Long: `Open a completed Fullstory session for deep agent review: capture screenshots,
walk the component tree, and diff two moments in time to understand what happened.

Primary use cases:
  - Verify another agent's proof work (BEFORE/AFTER chapter markers as the spine)
  - Diagnose a bug or regression from a captured session
  - Produce a structured summary of what an agent or user did

Sessions are identified by trace_id, session URL, device+session IDs,
email address, or user UID. Always close when done to release resources.

For workflow guidance and tool reference:
  https://github.com/fullstorydev/subtext/blob/main/cli/skills/review/SKILL.md`,
	DisableFlagParsing: true,
	RunE:               namespaceRunE,
}

func init() {
	liveCmd.SetHelpFunc(namespaceHelpFunc("live-",
		"https://github.com/fullstorydev/subtext/blob/main/cli/skills/live/SKILL.md"))
	commentCmd.SetHelpFunc(namespaceHelpFunc("comment-",
		"https://github.com/fullstorydev/subtext/blob/main/cli/skills/comments/SKILL.md"))
	docCmd.SetHelpFunc(namespaceHelpFunc("doc-",
		"https://github.com/fullstorydev/subtext/blob/main/cli/skills/docs/SKILL.md"))
	artifactCmd.SetHelpFunc(namespaceHelpFunc("artifact-", ""))
	privacyCmd.SetHelpFunc(namespaceHelpFunc("privacy-",
		"https://github.com/fullstorydev/subtext/blob/main/cli/skills/privacy/SKILL.md"))
	reviewCmd.SetHelpFunc(namespaceHelpFunc("review-",
		"https://github.com/fullstorydev/subtext/blob/main/cli/skills/review/SKILL.md"))
}
