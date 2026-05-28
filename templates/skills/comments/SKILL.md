---
name: comments
description: Comment MCP tools for agent-user collaboration. Use when reviewing sessions or live pages to leave observations, read user feedback, reply, and resolve.
metadata:
  targets: [mcp, cli]
  requires:
    skills: ["subtext:shared"]
---

# Comments

> **PREREQUISITE:** Read `subtext:shared` for {{if ne .Target "cli"}}MCP {{end}}conventions and sightmap upload.

Tool catalog and judgment rules for comment-based agent-user collaboration. {{if ne .Target "cli"}}Comment tools are available on the subtext MCP server.{{else}}Comment commands are available in the `subtext` CLI.{{end}}

{{if eq .Target "cli"}}## Commands{{else}}## MCP Tools{{end}}

| Tool | Description |
|------|-------------|
| {{tool "comment-list"}} | Read all comments/annotations on a trace, with thread structure |
| {{tool "comment-add"}} | Leave a comment on a trace, optionally tied to a page and timestamp |
| {{tool "comment-reply"}} | Reply to an existing comment by ID |
| {{tool "comment-resolve"}} | Mark a comment thread as resolved |

All comment tools are **stateless** — they identify the parent trace by `trace_id` (preferred) or `session_id` (deprecated; in `deviceId:sessionId` format), rather than requiring an active connection.

### `trace_id` vs `session_id`

Comments hang off a **trace** — the durable parent identifier that survives even when no FullStory session was captured. Every tool that needs a parent accepts either:

- `trace_id` — the 12-char base62 id you get from {{tool "live-connect"}} (`trace_id:` line, or parse the trailing path of `trace_url`) and from {{tool "review-open"}} (`trace_id:` line in the response). **Prefer this.** It's stable, works for traces with no underlying FS session, and is the only key the storage layer actually uses.
- `session_id` — the legacy `deviceId:sessionId` form. Still accepted for callers that only have an FS session URL on hand. The server promotes it to a trace_id under the hood. Responses include a one-line deprecation hint when you use this path.

{{tool "comment-resolve"}} only needs `comment_id`; the parent is looked up server-side.

## Discovering Parameters

Parameter schemas are visible in the tool definition at call time.

## Screenshots

Comment tools do **not** auto-capture screenshots. To attach a screenshot, pass a `screenshot_url` to {{tool "comment-add"}}. This URL must point to a pre-captured screenshot (e.g., from {{tool "live-view-screenshot"}} or another source).

> **Note:** To attach a screenshot, first capture one via {{tool "live-view-screenshot"}} or {{tool "review-view"}}, then pass the returned URL as `screenshot_url` **verbatim** — the signed query string (`?Expires=…&GoogleAccessId=…&Signature=…`) is the credential. Stripping it returns 403 from GCS and the image won't render.

When the comment is about a specific element, capture a focused clip by passing `component_id` (and a small `expand_pct` for context) to the screenshot tool. A focused clip is far more useful in a comment than a full viewport — the reader sees exactly what you're pointing at.

## Markdown

Comment text is rendered as **Markdown** in the comment thread UI. Use standard formatting freely:

- **Bold** / *italic* for emphasis
- Bulleted and numbered lists for structured observations
- `code spans` and fenced code blocks for selectors, error messages, or snippets
- [Links](url) to reference external evidence or docs

Keep formatting proportional to the comment — a one-line observation doesn't need a bulleted list.

## Intents

When adding a comment, classify it:

| Intent | Use when |
|--------|----------|
| `bug` | Something is broken |
| `tweak` | Minor improvement needed |
| `ask` | Question for user or another agent |
| `looks-good` | Confirming an area passes review |

## Rules

1. **List before acting.** Every time you receive a session URL or page URL, {{tool "comment-list"}} first. Never assume you know what feedback exists.
2. **Reply before resolving.** The reply is the audit trail. A silent resolve is invisible history.
3. **Agents resolve their own observations freely** after visual verification confirms the fix.
4. **User comments: reply with status, let users resolve** — unless they explicitly say "resolve it" or you have screenshot proof the specific issue is gone.
5. **Agent-to-agent handoffs:** Read prior agent's comments via {{tool "comment-list"}}, reply to acknowledge before starting your own work, don't resolve another agent's comments without verifying.

## Review Handoff Loop

Comments enable asynchronous review between agents and users:

1. Agent does work → runs visual verification
2. Agent calls {{tool "comment-add"}} with observations (`bug`, `tweak`, `looks-good`)
3. Agent shares the trace URL with the user
4. User reviews → reads agent comments → leaves own comments/replies
5. User shares URL back to agent
6. Agent calls {{tool "comment-list"}} to read ALL feedback
7. Agent addresses each issue → {{tool "comment-reply"}} with status
8. Agent calls {{tool "comment-resolve"}} ONLY on verified fixes
9. Repeat from step 4 until user is satisfied

## Gotchas

- Forgetting to {{tool "comment-list"}} on entry — you'll duplicate work or miss user feedback
- Resolving user comments without replying — no audit trail, user doesn't know what happened
- Resolving without visual verification — "I fixed it" without a screenshot is a claim, not evidence
- Adding comments without navigating to the relevant page first — comments attach to what's currently visible

## See Also

- `subtext:shared` — MCP conventions and sightmap upload
{{if ne .Target "cli"}}- `subtext:session` — session replay tools (review-*){{end}}
