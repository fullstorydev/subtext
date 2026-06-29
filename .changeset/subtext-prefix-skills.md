---
"subtext": minor
---

Prefix every skill folder with `subtext-` (e.g. `subtext-review`, `subtext-session`, `subtext-privacy`, `subtext-shared`, `subtext-using-subtext`, `subtext-setup-plugin`).

The namespace now lives in the skill folder name itself, so skills stay collision-free across the harnesses that don't namespace plugins (Cursor, `.agents/skills`, `npx openskills`). Skill invocation names change accordingly — e.g. in Claude Code the review skill is now `subtext:subtext-review`. Cross-references in skill bodies and the README were updated to match.
