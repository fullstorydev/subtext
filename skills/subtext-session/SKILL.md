---
name: subtext-session
description: Session replay tools for analyzing Fullstory session recordings. Sparse API catalog — tools are self-describing.
---

# Session Replay

> **PREREQUISITE:** Read `subtext-shared` for MCP conventions.

API catalog for the session replay tools (all prefixed `review-`). These tools let you open sessions, inspect UI state at specific timestamps, and compare state across time.

## MCP Tools

| Tool | Description |
|------|-------------|
| `review-open` | Open a session for analysis. Returns event summaries, metadata, timestamps. |
| `review-view` | Capture UI state at a timestamp — component tree + screenshot. Pass `component_id` to clip to a specific element's bounding box; optional `expand_pct` (0–100) grows the clip rect outward for surrounding context, clamped to the viewport. |
| `review-inspect` | Component tree with full CSS selectors — for detailed element inspection, not general use. |
| `review-diff` | Compare UI state between two timestamps. |
| `review-close` | Close the session and free resources. |

## Discovering Parameters

Parameter schemas are visible in the tool definition at call time.

## Session Input

`review-open` accepts five mutually-exclusive identifiers. Pick the one that matches what you have on hand — they're all first-class:

- `trace_id` — the 12-char base62 id from a prior `review-open` response.
- `session_url` — a full Fullstory session URL (a customer-shared link, a Slack paste, or a session from the app UI).
- `device_id` + `session_id` — both required together. Use when you have the raw ids but no URL.
- `email_address` / `user_uid` — looks up the user's most recent session.

All five paths return the same trace_id-keyed handle; the entry point doesn't change what comes out. Capture the `trace_id` from the response so follow-on calls don't need to re-resolve the session.

## Tips

- Event summaries from `review-open` are cheap. `review-view` is expensive. Start with summaries.
- When investigating a single suspect element, clip with `component_id` (and a small `expand_pct` for context). Smaller payload, sharper evidence.
- `review-diff` between two moments is the most revealing tool — it shows exactly what changed.
- Console errors and network failures in event summaries are highest-signal starting points.
- Always close sessions when done to free server resources.

## See Also

- `subtext-shared` — MCP conventions
