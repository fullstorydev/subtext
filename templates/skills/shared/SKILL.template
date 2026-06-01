---
name: shared
description: Foundation skill for the subtext plugin. MCP tool conventions, environment detection, security rules, and sightmap upload.
metadata:
  targets: [mcp, cli]

---

# Shared

Foundation for all subtext skills. Read this when any workflow or recipe lists it in PREREQUISITE.

## MCP Servers

All tools are served from the **subtext** MCP server. A **subtext-eu1** variant exists for EU1 data center sessions (`app.eu1.fullstory.com`). The agent framework resolves tool prefixes automatically based on the configured MCP servers — you do not need to hardcode prefixes.

## Sightmap Upload

Three tools return a sightmap upload URL:

| Tool | Field | Format |
|------|-------|--------|
| {{tool "review-open"}} | `sightmap_upload_url:` | text line in response |
| {{tool "live-connect"}} | `sightmap_upload_url:` | text line in response |
| {{tool "live-tunnel"}} | `sightmapUploadUrl` | JSON field in response |

If the project has `.sightmap/` definitions, upload them via the side-band script after getting the URL and **before** proceeding (before {{tool "review-view"}}/{{tool "review-diff"}} for review flows; before {{tool "live-view-new"}} for the tunnel-first flow):

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/shared/collect_and_upload_sightmap.py --url <sightmap_upload_url>
```

The upload uses a single-use token embedded in the URL — no additional auth is needed. Do NOT pass the `sightmap` parameter directly to {{tool "review-open"}}/{{tool "live-connect"}}.

## Tool Name Prefixes

Tools within the subtext server are grouped by prefix:

| Prefix | Tools |
|--------|-------|
| `review-` | Session replay: {{tool "review-open"}}, {{tool "review-view"}}, {{tool "review-diff"}}, {{tool "review-close"}} |
| `live-` | Browser automation: {{tool "live-connect"}}, {{tool "live-disconnect"}}, `live-view-*`, `live-act-*`, `live-log-*`, `live-net-*`, {{tool "live-tunnel"}}, {{tool "live-emulate"}}, {{tool "live-eval-script"}} |
| `comment-` | Comments: {{tool "comment-add"}}, {{tool "comment-list"}}, {{tool "comment-reply"}}, {{tool "comment-resolve"}} |
| `doc-` | Proof documents: {{tool "doc-create"}}, {{tool "doc-update"}}, {{tool "doc-attach"}}, {{tool "doc-close"}}, {{tool "doc-read"}}, {{tool "doc-diff"}}, {{tool "doc-list"}} |

The **subtext-tunnel** MCP server (for the reverse tunnel client) is a separate stdio server with its own tool namespace.

## Discovering MCP Tool Parameters

Each MCP tool is self-describing. If you're unsure about parameters, the tool's schema is available at call time. Don't memorize parameter lists — consult the atomic skill (`subtext:session`, `subtext:live`, or `subtext:comments`) for which tools exist, then let the schema guide parameter usage.

## Security Rules

- Never expose API tokens, session tokens, or credentials in output
- Confirm with the user before any write operation that modifies production data
- Session URLs may contain sensitive user data — don't log or repeat them unnecessarily
