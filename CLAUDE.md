# Subtext

AI coding assistant plugin (skills + MCP servers) for Fullstory session analysis.

## Repo structure

- `skills/` — Skill definitions (SKILL.md files), see "Skills" below
- `.claude-plugin/` — Claude Code plugin manifest and marketplace config
- `.mcp.json` — MCP server configuration (subtext server + live-tunnel). Uses `${CLAUDE_PLUGIN_ROOT}` for plugin-relative paths.

## Skills

Three tiers: atomics describe tools, workflows compose them with decision logic, recipes are short step lists. **Before creating or modifying any skill, read [`docs/skill-authoring.md`](docs/skill-authoring.md).**

### Atomic skills — "what tools exist"

| Skill | Purpose |
|-------|---------|
| `subtext:shared` | MCP prefixes, sightmap injection, security rules |
| `subtext:session` | Session replay tools: `review-open`, `review-view`, `review-diff`, `review-close` |
| `subtext:live` | Live browser tools: connections, views, interactions, console, network |
| `subtext:sightmap` | `.sightmap/` YAML schema for components, views, requests |
| `subtext:tunnel` | Reverse tunnel setup for localhost browser tools |
| `subtext:comments` | Comment tools: `comment-list`, `comment-add`, `comment-reply`, `comment-resolve` |
| `subtext:privacy` | Privacy tools: `privacy-propose`, `privacy-create`, `privacy-list`, `privacy-delete`, `privacy-promote` |
| `subtext:visual-verification` | Screenshot after UI changes, self-correct or checkpoint with user |

### Workflows — "how to accomplish a goal"

| Skill | Purpose |
|-------|---------|
| `subtext:workflow` | Hub + intent router — routes session URLs to the right workflow |
| `subtext:session-analysis-workflow` | Understand what happened in a session |
| `subtext:bug-fix-workflow` | End-to-end: understand, test, fix, validate |
| `subtext:ux-review-workflow` | Friction analysis with prioritized issues |
| `subtext:reproduce-workflow` | Drive browser through a user flow locally |

### Recipes — "do these steps"

| Skill | Purpose |
|-------|---------|
| `subtext:recipe-reproduce` | Open session, extract steps, reproduce locally |
| `subtext:recipe-sightmap-setup` | Create sightmap definitions from scratch |

### Onboarding — "getting started"

| Skill | Purpose |
|-------|---------|
| `subtext:onboard` | Guided setup: plugin → snippet → session → review → sightmap |
| `subtext:setup-plugin` | Install plugin, configure MCP, verify API key |
| `subtext:setup-snippet` | Framework-aware FullStory snippet installation |
| `subtext:first-session` | Capture first session via hosted browser |

## Snapshot Enrichment Source (`devtools/`)

> **Note:** This directory contains the source code for snapshot enrichment, forked from chrome-devtools-mcp. It is **not** a standalone MCP server that agents connect to — the enrichment code is built into the hosted subtext server. The `devtools/` directory exists only for development and upstream sync purposes.

A fork of chrome-devtools-mcp that enriches accessibility tree snapshots with:
1. **Computed properties** — visibility, interactivity, bounds (from a DOM probe via `page.evaluate()`)
2. **Semantic component names** — from static definitions file (`--definitions` flag)

### Key files (our changes)

All modifications to upstream files are marked with `// (subtext-devtools)` comments.

**New files** (entirely ours):
- `src/enrichment/types.ts` — `ComputedProps`, `ComponentDefinition`, `DefinitionsConfig` interfaces
- `src/enrichment/probe.ts` — DOM walker that collects visibility/interactivity/bounds, correlated by `backendNodeId` via CDP
- `src/enrichment/definitions.ts` — Loads YAML definitions (auto-discovers `.sightmap/components.yaml`), matches selectors via CDP `DOM.querySelectorAll`, deepest match wins
- `src/enrichment/merge.ts` — Walks `TextSnapshotNode` tree, attaches probe results + definition matches

**Modified upstream files** (minimal, surgical changes):
- `src/McpContext.ts` — Extended `TextSnapshotNode` interface (4 optional fields), enrichment pipeline call in `createTextSnapshot()`
- `src/formatters/SnapshotFormatter.ts` — Component legend, `componentName` replaces role, appends `visible`/`interactive`/`bounds`
- `src/main.ts` — Definitions loading (auto-discover or `--definitions` override), server rename, options pass-through
- `src/cli.ts` — `--definitions` CLI flag (optional override; normally auto-discovered)
- `src/tools/snapshot.ts` — `components` boolean param
- `package.json` — Name → `subtext-devtools`, removed `mcpName`

### Building

The rollup bundle is committed to the repo so the MCP server works when installed as a plugin (no build step needed by consumers). Source maps are gitignored.

After modifying `devtools/src/`, rebuild and commit the bundle:

```bash
cd devtools
npm ci
npm run bundle  # builds + rollup bundles all deps into self-contained output
```

Then commit the updated `devtools/build/` directory.

### Upstream sync

`devtools/` is a git subtree. The remote `chrome-devtools-mcp` tracks upstream.

```bash
git fetch chrome-devtools-mcp main
git subtree pull --prefix=devtools chrome-devtools-mcp main --squash
```

Conflicts will only occur in the modified files listed above. Resolve, rebuild, verify.

### Architecture

The enrichment pipeline runs inside `createTextSnapshot()`:

1. Upstream a11y snapshot → tree of `TextSnapshotNode` with `backendNodeId`
2. `runProbe(page)` → `Map<backendNodeId, ComputedProps>` (visibility, interactivity, bounds)
3. `matchDefinitions(page, config)` → `Map<backendNodeId, componentName>` (optional, when `.sightmap/components.yaml` exists or `--definitions` is set)
4. `enrichNodes(root, probeData, definitionMatches)` → mutates tree nodes in-place
5. `SnapshotFormatter` outputs enriched attributes

Enrichment is **non-fatal**: errors are caught and logged, snapshots still work without it. All upstream UIDs and tools (click, fill, hover, etc.) work unchanged.

### Component definitions format

YAML file at `.sightmap/components.yaml` in the project root (auto-discovered), or via `--definitions` override:

```yaml
version: 1
components:
  - name: NavBar
    selector: "nav.main-navigation"
    children:
      - name: nav-link
        selector: "a.nav-link"
```

Children selectors are scoped to parent subtrees. Deepest match wins.

## Sightmap injection

Passes `.sightmap/` component definitions to `review-open` and `live-connect` so the subtext MCP server replaces
generic `fs-XXXX` IDs with semantic names like `SettingsSidebar` in `review-view`/`review-diff` output.

```
session-open/live-connect  →  response includes sightmap_upload_url
  →  agent runs collect_and_upload_sightmap.py --url <upload_url>
  →  script collects .sightmap/*.yaml, POSTs to Lidar  →  sightmap applied to session
```

1. **Define components** in `.sightmap/*.yaml` — CSS selectors mapped to semantic names.
2. **Agent opens session/connection** — response includes a `sightmap_upload_url` with a single-use token.
3. **Agent runs upload script** — `collect_and_upload_sightmap.py` collects YAML and POSTs to the URL.
4. **Subtext matches selectors** against the recorded DOM, replaces element IDs with component names.

The sightmap data never enters the agent's context window — it's uploaded directly via HTTP.

### Key files

- `skills/shared/collect_and_upload_sightmap.py` — collects `.sightmap/*.yaml`, flattens hierarchies, and uploads to Lidar

