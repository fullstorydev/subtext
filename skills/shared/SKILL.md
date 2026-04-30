---
name: shared
description: Foundation skill for the subtext plugin. MCP tool conventions, environment detection, security rules, and sightmap upload.
---

# Shared

Foundation for all subtext skills. Read this when any workflow or recipe lists it in PREREQUISITE.

## MCP Servers

All tools are served from the **subtext** MCP server. A **subtext-eu1** variant exists for EU1 data center sessions (`app.eu1.fullstory.com`). The agent framework resolves tool prefixes automatically based on the configured MCP servers — you do not need to hardcode prefixes.

## Sightmap Upload

After calling `review-open` or `live-connect`, the response includes a `sightmap_upload_url`. If the project has `.sightmap/` definitions, upload them via the side-band script **before** calling `review-view` or `review-diff`:

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/shared/collect_and_upload_sightmap.py --url <sightmap_upload_url>
```

Extract the URL from the `sightmap_upload_url:` line in the tool response. The upload uses a single-use token embedded in the URL — no additional auth is needed. Do NOT pass the `sightmap` parameter directly to `review-open`/`live-connect`.

## Tool Name Prefixes

Tools within the subtext server are grouped by prefix:

| Prefix | Tools |
|--------|-------|
| `review-` | Session replay: `review-open`, `review-view`, `review-diff`, `review-close` |
| `live-` | Browser automation: `live-connect`, `live-disconnect`, `live-view-*`, `live-act-*`, `live-log-*`, `live-net-*`, `live-tunnel`, `live-emulate`, `live-eval-script` |
| `comment-` | Comments: `comment-add`, `comment-list`, `comment-reply`, `comment-resolve` |
| `doc-` | Proof documents: `doc-create`, `doc-update`, `doc-attach`, `doc-close`, `doc-read`, `doc-diff`, `doc-list` |

The **subtext-tunnel** MCP server (for the reverse tunnel client) is a separate stdio server with its own tool namespace.

## Discovering MCP Tool Parameters

Each MCP tool is self-describing. If you're unsure about parameters, the tool's schema is available at call time. Don't memorize parameter lists — consult the atomic skill (`subtext:session`, `subtext:live`, or `subtext:comments`) for which tools exist, then let the schema guide parameter usage.

## Security Rules

- Never expose API tokens, session tokens, or credentials in output
- Confirm with the user before any write operation that modifies production data
- Session URLs may contain sensitive user data — don't log or repeat them unnecessarily
