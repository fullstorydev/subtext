---
name: recipe-sightmap-setup
description: Short recipe to create sightmap definitions for a project from scratch.
metadata:
  requires:
    skills: ["subtext:sightmap"]
---

# Recipe: Sightmap Setup

> **PREREQUISITE:** Read `subtext:sightmap` for the full schema reference.

## Steps

1. **Navigate to the page**: `live-view-navigate(url=...)` or `live-view-new(url=...)`
2. **Take a baseline snapshot**: `live-view-snapshot()` to see the current a11y tree with generic roles
3. **Identify key UI components** in the snapshot (navigation, forms, cards, modals, etc.)
4. **Find good selectors** using `live-view-inspect()` — this returns the full component tree with CSS selectors (tag, id, classes, `data-*` attributes, `aria-*`, `href`, etc.) on every node. Use it to identify stable targeting info, then switch back to `live-view-snapshot()` for normal interaction.
   Prefer `data-*` attributes when available — they're stable and semantically meaningful (e.g., `[data-component="ProductTile"]`, `[data-testid="checkout-button"]`).
5. **Create `.sightmap/components.yaml`** with component definitions (see `subtext:sightmap` skill for schema)
6. **Add memories** to key components — contextual notes that appear in a `[Guide]` section at the top of every snapshot. Focus on:
   - **Auth/access**: passwords, test accounts, login flows (e.g., `"Password is 'argus'"`)
   - **Stateful components**: how toggles, tabs, or modes change the UI (e.g., `"Audience toggle switches copy between builder/agent perspectives"`)
   - **Forms**: required fields, validation rules, expected formats
   - **Complex interactions**: multi-step flows, known quirks, non-obvious behavior
   ```yaml
   - name: LoginForm
     selector: "[data-component='LoginForm']"
     source: src/components/LoginForm.tsx
     memory:
       - "Test account: user@test.com / password123"
       - "Shows CAPTCHA after 3 failed attempts"
   ```
7. **Take another snapshot** to verify component names appear (definitions are re-read on each snapshot)
8. **Add views** if the app has distinct routes — specify route patterns and view-scoped components
9. **Add requests** if key API endpoints should have semantic names — use `live-net-list` to identify them
10. **Verify enrichment**: take snapshots on different views, check `[View: ...]` headers, semantic names, and `[Guide]` section with memories all appear
