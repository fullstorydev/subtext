# Repo structure

- `.claude-plugin/` — Claude Code plugin manifest and marketplace config
- `.mcp.json` — MCP server configuration (subtext server + live-tunnel). Uses `${CLAUDE_PLUGIN_ROOT}` for plugin-relative paths.
- `skills/` — Skill definitions (SKILL.md files), see "Skills" below
- `tunnel/` — Live tunnel client MCP server (see the subtext:tunnel skill)

# Skills

Before creating or modifying any skill, read [`authoring`](skills/authoring.md).

# Plugin Versioning

Make sure to update the [plugin version](.claude-plugin/marketplace.json) in any pull request.
