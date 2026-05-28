---

name: sightmap
description: Use when setting up the sight map (.sightmap/ YAML files) — defining components, views, requests, or other runtime semantics for the application. Also use when snapshot output shows generic a11y roles instead of meaningful names.
metadata:
  _generated_from: templates/skills/sightmap/SKILL.md

---
# Sightmap

## Why this exists

`sitemap.xml` tells search engines how to crawl your site. `.sightmap/` **teaches** agents how to use it.

A `.sightmap/` directory at the project root is a small set of YAML files that name your app's views, components, and API routes — checked in alongside your code, learned from the running app, and read by every coding agent that touches the repo. Each definition can carry a `memory:` list: freeform notes about quirks, invariants, and shortcuts the source code doesn't record.

What you get:

- Snapshots and network traces show **semantic names** (`NavBar`, `CheckoutForm`, `FetchFlights`) instead of generic a11y roles (`navigation`, `region`, `generic`).
- A `[Guide]` section at the top of every enriched snapshot surfaces the `memory:` entries on whatever components are visible — so the next agent picks up where the last one left off (auth gates, state quirks, validation rules).
- The artifact is a few small YAML files in your repo. It travels with the code, works in any agent (Claude, Cursor, Codex, anything that reads files), and is curated incrementally as agents work — not authored up-front.

## Uploading definitions

After obtaining a sightmap upload URL from `subtext live tunnel`, `subtext live connect`, or `subtext review open`, upload with:

```bash
subtext sightmap upload --url <sightmap_upload_url>
```

`subtext sightmap upload` auto-discovers `.sightmap/` from the current working directory. Pass `--root <dir>` to point at a different directory.

The upload uses a single-use token embedded in the URL — no additional auth is needed.

## What you define

The `.sightmap` maps selectors, URL patterns, and API routes to semantic names that agents and analytics tools share across sessions. Three definition types:

- **Components** — map CSS selectors to semantic names (e.g., `NavBar`, `SearchBox`)
- **Views** — map URL route patterns to screen names (e.g., `ProductDetail`, `UserSettings`)
- **Requests** — map API endpoints to semantic names with payload schemas (e.g., `FetchFlights`, `CreateOrder`)

## File Location

Place definition files anywhere under `.sightmap/` in the project root. All `*.yaml` and `*.yml` files are discovered recursively and merged. Organize however makes sense for your project:

```
.sightmap/
  components.yaml           # global components (NavBar, Footer)
  views.yaml                # view definitions with scoped components
  pages/
    search.yaml             # components specific to search page
    cart.yaml               # components specific to cart page
```

All files use the same schema and can contain `components`, `views`, `requests`, or any combination. The directory structure is for human organization — at load time everything merges.

## Components

Components map CSS selectors to semantic names. They can be **global** (top-level `components` array) or **view-scoped** (nested inside a view definition).

### Schema

```yaml
version: 1
components:
  - name: NavBar
    selector: "nav.main-navigation"
    source: src/components/NavBar.tsx
    description: Main site navigation with links and action buttons
    children:
      - name: nav-link
        selector: "a.nav-link"
      - name: nav-button
        selector: "button.nav-btn"

  - name: ProductCard
    selector: ".product-card"
    source: src/components/ProductCard.tsx
    description: Reusable product display (search results, recommendations, home page)

  - name: PromotedProduct
    selector: ".product-card.promo"
    source: src/components/ProductCard.tsx
    description: Promoted/featured variant of ProductCard
```

### Fields

- **version** (required): Must be `1`
- **components** (optional): Array of component definitions
  - **name** (required): Semantic name shown in snapshots (replaces a11y role)
  - **selector** (required): CSS selector to match elements. May be a string or a YAML list of strings for multiple alternatives (avoids ambiguity with commas in selectors).
  - **source** (optional): Relative path to the source file implementing this component. Not uploaded to the server, but useful for agents navigating source code locally.
  - **description** (optional): Brief description of the component's purpose. Not uploaded, but useful for agents reading the sightmap directly.
  - **memory** (optional): List of contextual notes about this component, uploaded and shown in a Component Guide section of snapshot output.
  - **children** (optional): Child components. Their selectors are scoped to the parent's subtree.

### Multiple matches

When multiple definitions match the same element, all names are shown. For example, a `.product-card.promo` element matches both `ProductCard` and `PromotedProduct`:

```
uid=1_20 ProductCard, PromotedProduct "Cool Shoes" visible interactive
```

### Selector tips

- Prefer stable selectors: `data-` attributes, semantic class names, element roles
- Avoid fragile selectors: deeply nested paths, nth-child, generated class names
- Use a YAML list for multiple matching patterns:
  ```yaml
  selector:
    - ".search-bar"
    - "[role='search']"
  ```
- Children selectors are automatically scoped to parent subtree

### Writing memory entries

A memory entry should help the **next agent driving or reviewing the running app** understand what's on screen — *runtime behavior*, not source structure. Useful gut check: would this note show up usefully in the `[Guide]` of a snapshot the agent's about to interact with? If the answer requires holding the codebase in hand too, it belongs in source comments or `CLAUDE.md`, not here.

**Good memory candidates:** stateful behavior (how toggles change the rendered UI), auth gates and credentials, form rules, multi-step interactions, runtime quirks.

**Stay out of memory:** file paths, JSX/CSS patterns, style conventions, external doc references — all discoverable elsewhere or owned by other artifacts.

## Views

A view represents a screen or route in the application. Views provide:

1. **"You are here" context** — the snapshot header identifies the current view by name
2. **Scoped component definitions** — components that only exist on certain views
3. **Metadata** — description, source file reference

### Schema

```yaml
version: 1

# Global components — matched on all views
components:
  - name: NavBar
    selector: "nav.main-nav"

views:
  - name: HomePage
    route: "/"
    source: pages/Home.tsx
    components:
      - name: HeroSection
        selector: ".hero-section"

  - name: ProductDetail
    route: "/products/*"
    source: pages/ProductDetail.tsx
    components:
      - name: AddToCartButton
        selector: "button.add-to-cart"
```

### View Fields

- **name** (required): Semantic name shown in snapshot header
- **route** (required): Glob pattern matched against URL pathname
- **description** (optional): Brief description of the view
- **source** (optional): Relative path to the source file
- **components** (optional): View-scoped component definitions (additive model)

### Route matching

- `*` matches a single path segment; `**` matches any depth
- First matching view wins (definition order = priority)

## Requests

Requests map API endpoints to semantic names. See the MCP version of this skill for the full schema. The upload format is identical — `subtext sightmap upload` reads the same `.sightmap/` YAML files.

## Enriched Snapshot Output

With a matched view:

```
[View: ProductDetail "https://mystore.com/products/123"]

uid=1_0 RootWebArea "Blue Widget - MyStore"
  uid=1_1 NavBar visible interactive
  uid=1_10 main visible
    uid=1_20 AddToCartButton "Add to Cart" visible interactive
```

Without definitions, elements still get `visible`/`interactive` annotations but use generic a11y roles.
