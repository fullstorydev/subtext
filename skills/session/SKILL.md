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

`review-open` accepts five mutually-exclusive identifiers. Pick the one that matches what you actually have on hand — they're all first-class:

- `trace_id` — the 12-char base62 id from a prior `live-connect` or `review-open` response. Resolves to the underlying device:session via the trace store. Use this when you're staying inside the trace flow (e.g., re-opening for a follow-on review, or pivoting between live and review surfaces).
- `session_url` — a full FullStory session URL. Use this when you have a URL from outside the trace flow — a customer-shared link, a Slack paste, or a session you found in the app UI.
- `device_id` + `session_id` — both required together. Use when you have the raw ids but no URL.
- `email_address` / `user_uid` — looks up the user's most recent session. Use when you don't have a specific session in mind.

All five paths return the same trace_id-keyed handle; the entry point doesn't change what comes out.

### Always capture `trace_id` from the response

`review-open` emits `trace_id:` in its response regardless of which path you used (best-effort — omitted only if no trace exists for the resolved session, which is rare). **Capture it on entry** — comment tools (`comment-add`/`list`/`reply`) take a `trace_id`, not a session URL, so threading the trace_id forward saves you a round-trip later.

## Tips

- Event summaries from `review-open` are cheap. `review-view` is expensive. Start with summaries.
- When investigating a single suspect element, clip with `component_id` (and small `expand_pct` for context). Smaller payload, sharper evidence. `expand_pct` caps at 100, so very short elements still produce thin slices — clip to a wider parent in that case.
- `review-diff` between before/after is the most revealing tool — it shows exactly what changed.
- Console errors and network failures in event summaries are highest-signal starting points.
- Component names in `review-view`/`review-diff` output include `[src: ...]` annotations — use these to find source files directly.
- Always close sessions when done to free server resources.

## See Also

- `subtext:shared` — MCP conventions and sightmap upload
