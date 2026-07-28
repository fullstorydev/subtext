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

**What to reach for:**

- **`snapshot`** — read page state as an annotated component tree (start here).
- **interaction** (`click`/`fill`/`scroll`/…) — drive the page by component identity.
- **`browser screenshot`** — visual evidence; clip to one component with `--component`.
- **`console` / `network`** — debug what the page logged and requested.
- **`inspect`** — raw DOM for authoring selectors (see `sightmap-authoring`).

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
| `sightmap browser screenshot --out FILE.png` | Screenshot the page. Clip to a component with `--component NAME` (or `--selector CSS`), optionally `--expand-pct N` for context. |

## Reading the page: annotated snapshots

`sightmap snapshot --url URL` prints the page's component tree with your corpus
layered on (add `--coverage` for a terse coverage-only view that suppresses the
tree). Each line starts with a numeric component ID, then the node content:

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

If the page has **0 interactive nodes**, coverage renders `∅` (not `✓`) and
`snapshot` exits non-zero — the page is blank or still loading. Wait for it with
`browser wait-for --selector ...` (or `--wait N`) and re-snap before acting.

## Interaction (by ID or component query)

`click`, `fill`, `hover`, and `scroll --component-id` accept **either** a numeric
probe ID from snapshot output **or** a component query (see below):

| Command | What it does |
|---------|-------------|
| `sightmap browser click <id>` | Click element by probe ID |
| `sightmap browser click 'ComponentQuery'` | Click element by sightmap identity (preferred on dynamic pages) |
| `sightmap browser fill [--clear] <id-or-query> "text"` | Type into an input. Errors if the value doesn't stick — retry with `--clear` (see gotchas). |
| `sightmap browser hover <id-or-query>` | Hover over element |
| `sightmap browser keypress Enter` | Press a key (optionally focused on `<id>`) |
| `sightmap browser scroll --delta-y 500` | Scroll the page |
| `sightmap browser scroll --component-id <id-or-query>` | Scroll a component into view |
| `sightmap browser click --x N --y N` | Click raw coordinates (escape hatch; layout-fragile) |
| `sightmap browser wait-for --view <Name>` | Wait until the URL resolves to a sightmap view (the step boundary after a navigating action) |
| `sightmap browser wait-for --component '<Query>'` | Wait until a component query matches a node |
| `sightmap browser wait-for --selector "[data-loaded]"` | Wait until a CSS selector matches (also `--url SUBSTRING` (plain substring, not glob), `--load`) |
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

## Debugging: console & network

The `browser start` daemon owns the session and runs a **collector** that buffers
console messages and network requests from every tab for the life of the session
(bounded ring buffers, ~1000 of each). Read them with thin query commands — no
re-attaching to Chrome, and history the transient page commands never saw:

| Command | What it does |
|---------|-------------|
| `sightmap console list [--level error] [--tab ID] [--limit N]` | Captured console messages (uncaught exceptions fold in as `level=exception`). |
| `sightmap console get <index>` | One console message by index. |
| `sightmap network list [--type XHR] [--url /api] [--tab ID] [--limit N]` | Captured requests: `method url → status (type)`. |
| `sightmap network get <index> [--response-file F]` | One request + its response body (fetched on demand; save with `--response-file`). |

- These need a running `browser start` session — that's where the collector
  lives. Entries from before the session started aren't available.
- Reproduce the issue (navigate/click), then read `console list --level error`
  and `network list` to see what failed; `network get <index>` pulls the body.

## Gotchas

**`browser navigate` takes a positional URL, not a `--url` flag.**
```bash
sightmap browser navigate 'https://...'     # ✓ correct
sightmap browser navigate --url 'https://'  # ✗ wrong — passes literal "--url" as the URL
```

**`browser fill` detects when a value doesn't stick.**
On some React-controlled inputs plain `fill` (select-all + type) leaves the field empty. `fill` now reads the value back and **errors** in that case, telling you to retry with `--clear` (which clears via the native value setter first). If filling the same field repeatedly *accumulates* text, also use `--clear`.
```bash
sightmap browser fill --clear 'SearchInput' 'burrito'
```

**`browser click` scrolls the target into view and refuses off-screen / covered clicks.**
`click` scrolls the element to the center of the viewport, then verifies its center is actually the top-most element there before dispatching. It **errors** (rather than silently no-op'ing) when the target can't be positioned in the viewport, or is `covered by another element` — the signal of an open overlay/modal or a target you need to reveal first. The confirmation line reports the real post-scroll coordinates it clicked.

**After an action that should navigate, wait for the destination — don't snapshot immediately.**
SPA (client-side) navigation lands *after* `click` returns, so a snapshot taken right away shows the old page. `click` deliberately does not guess or wait; make the wait an explicit step, the way Playwright/Selenium do:
```
sightmap browser click 'WorkItemRow[key="FALCON-7"]'
sightmap browser wait-for --view WorkItemDetail      # or --component 'WorkItemDetail', or --url '/browse/'
```
`wait-for` auto-retries until the postcondition holds or it times out (loudly). Record per-app async quirks (which actions navigate, slow routes) in the relevant view/component `memory` so the next agent knows to wait.

**`browser eval` cannot return DOM elements.**
Only JSON-serializable values are returned. `document.querySelector(...)` returns an error reference. Extract what you need instead: `document.querySelector("sel")?.textContent`.

**Stale session files.**
`browser status` probes the CDP endpoint (not just the `.session` file): it reports `✗ unreachable` and removes the stale session file when Chrome is gone. If a command still fails with a CDP error, run `browser start` again.

**Always pass `--tab` when several tabs are open.**
Page commands auto-pick the lone content tab but error (listing tabs) when zero or several are open. `browser start` prints your tab ID; thread it through as `--tab <ID>`.

**`browser navigate` prints the final URL.**
After a redirect — server-side *or* client-side (an SPA auth guard bouncing `/login → /`, or `/ → /workspace`) — `navigate` prints `(redirected to FINAL)` so you know where you actually landed, not just the URL you asked for.
