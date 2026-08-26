# subtext

## 0.10.3

### Patch Changes

- b2ee015: Add a Cursor-flavored marketplace manifest (`.cursor-plugin/marketplace.json`) listing only the root Subtext plugin. Cursor-style marketplace indexers read `.cursor-plugin/marketplace.json` before `.claude-plugin/marketplace.json`; without it they fall through to the Claude listing, where the external `subtext-verify` GitHub source reference either fails parsing or causes Subtext Verify to be surfaced instead of Subtext. Also teach `sync-manifest-versions.mjs` to keep the new manifest's version in sync.

## 0.10.2

### Patch Changes

- 1027276: Document that `review-list-sessions` accepts `email_address`/`user_uid` to scope the list to one user, and `before` (fed from a prior response's `oldest`) to page back through their history. Contrasted against `review-open`'s identity lookup, which only ever returns that user's most recent session. Added the ticket-triage recipe: list a user's sessions, `review-summary` each candidate, `review-open` the match. No tool behavior changed — the parameters already existed; the skill just hadn't caught up.

## 0.10.1

### Patch Changes

- 2bac307: Document that `resolution` keys in `review-zoom` aren't limited to the two intrinsic tags (`error`/`exception`): a project's `.sightmap/` can author more. A component's `tags:` field rides onto any signal that targets it (e.g. `defect`), and a top-level `signals:` rule can generate a brand-new `classified` signal when a match fires against another signal's own fields — surfacing a classification buried in a payload (a 200 response whose body says a payment declined) without touching the signal it fired on.

  `subtext-session`'s resolution-key description and zoom recipes were updated to match; no tool behavior changed.

- 1b5fcf2: subtext-sightmap: remove references to live-mode tools from the sightmap upload
  instructions. The bridge skill documented `live-connect` / `live-tunnel` (and
  `live-view-new`) as alternate sources of the `sightmap_upload_url`, but those are
  Subtext Verify tools, not part of this plugin. The upload path here is
  `review-open` → `sightmap_upload_url` → collector (before `review-zoom` /
  `review-snapshot`), which is confirmed working; the instructions now describe only
  that flow.

## 0.10.0

### Minor Changes

- 40dccca: subtext-sightmap: reinstate the sightmap side-band upload path. The public skills lost the upload workflow when sightmap support was pulled from the initial release; this restores it in the first-party bridge skill. Bundles the `collect_and_upload_sightmap.py` collector beside the skill (referenced skill-relative, no plugin-root variable) and documents `review-open` / `live-connect` / `live-tunnel` → `sightmap_upload_url` → collector (before zoom/snapshot) as the preferred way to feed a `.sightmap/` corpus into a review. The inline `review-open sightmap:` array is demoted to a small, hand-authored / no-Python fallback, with the hierarchical-flatten caveat spelled out.

## 0.9.0

### Minor Changes

- 1017842: Bundle the sightmap skills. `sightmap-authoring` and `sightmap-browser` are now vendored from the `@sightmap/sightmap` package into `skills/`, and a new `subtext-sightmap` skill bridges a project's `.sightmap/` corpus into session review (passing definitions to `review-open` for annotated snapshots). No extra install and no binary required at plugin install time.

### Patch Changes

- be7d32c: Update the vendored sightmap skills from `@sightmap/sightmap` 0.14.0 to 0.15.9. `sightmap-authoring` and `sightmap-browser` pick up a large batch of upstream improvements — offline/live selector parity for `id`/`class`/SVG, visibility-aware coverage, `wait-for --view`/`--component` step boundaries, client-side redirect reporting, and stricter loud validation — along with the corrected authoring guidance. Also adds `AGENTS.md` documenting the vendoring and release process (the pin is now `--save-exact` for reproducible provenance).

## 0.8.0

### Minor Changes

- Enrich the marketplace manifests with Subtext branding. The Codex manifest gains an `interface` block — display name, short/long descriptions, brand color (#F5447B), example prompts, capabilities, legal links, and bundled composer/logo icons. Homepage, repository, and keywords are added across the Claude, Codex, and Cursor manifests, and author identity is standardized to Subtext (subtext@fullstory.com, https://subtext.fullstory.com).

## 0.7.0

### Minor Changes

- 30be04e: Add the `subtext-telemetry` skill documenting the new `telemetry-event` MCP tool, which records AI-reported workflow milestones (currently the `onboard` capture-snippet install flow) for funnel analysis and success-rate dashboards.

  The skill covers the nine onboarding steps (`start` through `complete`), per-step metadata fields, outcome classifications, and fire-and-forget semantics — a failed telemetry event is a soft failure that must never block or abort the user's workflow.

  Cross-references in `subtext-shared`, `subtext-using-subtext`, `subtext-setup-plugin`, and the README were updated to match.

## 0.6.0

### Minor Changes

- e2bf299: Prefix every skill folder with `subtext-` (e.g. `subtext-review`, `subtext-session`, `subtext-privacy`, `subtext-shared`, `subtext-using-subtext`, `subtext-setup-plugin`).

  The namespace now lives in the skill folder name itself, so skills stay collision-free across the harnesses that don't namespace plugins (Cursor, `.agents/skills`, `npx openskills`). Skill invocation names change accordingly — e.g. in Claude Code the review skill is now `subtext:subtext-review`. Cross-references in skill bodies and the README were updated to match.

- 1cc84b9: Rewrite `subtext-session` and `subtext-review` for the new review tool surface: `review-list-sessions`, `review-open`, `review-summary`, `review-zoom`, `review-snapshot`, and `review-close` replace `review-open`/`review-view`/`review-inspect`/`review-diff`/`review-close`.

  Every session open returns a map — signal counts by kind/tag, page flow, and a density strip — that stays whole regardless of what you later zoom into. `review-zoom` takes a `resolution` allow-list (`{scope|kind|tag: grain}`, grains `digest`/`standard`/`machine`/`detail`, finest-wins) for progressive disclosure over the signal stream. `review-snapshot` replaces `review-view`/`review-inspect` for a screen at a moment (screenshot + component tree + boxes, rooted at an optional `component_id`).

  `subtext-shared`'s tool prefix table was updated to match.

- 72ea8e9: Document `privacy-url-list`, `privacy-url-create`, `privacy-network-list`, and `privacy-network-create` in the `subtext-privacy` skill — new MCP tools for managing URL privacy rules (scrub host/path/query) and network privacy rules (elide/allowlist request-response bodies), alongside the existing element-block rule tools.

  `privacy-url-create` and `privacy-network-create` also double as update: pass `guid` (URL rules) or `overwrite=true` (network rules) to replace an existing rule in place instead of creating a new one. Unlike element rules, URL and network rules have no preview/promote scope — created or updated rules apply to all sessions immediately.

  Cross-references in `subtext-shared`, `subtext-using-subtext`, `subtext-setup-plugin`, and the README were updated to match.
