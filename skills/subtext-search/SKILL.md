---
name: subtext-search
description: Find Subtext sessions by what happened in them — a predicate tree over page navigations, custom events, failed network requests, and client-side signals (clicks, frustration, console, all requests) within a time window — then hand a match off to session review. Use when you don't have a session URL and need sessions matching a behavior, not a specific user.
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

## What's searchable

The index holds three kinds of signal:

- **Page navigations** — `navigate.url`
- **Custom events** — `custom.event_name`
- **Failed network requests** — `network.*`, but only status >= 400

Successful requests, clicks, and console messages are not in the index. A `network` predicate over a 2xx status matches nothing at all, and a `not_has` over one is vacuously true for every session — so build absence checks over navigations or custom events instead. A session that *did* something unindexed still has it in the replay; search just can't find the session by it.

### Client-side signals

Where the page runs subtext-capture, `signal` matches the signals it generates, one item per signal, and every field you set must hold of the same signal. Unlike `network`, it sees successful requests too. The fields that matter most:

- `kind`: lowercase and hyphenated: `click`, `rage-click`, `dead-click`, `error-click`, `frustrated-reload`, `form-abandon`, `exception`, `message` (console), `network`, `page-load`, `navigate`, and the rest listed in the schema.
- `component`: any sightmap name the signal resolved to: a component in the clicked element's chain, or the request or message definition it matched.
- `tag`: any tag, e.g. `error` (failed requests, exceptions) or `frustration`.
- `text`, `selector`, `url`, `method`, `status`, `level`, `message`, `page_url`, `view`, `duration_ms`: the signal's own columns.

Only some environments carry these signals. Where they're absent, any `signal` match fails with `signal matches aren't searchable in this environment`, so fall back to the three indexed kinds.

## Result ordering

Results are ordered by **last activity**, most recent first — not by when the session started, so a long-running older session can outrank one that started later. The response displays only `started`, so the sort key isn't visible in the output. On a busy org the top of the list turns over fast: an identical query re-run seconds later can return a different set.

## Gotchas

- Exactly one of `since` / `time_range` is required. Passing both is rejected, not merged.
- `and` / `or` wrap an `operands` array — `{"and": {"operands": [ … ]}}`, not a bare array.
- `operands` accept any node, including another junction, so trees nest to any depth.
- `count` is an object — `{"gte": 3}`, not `3`.
- `not_has` is a negated leaf with the same body as `has`. It takes no operand list.

The `operands`, `count`, and `not_has` shapes reject with a raw unmarshal error naming an internal type rather than the fix. Every other rule announces itself clearly, so send the query and read the error.

Reached `/checkout`, never reached `/confirmation`, and either a failed `checkout/pay` request or a `payment_declined` event:

```json
{
  "since": "7d",
  "where": { "and": { "operands": [
    { "has":     { "match": { "navigate": { "url": { "contains": "/checkout" } } } } },
    { "not_has": { "match": { "navigate": { "url": { "contains": "/confirmation" } } } } },
    { "or": { "operands": [
      { "has": { "match": { "network": { "url": { "contains": "checkout/pay" },
                                         "status": { "gte": 400 } } } } },
      { "has": { "match": { "custom":  { "event_name": { "eq": "payment_declined" } } } } }
    ] } }
  ] } }
}
```

Three or more rage clicks on the checkout button, in a session that also logged a console error:

```json
{
  "since": "7d",
  "where": { "and": { "operands": [
    { "has": { "match": { "signal": { "kind": { "eq": "rage-click" },
                                      "component": { "eq": "CheckoutButton" } } },
               "count": { "gte": 3 } } },
    { "has": { "match": { "signal": { "kind": { "eq": "message" },
                                      "level": { "eq": "error" } } } } }
  ] } }
}
```

## Check the readback

Every response echoes how the server parsed the tree:

```
Predicate: (navigate url contains "/checkout" AND NOT (navigate url contains "/confirmation") AND (network url contains "checkout/pay" and status >= 400 OR custom event_name eq "payment_declined"))
```

Read it before trusting the results. A query that parses but doesn't mean what you intended shows up there, never as an error — and zero matches is ambiguous on its own, since it could mean the predicate was wrong, the window was too narrow, or the signal isn't indexed.

## Cost

Each call charges 1 credit. Validation runs before any work, so a rejected query fails the same way every time — fix it rather than re-sending. A "retry shortly" message is the transient case and is worth another attempt.

## See Also

- `subtext-session` — the `review-*` catalog and session-identifier forms
- `subtext-review` — the structured-summary workflow once you've opened a match
