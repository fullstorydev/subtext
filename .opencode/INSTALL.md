# Installing Subtext for OpenCode

## Prerequisites

- [OpenCode.ai](https://opencode.ai) installed
- A Fullstory API key with Subtext access — exported as `SUBTEXT_API_KEY` (or `FULLSTORY_API_KEY`) before launching OpenCode

## Installation

Add subtext to the `plugin` array in your `opencode.json` (global or
project-level), and register the Subtext MCP servers so the plugin's skills
have tools to drive:

```json
{
  "plugin": ["subtext@git+https://github.com/fullstorydev/subtext.git"],
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

Restart OpenCode. The plugin installs through OpenCode's plugin manager and
registers all Subtext skills.

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

OpenCode's plugin loader has had a few version-specific regressions around
hook-registered skills ([#20940](https://github.com/sst/opencode/issues/20940),
[#21032](https://github.com/anomalyco/opencode/issues/21032)). If the `skill`
tool lists no `subtext/*` entries on your version of OpenCode, either:

1. **Switch the plugin entry to a `file://` path** (a workaround others have
   confirmed for related plugin-discovery bugs). Find the install path with
   `opencode run --print-logs "hello" 2>&1 | grep -i subtext`, then point at
   it directly:
   ```json
   { "plugin": ["file:///absolute/path/to/subtext/.opencode/plugins/subtext.js"] }
   ```
2. **Or set `skills.paths` explicitly**, so discovery doesn't depend on the
   plugin's `config` hook:
   ```json
   { "skills": { "paths": ["/absolute/path/to/subtext/skills"] } }
   ```

The bootstrap context still injects regardless — only the `skill`-tool
discovery is affected.

### MCP tool calls failing with 401

`SUBTEXT_API_KEY` (or `FULLSTORY_API_KEY`) must be set in the environment
OpenCode runs in. Verify with `echo $SUBTEXT_API_KEY` before launching.

## Getting Help

- Report issues: https://github.com/fullstorydev/subtext/issues
- Subtext documentation: https://subtext.fullstory.com/
