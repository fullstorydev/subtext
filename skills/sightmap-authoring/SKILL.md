---
name: sightmap-authoring
description: Use when building or maintaining a sightmap corpus — defining components, authoring .sightmap/ YAML, seeding from a live site or the codebase, running snapshot/coverage/validate/lint, or diagnosing coverage gaps. Activate whenever a .sightmap/ directory is present in the project.
activation:
  - .sightmap/ directory exists in project
---

# Sightmap authoring

A sightmap layers semantic component names onto a live page's ARIA tree, enabling
structured event attribution (`click [ProductCard] > [AddToCartButton]`) and
AI-readable page snapshots (`42 [CategoryTile category="Garden Center"]`).

Two outputs drive everything:
- **Coverage**: every interactive node has a component ancestor (T1 direct or T2 scoped)
- **Annotation**: component names + extracted properties appear inline in the tree

> **Further reading.** The Go implementation's `README.md` (`go/README.md`) has a
> runnable quickstart, and `docs/reference.md` is the full authoring reference (coverage
> model, component model, the outer loop, tool reference, lint rules, quality
> checklist). To *use* a finished corpus — driving the browser and interacting
> with the page — see the `sightmap-browser` skill.

## Installation

These commands need the `sightmap` binary on your PATH. **Check first, install
only if missing** — run `sightmap version`; if that fails, install it:

```bash
# Recommended — global install via npm (no Go toolchain required):
npm install -g @sightmap/sightmap
sightmap version                       # verify it's on PATH

# One-off without installing (fine for a single command, not this iterative loop):
npx @sightmap/sightmap snapshot ...

# Install this skill (and its companion) into ~/.agents/skills at the same time:
sightmap skills install

# Developers building from source:
go install github.com/sightmap/sightmap/go/cmd/sightmap@latest
```

Use `npm` in instructions — it's the universal baseline. `pnpm`/`yarn` work too
(the published package is identical), but don't assume they're installed.

## Tool quick reference

### Primary loop

