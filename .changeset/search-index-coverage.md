---
"subtext": patch
---

Document what the `review-search` index actually covers, and drop an example that could never match. The index holds page navigations, custom events, and network requests that **failed** (status >= 400). Successful requests, clicks, and console messages are not indexed and can never match — so a predicate over a 2xx status matches nothing, and a `not_has` over one is vacuously true for every session.

The skill's worked example did exactly that: it used `not_has` over a 2xx `checkout/pay` response to mean "never got a successful payment", which is satisfied by every session in the window regardless of behavior. Replaced with a verified example that builds its absence check over navigations instead, and that also demonstrates junction nesting (`operands` accept any node, not just `has`) and a `custom` event predicate.

Also documents the predicate readback. Every response echoes how the server parsed the tree, which is the only way to tell a mis-built-but-parseable query from a genuinely empty result — zero matches on its own could mean a wrong predicate, too narrow a window, or an unindexed signal.

This coverage rule appears in neither the tool schema nor the tool description; it surfaces only in the zero-result help text, so a query that returns rows never reveals it.
