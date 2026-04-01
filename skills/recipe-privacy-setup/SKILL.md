---
name: subtext:recipe-privacy-setup
description: Short recipe to detect PII in a session, create preview-scoped privacy rules, validate masking, and promote to production.
metadata:
  requires:
    skills: ["subtext:privacy", "subtext:session", "subtext:shared"]
---

# Recipe: Privacy Setup

> **PREREQUISITE — Read inline before any other action:** Read skills `subtext:privacy`, `subtext:session`, `subtext:shared`. Do not use the Skill tool — read the files directly.

## Steps

1. **Propose rules**: `privacy-propose(session_url=...)` — scans all pages in the session automatically, returns proposed selectors and PII types in dry-run mode
2. **Review with user**: present the proposed rules table, explain what each selector covers and why
3. **Create preview rules**: `privacy-create(selectors=[...])` — rules are created in `PREVIEW_SESSIONS_ONLY` scope
4. **Capture a preview session**: navigate with `?_fs_preview=true` appended to the URL so preview-scoped rules apply during recording
5. **Compare original vs preview**: `review-open` + `review-view` on both the original session and the preview session. Compare screenshots and component trees side-by-side to check:
   - **True positives**: PII that is correctly masked (good — keep these rules)
   - **False positives**: non-PII content that got masked (bad — these rules need to be removed)
   - **Missed PII**: sensitive data still visible in the preview (need additional rules)
6. **Flag false positives**: if any rules masked non-PII content, present them to the user with the before/after evidence and ask for confirmation. Delete confirmed false positives with `privacy-delete(rule_ids=[...])`
7. **Ask the user**: present a summary of what looks correct and what might need work. Ask if they want to iterate (add/remove rules and capture another preview) or proceed to promotion
8. **Promote to production**: `privacy-list(scope_filter="preview")` to find rule IDs, then `privacy-promote(rule_ids=[...])`
9. **Verify**: `privacy-list` to confirm all rules are now `ALL_SESSIONS`
