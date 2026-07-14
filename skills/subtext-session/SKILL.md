---
name: subtext-session
description: Session replay tools for analyzing Fullstory session recordings. Sparse API catalog — tools are self-describing.
---

# Session Replay

> **PREREQUISITE:** Read `subtext-shared` for MCP conventions.

API catalog for the session replay tools (all prefixed `review-`). One gesture — **zoom** — over two data sets: the **signal stream** (temporal) and the **snapshot** (spatial). Opening a session hands back a **map**: an always-on orientation header, never a zoom level.

## MCP Tools

| Tool | Description |
|------|-------------|
| `review-list-sessions` | Find reviewable sessions — numbered URLs + timestamps. |
| `review-open` | Open a session for analysis. Returns a handle (`client_id`) plus the **map** and a digest rollup. |
| `review-summary` | Static "what happened" — the default zoom (all kinds @ `standard`), frozen. No map, no handle. Stateless, cheapest call. Use for a quick read before deciding whether to `open`. |
| `review-zoom` | The live lens. Pass a `resolution` map and/or a `t0_ms`/`t1_ms` time window — returns the matching signal slice. |
| `review-snapshot` | The screen at a moment — screenshot + component tree + boxes, rooted at an optional `component_id`. |
| `review-close` | Close the session and free resources; records a short usage summary. |

## Discovering Parameters

Parameter schemas are visible in the tool definition at call time.

## Session Input

`review-open` accepts six mutually-exclusive identifiers. Pick the one that matches what you have on hand — they're all first-class:

- `session_url` — a full Fullstory session URL. The most common form — a customer-shared link, a Slack paste, or a session from the app UI.
- `trace_id` — the 12-char base62 id from a prior `review-open` response.
- `trace_url` — a full trace URL copied from the browser or returned by a live tool.
- `device_id` + `session_id` — both required together. Use when you have the raw ids but no URL.
- `email_address` / `user_uid` — looks up the user's most recent session.

All six paths return the same handle. Capture the `client_id` from the response so follow-on `review-zoom`/`review-snapshot`/`review-close` calls don't need to re-resolve the session.

## The map

`review-open`'s response includes a map — a cheap counting fold over the signal layer, never a body dump:

```
## Map · 114 signals · 0.0s–353s · 2 pages
flow: /ui ▸ /settings/overview ▸ /subtext/sessions ▸ /subtext/session/asr
kinds: navigation 18 · interaction 36 · network 58 (2 err) · console 2 (2 err)
tags: error:4
```

The map is **whole** — rendered once, over the entire session. Zooming into `{navigation: "standard"}` later doesn't touch it: `error:4` stays in the map's counts regardless of what you go on to zoom into. Read the map first; it tells you what exists before you pay for a zoom.

## The resolution contract

`review-zoom` takes:

```
resolution?: { [scope | kind | tag]: "digest" | "standard" | "machine" | "detail" }
t0_ms?: number   // narrow the zoom to a time window
t1_ms?: number
```

Grain ladder, coarse → fine:

| grain | what you see |
|-------|--------------|
| `digest` | one rollup line per (section × kind) — `network ×19 (1 err)` |
| `standard` *(default)* | the readable transcript — bursty/repeated signals merged into one line |
| `machine` | every signal, nothing merged |
| `detail` | every signal plus its payload — headers, bodies, stack traces |

- **Omit `resolution`** → everything at `standard`.
- **Provide it** → an explicit allow-list. Unlisted kinds are excluded from the slice (never from the map).
- **Overlap → finest-wins.** A signal matching more than one key takes the finest grain among them — order-independent, and it can only ever show *more*, never hide something.

Keys are scopes (`navigation`, `interaction`, `network`, `console`, …), kinds (`click`, `network`, `exception`, …), or tags (`error`, `exception` — the only tags today) — they resolve the same way.

### Zoom recipes

```
// what went wrong, anywhere
review-zoom resolution={ error: "standard" }

// what happened in this session
review-zoom resolution={ navigation: "standard", interaction: "standard" }

// devtool-level detail
review-zoom resolution={ network: "machine", console: "machine" }

// network readable, but every error deep — finest-wins, no override needed
review-zoom resolution={ network: "standard", error: "detail" }
```

## Snapshot

`review-snapshot` takes `client_id` + `timestamp`, plus:

- `component_id` — optional; roots **both** the image clip and the tree subtree, so "focus here" means one thing.
- `lens` — `visible` (default), `interactive`, or `full`. Governs which elements populate the tree/boxes, not the pixels.
- `include` — any of `image`, `tree`, `boxes`.
- `expand_pct` — grows the `component_id` clip outward by this percent (0–100) for surrounding context.
- `upload` — store the screenshot and return a shareable signed URL.

No network/console excerpts are stapled onto a snapshot — signals only come from `review-zoom`. Want the requests or logs around a moment? Zoom that window.

## Tips

- Read the map before you zoom. It's free and tells you whether there's anything worth looking at.
- Start every zoom at `standard` (or omit `resolution` entirely) unless you already have a hypothesis about which kind matters.
- `error` as a resolution key is a floor, not a special case — it only ever raises detail wherever it applies.
- Use `review-snapshot` for "what did the screen look like," not for signals — it's a different data set.
- Always close sessions when done to free server resources.

## See Also

- `subtext-shared` — MCP conventions
