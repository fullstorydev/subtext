---
name: sightmap
description: Use when setting up the sight map (.sightmap/ YAML files) — defining components, views, requests, or other runtime semantics for the application. Also use when snapshot output shows generic a11y roles instead of meaningful names.
---

# Sightmap

## Why this exists

`sitemap.xml` tells search engines how to crawl your site. `.sightmap/` **teaches** agents how to use it.

A `.sightmap/` directory at the project root is a small set of YAML files that name your app's views, components, and API routes — checked in alongside your code, learned from the running app, and read by every coding agent that touches the repo. Each definition can carry a `memory:` list: freeform notes about quirks, invariants, and shortcuts the source code doesn't record.

What you get:

- Snapshots and network traces show **semantic names** (`NavBar`, `CheckoutForm`, `FetchFlights`) instead of generic a11y roles (`navigation`, `region`, `generic`).
- A `[Guide]` section at the top of every enriched snapshot surfaces the `memory:` entries on whatever components are visible — so the next agent picks up where the last one left off (auth gates, state quirks, validation rules).
- The artifact is a few small YAML files in your repo. It travels with the code, works in any agent (Claude, Cursor, Codex, anything that reads files), and is curated incrementally as agents work — not authored up-front.

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
  - **source** (optional): Relative path to the source file implementing this component. Not uploaded to the MCP server, but useful for agents navigating source code locally.
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

Concrete — after editing a `Hero` component:

```yaml
- "Audience toggle re-renders all H1 copy between 'builders' and 'agents'"   # ✓ runtime
- "Headline copy lives in the `copy` object as JSX with both variants"        # ✗ source structure
- "H1 emphasis uses <em className='italic text-[var(--accent)]'>…</em>"       # ✗ implementation
- "Positioning doc at src/.../current.md retires 'sight' language"            # ✗ external ref
```

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
    children:
      - name: nav-link
        selector: "a.nav-link"

# View definitions
views:
  - name: HomePage
    route: "/"
    description: Main landing page
    source: pages/Home.tsx
    components:
      - name: HeroSection
        selector: ".hero-section"
        children:
          - name: hero-cta
            selector: "button.cta"

  - name: ProductDetail
    route: "/products/*"
    description: Individual product page
    source: pages/ProductDetail.tsx
    components:
      - name: ProductGallery
        selector: ".product-gallery"
        children:
          - name: gallery-image
            selector: ".gallery-img"
      - name: AddToCartButton
        selector: "button.add-to-cart"

  - name: UserSettings
    route: "/users/*/settings"
    source: pages/UserSettings.tsx
