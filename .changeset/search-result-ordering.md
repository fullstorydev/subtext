---
"subtext": patch
---

Correct the documented result ordering for `review-search`. The skill said results were not ordered by start time and told callers to sort them, which read as "unordered". They are ordered — by last activity, most recent first. Start time is not the sort key, and because the response displays only `started`, the ordering looks arbitrary in the output when it isn't. Also notes that the top of the list turns over quickly on a busy org, so an identical query re-run seconds later can return a different set.
