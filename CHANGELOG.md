# subtext

## 0.12.0

### Minor Changes

- 2b16772: subtext-sightmap: upload the `.sightmap/` corpus with the `sightmap` CLI
  (`sightmap export --url <sightmap_upload_url>`) instead of the bundled Python
  collector, and remove `collect_and_upload_sightmap.py`.

  `sightmap export` routes the upload through the Go loader — the single source of
  truth, shared with the server-side reader — and POSTs the whole canonical wire
  (components incl. view-scoped, views/routes, requests, messages, memory, tags), so
  review snapshots and signals now also carry view and network annotations, not just
  components. Drops the Python 3 / PyYAML dependency. The inline `review-open
sightmap:` array stays as the small-set / no-binary fallback. Also documents that
  the upload token is single-use and time-limited (upload immediately after
  `review-open`).

### Patch Changes

- fc74464: Document what the `review-search` index actually covers, and drop an example that could never match. The index holds page navigations, custom events, and network requests that **failed** (status >= 400). Successful requests, clicks, and console messages are not indexed and can never match — so a predicate over a 2xx status matches nothing, and a `not_has` over one is vacuously true for every session.

  The skill's worked example did exactly that: it used `not_has` over a 2xx `checkout/pay` response to mean "never got a successful payment", which is satisfied by every session in the window regardless of behavior. Replaced with a verified example that builds its absence check over navigations instead, and that also demonstrates junction nesting (`operands` accept any node, not just `has`) and a `custom` event predicate.

  Also documents the predicate readback. Every response echoes how the server parsed the tree, which is the only way to tell a mis-built-but-parseable query from a genuinely empty result — zero matches on its own could mean a wrong predicate, too narrow a window, or an unindexed signal.

  This coverage rule appears in neither the tool schema nor the tool description; it surfaces only in the zero-result help text, so a query that returns rows never reveals it.

- fc74464: Correct the documented result ordering for `review-search`. The skill said results were not ordered by start time and told callers to sort them, which read as "unordered". They are ordered — by last activity, most recent first. Start time is not the sort key, and because the response displays only `started`, the ordering looks arbitrary in the output when it isn't. Also notes that the top of the list turns over quickly on a busy org, so an identical query re-run seconds later can return a different set.
- fc74464: Trim `subtext-search` to what the `review-search` schema and its error messages don't already carry. Removed the parameter and operator inventory (match kinds and their fields, string/int operators, `between` inclusivity, `method` case sensitivity, `limit` bounds, empty-match semantics) — all of it is in the self-describing tool schema, and the match-kind and `since`-format rules additionally reject with messages that name the rule and the fix.

  What stays is what inspecting the tool can't tell you: when to reach for search over `review-open` or `review-list-sessions`, the handoff into review, result ordering, per-call cost, the mutual exclusivity of `since`/`time_range` (the schema's per-field "one of" wording doesn't convey that passing both is rejected), and the three `where` shapes whose rejections surface as raw unmarshal errors naming an internal type (`and`/`or` taking an `operands` object, `count` taking an object, `not_has` being a leaf rather than a junction).

  Also disambiguates "URL", which previously read as a reason to skip search whenever one was on hand. A Fullstory session URL names one recorded session and should be opened directly; an app URL like `/checkout` is something sessions visited or requested, which is a search predicate and a reason to search rather than skip it.

## 0.11.1

### Patch Changes

- fc83a22: Vendor the sightmap skills from `@sightmap/sightmap@0.32.0` (was `0.27.0`). Refreshes `sightmap-authoring` and `sightmap-browser` to the latest published versions and pins the source exactly.

## 0.11.0

### Minor Changes

- b5b0521: Add the `subtext-search` skill documenting the `review-search` MCP tool, which finds sessions across the org by what happened in them — a `has`/`and`/`or`/`not_has` predicate tree over navigate/network/custom signals within a `since`/`time_range` window. Unlike opening a known session, search is the tool for finding sessions by behavior ("visited /checkout and got a 4xx/5xx from checkout/pay").

  The skill covers the time-window rule (exactly one of `since`/`time_range`), the recursive `where` predicate tree (string/int matches, `count`, empty-match semantics, `limit`), and the search-to-review handoff. It also notes that results are not ordered by start time and that a rejected query won't succeed on retry.

  Cross-references in `subtext-shared`, `subtext-session`, `subtext-using-subtext`, `subtext-setup-plugin`, and the README were updated to match.

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
