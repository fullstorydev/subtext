# Subtext Review

Read-only review of Fullstory session recordings, plus privacy-rule management, for coding agents.

This plugin bundles:

- **Skills** — `review` (structured session summaries), `session` (the `review-*` tool catalog), `privacy` (PII detection + element-block rules), plus `shared` and `using-subtext`.
- **MCP server** — `subtext` at `https://api.fullstory.com/mcp/subtext` (EU1 mirror: `https://api.eu1.fullstory.com/mcp/subtext`). HTTP only — no local process required.

## Install

**Claude Code**
```
/plugin marketplace add fullstorydev/subtext-review
/plugin install subtext-review@subtext-review-marketplace
```

**Cursor** — install from the Marketplace panel (or a Team Marketplace that imports this repo).

**Codex** — open `/plugins`, install **subtext-review** from the repo marketplace.

**Gemini CLI**
```
gemini extensions install https://github.com/fullstorydev/subtext-review
```

**Manual / openskills**
```
npx openskills install fullstorydev/subtext-review
```
…then add the `subtext` MCP server (URL above) to your agent's MCP configuration.

## Notes

- All tools are read-only analysis **except** `privacy-create` / `privacy-promote` / `privacy-delete`, which modify org privacy rules.
- Driving a live browser and capturing before/after proof of code changes live in the separate **Subtext Verify** plugin.
