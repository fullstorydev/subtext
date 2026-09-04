---
"subtext": minor
---

Add the `subtext-search` skill documenting the `review-search` MCP tool, which finds sessions across the org by what happened in them — a `has`/`and`/`or`/`not_has` predicate tree over navigate/network/custom signals within a `since`/`time_range` window. Unlike opening a known session, search is the tool for finding sessions by behavior ("visited /checkout and got a 4xx/5xx from checkout/pay").

The skill covers the time-window rule (exactly one of `since`/`time_range`), the recursive `where` predicate tree (string/int matches, `count`, empty-match semantics, `limit`), and the search-to-review handoff. It notes that `review-search` is gated behind the `lidar-review-search` org flag and that a rejected query won't succeed on retry.

Cross-references in `subtext-shared`, `subtext-session`, `subtext-using-subtext`, `subtext-setup-plugin`, and the README were updated to match.
