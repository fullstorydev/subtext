---
name: subtext:comments
description: Comment MCP tools for agent-user collaboration. Use when reviewing sessions or live pages to leave observations, read user feedback, reply, and resolve.
metadata:
  requires:
    skills: ["subtext:shared"]
---

# Comments

> **PREREQUISITE:** Read `subtext:shared` for MCP conventions and sightmap upload.

Tool catalog and judgment rules for comment-based agent-user collaboration. Comment tools are available on the subtext MCP server.

## MCP Tools

| Tool | Description |
|------|-------------|
| `comment-list` | Read all comments/annotations with thread structure |
| `comment-add` | Leave a comment on a session, optionally tied to a page and timestamp |
| `comment-reply` | Reply to an existing comment by ID |
| `comment-resolve` | Mark a comment thread as resolved |

All comment tools are **stateless** — they take a `session_id` parameter (in `deviceId:sessionId` format) rather than requiring an active connection. UUID-format session IDs are automatically resolved to durable IDs.

## Discovering Parameters

Parameter schemas are visible in the tool definition at call time.

## Screenshots

Comment tools do **not** auto-capture screenshots. To attach a screenshot, pass a `screenshot_url` to `comment-add`. This URL must point to a pre-captured screenshot (e.g., from `live-view-screenshot` or another source).

> **Note:** To attach a screenshot, first capture one via `live-view-screenshot` or `review-view`, then pass the returned URL as `screenshot_url`.

## Intents

When adding a comment, classify it:

| Intent | Use when |
|--------|----------|
| `bug` | Something is broken |
| `tweak` | Minor improvement needed |
| `ask` | Question for user or another agent |
| `looks-good` | Confirming an area passes review |

## Rules

1. **List before acting.** Every time you receive a session URL or page URL, `comment-list` first. Never assume you know what feedback exists.
2. **Reply before resolving.** The reply is the audit trail. A silent resolve is invisible history.
3. **Agents resolve their own observations freely** after visual verification confirms the fix.
4. **User comments: reply with status, let users resolve** — unless they explicitly say "resolve it" or you have screenshot proof the specific issue is gone.
5. **Agent-to-agent handoffs:** Read prior agent's comments via `comment-list`, reply to acknowledge before starting your own work, don't resolve another agent's comments without verifying.

## Review Handoff Loop

Comments enable asynchronous review between agents and users:

1. Agent does work → runs visual verification
2. Agent calls `comment-add` with observations (`bug`, `tweak`, `looks-good`)
3. Agent shares the viewer URL with the user
4. User reviews → reads agent comments → leaves own comments/replies
5. User shares URL back to agent
6. Agent calls `comment-list` to read ALL feedback
7. Agent addresses each issue → `comment-reply` with status
8. Agent calls `comment-resolve` ONLY on verified fixes
9. Repeat from step 4 until user is satisfied

## Gotchas

- Forgetting to `comment-list` on entry — you'll duplicate work or miss user feedback
- Resolving user comments without replying — no audit trail, user doesn't know what happened
- Resolving without visual verification — "I fixed it" without a screenshot is a claim, not evidence
- Adding comments without navigating to the relevant page first — comments attach to what's currently visible

## See Also

- `subtext:shared` — MCP conventions and sightmap upload
- `subtext:session` — session replay tools (review-*)
