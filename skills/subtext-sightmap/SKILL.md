---
name: subtext-sightmap
description: Connect a project's .sightmap/ corpus to Subtext session review — maintain it with the bundled sightmap skills and upload its definitions into review tools so snapshots come back with semantic component names.
---

# Subtext × Sightmap

> **PREREQUISITE:** Read `subtext-shared` for MCP conventions.

Subtext's session tools understand **sightmap** — a `.sightmap/` corpus (checked
into a project's repo) that names an app's **views**, **components**, and **API
requests**, with optional `memory` notes. Feed that corpus to a review and
snapshots/traces come back annotated with semantic names and memory guides
instead of generic a11y roles.

## Maintaining the corpus

The corpus itself is authored with the bundled sightmap skills — use them
directly:

- **`sightmap-authoring`** — build and maintain `.sightmap/` YAML (components,
  views, requests, memory). The full schema reference lives here.
- **`sightmap-browser`** — drive a live browser to read page state and verify
  coverage before/after edits.

Both drive the `sightmap` CLI. If it isn't on PATH, install it
(`npm install -g @sightmap/sightmap`) — see those skills' Installation sections.

## Feeding the corpus into review

When a project has a `.sightmap/` directory, upload it to the session so the
output is enriched. There are two ways; **prefer the side-band upload** for any
real corpus.

### Preferred — side-band upload (whole corpus)

`review-open` returns a single-use `sightmap_upload_url` in its response. Upload
the checked-in corpus to that URL with the `sightmap` CLI, from the project root:

```bash
# run from the project root (where .sightmap/ lives):
sightmap export --url <sightmap_upload_url>
```

`sightmap export` finds the nearest `.sightmap/` at or above the current directory,
compiles it through the Go loader — the single source of truth, shared with the
server-side reader, so the two ends can't drift — and POSTs the whole canonical
wire: **components** (including view-scoped ones, flattened to the compound
selectors the matcher expects), **views/routes**, **requests**, **messages**,
**memory**, and authored **tags**. No extra auth; the URL carries its own token.
Needs the `sightmap` binary on PATH (installed above).

Matched names then appear in `review-snapshot` component trees and `review-zoom`
signals — component names on interactions, plus view and network annotations from
the uploaded routes/requests — and `memory` entries surface as an orientation guide.

> **Upload promptly.** The `sightmap_upload_url` token is single-use **and**
> time-limited — a stale one returns `401 invalid or expired nonce`. Run the
> upload right after `review-open`, before any `review-zoom` / `review-snapshot`.

### Fallback — inline on `review-open` (small sets / no binary)

Without the `sightmap` binary, or for a handful of flat, hand-written definitions,
`review-open` also accepts a `sightmap` array (component definitions: `name`,
`selectors`, optional `memory`, `source`) and a top-level `memory` array directly.

The array takes **already-flattened** compound selectors, so nested components must
be flattened by hand (each parent selector prefixed onto its children) — which is
why the side-band upload is preferred for anything real. Either way, keep the
`.sightmap/` corpus the source of truth: edit the YAML and re-upload — don't paste
one-off definitions that aren't checked in.

## See also

- `sightmap-authoring`, `sightmap-browser` — the corpus skills (bundled).
- `subtext-session` — the `review-*` tool catalog.
- `subtext-shared` — MCP conventions.
