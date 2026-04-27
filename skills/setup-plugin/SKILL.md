---
name: setup-plugin
description: Install the Subtext plugin and configure MCP servers. Authenticates via OAuth or API Key.
metadata:
  platform: claude-code
  requires:
    skills: ["subtext:shared"]
---

# Setup Plugin

Install and verify the Subtext plugin for Claude Code.

## Pre-check

Verify the plugin is working by testing actual connectivity — do NOT read config files or plugin cache directories.

**Step 1: Test MCP connectivity**

Try calling a lightweight MCP tool to verify the server is reachable. For example, list the available tools on the `subtext` MCP server. If the call succeeds, the plugin is installed and connected.

Check these servers:
- `subtext` — required (for review, live, comments, privacy)
- `subtext-tunnel` — optional (local tunnel client)

If MCP tools are available, the plugin is working. Report which servers connected and move on.

**Step 2: Verify local dependencies**

Run in a single command:
```bash
python3 --version 2>&1 && python3 -c "import yaml; print('PyYAML OK')" 2>&1
```

These are required by the sightmap upload script. If missing:
- No Python 3: suggest `brew install python@3.12` (macOS)
- No PyYAML: suggest `python3 -m pip install pyyaml`

**If all pass:** report "Plugin is set up — MCP servers connected, dependencies OK." and exit.

## Install Steps

### Plugin not installed

If MCP tools are not available, the plugin needs to be installed.

<!-- TODO: Replace install instructions with `Read https://subtext.fullstory.com/install/` once that page exists, so instructions stay up to date automatically. -->

Tell the user to run:

```
/plugin marketplace add https://subtext.fullstory.com/repo.git
/plugin install subtext@subtext-marketplace
```

Note: Slash commands can't be executed by the agent — the user must run them directly.

### MCP connectivity failed

If the MCP connectivity test fails, tell the user:

1. **MCP connectivity test failed** — the subtext MCP server did not respond.
2. **Double-check authentication settings** for the MCP servers in the tool configuration.
3. **To authenticate**, follow the OAuth flow provided by the tool being used (e.g. Claude Code, Cursor) to connect the MCP servers. Alternatively, manually configure an API key header value for the MCP server as described in the installation instructions.

After the user has addressed authentication, re-run the MCP connectivity check to confirm everything works.

## Explain

After setup, explain what was installed:
- **Skills** — guided workflows for session analysis, bug fixing, UX review, and reproduction
- **MCP servers** — subtext (review, live, comments, privacy) and subtext-tunnel
- **Sightmap** — semantic component mapping, uploaded automatically after session open (set up later in onboarding)
