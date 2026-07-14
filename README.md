# Subtext, by Fullstory

Read-only review of Subtext session recordings, plus privacy-rule management, for coding agents.

This plugin bundles:

- **Skills** — `subtext-review` (structured session summaries), `subtext-session` (the `review-*` tool catalog), `subtext-privacy` (PII detection + element-block/URL/network privacy rules), `subtext-telemetry` (workflow milestone logging), plus `subtext-shared` and `subtext-using-subtext`.
- **MCP server** — `subtext` at `https://api.fullstory.com/mcp/subtext` (EU1 mirror: `https://api.eu1.fullstory.com/mcp/subtext`). HTTP only — no local process required.

## Install

**Claude Code**
```
/plugin marketplace add fullstorydev/subtext
/plugin install subtext@subtext-marketplace
```

**Cursor** — install from the Marketplace panel (or a Team Marketplace that imports this repo).

**Codex** — open `/plugins`, install **subtext** from the repo marketplace.

**Gemini CLI**
```
gemini extensions install https://github.com/fullstorydev/subtext
```

**Manual / openskills**
```
npx openskills install fullstorydev/subtext
```
…then add the `subtext` MCP server (URL above) to your agent's MCP configuration.

## Notes

- All tools are read-only analysis **except** `privacy-create` / `privacy-promote` / `privacy-delete` / `privacy-url-create` / `privacy-network-create`, which modify org privacy rules.
- Driving a live browser and capturing before/after proof of code changes live in the separate **Subtext Verify** plugin.
