# Installing Subtext for OpenCode

## Prerequisites

- [OpenCode.ai](https://opencode.ai) installed
- A Fullstory API key with Subtext access — exported as `SUBTEXT_API_KEY` (or `FULLSTORY_API_KEY`) before launching OpenCode

## Installation

The recommended install is `git clone` so you have a stable, predictable path
to point `skills.paths` at (see "Known limitations" below — the plugin can't
yet auto-register its skills directory):

```sh
git clone https://github.com/fullstorydev/subtext.git ~/.config/opencode/subtext
```

Then add the plugin, the skills path, and the Subtext MCP servers to your
`opencode.json` (global or project-level):

```json
{
  "plugin": ["file://~/.config/opencode/subtext/.opencode/plugins/subtext.js"],
  "skills": {
    "paths": ["~/.config/opencode/subtext/skills"]
  },
  "mcp": {
    "subtext": {
      "type": "remote",
      "url": "https://api.fullstory.com/mcp/subtext",
      "headers": { "Authorization": "Bearer ${SUBTEXT_API_KEY}" },
      "enabled": true
    },
    "subtext-tunnel": {
      "type": "local",
      "command": ["npx", "-y", "@fullstory/subtext-tunnel@latest"],
      "enabled": true
    }
  }
}
```

Restart OpenCode. The plugin loads, registers all Subtext skills, and the
`skill` tool discovers them via `skills.paths`.

> **Known limitations.** OpenCode bug
> [sst/opencode#20940](https://github.com/sst/opencode/issues/20940) means the
> plugin's `config` hook can't register the skills directory automatically —
> the mutation is invisible to skill discovery. Until that's fixed, `skills.paths`
> must be set explicitly in `opencode.json` as shown above. The plugin still
> auto-injects the bootstrap context regardless.

Verify by asking: "List the Subtext skills you have available."

OpenCode uses its own plugin install. If you also use Claude Code, Codex, or
another harness, install Subtext separately for each one (the marketplace at
`subtext-marketplace` covers Claude Code / Cursor; this plugin covers
OpenCode).

## Usage

Use OpenCode's native `skill` tool:

```
use skill tool to list skills
use skill tool to load subtext/live
use skill tool to load subtext/proof
```

The bootstrap context (the `using-subtext` skill) is injected into the first
user message of every session, so the agent always knows what's available.

## Pinning a specific version

Replace `<tag>` with any tag from
[Releases](https://github.com/fullstorydev/subtext/releases):

```json
{
  "plugin": ["subtext@git+https://github.com/fullstorydev/subtext.git#<tag>"]
}
```

## Troubleshooting

### Plugin not loading

1. Check logs: `opencode run --print-logs "hello" 2>&1 | grep -i subtext`
2. Verify the plugin line in your `opencode.json`
3. Make sure you're running a recent version of OpenCode

### Skills not found

1. Use the `skill` tool to list what's discovered.
2. Confirm `skills.paths` in your `opencode.json` points at the
   `subtext/skills` directory (see "Known limitations" in the Installation
   section — the plugin's `config` hook can't yet register the path
   automatically). Path glob expansion: OpenCode resolves `~` to your home
   directory.

### MCP tool calls failing with 401

`SUBTEXT_API_KEY` (or `FULLSTORY_API_KEY`) must be set in the environment
OpenCode runs in. Verify with `echo $SUBTEXT_API_KEY` before launching.

## Getting Help

- Report issues: https://github.com/fullstorydev/subtext/issues
- Subtext documentation: https://subtext.fullstory.com/
