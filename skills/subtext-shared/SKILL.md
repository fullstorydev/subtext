---
name: subtext-shared
description: Foundation skill for the Subtext plugin. MCP tool conventions and security rules. Read this when any skill lists it in PREREQUISITE.
---

# Shared

Foundation for all Subtext skills. Read this when a skill lists it in PREREQUISITE.

## MCP Servers

All tools are served from the **subtext** MCP server. A **subtext-eu1** variant exists for EU1 data center sessions (`app.eu1.fullstory.com`). The agent framework resolves tool prefixes automatically based on the configured MCP servers — you do not need to hardcode prefixes.

## Tool Name Prefixes

| Prefix | Tools |
|--------|-------|
| `review-` | Session replay: `review-open`, `review-view`, `review-inspect`, `review-diff`, `review-close` |
| `privacy-` | Privacy rules: `privacy-propose`, `privacy-create`, `privacy-list`, `privacy-delete`, `privacy-promote`, `privacy-url-list`, `privacy-url-create`, `privacy-network-list`, `privacy-network-create` |

## Discovering MCP Tool Parameters

Each MCP tool is self-describing. If you're unsure about parameters, the tool's schema is available at call time. Don't memorize parameter lists — consult the atomic skill (`subtext-session` or `subtext-privacy`) for which tools exist, then let the schema guide parameter usage.

## Security Rules

- Never expose API tokens, session tokens, or credentials in output.
- Confirm with the user before any write operation that modifies org configuration (e.g. `privacy-promote`, `privacy-create`, `privacy-url-create`, `privacy-network-create`).
- Session URLs may contain sensitive user data — don't log or repeat them unnecessarily.