```

### View Fields

- **name** (required): Semantic name shown in snapshot header
- **route** (required): Glob pattern matched against URL pathname
- **description** (optional): Brief description of the view
- **source** (optional): Relative path to the source file
- **components** (optional): View-scoped component definitions (same schema as global components). These are matched **in addition to** globals (additive model).

### Route matching

- `route` is a glob pattern matched against `new URL(pageUrl).pathname`
- `*` matches a single path segment (e.g., `/products/*` matches `/products/123`)
- `**` matches any depth (e.g., `/admin/**` matches `/admin/users/42/edit`)
- Exact routes work too: `/` matches only the root
- First matching view wins (definition order = priority)
- If no view matches, only global components are used

### How scoped components work

When a view matches, its `components` are merged with the top-level global components before matching against the DOM. This is additive — view components supplement globals, they don't replace them.

For example, with the schema above on `/products/123`:
- Global `NavBar` and `nav-link` are matched (always)
- View-scoped `ProductGallery`, `gallery-image`, and `AddToCartButton` are also matched
- Total: all five component names are available in the snapshot

## Requests

Requests map API endpoints to semantic names with optional payload schemas. When matched, network tools (`live-net-list`, `live-net-get`) overlay the definition metadata — giving immediate context about what each request does.

### Schema

```yaml
version: 1
requests:
  - name: FetchFlights
    route: "/api/flights"
    method: GET
    description: Search for available flights
    source: src/api/flights.ts
    request:
      fields:
        - name: origin
          type: string
          description: Origin airport code
        - name: destination
          type: string
          description: Destination airport code
    response:
      fields:
        - name: flights
          type: array
          description: List of available flights
        - name: total
          type: number
    headers:
      - Authorization

  - name: GetFlightFares
    route: "/api/flights/:id/fares/:category"
    method: GET
    description: Fare options for a specific flight and cabin class

  - name: CreateBooking
    route: "/api/bookings"
    method: POST
    description: Create a new flight booking
    source: src/api/bookings.ts
```

### Request Fields

- **name** (required): Semantic name shown in network tool output
- **route** (required): Glob pattern matched against the URL pathname. Express-style `:param` segments are converted to `*` before matching (e.g., `/api/flights/:id` becomes `/api/flights/*`).
- **method** (optional): HTTP method filter (e.g., `GET`, `POST`). If omitted, matches any method.
- **description** (optional): Brief description of what the endpoint does
- **source** (optional): Relative path to the source file implementing this endpoint
- **request** (optional): Expected request payload
  - **fields**: Flat list of field descriptors (`name`, `type`, `description`)
- **response** (optional): Expected response payload (same structure as `request`)
- **headers** (optional): Notable header names to highlight

### Route matching

- `route` is a glob pattern matched against `new URL(requestUrl).pathname`
- Express-style `:param` segments are converted to `*` before matching
- `*` matches a single path segment: `/api/flights/*` matches `/api/flights/123`
- `**` matches any depth: `/api/**` matches `/api/v2/flights/123/fares`
- First matching definition wins (definition order = priority)

### View-scoped requests

Views can include a `requests` array, which is merged with global requests (additive, same pattern as view-scoped components):

```yaml
version: 1
requests:
  - name: GetUser
    route: "/api/user"

views:
  - name: SearchPage
    route: "/search"
    requests:
      - name: SearchFlights
        route: "/api/flights/search"
        method: POST
```

When on `/search`, both `GetUser` and `SearchFlights` are available for matching.

### Enriched Network Output

**List view** (`live-net-list`) — matched requests show the semantic name:
```
reqid=1 FetchFlights GET https://app.example.com/api/flights [success - 200]
reqid=2 GET https://app.example.com/assets/logo.png [success - 200]
```

**Detail view** (`live-net-get`) — a Sightmap section appears with description and field schemas:
```
## Request https://app.example.com/api/flights
### Sightmap: FetchFlights
Search for available flights
Source: src/api/flights.ts
Expected request fields:
- origin (string) — Origin airport code
- destination (string) — Destination airport code
Expected response fields:
- flights (array) — List of available flights
- total (number)
Status:  [success - 200]
### Request Headers
...
```

Unmatched requests render exactly as before — enrichment is non-fatal.

## Enriched Snapshot Output

With a matched view:

```
[View: ProductDetail "https://mystore.com/products/123"]

uid=1_0 RootWebArea "Blue Widget - MyStore"
  uid=1_1 NavBar visible interactive
    uid=1_4 nav-link "Home" visible interactive
    uid=1_6 nav-link "Products" visible interactive
  uid=1_10 main visible
    uid=1_15 ProductGallery visible
      uid=1_16 gallery-image "Blue Widget front" visible
      uid=1_17 gallery-image "Blue Widget side" visible
    uid=1_20 AddToCartButton "Add to Cart" visible interactive
```

Without a matched view (globals only):

```
[Components: NavBar, nav-link]

uid=1_0 RootWebArea "Some Page"
  uid=1_1 NavBar visible interactive
    uid=1_4 nav-link "Home" visible interactive
  ...
```

Without definitions, elements still get `visible`/`interactive` annotations from the DOM probe but use generic a11y roles.

## Using Sightmap in Snapshots

When sightmap definitions are loaded, snapshots automatically annotate matched elements with semantic names. Component `memory` entries appear in a Component Guide section at the top of snapshot output, giving agents context about each component's purpose. The `source` and `description` fields are not uploaded but are available to agents reading `.sightmap/` files directly for local navigation and context.
