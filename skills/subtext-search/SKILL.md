---
name: subtext-search
description: Find Fullstory sessions by what happened in them — a predicate tree over navigate / network / custom signals within a time window — then hand a match off to session review. Use when you don't have a session URL and need sessions matching a behavior, not a specific user.
---

# Search

> **PREREQUISITE:** Read `subtext-shared` for MCP conventions and `subtext-session` for the `review-*` catalog and session-identifier forms.

`review-search` finds sessions by *what happened in them* — "visited `/checkout` and got a 4xx/5xx from `checkout/pay`". It scans the org over a time window and returns sessions to hand to review.

Read the tool schema for parameters and operators; it's complete and self-describing. Below is only what the schema and its error messages don't tell you.

## When to reach for it

| You have | Use |
|----------|-----|
| A behavior or symptom, including an app URL sessions visited or requested (`/checkout`) | `review-search` |
| A Fullstory session URL, naming one recorded session | `review-open` directly — skip search |
| One known user and no behavior to filter on | `review-list-sessions` — it does no signal filtering |

**Two different things get called a URL here.** A *Fullstory session URL* identifies one recorded session, so open it directly. An *app URL* like `/checkout` or `checkout/pay` is something sessions visited or requested — that's a search predicate (`navigate.url`, `network.url`), and having one is a reason to search, not to skip it.

Then hand off: `review-search` → `review-summary` to triage candidates → `review-open` → `review-zoom` / `review-snapshot`.

## Result ordering

Results are ordered by **last activity**, most recent first — not by when the session started, so a long-running older session can outrank one that started later. The response displays only `started`, so the sort key isn't visible in the output. On a busy org the top of the list turns over fast: an identical query re-run seconds later can return a different set.

## Gotchas

- Exactly one of `since` / `time_range` is required. Passing both is rejected, not merged.
- `and` / `or` wrap an `operands` array — `{"and": {"operands": [ … ]}}`, not a bare array.
- `count` is an object — `{"gte": 3}`, not `3`.
- `not_has` is a negated leaf with the same body as `has`. It takes no operand list.

The last three reject with a raw unmarshal error naming an internal type rather than the fix. Every other rule announces itself clearly, so send the query and read the error.

Hit `checkout/pay` with a 4xx or 5xx:

```json
{
  "since": "7d",
  "where": { "has": { "match": { "network": {
    "url": { "contains": "checkout/pay" },
    "status": { "gte": 400 }
  } } } }
}
```

Reached `/checkout`, but never got a successful `checkout/pay`:

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

## Cost

Each call charges 1 credit. Validation runs before any work, so a rejected query fails the same way every time — fix it rather than re-sending. A "retry shortly" message is the transient case and is worth another attempt.

## See Also

- `subtext-session` — the `review-*` catalog and session-identifier forms
- `subtext-review` — the structured-summary workflow once you've opened a match
