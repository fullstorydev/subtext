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

Version bumps are automated via [Changesets](https://github.com/changesets/changesets) and the `Release` GitHub Actions workflow.

For any user-facing PR, run `npm run changeset`, pick a bump type, and commit the generated `.changeset/*.md` file. On merge to `main`, the workflow opens a "Version Packages" PR that bumps `package.json` and syncs the version into all harness manifests (`.claude-plugin/`, `.codex-plugin/`, `.cursor-plugin/`, and `marketplace.json`) via `scripts/sync-manifest-versions.mjs`. Merging that PR creates the git tag and GitHub release.

See [`.changeset/README.md`](.changeset/README.md) for the full workflow. Pure-infra / docs PRs can skip the changeset.
