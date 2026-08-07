---
"subtext": patch
---

Document that `review-list-sessions` accepts `email_address`/`user_uid` to scope the list to one user, and `before` (fed from a prior response's `oldest`) to page back through their history. Contrasted against `review-open`'s identity lookup, which only ever returns that user's most recent session. Added the ticket-triage recipe: list a user's sessions, `review-summary` each candidate, `review-open` the match. No tool behavior changed — the parameters already existed; the skill just hadn't caught up.
