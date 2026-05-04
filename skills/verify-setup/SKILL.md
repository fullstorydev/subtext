---
name: verify-setup
description: Verify the Subtext plugin/extension is connected and diagnose MCP connectivity or auth failures. Does not install — see https://subtext.fullstory.com/install/ for first-time setup.
metadata:
  requires:
    skills: ["subtext:shared"]
---

# Verify Setup

Confirm Subtext is wired up correctly and diagnose failures. This skill assumes the plugin/extension is already installed — you wouldn't be reading it otherwise. For first-time install, point users at https://subtext.fullstory.com/install/.

## When to use

- User asks *"is Subtext working?"* or *"is it set up?"*
- A Subtext MCP tool just failed and you need to diagnose why
- Invoked implicitly by `subtext:onboard` when an early MCP call errors out

## Step 1: Test MCP connectivity

Try a lightweight MCP call to confirm the server is reachable. Listing tools on the `subtext` server is a good probe — it doesn't require any session or scope beyond auth.

Servers to consider:
- `subtext` (US) or `subtext-eu1` (EU) — required for review, live, comments. Whichever the user's account region uses.
- `subtext-tunnel` — optional, only needed for hosted-browser flows against a localhost dev server.

If the call succeeds, the plugin is connected. Report which servers are reachable and move to Step 2.

If the call fails, classify the failure:

- **Tool / server not registered** (the MCP server name isn't even available) → the plugin or extension isn't activated in this agent. Tell the user to enable it via their platform's extension/plugin UI. Don't prescribe specific UI flows — different platforms differ; ask the user to check whichever they're on.
- **401 / 403 / "auth required"** → MCP server is reachable but unauthenticated. Tell the user to complete the OAuth flow (typically opens a browser on first tool use), or to configure an API key per their platform's MCP server settings. Detailed install/auth steps live at https://subtext.fullstory.com/install/.
- **Network error / 5xx / timeout** → MCP server is unreachable. Suggest checking network and retrying. If persistent, escalate to subtext@fullstory.com.

## Step 2: Verify local dependencies

The sightmap upload script (`skills/shared/collect_and_upload_sightmap.py`) needs Python 3 + PyYAML. Run as a single command:

```bash
python3 --version 2>&1 && python3 -c "import yaml; print('PyYAML OK')" 2>&1
```

- No Python 3 → suggest the user's OS-appropriate install (e.g. `brew install python@3.12` on macOS).
- No PyYAML → suggest `python3 -m pip install pyyaml`.

These aren't fatal — Subtext's MCP tools work without sightmap upload — but agents that try to upload sightmap on session start will fail silently if these are missing.

## Step 3: Report

If everything passes:

> "Subtext is connected. MCP servers reachable, deps OK."

If something failed, report the specific failure and the next step you suggested. Stay terse — the user wants to get unstuck, not read a plumbing essay.
