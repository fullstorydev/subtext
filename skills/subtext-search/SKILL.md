---
name: subtext-search
description: Find Fullstory sessions by what happened in them — a predicate tree over navigate / network / custom signals within a time window — then hand a match off to session review. Use when you don't have a URL and need sessions matching a behavior, not a specific user.
---

# Search

> **PREREQUISITE:** Read `subtext-shared` and `subtext-session` for tool conventions.

Search is the front door to review when you don't have a URL and you're looking for sessions by *what happened in them* — "sessions that visited `/checkout` and got a 4xx/5xx from `checkout/pay`". `review-search` scans the org's captured sessions over a time window, matches a predicate tree against their signals, and returns the sessions to open with `review-open`.

It's part of the session-replay tool family (all `review-` prefixed): search discovers sessions; `review-open` and the rest inspect one.

## MCP Tools

| Tool | Description |
|------|-------------|
| `review-search` | Cross-session search for the authenticated org — a `has`/`and`/`or`/`not_has` predicate tree over navigate/network/custom signals within a time window. Returns matching sessions to open with `review-open`. |

## Discovering Parameters

Parameter schemas are visible in the tool definition at call time. The `where` tree is recursive — the outline below is enough to build a query; lean on the schema for exact field names.

## Time window — pick exactly one

Every search is scoped to a window, and **exactly one** of these is required:

- `since` — a positive Go duration, or a day count: `"24h"`, `"90m"`, `"1h30m"`, `"7d"`.
- `time_range` — an absolute `{start, end}` as RFC3339. `start` inclusive, `end` exclusive.

Passing both, or neither, is rejected with `exactly one of since or time_range is required`.

`limit` caps how many sessions come back (default 10, max 100). Results are **not** ordered by start time — unlike `review-list-sessions`, which is newest-first. Sort them yourself if order matters.

Each `review-search` call charges 1 credit, so shape the query before you send it rather than probing with several.

## The `where` predicate tree

Omit `where`, or pass `{}`, to match **every** session in the window. Otherwise it's a recursive tree in which every node sets exactly one of `has` / `and` / `or` / `not_has`.

- **`has`** — the leaf. A required `match` plus an optional `count`. Its `match` sets exactly one of:
  - `navigate` — `url` (a string match).
  - `network` — `url`, `method` (string match; case-sensitive unless you set `case_insensitive` — methods are stored as the client sent them, conventionally uppercase), and `status` (an int match).
  - `custom` — `event_name` (a string match).
  - An empty match (e.g. `{"navigate": {}}`) counts every item of that kind.
  - `count` is an **object**, not a bare number — `{"gte": 3}`, `{"eq": 1}`, `{"lte": 5}`. Omit it for the default of at least one.
- **`not_has`** — a negated leaf. Same body as `has` (`match` plus optional `count`); it is not a junction and takes no operand list.
- **`and`** / **`or`** — junctions. Each wraps an `operands` array: `{"and": {"operands": [ … ]}}`. Operands are full predicate nodes, so junctions nest.

**String match** takes exactly one of `eq` / `contains` / `prefix` / `in`, optionally with `case_insensitive`.
**Int match** (`status`) takes `eq` / `gte` / `lte` / `between`, where `between` is `[min, max]` — inclusive on both ends.
**`count`** takes `eq` / `gte` / `lte`. It has no `between`.

### Examples

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

Combined with a junction — reached `/checkout`, but never got a successful `checkout/pay`:

```json
{
  "since": "7d",
  "where": { "and": { "operands": [
    { "has":     { "match": { "navigate": { "url": { "contains": "/checkout" } } } } },
    { "not_has": { "match": { "network":  { "url": { "contains": "checkout/pay" },
                                            "status": { "between": [200, 299] } } } } }
  ] } }
}
```

## The handoff

Search narrows the org down to sessions that match a behavior; review reads them:

```
review-search  →  review-summary (triage a candidate)  →  review-open  →  review-zoom / review-snapshot
```

Reach for search when the user describes a *behavior or symptom* ("where did the payment call fail?") rather than a user or a URL. When you already have a session URL, skip search and open it directly. When you're chasing one known user's sessions rather than a behavior, use `review-list-sessions` — it lists recent or per-user sessions but does no signal filtering.

## Tips

- **A rejected query won't succeed on retry.** Validation runs before any work, so a bad window or malformed predicate fails the same way every time — fix the query, don't re-send it. A "retry shortly" message is the transient case; that one's worth another attempt.
- Validation errors come in two flavors. Rule violations name the rule (`match must have exactly one of navigate/network/custom, not several`) and tell you the fix. Shape violations surface as raw unmarshal errors naming internal types (`cannot unmarshal array into ... review.whereJunction`) — those mean a node has the wrong *structure*, so check it against the shapes above rather than reading the type name.
- `review-summary` is stateless and needs no open session — use it to triage candidates before spending a `review-open` on one.
- Capture the `client_id` from `review-open` so follow-on `review-zoom`/`review-snapshot`/`review-close` calls don't re-resolve the session.

## See Also

- `subtext-shared` — MCP conventions
- `subtext-session` — the `review-*` tool catalog and session-identifier forms
- `subtext-review` — the structured-summary workflow that runs on a session once you've found and opened it
