---
"subtext": patch
---

Document that `resolution` keys in `review-zoom` aren't limited to the two intrinsic tags (`error`/`exception`): a project's `.sightmap/` can author more. A component's `tags:` field rides onto any signal that targets it (e.g. `defect`), and a top-level `signals:` rule can generate a brand-new `classified` signal when a match fires against another signal's own fields — surfacing a classification buried in a payload (a 200 response whose body says a payment declined) without touching the signal it fired on.

`subtext-session`'s resolution-key description and zoom recipes were updated to match; no tool behavior changed.
