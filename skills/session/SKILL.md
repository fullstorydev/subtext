---
name: subtext:session
description: Session replay tools for analyzing Fullstory session recordings. Sparse API catalog — tools are self-describing.
metadata:
  requires:
    skills: ["subtext:shared"]
---

# Session Replay

> **PREREQUISITE:** Read `subtext:shared` for MCP conventions and sightmap upload.

API catalog for the session replay tools (all prefixed `review-`). These tools let you open sessions, inspect UI state at specific timestamps, and compare state across time.

## MCP Tools

| Tool | Description |
|------|-------------|
| `review-open` | Open a session for analysis. Returns event summaries, metadata, timestamps. |
| `review-view` | Capture UI state at a timestamp — component tree + screenshot. Pass `component_id` to clip to a specific element's bounding box; optional `expand_pct` (0–100) grows the clip rect outward for surrounding context, clamped to the viewport. |
| `review-inspect` | Component tree with full CSS selectors — for sightmap authoring only, not general use |
| `review-diff` | Compare UI state between two timestamps |
| `review-close` | Close the session and free resources |

## Discovering Parameters

Parameter schemas are visible in the tool definition at call time.

## Session Input

Pass the full `session_url` directly to `review-open` when a URL is provided. If the URL fails, parse it to extract `device_id` and `session_id` and pass those instead.

When no session URL or IDs are available, you can look up a user's most recent session by passing `email_address` or `user_uid`. Precedence: `session_url` > `device_id`+`session_id` > `email_address` > `user_uid`.

## Tips

- Event summaries from `review-open` are cheap. `review-view` is expensive. Start with summaries.
- When investigating a single suspect element, clip with `component_id` (and small `expand_pct` for context). Smaller payload, sharper evidence. `expand_pct` caps at 100, so very short elements still produce thin slices — clip to a wider parent in that case.
- `review-diff` between before/after is the most revealing tool — it shows exactly what changed.
- Console errors and network failures in event summaries are highest-signal starting points.
- Component names in `review-view`/`review-diff` output include `[src: ...]` annotations — use these to find source files directly.
- Always close sessions when done to free server resources.

## See Also

- `subtext:shared` — MCP conventions and sightmap upload
