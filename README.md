# Subtext by Fullstory

AI coding assistant skills for session analysis. Works with Claude Code, Cursor, Windsurf, and other agents that support the SKILL.md format.

## Quick Start

1. Install the plugin (see below)
2. Authenticate via OAuth when prompted, or [set an API key](https://app.fullstory.com/ui/org/settings/apikeys) if preferred
3. Paste a Fullstory session URL — Subtext handles the rest

```
> Fix this bug: https://app.fullstory.com/ui/org/session/dev:ses
```

Subtext auto-detects the environment, infers what you want, and delegates to the right workflow. See [docs/USAGE.md](docs/USAGE.md) for the full guide.

## Installation

### Claude Code (Plugin)

```bash
/plugin marketplace add https://subtext.fullstory.com/repo.git
/plugin install subtext@subtext-marketplace

# Or test locally
claude --plugin-dir /path/to/subtext
```

**Note:** Most tools will prompt you to authenticate via OAuth on first use. If your tool doesn't support OAuth, see "Manual MCP Configuration" below to configure an API key.

### OpenSkills (Cursor, Windsurf, etc.)

```bash
npx openskills install https://subtext.fullstory.com/repo.git
npx openskills sync
```

See [OpenSkills](https://github.com/numman-ali/openskills) for more details.

### Manual MCP Configuration

If your tool didn't configure MCP servers automatically during installation, add them manually.

#### OAuth (recommended)

Add the server URL without any headers — your tool will handle the OAuth flow on first use.

**Claude Code** (`~/.claude/settings.json`):
```json
{
  "mcpServers": {
    "session-review": {
      "type": "http",
      "url": "https://api.fullstory.com/mcp/subtext"
    }
  }
}
```

**Cursor** (Settings → MCP → Add Server):
```json
{
  "session-review": {
    "type": "http",
    "url": "https://api.fullstory.com/mcp/subtext"
  }
}
```

#### API Key

If you prefer API key authentication, get your key from https://app.fullstory.com/ui/org/settings/apikeys and pass it as a Bearer token header.

**Claude Code** (`~/.claude/settings.json`):
```json
{
  "mcpServers": {
    "subtext": {
      "type": "http",
      "url": "https://api.fullstory.com/mcp/subtext",
      "headers": {
        "Authorization": "Bearer YOUR_SUBTEXT_API_KEY"
      }
    }
  }
}
```

**Cursor** (Settings → MCP → Add Server):
```json
{
  "subtext": {
    "type": "http",
    "url": "https://api.fullstory.com/mcp/subtext",
    "headers": {
      "Authorization": "Bearer YOUR_SUBTEXT_API_KEY"
    }
  }
}
```

See `.mcp.example.json` in this repo for a template

## What's Included

### Skills (portable — Claude Code, Cursor, Windsurf)

| Skill | Description |
|---|---|
| **session** | Auto-triggered workflow router. Detects environment, infers intent, delegates to subagents. |
| **bug-diagnosis** | Diagnose a session: understand what happened, expected vs actual, reproduction steps, component evidence. |
| **qa-automation** | Generate Playwright/Cypress test steps from a session recording. |
| **bug-fix** | Phased bug-fix workflow: understand, reproduce, locate, test, fix, validate. |
| **sightmap** | Define semantic component mappings for enriched browser snapshots. |
| **ui-implementation** | Navigate from live UI to source code via sightmap + browser tools. |

### Commands (Claude Code only)

| Command | Description |
|---|---|
| `/subtext:bug-diagnosis` | Diagnose a session / bug as a subagent |
| `/subtext:qa-automation` | Generate test automation as a subagent |

### Tunnel (`tunnel/`)

A local MCP server that creates a reverse tunnel so the hosted browser can reach `localhost` apps. When the agent needs to interact with a local dev server, the tunnel proxies requests from Fullstory infrastructure back to the user's machine.

The rollup bundle is committed to the repo so the tunnel works when installed as a plugin — no build step needed by consumers.

## Repository Structure

```
subtext/
├── .claude/
│   └── commands/               # Claude Code slash commands
│       ├── session-summary.md
│       ├── bug-diagnosis.md
│       └── qa-automation.md
├── .claude-plugin/
│   ├── plugin.json             # Claude Code plugin manifest
│   └── marketplace.json        # Marketplace registry
├── .mcp.json                   # MCP server config (subtext + live-tunnel)
├── skills/
│   ├── session/                # Workflow router (auto-triggered)
│   ├── bug-diagnosis/          # Session analysis and bug diagnosis
│   ├── qa-automation/          # Test automation generation
│   ├── bug-fix/                # Phased bug-fix workflow
│   ├── sightmap/               # Component definition setup
│   └── ui-implementation/      # UI-to-source navigation
├── tunnel/                     # Reverse tunnel MCP server (local stdio)
│   ├── src/
│   │   ├── main.ts             # MCP tool registration
│   │   ├── client.ts           # WebSocket tunnel client
│   │   └── types.ts            # Protocol types
│   └── package.json
├── hooks/                      # PreToolUse hooks (sightmap injection)
├── rules/                      # Plugin rules (.mdc files)
├── deploy/                     # Docker/Cloud Run deployment
├── docs/
│   └── USAGE.md                # Usage guide
├── CLAUDE.md
└── README.md
```

## Development

### Building the tunnel

The bundled build is committed to the repo for plugin distribution. You only need to rebuild after modifying `tunnel/src/`:

```bash
cd tunnel
npm ci
npm run bundle  # builds + rollup bundles all deps into self-contained output
```

After bundling, commit the updated `tunnel/build/` directory. Source maps are gitignored.

### Local Testing (Claude Code)

```bash
claude --plugin-dir /path/to/subtext
```

### SSL Certificates for Local MCP Server

If connecting to a local MCP server with self-signed certs:

```bash
export NODE_EXTRA_CA_CERTS=~/.local/share/mkcert/rootCA.pem
```

## Future Work

- [ ] Additional skills based on usage patterns
