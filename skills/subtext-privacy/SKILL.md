---
name: subtext-privacy
description: Privacy rule management — detect PII in sessions and manage element-block, URL, and network privacy rules. Use when you need to propose, create, list, delete, or promote privacy rules for a Fullstory org.
---

# Privacy

> **PREREQUISITE:** Read `subtext-shared` for MCP conventions.

Privacy tools manage three kinds of rules that control what Fullstory session recordings capture:

- **Element rules** — CSS-selector-based rules that mask or exclude specific page elements.
- **URL rules** — scrub sensitive parts of captured URLs (host/path/query).
- **Network rules** — control whether request/response bodies are captured, redacted, or partially allowlisted.

## MCP Tools

| Tool | Description |
|------|-------------|
| `privacy-propose` | Scan a session for PII and return suggested selectors (dry-run — persists nothing). Element rules only. |
| `privacy-create` | Create element-block rules from selectors in preview scope. |
| `privacy-list` | List existing element-block rules, with optional scope/type filters. |
| `privacy-delete` | Delete preview-scoped rules by ID. |
| `privacy-promote` | Promote preview-scoped rules to apply to all sessions. |
| `privacy-url-list` | List URL privacy rules. |
| `privacy-url-create` | Create a URL privacy rule that scrubs host/path/query, or update one in place by passing `guid`. Live immediately. |
| `privacy-network-list` | List network (request/response body) privacy rules. |
| `privacy-network-create` | Create a network privacy rule (elide or allowlist body fields), or update the existing rule for a `url_regex` by passing `overwrite=true`. Live immediately. |

Listing and creation are supported for all three rule kinds. There's no separate update tool for URL/network rules — `privacy-url-create`/`privacy-network-create` double as update when you pass `guid`/`overwrite`. Deletion is only supported for element rules today.

## Rule lifecycle (element rules)

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

## URL and network rules: no preview step

Unlike element rules, **URL and network rules have no scope and no preview/promote lifecycle.** `privacy-url-create` and `privacy-network-create` take effect for **all sessions immediately** — there is nothing to promote, and (for now) nothing to delete via MCP. Double-check a rule before creating it; use `privacy-url-list` / `privacy-network-list` afterward to confirm what's live.

### URL rules

`privacy-url-create` takes a `name` plus either simplified fields or a raw `advanced` override:

```
privacy-url-create name="scrub-ssn-param" match_host="example\.com" exclude_query_params=["ssn"]
```

This redacts the `ssn` query parameter's value (not its key) on URLs whose host matches `example\.com`. Leave `match_host`/`match_path` both empty for an unconditional rule (applies to every URL). Use `exclude_path` / `exclude_query` for a raw regex against the path or full query string instead of a named param. Use `advanced` (structured `if`/`exclude` pattern sets over hash/host/path/query_param/query) only when the simplified fields can't express the rule.

**Updating a URL rule:** pass the rule's `guid` (from `privacy-url-list`) to replace it in place instead of creating a new one:

```
privacy-url-create guid="<guid>" name="scrub-ssn-param" match_host="example\.com" exclude_query_params=["ssn", "token"]
```

Update is a **full replace**, not a merge — pass the complete desired state (name, condition, exclusions), not just the field you're changing. Built-in rules (part of the default rule set created at privacy settings setup) cannot be updated this way.

### Network rules

`privacy-network-create` takes a `url_regex` plus request/response body handling:

```
privacy-network-create url_regex="/api/checkout/.*" request_body="whitelist" request_allowlist_fields=["order_id", "status"]
```

Only `elide` (default, redact the whole body) and `whitelist` (keep only named fields) are supported for automated creation/update — `record` (capture the full body) increases data capture and must be set up manually. Rules are keyed by `url_regex`; without `overwrite`, creating a rule for a regex that already has one is a no-op.

**Updating a network rule:** pass `overwrite=true` to replace the existing rule for that `url_regex` instead of skipping it:

```
privacy-network-create url_regex="/api/checkout/.*" request_body="whitelist" request_allowlist_fields=["order_id", "status", "total"] overwrite=true
```

## Rules and constraints

- `privacy-propose` is always a **dry-run**. It returns suggested selectors but persists nothing. Use it to preview before committing.
- `privacy-create` only supports `mask` and `exclude` block types. Unmask rules cannot be created via this tool.
- `privacy-delete` only accepts preview-scoped rules. Promoted rules cannot be deleted here.
- `privacy-promote` also rejects unmask rules — only mask and exclude rules can be promoted.
- System-managed rules (not user-created) are hidden by default. Pass `include_system=true` to `privacy-list` to see them. These rules cannot be deleted or promoted.
- `privacy-url-create` and `privacy-network-create` rules go live for all sessions immediately — there's no preview scope to validate in first.
- `privacy-network-create` rejects `record` for request/response body mode; only `elide` and `whitelist` are allowed.
- Neither URL nor network rules currently support deletion via MCP — use the Fullstory settings UI if a rule needs to be removed.

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
- Assuming `privacy-url-create` / `privacy-network-create` land in a preview scope like element rules — they don't. They apply to all sessions the moment they're created, so double-check the pattern/regex before calling.
- Using `request_body="record"` (or `response_body="record"`) in `privacy-network-create` — this is rejected; only `elide` and `whitelist` are supported for automated creation.
- Passing `guid` to `privacy-url-create` with only the field you want to change — update is a full replace, so omitted fields (name, condition, exclusions) are lost, not preserved. Fetch the current rule from `privacy-url-list` first and resend its full state.
- Forgetting `overwrite=true` on `privacy-network-create` when you meant to change an existing rule — without it, a matching `url_regex` is silently skipped, not updated.

## See Also

- `subtext-shared` — MCP conventions
- `subtext-session` — session replay tools (for obtaining a session URL to pass to `propose`)
