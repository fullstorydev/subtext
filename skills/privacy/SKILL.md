---
name: subtext:privacy
description: Privacy tools for automated PII detection and rule management. Detects PII, creates preview-scoped rules, lists rules, and promotes to production.
metadata:
  requires:
    skills: ["subtext:shared", "subtext:session"]
---

# Privacy

> **PREREQUISITE — Read inline before any other action:** Read skill `subtext:shared` for MCP prefix conventions and security rules. Do not use the Skill tool — read the file directly.

API catalog for the privacy tools (all prefixed `privacy-`). These tools let you detect PII in sessions, create privacy rules, and manage their lifecycle from preview to production.

## MCP Tools

All privacy tools are on the subtext MCP server with the `privacy-` prefix.

| Tool | Description |
|------|-------------|
| `privacy-propose` | Scan all pages of a session for PII. Pass a `session_url` — all pages are scanned and results deduplicated. Returns proposed selectors and PII types in dry-run mode. |
| `privacy-create` | Create mask or exclude rules from selectors. Rules start in `PREVIEW_SESSIONS_ONLY` scope. |
| `privacy-list` | List current rules — filterable by scope and type. |
| `privacy-delete` | Delete rules by ID. Only `PREVIEW_SESSIONS_ONLY` rules can be deleted — live rules are rejected. |
| `privacy-promote` | Flip rules from `PREVIEW_SESSIONS_ONLY` to `ALL_SESSIONS` by rule ID. |

## Discovering Parameters

Parameter schemas are visible in the tool definition at call time.

## Constraints

- **Block types:** Only `mask` and `exclude`. Unmask rules are rejected — too dangerous for automation.
- **Max 2 selectors per rule:** Each rule can have at most 2 targeted selectors. When creating rules, give each selector a unique `pii_type` so they become separate rules — do NOT group many selectors under the same PII type.
- **Initial scope:** Rules always start `PREVIEW_SESSIONS_ONLY`. Promotion to `ALL_SESSIONS` is a separate, explicit action.
- **Preview validation:** Capture a session with `?_fs_preview=true` to see preview-scoped rules applied. Use `review-*` tools to verify masking before promoting.
- **Rule priority:** Exclude beats Mask beats Unmask. An element matching both an Exclude and a Mask rule will be excluded.

## Tips

- `privacy-propose` takes a `session_url` and scans every page automatically — no need to call it per-page. It's always dry-run; no rules are persisted until you call `privacy-create`.
- `privacy-create` deduplicates against existing rules — safe to re-run after re-detection without creating duplicates.
- `privacy-create` creates one rule per selector. Use unique `pii_type` values (e.g. "Person Name (sidebar)", "Person Name (chat)") to avoid grouping — each rule has a max of 2 selectors and will fail if exceeded.
- `privacy-list(scope_filter="preview")` finds rules awaiting promotion.
- `privacy-delete` only works on preview rules — use it to clean up incorrect rules before promoting. Live rules must be removed via the Fullstory UI.
- `privacy-promote` accepts multiple rule IDs — use it for bulk promotion after validation.
- If no PII is detected, that's normal for test data. Rules will appear as real user data flows through.

## See Also

- `subtext:recipe-privacy-setup` — Step-by-step recipe for the full detect → create → validate → promote flow
- `subtext:shared` — MCP prefix conventions and environment detection
- `subtext:session` — Session replay tools for validating masking in preview sessions
