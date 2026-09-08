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
the checked-in corpus to that URL with the bundled collector script **before**
you read anything back — before `review-zoom` / `review-snapshot`:

```bash
# run from the project root (where .sightmap/ lives):
python3 <this skill's directory>/collect_and_upload_sightmap.py --url <sightmap_upload_url>
```

`collect_and_upload_sightmap.py` sits **beside this SKILL.md** — reference it at
that path (it ships with the skill; there is no plugin-root variable to expand).
It walks `.sightmap/**/*.yaml` under the project root (auto-detected by walking up
from the current directory, or pass `--root DIR` / set `SIGHTMAP_ROOT`), flattens
hierarchical components into the compound selectors the matcher expects, collects
top-level `memory`, and POSTs the result using the single-use token embedded in
the URL — no extra auth. Requires **Python 3.9+ and PyYAML** (`pip install pyyaml`).

Matched component names then appear in `review-snapshot` component trees and
`review-zoom` signals, and `memory` entries surface as an orientation guide.

> **Scope today:** the collector uploads **components** (including view-scoped
> components) and top-level **memory** only. `requests:` and `views:` definitions
> are not uploaded yet — network / view-name enrichment isn't wired through the
> signal stream.

### Fallback — inline on `review-open` (small, hand-authored sets)

For a handful of flat, hand-written definitions — or a harness without Python —
`review-open` also accepts a `sightmap` array (component definitions: `name`,
`selectors`, optional `memory`, `source`) and a top-level `memory` array directly.

Reach for this only for tiny sets. The array takes **already-flattened** compound
selectors, so nested components must be flattened by hand (each parent selector
prefixed onto its children) — which is exactly what the collector script does for
you, which is why the side-band upload is preferred for anything real. Either way,
keep the `.sightmap/` corpus the source of truth: edit the YAML and re-upload —
don't paste one-off definitions that aren't checked in.

## See also

- `sightmap-authoring`, `sightmap-browser` — the corpus skills (bundled).
- `subtext-session` — the `review-*` tool catalog.
- `subtext-shared` — MCP conventions.
