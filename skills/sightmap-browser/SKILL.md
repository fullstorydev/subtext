---
name: sightmap-browser
description: Use when driving a live browser session with a sightmap — starting or navigating a Chrome session, taking annotated component snapshots to read page state, and interacting with elements by component ID or component query. Activate when a .sightmap/ directory is present and you need to observe or act on the running app.
activation:
  - .sightmap/ directory exists in project
  - driving a live browser session against a sightmap corpus
---

# Sightmap browser: observe and interact

The sightmap CLI drives a Chrome-for-Testing session and layers your `.sightmap/`
corpus onto the live page, so you can **read page state** as an annotated
component tree and **act on elements by their semantic component identity**
instead of brittle CSS. To build or maintain the corpus itself, see the
`sightmap-authoring` skill.

## Installation

Every command below needs the `sightmap` binary on your PATH. **Check first,
install only if missing** — run `sightmap version`; if that fails, install it:

```bash
npm install -g @sightmap/sightmap                                 # recommended: global install
sightmap version                                                 # verify it's on PATH
go install github.com/sightmap/sightmap/go/cmd/sightmap@latest    # or build from source
```

This skill drives a **multi-step browser session**, so prefer a global install
over `npx @sightmap/sightmap <command>` (which re-resolves the package on every
invocation). Use `npm` in instructions — the published package is identical under
`pnpm`/`yarn`, but npm is the safe baseline.

## Session management

| Command | What it does |
|---------|-------------|
| `sightmap browser start` | Launch Chrome + the sightmap overlay server. Writes `.sightmap/.session`. |
| `sightmap browser status` | Check session health and current URL. |
| `sightmap browser navigate 'URL'` | Navigate to URL (positional arg — no `--url` flag). |
| `sightmap browser stop` | Stop Chrome session. |
| `sightmap browser eval 'js'` | Evaluate JS in page context. Returns JSON-serializable values only — DOM element references return an error. |
| `sightmap browser screenshot --out FILE.png` | Screenshot of the current page. |

## Reading the page: annotated snapshots

`sightmap snapshot --url URL` (or `sightmap iterate URL`) prints the page's
component tree with your corpus layered on. Each line starts with a numeric
component ID, then the node content:

```
42 [SiteHeader]
  83 [DesktopNavLink label="Explore"]
  91 link "Privacy Policy"
```

- **`[ComponentName prop="val"]`** — sightmap-matched node; role suppressed
- **`role "text"`** — unmatched node; role and accessible name shown
- **`42`** prefix — probe component ID; usable as a handle for interaction commands

Properties are sorted alphabetically. The accessible name is shown last inside
brackets when not suppressed (an exact match with a property value).

## Interaction (by ID or component query)

`click`, `fill`, `hover`, and `scroll --component-id` accept **either** a numeric
probe ID from snapshot output **or** a component query (see below):

| Command | What it does |
|---------|-------------|
| `sightmap browser click <id>` | Click element by probe ID |
| `sightmap browser click 'ComponentQuery'` | Click element by sightmap identity (preferred on dynamic pages) |
| `sightmap browser fill <id-or-query> "text"` | Type into an input. May append on React-controlled inputs — see gotchas. |
| `sightmap browser hover <id-or-query>` | Hover over element |
| `sightmap browser keypress Enter` | Press a key (optionally focused on `<id>`) |
| `sightmap browser scroll --delta-y 500` | Scroll the page |
| `sightmap browser scroll --component-id <id-or-query>` | Scroll a component into view |
| `sightmap browser click --x N --y N` | Click raw coordinates (escape hatch; layout-fragile) |
| `sightmap browser wait-for --selector "[data-loaded]"` | Wait for element |
| `sightmap browser tabs list` | List open tabs |

### Component queries (CSS-shaped, over sightmap components + extracted properties)

Probe IDs are extraction-local: they're reassigned every snapshot, so on
re-rendering pages an `<id>` from an earlier call goes stale. A component query
re-resolves against the live tree atomically (extract → match → act in one pass),
so nothing goes stale. Prefer queries on dynamic pages.

| Query | Resolves to |
|-------|-------------|
| `FulfillmentTileButton[label=deliveryTile]` | the `FulfillmentTileButton` whose `label` property equals `deliveryTile` |
| `ProductCard[name^="Webber grill"]` | a `ProductCard` whose `name` starts with `Webber grill` |
| `ProductCard[name*="weber" i]` | substring, case-insensitive (`i` flag) |
| `LoginForm UserNameInput` | a `UserNameInput` anywhere under a `LoginForm` (target = last component) |
| `FulfillmentTileButton#1` | occurrence 1 (0-based) when several match — weak fallback |

- Brackets are **component names**; `[prop op value]` filters on **extracted
  properties** (not raw DOM attributes). Operators: `=` exact, `^=` prefix,
  `*=` substring, with an optional trailing ` i` for case-insensitive.
- Whitespace is a **descendant** combinator; the **last** component is the target.
- If a query matches **zero** components it errors; if it matches **several** it
  errors and prints the candidates with their distinguishing properties — add a
  predicate to disambiguate, or append `#N`.
- Robust queries need a corpus with disambiguating **properties**; authoring a
  property like `FulfillmentTileButton.label` is what makes the element
  addressable (see the `sightmap-authoring` skill).
- `--sightmap-dir` (default `.sightmap`) controls which corpus resolves a query.

## Gotchas

**`browser navigate` takes a positional URL, not a `--url` flag.**
```bash
sightmap browser navigate 'https://...'     # ✓ correct
sightmap browser navigate --url 'https://'  # ✗ wrong — passes literal "--url" as the URL
```

**`browser fill` may append on React-controlled inputs.**
If filling the same field multiple times accumulates text, use `browser eval` with the native value setter:
```bash
sightmap browser eval 'var el = document.querySelector("INPUT_SELECTOR"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, "new value"); el.dispatchEvent(new Event("input", {bubbles: true}))'
```

**`browser eval` cannot return DOM elements.**
Only JSON-serializable values are returned. `document.querySelector(...)` returns an error reference. Extract what you need instead: `document.querySelector("sel")?.textContent`.

**Stale session files.**
`browser status` probes the CDP endpoint (not just the `.session` file): it reports `✗ unreachable` and removes the stale session file when Chrome is gone. If a command still fails with a CDP error, run `browser start` again.

**Always pass `--tab` when several tabs are open.**
Page commands auto-pick the lone content tab but error (listing tabs) when zero or several are open. `browser start` prints your tab ID; thread it through as `--tab <ID>`.

**`browser navigate` prints the final URL.**
After a server-side redirect, `navigate` prints `(redirected to FINAL)` so you know where you actually landed.
