---
name: subtext-privacy
description: Privacy rule management — detect PII in sessions and manage element-block rules. Use when you need to propose, create, list, delete, or promote CSS-selector-based privacy rules for a Fullstory org.
---

# Privacy

> **PREREQUISITE:** Read `subtext-shared` for MCP conventions.

Privacy tools manage element-block rules — CSS-selector-based rules that mask or exclude specific page elements from Fullstory session recordings.

## MCP Tools

| Tool | Description |
|------|-------------|
| `privacy-propose` | Scan a session for PII and return suggested selectors (dry-run — persists nothing). |
| `privacy-create` | Create element-block rules from selectors in preview scope. |
| `privacy-list` | List existing element-block rules, with optional scope/type filters. |
| `privacy-delete` | Delete preview-scoped rules by ID. |
| `privacy-promote` | Promote preview-scoped rules to apply to all sessions. |

## Rule lifecycle

Rules always start in **preview scope** (`PREVIEW_SESSIONS_ONLY`) and must be explicitly promoted to apply broadly:

```
propose (dry-run)
    │
    ▼
create → PREVIEW_SESSIONS_ONLY
    │
    ▼
list / verify
    │
    ▼
promote → ALL_SESSIONS
    │        ─ or ─
    ▼
delete (preview only)
```

## Rules and constraints

- `privacy-propose` is always a **dry-run**. It returns suggested selectors but persists nothing. Use it to preview before committing.
- `privacy-create` only supports `mask` and `exclude` block types. Unmask rules cannot be created via this tool.
- `privacy-delete` only accepts preview-scoped rules. Promoted rules cannot be deleted here.
- `privacy-promote` also rejects unmask rules — only mask and exclude rules can be promoted.
- System-managed rules (not user-created) are hidden by default. Pass `include_system=true` to `privacy-list` to see them. These rules cannot be deleted or promoted.

## Typical flow

### 1. Propose — find PII in a session

```
privacy-propose session_url=<url>
```

Returns a list of CSS selectors the auto-configure pipeline identified as likely PII, with suggested rule names. Inspect the list — reject any false positives before proceeding.

### 2. Create — persist the rules you want

```
privacy-create selectors=[{"selector": ".email-field"}, {"selector": "#ssn"}]
```

Rules land in `PREVIEW_SESSIONS_ONLY` scope. They only apply to preview sessions until promoted.

### 3. Verify — list and review

```
privacy-list
privacy-list scope_filter=preview
```

Review what was created. Note the `rule_id` values — you'll need them for delete or promote.

### 4. Promote or delete

Promote to activate for all sessions:
```
privacy-promote rule_ids=["<id1>", "<id2>"]
```

Delete if the rule was wrong:
```
privacy-delete rule_ids=["<id1>"]
```

## Gotchas

- Running `propose` without reviewing the output — it's a starting point, not ground truth. Inspect selectors for false positives before creating rules.
- Creating rules and immediately promoting — always verify with a preview session first. The preview scope exists for exactly this purpose.
- Trying to delete a promoted rule — `delete` only works on preview-scoped rules.
- Using `unmask` as `block_type` in `create` — this is rejected. Unmask rules are system-managed.

## See Also

- `subtext-shared` — MCP conventions
- `subtext-session` — session replay tools (for obtaining a session URL to pass to `propose`)
