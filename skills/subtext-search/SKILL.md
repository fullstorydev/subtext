---
name: subtext-search
description: Find Fullstory sessions by what happened in them — a predicate tree over navigate / network / custom signals within a time window — then hand a match off to session review. Use when you don't have a URL and need sessions matching a behavior, not a specific user.
---

# Search

> **PREREQUISITE:** Read `subtext-shared` and `subtext-session` for tool conventions.

Search is the front door to review when you don't have a URL and you're looking for sessions by *what happened in them* — "sessions that visited `/checkout` and got a 4xx/5xx from `checkout/pay`". `review-search` scans the org's captured sessions over a time window, matches a predicate tree against their signals, and returns the sessions to open with `review-open`.

It's part of the session-replay tool family (all `review-` prefixed): search discovers sessions; `review-open` and the rest inspect one.

**Availability:** `review-search` is gated behind the `lidar-review-search` org flag. If it isn't in the tool list, the org doesn't have it enabled — there's nothing to configure client-side.

## MCP Tools

| Tool | Description |
|------|-------------|
| `review-search` | Cross-session search for the authenticated org — a `has`/`and`/`or`/`not_has` predicate tree over navigate/network/custom signals within a time window. Returns matching sessions to open with `review-open`. |

## Discovering Parameters

Parameter schemas are visible in the tool definition at call time. The `where` tree is recursive — the outline below is enough to build a query; lean on the schema for exact field names.

## Time window — pick exactly one

Every search is scoped to a window, and **exactly one** of these is required:

- `since` — a relative range: `"7d"`, `"24h"`, `"90m"`. Days (`d`) plus any Go duration unit.
- `time_range` — an absolute `{start, end}` as RFC3339. `start` inclusive, `end` exclusive.

Passing both, or neither, is rejected.

`limit` caps how many sessions come back (default 10, max 100).

## The `where` predicate tree

Omit `where`, or pass `{}`, to match **every** session in the window. Otherwise it's a tree:

- **`has`** — the leaf. Its `match` sets exactly one of:
  - `navigate` — `url` (a string match).
  - `network` — `url`, `method` (string match; case-sensitive unless you set `case_insensitive` — methods are stored as the client sent them, conventionally uppercase), and `status` (an int match).
  - `custom` — `event_name` (a string match).
  - An empty match (e.g. `{"navigate": {}}`) counts every item of that kind. An optional `count` on the `has` requires *N* matching items (default: at least one).
- **`and`** / **`or`** / **`not_has`** — combine `has` nodes.

**String match** takes one of `eq` / `contains` / `prefix` / `in`, optionally with `case_insensitive`.
**Int match** (status) takes `eq` / `gte` / `lte` / `between`.

### Example

Sessions in the last 7 days that hit `checkout/pay` with a 4xx or 5xx:

```json
{
  "since": "7d",
  "where": { "has": { "match": { "network": {
    "url": { "contains": "checkout/pay" },
    "status": { "gte": 400 }
  } } } }
}
```

## The handoff

Search narrows the org down to sessions that match a behavior; review reads them:

```
review-search  →  pick a matching session  →  review-open  →  review-view / review-diff
```

Reach for search when the user describes a *behavior or symptom* ("where did the payment call fail?") rather than a user or a URL. When you already have a session URL, skip search and open it directly. When you're chasing one known user's sessions rather than a behavior, that's a plain per-user listing, not a signal search.

## Tips

- **Search is the expensive door.** It scans every matching session's signals server-side, so it costs more than opening a known session — scope the window tightly and add predicates to shrink the result set before you start opening sessions.
- Start from the most specific signal the user gave you — a failing endpoint, a status code, a visited path — and widen only if it returns nothing.
- **A rejected query won't succeed on retry.** If `review-search` comes back saying the query won't succeed as written (bad window, malformed predicate), fix the query — don't re-send it. A "retry shortly" message is the transient case; that one's worth another attempt.
- Capture the `trace_id` from the session you open so follow-on `review-*` calls don't re-resolve it.

## See Also

- `subtext-shared` — MCP conventions
- `subtext-session` — the `review-*` tool catalog and session-identifier forms
- `subtext-review` — the structured-summary workflow that runs on a session once you've found and opened it
