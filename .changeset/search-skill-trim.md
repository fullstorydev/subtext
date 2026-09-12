---
"subtext": patch
---

Trim `subtext-search` to what the `review-search` schema and its error messages don't already carry. Removed the parameter and operator inventory (match kinds and their fields, string/int operators, `between` inclusivity, `method` case sensitivity, `limit` bounds, empty-match semantics) — all of it is in the self-describing tool schema, and the match-kind and `since`-format rules additionally reject with messages that name the rule and the fix.

What stays is what inspecting the tool can't tell you: when to reach for search over `review-open` or `review-list-sessions`, the handoff into review, result ordering, per-call cost, the mutual exclusivity of `since`/`time_range` (the schema's per-field "one of" wording doesn't convey that passing both is rejected), and the three `where` shapes whose rejections surface as raw unmarshal errors naming an internal type (`and`/`or` taking an `operands` object, `count` taking an object, `not_has` being a leaf rather than a junction).

Also disambiguates "URL", which previously read as a reason to skip search whenever one was on hand. A Fullstory session URL names one recorded session and should be opened directly; an app URL like `/checkout` is something sessions visited or requested, which is a search predicate and a reason to search rather than skip it.
