---
name: subtext-sightmap
description: Connect a project's .sightmap/ corpus to Subtext session review — maintain it with the bundled sightmap skills and pass its definitions into review tools so snapshots come back with semantic component names.
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

When you have a `.sightmap/` directory, pass its definitions to the session
tools so their output is enriched:

- `review-open` accepts a `sightmap` array (component definitions: `name`,
  `selectors`, optional `memory`, `source`) and a top-level `memory` array.
- Read the project's `.sightmap/` YAML, translate the component definitions into
  that shape, and pass them through on open.
- Matched component names then appear in `review-snapshot` component trees, and
  `memory` entries surface as an orientation guide.

Keep the corpus the source of truth: edit `.sightmap/` YAML, then re-pass it —
don't paste one-off definitions that aren't checked in.

## See also

- `sightmap-authoring`, `sightmap-browser` — the corpus skills (bundled).
- `subtext-session` — the `review-*` tool catalog.
- `subtext-shared` — MCP conventions.
