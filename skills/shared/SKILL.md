---
name: subtext:shared
description: Foundation skill for the subtext plugin. MCP tool conventions, environment detection, security rules, and sightmap upload.
---

# Shared

Foundation for all subtext skills. Load this when any workflow or recipe lists it in PREREQUISITE.

## MCP Tool Prefixes

All tools are served from a single MCP server per environment. Match the session URL hostname to select the correct prefix.

| Environment | Session URL host | MCP tool prefix |
|-------------|-----------------|-----------------|
| Production NA (default) | `app.fullstory.com` | `mcp__plugin_subtext_subtext__` |
| Production EU1 | `app.eu1.fullstory.com` | `mcp__plugin_subtext_eu1-subtext__` |

If no hostname matches, default to Production NA.

For non-production environments, consult `subtext-environment` for the domain→prefix mapping. If the needed MCP server isn't configured, tell the user to run `/subtext-environment`.

## Sightmap Upload

After calling `open_session` or `open_connection`, the response includes a `sightmap_upload_url`. If the project has `.sightmap/` definitions, upload them via the side-band script **before** calling `view` or `diff`:

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/shared/collect_and_upload_sightmap.py --url <sightmap_upload_url>
```

Extract the URL from the `sightmap_upload_url:` line in the tool response. The upload uses a single-use token embedded in the URL — no additional auth is needed. Do NOT pass the `sightmap` parameter directly to `open_session`/`open_connection`.

## Tool Name Prefixes

Tools within the server are grouped by prefix:

| Prefix | Tools |
|--------|-------|
| `review-` | Session replay: `review-open`, `review-view`, `review-diff`, `review-close` |
| `live-` | Browser automation: `live-connect`, `live-disconnect`, `live-view-*`, `live-act-*`, `live-log-*`, `live-net-*`, `live-tunnel`, `live-emulate`, `live-eval-script` |
| `comment-` | Comments: `comment-add`, `comment-list`, `comment-reply`, `comment-resolve` |
| `privacy-` | Privacy rules: `privacy-propose`, `privacy-create`, `privacy-list`, `privacy-delete`, `privacy-promote` |

The **live-tunnel** stdio MCP server (for the reverse tunnel client) is separate — its tools use the prefix `mcp__plugin_subtext_live-tunnel__`.

## Sightmap Injection

A PreToolUse hook automatically injects `.sightmap/*.yaml` definitions into every `live-connect` call across all environments (production, local, staging). You do NOT need to read or pass the `sightmap` parameter — just call `live-connect` normally and the hook handles it. Just ensure `.sightmap/` definitions exist in the project.

## Discovering MCP Tool Parameters

Each MCP tool is self-describing. If you're unsure about parameters, the tool's schema is available at call time. Don't memorize parameter lists — consult the atomic skill (`subtext:session`, `subtext:live`, `subtext:comments`, or `subtext:privacy`) for which tools exist, then let the schema guide parameter usage.

## Security Rules

- Never expose API tokens, session tokens, or credentials in output
- Confirm with the user before any write operation that modifies production data
- Session URLs may contain sensitive user data — don't log or repeat them unnecessarily
