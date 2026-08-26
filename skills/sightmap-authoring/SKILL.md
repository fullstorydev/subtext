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

> **Further reading.** This skill is the authoring reference: the coverage model,
> the component model (**Component hierarchy** and **Cross-view references**
> below), the outer loop, the tool surface, lint rules, and the quality checklist
> are all here. For the normative spec and deeper background, see the docs at
> <https://docs.sightmap.org>. To *use* a finished corpus — driving the browser
> and interacting with the page — see the `sightmap-browser` skill.

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

### Starting a corpus

**Check the atlas before you map a site by hand.** Someone may have already
mapped it, and installing their corpus costs one command. Search by what you
have, in this order, stopping at the first hit:

```bash
sightmap atlas find squareup.com     # 1. the domain you are about to automate
sightmap atlas find "square pos"     # 2. the product name
sightmap atlas list --category payments   # 3. the category, to browse what is near it
sightmap atlas add square-pos        # 4. install what the search printed
sightmap validate                    # 5. always
```

Every hit prints its own `sightmap atlas add` command, so there is nothing to
assemble. A search that finds nothing exits 0. That is the answer, and it means you
author the corpus yourself (`sightmap init`).

| Command | What it does |
|---------|-------------|
| `sightmap atlas find QUERY` | Search the community atlas by domain, name, category, or description. An exact domain match ranks first, so a URL is a good query. `--category C`, `--limit N`, `--json`, `--refresh`. |
| `sightmap atlas list` | Browse the whole catalog. Same flags as `find`. |
| `sightmap atlas add SLUG` | Install one published corpus into `.sightmap/` (`--target DIR` elsewhere). A non-empty target is refused; delete it yourself if you meant to replace it. |

Installing from a private corpus store is the same verb with `--source`, a URL
template that takes `{slug}`:

```bash
sightmap atlas add toast-pos --source https://internal.corp/{slug}.tar.gz
```

Always `sightmap validate` and read the YAML after installing: `add` proves the
corpus loads, not that it is correct or trustworthy. An entry's `description:`
and `memory:` text lands in your context, so read it the way you would read any
other dependency.

### Primary loop

