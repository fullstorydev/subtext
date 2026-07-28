# AGENTS.md

Guidance for coding agents working in the **Subtext** repo. This repo is the
Subtext **plugin / skill bundle**: the agent skills and the plugin manifests that
ship them to the various harnesses (Claude Code, Codex, Cursor, Gemini). It does
**not** contain the Subtext server — only what an agent installs.

## Repository layout

| Path | What it is |
|---|---|
| `skills/` | The installed skill set. Two kinds live here (see below): first-party `subtext-*` skills, and **vendored** `sightmap-*` skills. |
| `.claude-plugin/`, `.codex-plugin/`, `.cursor-plugin/`, `gemini-extension.json` | Per-harness plugin manifests. Each carries a `version` that is kept in sync automatically (see [Releasing](#releasing)). |
| `scripts/sync-sightmap-skills.mjs` | Vendors the sightmap skills from the `@sightmap/sightmap` npm package into `skills/`. Run via `npm run vendor-skills`. |
| `scripts/sync-manifest-versions.mjs` | Writes `package.json`'s version into every plugin manifest. Runs as part of the release version bump. |
| `.sightmap-vendored.json` | Marker recording exactly which `@sightmap/sightmap` version the vendored skills came from. Generated — don't hand-edit. |
| `.changeset/` | Changesets that drive the version bump / changelog. |
| `mcp.json` / `.mcp.json` | MCP server wiring for the harnesses. |

## Two kinds of skill in `skills/`

1. **First-party** (`subtext-*`) — authored and maintained **here**. Edit freely.
2. **Vendored** (`sightmap-*`) — `sightmap-authoring` and `sightmap-browser` are
   **generated copies** of skills maintained upstream in the
   [sightmap repo](https://github.com/sightmap/sightmap) and shipped inside the
   published [`@sightmap/sightmap`](https://www.npmjs.com/package/@sightmap/sightmap)
   npm package. **Never hand-edit `skills/sightmap-*/`** — changes there are
   overwritten on the next vendor sync. Fix the source upstream, publish, then
   re-vendor (below). The `subtext-sightmap` skill is first-party glue that
   *bridges* a project's `.sightmap/` corpus into session review; it is not
   vendored and is safe to edit.

## Vendoring the sightmap skills

The pattern (also the reference pattern we want third parties to copy):

1. **Pin the source version.** Only versions **published to npm** can be pinned.
   Use `--save-exact` — an exact pin (not a `^` range) keeps a fresh `npm install`
   from drifting ahead of what was actually vendored:
   ```sh
   npm install --save-dev --save-exact @sightmap/sightmap@<version>
   ```
2. **Sync the skills.** This sweeps `skills/sightmap-*/`, copies the package's
   `skills/sightmap-*` in fresh, and rewrites `.sightmap-vendored.json`:
   ```sh
   npm run vendor-skills
   ```
3. **Commit** the result (the `skills/sightmap-*` copies, the bumped pin in
   `package.json` / `package-lock.json`, and `.sightmap-vendored.json`) and add a
   changeset — bumping the vendored skills is a user-facing change.

The pin in `package.json` is the provenance; `.sightmap-vendored.json` records the
exact version + skill list + timestamp. Both are the source of truth for "what
version of the skills are we shipping."

> **Bumping the pin is a manual step.** Nothing auto-updates the
> `@sightmap/sightmap` version — do steps 1–3 by hand when you want newer skills.
> (The *repo's own* version then bumps automatically via changesets — see below.)

### Checking whether a re-vendor is due

- `.sightmap-vendored.json` → the version currently shipped.
- `npm view @sightmap/sightmap version` → the newest version available to pin.
- If they differ and the newer version carries skill changes you want, do a
  re-vendor. Note the two-hop dependency: if the upstream change is on `main` but
  not yet **published** (npm is behind the sightmap repo's `main`), it must be
  released upstream first (a `v*` tag pushed in the sightmap repo) before it can
  be pinned here.

## Releasing

Versioning is driven by [changesets](https://github.com/changesets/changesets).
**Nothing is published to npm** — a release is a git tag + GitHub release that the
harnesses install from.

1. **Per change:** if a PR is user-facing, add a changeset (`npm run changeset`,
   pick `patch`/`minor`/`major`) and commit the `.changeset/*.md`. Pure
   infra/docs/refactor changes can skip it.
2. **Per release (automatic):** when changesets land on `main`, the release
   workflow opens a **"Version Packages"** PR that runs `changeset version`
   (bumps `package.json` + writes `CHANGELOG.md`) and
   `scripts/sync-manifest-versions.mjs` (writes the new version into all plugin
   manifests). You never hand-edit the manifest versions.
3. **Per release (manual):** merge the Version Packages PR. The workflow then runs
   `changeset tag` to push the git tag and cut the GitHub release.

So the repo's version bump is automatic (a Version Packages PR); the human steps
are: write a changeset, and merge the Version Packages PR. A re-vendor rides along
as an ordinary changeset in step 1 — bump the pin + `vendor-skills` + changeset,
and its version bump is folded into the next Version Packages PR.

## Conventions

- Commits are signed off (DCO) — `git commit -s`.
- One concern per PR; keep diffs focused.
- Don't hand-edit generated files: `skills/sightmap-*/`, `.sightmap-vendored.json`,
  and the `version` fields in the plugin manifests.
