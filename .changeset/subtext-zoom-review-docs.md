---
"subtext": minor
---

Rewrite `subtext-session` and `subtext-review` for the new review tool surface: `review-list-sessions`, `review-open`, `review-summary`, `review-zoom`, `review-snapshot`, and `review-close` replace `review-open`/`review-view`/`review-inspect`/`review-diff`/`review-close`.

Every session open returns a map — signal counts by kind/tag, page flow, and a density strip — that stays whole regardless of what you later zoom into. `review-zoom` takes a `resolution` allow-list (`{scope|kind|tag: grain}`, grains `digest`/`standard`/`machine`/`detail`, finest-wins) for progressive disclosure over the signal stream. `review-snapshot` replaces `review-view`/`review-inspect` for a screen at a moment (screenshot + component tree + boxes, rooted at an optional `component_id`).

`subtext-shared`'s tool prefix table was updated to match.