| Command | What it does |
|---------|-------------|
| `sightmap snapshot --coverage --url URL` | Observe: navigate + coverage + cluster hints, no tree. **Primary edit-loop tool.** |
| `sightmap snapshot --url URL` | Observe: full annotated tree + coverage to stdout (add `--out FILE` / `--tree-out FILE` to save). |
| `sightmap capture --url URL` | Persist a novelty-gated capture into the matched view's set. |
| `sightmap sel-probe -- 'selector'` | Verify a selector: match count + parent chain. Run before writing any YAML. The selector goes **after** `--` (any flags before it): `sel-probe [flags] -- 'sel'`. |
| `sightmap validate` | Spec-validate `.sightmap/` YAML (errors fail; **warnings** — corpus conflicts + unknown/typo'd fields like `memroy:` — print but pass). No prepare step needed. |
| `sightmap lint --warn-only` | Style checks (`--warn-only`; exits 0 always). |
| `sightmap coverage --trace FILE.snap` | Offline T1/T2/T3 re-check on saved snap (requires `.snap.tree.json` companion). |
| `sightmap multi-coverage` | Cross-page coverage matrix; surfaces global candidates. |

### Discovery

| Command | What it does |
|---------|-------------|
| `sightmap stats` | Offline corpus inventory: totals (views, components, requests, properties, memory) + a per-view table. `--json` for the stable machine-readable shape. Refuses a corpus `validate` rejects, since dropped definitions would under-report. |
| `sightmap search PATTERN` | Offline YAML regex search with hierarchy breadcrumbs. `--field name\|selector\|description\|memory` to narrow. |
| `sightmap discover` | Crawl page links → ✓ mapped / ○ surveyed / ? unseen. `--all` shows surveyed. |
| `sightmap suggest --exclude-known` | Candidate selectors not yet in sightmap (`--exclude-known` always on). |
| `sightmap gap` | Orphaned interactive nodes with selector hints. Add `--include-hidden` to also list hidden/off-screen nodes. |
| `sightmap explain [SELECTOR] [--grep STR] [--id N] [--snap FILE]` | Node-first inspection: dump a node's facts (tag/id/classes/attrs), ranked selector candidates, coverage tier + owning component, and ancestor hooks. Use `--grep 'Refresh'` (by role/name) or a selector when you've spotted a node but don't have a selector yet — the shadow-transparent replacement for hand-reading `*.snap.tree.json`. `--snap FILE` inspects a captured tree offline. |

### Session management

| Command | What it does |
|---------|-------------|
| `sightmap browser start` | Launch Chrome + the sightmap overlay server. **Foreground daemon — holds the shell; pass `--detach` in scripts/agents.** Writes `.sightmap/.session`. |
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
Run `sightmap sel-probe -- 'selector'` on every new selector before committing it
to YAML (the selector goes after `--`, any flags before it). sel-probe queries the live DOM **and** cross-checks the offline matcher
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

## Component hierarchy (`children:`)

Components nest. A component may carry a `children:` list of nested components,
and this is the idiomatic way to model a container and the controls it owns
(a sidebar and its buttons, a row and its actions). The snap tree already *shows*
this nesting (`Sidebar` > `NavLink`); `children:` is how you *author* it.

```yaml
components:
  - name: Sidebar
    selector: 'nav.rail'
    children:
      - name: Brand
        selector: '.brand'          # relative to Sidebar
      - name: NavLink
        selector: 'a'               # generic — scoped to Sidebar's subtree
```

**A child's selector is scoped to its parent's subtree** — the effective
selector is the ancestor selectors prepended (a descendant combinator),
recursively. So a child only has to be unambiguous *within its parent*, not
globally: on a page with 16 `button`s, 14 of them inside `nav.rail`, a
`Sidebar` > `NavButton` with the generic child selector `button` matches exactly
those 14. This shortens selectors and keeps obviously-owned sub-components out of
the global namespace. (Flat components already earn T2 by DOM containment;
`children:` is not required to reach 0 orphaned — it is how you express ownership
and shorten child selectors.)

**Use it for:**

- **Owned sub-components** that only ever live in one container (a rail's brand,
  collapse, new-chat, sign-out buttons): nest them with short relative selectors
  instead of declaring long-selectored top-level globals.
- **Repeated-identical controls** — every row's identical Rescue button, a
  conversation row's `⋯` button, per-row stars. The row is a repeated container,
  so by the property rules below it carries its own discriminator
  (`ArchiveRow[title=…]`); nest the identical control beneath it
  (`ArchiveRow` > `RescueButton`, child selector `button`). You then address one
  instance with a **descendant component query** — `ArchiveRow[title="…"]
  RescueButton` — because the parent's discriminator carries into the query.
  (Query syntax lives in the `sightmap-browser` skill; whitespace is a descendant
  combinator — there is no `>` child combinator.)

**Depth budget.** Because selectors are prepended, deep trees produce long
selectors; `lint` warns `[deep-nesting]` at ≥4 levels. When you hit it, **promote
a singleton**: a descendant that is globally unique (e.g. the one open menu
popover) belongs as a top-level component, not buried four levels down.

**Names are unique per-parent, not global.** Two different parents may each have
a child named `Star`; `search` shows them by breadcrumb (`TreeRow › Star`,
`GalleryTile › Star`). Reuse generic child names freely for coverage, but give a
**unique** name (or a per-instance property) to anything you intend to drive by
component query.

## Cross-view references (`$ref`)

A component defined at the root of a `components.yaml` is **global**: it matches
on every view with no further wiring. To record *in a view* that such a global
appears there, reference it by name:

```yaml
views:
  - name: Home
    route: "/"
    components:
      - $ref: Sidebar            # the global Sidebar can appear on Home
      - name: Composer
        selector: '.composer'
```

- The spelling is exactly `$ref` (a single-key entry). `ref:` and `uses:` are
  **not** recognized (they validate as unknown fields).
- `$ref` resolves against a root-level component **name**. A dangling ref is a
  hard error (`ref-unresolved`); a reference cycle errors too (`ref-circular`).
- It is **idempotent** for a genuine global: the component already matches
  everywhere, so `$ref`-ing it adds documentation, not a second match.
- **What a listed component means:** anything listed on a view (or nested under
  it), `$ref` included, is something that *can* appear there — **not** a
  guarantee it is always present. There is no way to assert "always present", so a
  `$ref`'d component that is absent from some captured states is expected and
  fine. Use `$ref` to attest which globals a view can show (a rail that's usually
  there, a modal reachable from the page).

## Memory (`memory:`)

`memory:` carries short free-text notes that surface in your `[Guide]` context
whenever the definition is active — quirks, invariants, "you have to click this
twice" lore that isn't recoverable from the DOM. It is a **list of plain
strings** (not objects — a list of `{name, text}` maps fails to parse), and it
attaches at the file root (global notes), on a view, or on a component:

```yaml
version: 1
memory:
  - Auth rail is present on every page except /login.
components:
  - name: RangeSlider
    selector: '.range'
    memory:
      - "Range: 1st click = start, 2nd = end, 3rd resets"
```

---

## Property extraction principles

Two property rules are **mandatory**:

1. Every child component that is a link or button **must** have at least one
   property.
2. Every component whose selector matches **more than one instance** — a
   repeated container or control (cards, list rows, nav tabs, feed items) —
   **must** carry a property that *varies per instance* (a title, label, key, or
   state), even a pure container with no link/button of its own. Without one,
   every instance collapses to an indistinguishable node and no component query
   can resolve a single one. `sel-probe` already prints the match count: a count
   > 1 with no per-instance property is the tell. Extract the discriminator from
   wherever it lives — a header title, an `aria-label`, a stable `data-*`. When
   the repeated node is an *identical leaf* that has no discriminator of its own
   (every row's identical Rescue button), put the discriminator on its container
   and nest the leaf beneath it — see **Component hierarchy** above.

```yaml
- name: FooterLink
  selector: 'a'
  properties:
    - name: label
      extract: text

# Repeated container: one selector, many instances → needs a per-instance
# discriminator so `Card[title^="Today"]` can resolve exactly one.
- name: Card
  selector: 'article.card'
  properties:
    - name: title
      extract: '.card__title'
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

## Requests and messages

Components and views describe the DOM. Two more top-level entities describe a
page's *runtime activity*: the network it makes (`requests:`) and the
console/exceptions it emits (`messages:`). Both are matched against **live
traffic**, not the DOM tree — you author them from what you observe with the
`sightmap-browser` skill's `network` and `console` tools, where each captured
record leads with a `[MatchedName]` slot (or `[--]` when nothing matched). They
live in their own top-level lists and can share any `.sightmap/*.yaml` file.

### `requests:` — name an endpoint

Name endpoints that *mean something* (an API action, an auth call, a data fetch)
by route glob + method, so their traffic is classified instead of anonymous.
Don't map static assets (JS/CSS/images/fonts).

```yaml
version: 1
requests:
  - name: AuraAction
    route: /aura                 # glob matched against the request URL path
    method: POST
    description: Lightning Aura batched server actions.
```

In `sightmap network list`, traffic to it now reads `[AuraAction]`; unmapped
traffic reads `[--]`.

### Request `properties:` — extract a value from live traffic

The HTTP status often lies: an endpoint returns `200 OK` while the real outcome
lives inside the body. A request `properties:` entry pulls a named value out of
the live request/response so a consumer can reason about it (the SEP-0005 "200 OK
but the body says declined" case). Each property is resolved
**source → field → pattern → transform**:

- **`source:`** — which half to read: `rsp.body`, `req.body`, `rsp.headers`, or
  `req.headers`.
- **`field:`** — where inside it. For a body, a dot-path into the parsed JSON; a
  numeric segment indexes an array (`actions.0.state`). For headers, the header
  name (case-insensitive).
- **`pattern:`** *(optional)* — an RE2 regex refining what `field` resolved (or
  scanning the raw source when `field` is omitted). Capture group 1 is the value
  when present, else the whole match.
- **`transform:`** *(optional)* — same vocabulary as component properties.

```yaml
requests:
  - name: AuraAction
    route: /aura
    method: POST
    properties:
      # Aura returns HTTP 200 even when an action fails; the real per-action
      # outcome (SUCCESS | ERROR | INCOMPLETE) is inside the JSON body.
      - name: first_action_state
        source: rsp.body
        field: actions.0.state
```

Live, matched requests carry the extracted value:
`[AuraAction] POST /aura → 200 (XHR) {first_action_state=SUCCESS}` — and, on the
one call that actually failed behind the same 200, `{first_action_state=ERROR}`.

Extraction is **silently omitted** (never an error) when the source isn't
present, the field doesn't resolve, or the pattern doesn't match — whether a body
or header is even captured depends on the runtime layer. `status`, `method`, and
`duration` are already-structured request identity and need no `properties:`
declaration.

### `messages:` — name a console/exception pattern

A `messages:` entry classifies console output and runtime exceptions by `level`
and/or a `message` regex. An exception folds in as an ERROR/`exception`-level
record — there is no separate entity.

```yaml
version: 1
messages:
  - name: DeprecatedChartApi
    level: WARN                    # exact, case-insensitive; omit to match any level
    message: has been deprecated   # RE2 regex over the message text; omit to match any
    description: Legacy chart JS deprecation warning.
```

In `sightmap console list`, a matched record reads `[DeprecatedChartApi]`;
unmatched reads `[--]`. Declare at least one of `level`/`message` (an entry
matching everything isn't useful).

An exception's **stack frames** are addressable with message `properties:`
(`source: stack` is the only source in v1):

```yaml
messages:
  - name: CartSyncCrash
    message: cart version mismatch
    properties:
      - name: origin_fn
        source: stack
        field: top.function       # <frame>.<attr>; frame = top|<index>, attr = function|file|line|column
```

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

`browser start` is a **foreground daemon that holds this shell** for the whole
session. In a script or agent shell (each command run to completion), use
`sightmap browser start --detach` instead — it backgrounds the daemon and
returns once it's ready. See the `sightmap-browser` skill's *Session management*.

Verify with `sightmap browser status` — should show `● running cdp=7892` and list your content tab(s).
The sightmap HTTP server starts automatically and recompiles on YAML changes.
The overlay extension is embedded in the binary and auto-extracted to
`~/.sightmap/extension/` on first run — no `--extensions` flag needed.

If the site has a `package.json` with `g:*` scripts, those are convenience wrappers around the same commands and work equally well.

---

## Phase 1: Per-page iteration

### Step 1a — If no view file exists yet

```bash
sightmap suggest --exclude-known   # candidates not in sightmap
sightmap discover                  # URL patterns — find unseen routes
```

Prefer selectors with `data-testid`, `data-component^=`, `#id`. Stable,
hand-authored class names are fine too — the volatility risk is *generated or
hashed* classes (CSS-modules, hashed production builds) and auto-generated IDs;
avoid those, not classes as a category.

Create a view file `.sightmap/views/PAGE.yaml`. **View fields go under a
top-level `views:` list** — `route:`/`url:`/`name:` are *not* file-root fields
(putting them at the root silently makes the file a globals file, matching no
view):

```yaml
version: 1
views:
  - name: Home
    route: "/"                     # glob matched against the URL path (** = any depth)
    url: "https://example.com/"    # a representative URL, used by report/capture
    components:
      - name: SearchBar
        selector: '[data-testid="search"]'
```

Run `sightmap validate` before snapping.

**Route matching (globs).** `*` matches exactly one path segment; `**` as its
own segment matches zero or more (`/a/**` matches `/a`, `/a/b`, `/a/b/c`; `/a/*`
matches only `/a/b`). Matching is against the URL's **decoded** path, so a `%2F`
in the URL counts as a separator: `/app/x%2Fy%2Fz` is five segments, not three,
and a `/app/*/*` route won't match it (use `/app/**`). When several views match,
the most specific wins; ties go to the first-declared view.

**Keep routes specific.** A `route:` glob should identify *this* view, not every
page. A catch-all like `/lightning/**` or `/**` that matches every URL is a smell:
as you map more pages they all collapse onto the one view, and — worse —
`sightmap discover` marks those distinct URLs `✓ [ThatView]` (mapped) purely
because the catch-all matched, hiding that they are actually uncovered. When a
new page looks structurally different (its Guide is mostly *different*
components), give it its own view with a narrower route and demote or drop the
catch-all. Matching every page is the problem, not the goal — don't keep an
over-general route just because it "matches."

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

The `→` selector hint (and the `container:` hook on hook-poor DOMs) is what to
use for a new child component. Use `sightmap sel-probe` to verify match count
before writing YAML.

When you've spotted a node but need its raw facts to craft a selector — common on
shadow-DOM / hashed-id apps where `browser eval`'s `querySelector` returns `[]` —
reach for `sightmap explain` instead of hand-reading the tree JSON: `explain
--grep 'Refresh'` (by role/name), `explain 'div.card'` (by selector), or `explain
--snap PAGE.snap --id N` (offline). It dumps the node's tag/id/classes/attrs,
ranked selector candidates, its tier + owning component, and ancestor hooks —
shadow-transparent, matching what the offline matcher sees.

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
Scan YAML for children (see **Component hierarchy**) in different parents with
identical selectors. Consolidate or promote to global.

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

### Step 1e — Runtime activity (requests & messages)

DOM coverage isn't the whole page. Once components are done, classify what the
page *does* at runtime — the network it makes and the console/exceptions it emits
— with the `requests:` and `messages:` entities (see **Requests and messages**
above; observe them with the `sightmap-browser` skill's `network`/`console`
tools). Traffic from before the session started isn't captured, so **reproduce it
first**: refresh the page (or re-trigger the action), then read the streams —
matched records lead with a `[Name]` slot, unmapped ones with `[--]`:

```bash
sightmap network list --type XHR    # name meaningful endpoints; skip static assets
sightmap console list               # name recurring console/exception patterns
```

- Add a `requests:` entry for endpoints that *mean something* (an API action, an
  auth call, a data fetch). Add request `properties:` where a value inside the
  body/headers is the real signal — the "200 OK but the body says failed" case.
- Add a `messages:` entry for recurring console/exception patterns worth naming.
- Requests/messages are often global; promote cross-page ones like components
  (Phase 2). Skip it only when the page makes no meaningful traffic.

---

## Phase 2: Cross-page promotion

```bash
sightmap multi-coverage
```

**Promote** components appearing on 2+ pages that aren't in `components.yaml`:
- 3+ pages → always promote
- 2 pages, identical selectors → usually promote
- 2 pages, different selectors → keep view-scoped

Only **current** views count toward this. A capture dir that matches no view in
the current corpus (a stale or renamed `snapshots/<dir>/`) is marked `*` in the
matrix and excluded from the candidate list, with a warning — so a leftover dir
can't manufacture phantom "appears in 2+ views" evidence for a page's own
components. When you see that warning, delete the stale dir (or re-capture the
view under its current name) and re-run.

---

## Phase 3: Validation

```bash
sightmap validate       # ✓ no validation errors = done
sightmap lint --warn-only   # deep-nesting warnings (see Component hierarchy: promote singletons); watch for new ones
```

**Done when:**
- [ ] `sightmap validate` exits 0
- [ ] Every page at 0 orphaned ✓
- [ ] Quality self-review passed for all pages
- [ ] `sightmap multi-coverage` shows no unaddressed global candidates
- [ ] Runtime activity classified — meaningful `network`/`console` records lead with a `[Name]`, not `[--]` (or are deliberately left unmapped)

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
skipped by the **novelty gate** — `capture` reports that the view *already has* N
capture(s) and this one is redundant ("not saved"), and the overlay's Snap-view
button likewise marks it skipped. Read that as "already covered", **not** as a
refusal of a first baseline: **the first capture of a view always writes** (an
empty set can't be redundant), and `capture --force` keeps a redundant one
anyway. So just re-`capture` a dynamic view a few times — only loads that render
something structurally new are kept; pure value churn (different products/prices)
is ignored. `coverage` unions the whole view set.

**`coverage` / `multi-coverage`** require `.snap.tree.json` companion files.
`capture` writes them automatically; `snapshot` writes one when `--tree-out` is
passed.

**Text duplication artifact**: components whose accessible name is `"X X"` (image
alt + heading both say "X") will show the duplication even when `category="X"` is
extracted. This is an AX artifact; Rule A only fires on exact equality.

