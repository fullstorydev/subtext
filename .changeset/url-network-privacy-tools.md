---
"subtext": minor
---

Document `privacy-url-list`, `privacy-url-create`, `privacy-network-list`, and `privacy-network-create` in the `subtext-privacy` skill — new MCP tools for managing URL privacy rules (scrub host/path/query) and network privacy rules (elide/allowlist request-response bodies), alongside the existing element-block rule tools.

`privacy-url-create` and `privacy-network-create` also double as update: pass `guid` (URL rules) or `overwrite=true` (network rules) to replace an existing rule in place instead of creating a new one. Unlike element rules, URL and network rules have no preview/promote scope — created or updated rules apply to all sessions immediately.

Cross-references in `subtext-shared`, `subtext-using-subtext`, `subtext-setup-plugin`, and the README were updated to match.