| Command | What it does |
|---------|-------------|
| `sightmap snapshot --coverage --url URL` | Observe: navigate + coverage + cluster hints, no tree. **Primary edit-loop tool.** |
| `sightmap snapshot --url URL` | Observe: full annotated tree + coverage to stdout (add `--out FILE` / `--tree-out FILE` to save). |
| `sightmap capture --url URL` | Persist a novelty-gated capture into the matched view's set. |
| `sightmap sel-probe 'selector'` | Verify a selector: match count + parent chain. Run before writing any YAML. |
| `sightmap validate` | Spec-validate `.sightmap/` YAML (errors fail; **warnings** — corpus conflicts + unknown/typo'd fields like `memroy:` — print but pass). No prepare step needed. |
| `sightmap lint --warn-only` | Style checks (`--warn-only`; exits 0 always). |
| `sightmap coverage --trace FILE.snap` | Offline T1/T2/T3 re-check on saved snap (requires `.snap.tree.json` companion). |
| `sightmap multi-coverage` | Cross-page coverage matrix; surfaces global candidates. |

### Discovery

| Command | What it does |
|---------|-------------|
| `sightmap search PATTERN` | Offline YAML regex search with hierarchy breadcrumbs. `--field name\|selector\|description\|memory` to narrow. |
| `sightmap discover` | Crawl page links → ✓ mapped / ○ surveyed / ? unseen. `--all` shows surveyed. |
| `sightmap suggest --exclude-known` | Candidate selectors not yet in sightmap (`--exclude-known` always on). |
| `sightmap gap --visible` | Orphaned interactive nodes with selector hints (`--visible` always on). |

### Session management

| Command | What it does |
|---------|-------------|
| `sightmap browser start` | Launch Chrome + the sightmap overlay server. Writes `.sightmap/.session`. |
| `sightmap browser status` | Check session health and current URL. |
| `sightmap browser navigate 'URL'` | Navigate to URL (positional arg — no `--url` flag). |
| `sightmap browser stop` | Stop Chrome session. |
| `sightmap browser eval 'js'` | Evaluate JS in page context. Returns JSON-serializable values only — DOM element references return an error. |
| `sightmap browser screenshot --out FILE.png` | Screenshot of current page. |

### Interacting with the page

To drive the live page — `click`/`fill`/`hover` by probe ID or by **component
query** (e.g. `ProductCard[name^="Weber"]`) — see the **`sightmap-browser`**
skill. During authoring, the component-query form is the quickest way to confirm
a newly named component is addressable: if a query can't uniquely resolve it, the
component still needs a disambiguating property.

---

## Hard rules

**NEVER write YAML without first verifying selectors.**
Run `sightmap sel-probe 'selector'` on every new selector before committing it to
YAML. sel-probe queries the live DOM **and** cross-checks the offline matcher
that `snapshot`/`coverage`/`capture` actually use — it prints both counts and a
`⚠ offline/live divergence` warning when they disagree. Trust the **offline**
count: that is what the corpus will see. Wrong match count = corrupt coverage.

**Attribute selectors on `class` and `id` match offline**, the same as live
(`[class*=…]`, `[class^=…]`, `[class~=…]`, `[id^=…]`, `[id$=…]`, …). `class` and
`id` are captured for every element (SVG included) and resolve to the same fields
`.classname` / `#id` use. Prefer `.classname` / `#id` when a full class or id is
stable — they're the shortest forms — but reach for the attribute forms when only
a fragment is stable, e.g. `[id^="issue_"]` for dynamic `issue_<uuid>` ids.
Verify any new selector with `sel-probe` regardless.

**Pseudo-classes: `:not()`, `:is()`, `:where()`, `:has()` are supported**
(both offline — `validate`/`snapshot`/`coverage`/`sel-check` — and live).
Sibling combinators (`+`, `~`) are NOT supported, including inside `:has()`.

`:has()` scopes a component to a container by what it *contains* — invaluable
when a row has no unique attribute of its own. Combinators inside work: `:has(x)`
= descendant, `:has(> x)` = direct child. Example — target only the add-on row
that holds a checkbox (not the sibling radio row), so its `text` frames the whole
offer and feeds a `match:` split:
```yaml
- name: AssemblyOption
  selector: '[data-testid="form-group"]:has(input[type="checkbox"])'
  properties:
    - name: assemblyType        # In-Store | In-Home
      extract: text
      transform: 'match:(In-Store|In-Home)'
    - name: price               # FREE | $179.00
      extract: text
      transform: 'match:(FREE|\$[\d,.]+)'
```
Always `sel-probe`/`sel-check` first — `:has()` now agrees across the live and
offline matchers.

**ALWAYS navigate before snapping.**
`snapshot`/`capture` use the current browser URL to match views. Use the `--url`
flag or navigate first:
```bash
sightmap snapshot --coverage --url 'https://www.example.com/page'
# persist a capture into the view's set:
sightmap capture --url 'https://www.example.com/page'
# or write a one-off snap file (no view set):
sightmap snapshot --url 'https://www.example.com/page' --out page.snap --tree-out page.snap.tree.json
```

**Async-rendered pages need `--wait`.**
Sites using client-side rendering (React/Next.js canvas, lazy hydration) may
not have their content ready at `loadEventFired`. Homedepot.com's `snapshot`
already includes `--wait 1`. For other slow pages add `--wait N` seconds.
A page with **0 interactive nodes** renders `∅` (not `✓`) and `snapshot` exits
non-zero — that is the blank/still-loading signal; raise `--wait` or use
`browser wait-for --selector` and re-snap. `capture` refuses to persist such a
page as a view's baseline (override with `--force`), and `coverage` counts it as
a failure.

**A snap is only valid for the page loaded when it was taken.**
Re-snap after every YAML change. Do not reuse stale snaps.

**0 orphaned is the only acceptable exit condition.**
T3 > 0 means some interactive nodes have zero semantic context. Do not declare
a page done until `[Coverage] (visible only) ... 0 orphaned ✓`. A `∅` mark (0
interactive nodes) is never done — the page is blank or still loading.

---

## Known gotchas

**`browser navigate` takes a positional URL, not a `--url` flag.**
```bash
sightmap browser navigate 'https://...'   # ✓ correct
sightmap browser navigate --url 'https://'  # ✗ wrong — passes literal "--url" as URL
```

**`browser fill` may append on React-controlled inputs.**
If filling the same field multiple times accumulates text, use `browser eval` with the native value setter:
```bash
sightmap browser eval 'var el = document.querySelector("INPUT_SELECTOR"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, "new value"); el.dispatchEvent(new Event("input", {bubbles: true}))'
```

**`browser eval` cannot return DOM elements.**
Only JSON-serializable values are returned. `document.querySelector(...)` returns an error reference. Instead, extract the data you need: `document.querySelector("sel")?.textContent` or `document.querySelector("sel")?.getAttribute("data-x")`.

**Stale session files.**
`browser status` now probes the CDP endpoint (not just the `.session` file): it reports `✗ unreachable` and removes the stale session file when Chrome is gone or its DevTools never bound, so trust its verdict. If a command still fails with a CDP error, run `browser start` again.

**Always pass `--tab` when several tabs are open.**
Page commands (`eval`/`snapshot`/`click`/`navigate`/`sel-probe`/…) auto-pick the lone *content* tab, but ERROR (listing tabs) when zero or several are open — so concurrent agents never silently drive the wrong tab or the extension side panel. `browser start` prints your tab ID; thread it as `--tab <ID>` (flags work before or after positionals now). `browser status` lists every content tab's ID + URL.

**`browser navigate` prints the final URL.**
After a server-side redirect, `navigate` now prints `(redirected to FINAL)` so you know where you actually landed.

---

## Snap output format

Each line in the component tree starts with a numeric component ID, then the
node content:

```
42 [SiteHeader]
  83 [DesktopNavLink label="Explore"]
  91 link "Privacy Policy"
```

- **`[ComponentName prop="val"]`** — sightmap-matched node; role suppressed
- **`role "text"`** — unmatched node; role and accessible name shown
- **`42`** prefix — probe component ID; usable as a handle for interaction commands

Properties are sorted alphabetically. Accessible name is shown last inside
brackets when not suppressed by Rule A (exact match with a property value).

---

## Property extraction principles

Every child component that is a link or button **must** have at least one property.

```yaml
- name: FooterLink
  selector: 'a'
  properties:
    - name: label
      extract: text
```

**Choosing an extract mode:**

| Mode | Use when |
|------|----------|
| `text` | Default for most cases |
| `inner_text` | Adjacent inline elements concatenate without spaces (date+time+venue) |
| `text_only` | Image alt text bleeds into the label (icon+text buttons) |
| `attr=NAME` | Need a specific attribute (aria-label, href, data-value) |
| `exists:SEL` | Boolean state flag — emits "true" or omits entirely |
| CSS selector | `el.querySelector(SEL)?.textContent` for a specific child element |

**Transforms** (post-extract): `first_word`, `last_word`, `first_number`,
`first_dollar`, `number`, `slug`, `match:REGEX`.

`match:REGEX` captures an arbitrary substring or enum from the extracted value.
If the pattern has a capture group, the value is **group 1**; otherwise the full
match. On no match (or an invalid pattern) the value passes through unchanged.
Use it to split one concatenated label into several structured, queryable props
(which is also what the component-query DSL matches on):

```yaml
# "Add In-Store Assembly / FREE"  vs  "Add In-Home Assembly / +$179.00"
- name: AssemblyCheckbox
  selector: '[data-testid="assembly-option"]'
  properties:
    - name: assemblyType            # → "In-Store" | "In-Home"
      extract: text
      transform: 'match:(In-Store|In-Home)'
    - name: price                   # → "FREE" | "$179.00"
      extract: text
      transform: 'match:(FREE|\$[\d,.]+)'
```

Write patterns in the Go-RE2 ∩ JS-RegExp common subset (alternation, character
classes, anchors, quantifiers, groups). Avoid inline flags like `(?i)` and
backreferences — JS rejects them, so the live overlay would silently drop the
prop while the offline path keeps it. For case-insensitivity use an explicit
class (`[Ss]tore`) or alternation. Quote the whole `transform:` value in YAML so
`$`, `|`, and `\` survive.

**Text deduplication (automatic):** If a property value exactly equals the
accessible name, the accessible name is suppressed from the annotation. Use
this to your advantage — a well-named property makes the annotation clean.

---

## Seeding from the codebase

When the app's source is available, use it to bootstrap components before you
ever open a browser — it turns a blank corpus into a strong first draft:

- **Grep for stable hooks.** Search the source for `data-testid`,
  `data-component`, `id=`, `aria-label`, and role attributes. These are the
  selectors most likely to be stable across renders — exactly what components
  should key on.
- **Map component files → sightmap components.** A framework component
  (`ProductCard.tsx`, a route/page component) usually corresponds to a sightmap
  component or view. Name the sightmap component after the source component and
  set its `source:` field to the file path so the next author can trace it.
- **Read routes for views.** The router config (route table, file-based routes)
  enumerates the app's views and their URL patterns — seed the `route:` field of
  each `views/*.yaml` directly from it.
- **Infer properties from the render.** Props that vary per instance (a card's
  title, price, or selected state) map to `properties:` extractions that make
  sibling instances addressable.

Source seeding is a starting point, not the source of truth: **always verify the
seeded selectors against a live snapshot** (`sel-probe`, then the coverage loop
below) before trusting them. Selectors that look right in source can be
transformed by the framework, and dynamic content only appears at runtime.

---

## Phase 0: Session startup

```bash
cd sites/vividseats.com/    # or any site dir with a .sightmap/
sightmap browser start   # launches Chrome + sightmap HTTP server (port 7891)
```

Verify with `sightmap browser status` — should show `● running cdp=7892` and list your content tab(s).
The sightmap HTTP server starts automatically and recompiles on YAML changes.
The overlay extension is embedded in the binary and auto-extracted to
`~/.sightmap/extension/` on first run — no `--extensions` flag needed.

If the site has a `package.json` with `g:*` scripts, those are convenience wrappers around the same commands and work equally well.

To connect to an existing Chrome session:
```bash
sightmap browser register --addr localhost:PORT
```

---

## Phase 1: Per-page iteration

### Step 1a — If no view file exists yet

```bash
sightmap suggest --exclude-known   # candidates not in sightmap
sightmap discover                  # URL patterns — find unseen routes
```

Prefer selectors with `data-testid`, `data-component^=`, `#id`. Avoid
class selectors (volatile) and auto-generated IDs.

Create `.sightmap/views/PAGE.yaml` with `route: "/pattern/**"`. Run
`sightmap validate` before snapping.

### Step 1b — Snap and read coverage

```bash
sightmap snapshot --coverage --url URL
```

The `[Coverage] (visible only)` line:

```
365 interactive · 141 direct T1 (39%) · 221 scoped T2 (61%) · 3 orphaned T3 ✗
```

| Metric | Goal |
|--------|------|
| T1 direct | Maximize — node has its own `[ComponentName]` annotation |
| T2 scoped | Acceptable — inside a labeled container |
| T3 orphaned | **Must be 0** |

If `0 orphaned ✓` → do quality self-review (Step 1d), then move to Phase 2.

### Step 1c — Diagnose orphaned nodes

The `Unlabeled clusters` section at the bottom of the snap shows T3 nodes
grouped by role and nearest data-attr ancestor:

```
Unlabeled clusters:
  3× link "..."
       inside: div[data-testid="product-pod"]
       → [data-testid="product-pod"] a
```

The `→` selector hint is what to use for a new child component. Use
`sightmap sel-probe` to verify match count before writing YAML.

After YAML edits, re-snap and check coverage. Repeat until 0 orphaned ✓.

**Blocking modals/overlays:** If coverage shows 80%+ of nodes inside one
modal and 0% page content, build the modal component first, then dismiss it
and re-snap.

### Step 1d — Quality self-review (after 0 orphaned ✓)

**1. Properties completeness**
Every `[ComponentName]` that is a link or button should have at least one
`prop="value"`. Scan the snap for bare `[ComponentName]` on interactive nodes.
Check `textbox`, `combobox` nodes — if scoped inside a component but unlabeled,
add a named child for them.

**2. Structured data in cards**
If a property value is a long concatenated string containing date+time+venue
mixed together, split it:
```yaml
properties:
  - name: date
    extract: inner_text
  - name: venue
    extract: '[data-testid="venue-name"]'
```

**3. T2 triage**
For every T2 cluster, categorise — don't just accept it:
- **(A) Third-party / injected** (analytics, live chat widgets) — acceptable; add `memory:` note
- **(B) Exhausted** — tried `data-testid`, `data-component`, `aria-label`, `href`; nothing stable — acceptable; document in memory
- **(C) Untried** — run `sightmap sel-probe` first; T2 is only acceptable after a real attempt

**4. Duplicate selectors**
Scan YAML for children in different parents with identical selectors. Consolidate
or promote to global.

**5. Zero-match component check** *(manual)*
Cross-check the Guide against the view's component list. Any component defined
in the YAML but absent from the Guide is either on the wrong page, broken
selector, or genuinely absent. Investigate before accepting.

### When the snap looks wrong

If coverage is implausibly low or the Guide shows only globals:
```bash
sightmap browser status   # check current URL
```

If on the wrong page, navigate first:
```bash
sightmap browser navigate https://...
sightmap snapshot --out PAGE.snap --tree-out PAGE.snap.tree.json
```

---

## Phase 2: Cross-page promotion

```bash
sightmap multi-coverage
```

**Promote** components appearing on 2+ pages that aren't in `components.yaml`:
- 3+ pages → always promote
- 2 pages, identical selectors → usually promote
- 2 pages, different selectors → keep view-scoped

---

## Phase 3: Validation

```bash
sightmap validate       # ✓ no validation errors = done
sightmap lint --warn-only   # deep-nesting warnings are expected; watch for new ones
```

**Done when:**
- [ ] `sightmap validate` exits 0
- [ ] Every page at 0 orphaned ✓
- [ ] Quality self-review passed for all pages
- [ ] `sightmap multi-coverage` shows no unaddressed global candidates

---

## Known limitations

**Async-rendered pages** (React/Next.js): use `--wait 1` or `--wait 2` for pages
that render content after `loadEventFired`. Homedepot's `snapshot` includes
`--wait 1` by default.

**Page non-determinism — a view needs MULTIPLE snapshots**. Real
pages render differently load-to-load (lazy carousels, personalization, ad-driven
modules, rotating promos). A single capture can omit whole sections, making
correct components report `0 matches`. Don't treat a one-shot `0-match` as a dead
selector — re-snap, and confirm absence with `sel-probe`. A view is a *set* of
timestamped captures (`snapshots/<view>/<stamp>.snap`, `<stamp>` = UTC
`YYYYMMDDTHHMMSSZ`).

`coverage` is **union-aware**: it groups captures by view and flags
a component dead only when it matches 0 across the *whole* set
(`[Warnings] … 0 of N snaps`). Components present in only some captures are no
longer flagged — they appear under `[Presence]` with a `matched in K of N snaps
(last <stamp>)` recency line. T1/T2/T3 stats stay per-capture (they describe one
DOM).

**A `0 matches` warning can be a *conflict*, not a dead selector.** If a component reads `0 matches` but its selector is right, check the `[Conflicts]` section: when two components match the same node, first-match-wins keeps only the first and the other reports zero. Rename or narrow one so each node has a single owner (multi-match decomposition is not a v0 feature). `[Conflicts]` also flags two views matching a URL at equal specificity — give one a more specific route.

Observing vs. persisting are **separate commands**. `snapshot` only ever renders
to stdout (or `--out FILE`) — it never touches the corpus and never gates.
`capture` (and the overlay's Snap-view button) *append* a timestamped capture to
`snapshots/<view>/<stamp>.snap` rather than overwriting. There is **no per-view
“state” axis** — just re-`capture` the view in whatever configurations you want
(different loads, a drawer open, a tab switched).

A capture that adds **no new component type or orphan slot** vs the view set is
skipped by the **novelty gate** — `capture` prints "nothing new … not saved" and
the overlay's Snap-view button shows "= nothing new (not saved)". The first
capture of a view always writes; `capture --force` overrides. So just re-`capture`
a dynamic view a few times — only loads that render something structurally new
are kept; pure value churn (different products/prices) is ignored. `coverage`
unions the whole view set.

**`coverage` / `multi-coverage`** require `.snap.tree.json` companion files.
`capture` writes them automatically; `snapshot` writes one when `--tree-out` is
passed.

**Text duplication artifact**: components whose accessible name is `"X X"` (image
alt + heading both say "X") will show the duplication even when `category="X"` is
extracted. This is an AX artifact; Rule A only fires on exact equality.

