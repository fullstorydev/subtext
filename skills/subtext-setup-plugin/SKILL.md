---
name: subtext-setup-plugin
description: Install the Subtext plugin and verify the MCP server is connected. Authenticates via OAuth or API key.
---

# Setup Plugin

Install and verify the Subtext plugin/extension. Works for Claude Code, Cursor, Codex, and Gemini CLI.

## Pre-check

Verify connectivity by calling a lightweight MCP tool — do NOT read config files or plugin cache directories.

List the available tools on the `subtext` MCP server (or call `privacy-list`). If the call succeeds, the plugin is installed and connected. Report which server connected and move on.

## Install

If MCP tools are not available, the plugin needs to be installed. The command depends on the platform.

**Claude Code:**

```
/plugin marketplace add fullstorydev/subtext
/plugin install subtext@subtext-marketplace
```

**Gemini CLI:**

```
gemini extensions install https://github.com/fullstorydev/subtext
```

Note: Slash commands can't be executed by the agent — the user must run them directly.

## MCP connectivity failed

If the connectivity test fails:

1. The `subtext` MCP server did not respond.
2. Double-check authentication settings for the MCP server in the tool configuration.
3. Authenticate via the OAuth flow provided by your tool (Claude Code, Cursor, etc.), or configure an API key header for the MCP server.

Re-run the connectivity check after authenticating.

## Explain

After setup, explain what was installed:

- **Skills** — `subtext-review` (structured summary of a session), `subtext-session` (the `review-*` tool catalog), `subtext-privacy` (PII detection + element-block/URL/network privacy rules), `subtext-telemetry` (workflow milestone logging).
- **MCP server** — `subtext` at `https://api.fullstory.com/mcp/subtext` (EU1: `https://api.eu1.fullstory.com/mcp/subtext`).
