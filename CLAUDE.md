# Repo structure

- `.claude-plugin/` — Claude Code plugin manifest and marketplace config
- `.cursor-plugin/` — Cursor plugin manifest
- `.codex-plugin/` — Codex plugin manifest
- `.mcp.json` — MCP server configuration (subtext server + live-tunnel).
- `skills/` — Skill definitions (SKILL.md files), see "Skills" below
- `tunnel/` — Live tunnel client MCP server (see the subtext:tunnel skill)

# Skills

Before creating or modifying any skill, read [`authoring`](skills/authoring.md).

# Plugin Versioning

Make sure to update the [plugin version](.claude-plugin/marketplace.json) in any pull request.

# Tunnel Development

`tunnel/build/` and `tunnel/dist/` are gitignored build artifacts — never commit them.

| Script | What it does |
|--------|--------------|
| `npm run build` | `clean` then `tsc` → emits JS to `build/` (used by tests and local dev) |
| `npm run bundle` | `build` then `rollup` → emits the single-file CLI to `dist/` (what npm ships) |
| `npm test` | `build` then `node --test` (self-bootstrapping; no stale build surprises) |
| `npm run verify` | `npm pack --dry-run` — shows exactly what `npm publish` would ship |

`prepack` runs `bundle` automatically, so `npm publish` and `npm pack` are always self-contained even if you forget to run `bundle` first.
