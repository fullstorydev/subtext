---
name: subtext:visual-verification
description: After making visual UI changes, verify the result by screenshotting the running app. Self-correct obvious issues; checkpoint with the user on subjective changes.
metadata:
  requires:
    skills: ["subtext:shared", "subtext:live", "subtext:comments"]
---

# Visual Verification

> **PREREQUISITE:** Read `subtext:shared` for MCP conventions. Subtext live browser tools must be available.

After modifying UI code, verify the result visually. Don't say "the styling looks good" without actually seeing it.

## When This Applies

Activated when you modify a file that produces visible UI changes:
- Component files: `.tsx`, `.jsx`, `.vue`, `.svelte`
- Stylesheets: `.css`, `.scss`, `.less`
- Template files: `.html`, `.ejs`

Does NOT activate for purely logic changes (API handlers, utils, tests) unless they directly affect rendered output.

**Not sure?** Screenshot. The cost of an unnecessary screenshot is near zero.

## Rules

### 1. Screenshot after visual changes

After modifying UI code, take a screenshot of the affected area before reporting done. Use Subtext MCP tools (e.g. `live-view-screenshot`, `live-view-snapshot`).

When the change is to a specific component, clip the screenshot to it via `live-view-screenshot`'s `component_id` (and a small `expand_pct` for surrounding context). A focused clip is sharper evidence than a full viewport.

If you don't know the URL or the dev server isn't running, ask.

### 2. Self-verify vs checkpoint

- **Functional/mechanical changes** (fixed a broken button, updated text, wired up a handler): self-verify silently. Only mention if something looks wrong.
- **Aesthetic/subjective changes** (new component, styling, layout, spacing): share the screenshot with the user and ask if it looks right.

### 3. Check variants when touching style code

If the change involves colors, CSS variables, theme classes, or responsive/layout code:
- Screenshot both light and dark themes
- Check a mobile viewport

If it's a content-only change, skip the variants.

### 4. Compare against user feedback

When the user provides visual feedback (screenshot, description of what's wrong), after making the fix, screenshot the same area and compare. Don't just say "fixed" — show it. If the feedback is about a specific element, clip to that element (`component_id`) so the before/after framing matches.

### 5. Snapshot before modifying unfamiliar UI

Before changing a component you haven't seen yet, take a snapshot to understand the current state. Don't guess at the existing layout from code alone.

### 6. Share the trace URL as the last step

After verifying, **output the `trace_url`** from the `live-connect` response so the user can review your work. The link opens the live viewer with agent comments in the sidebar.

## Leaving comments

Call `comment-list` before starting verification to read existing user annotations or prior agent observations. Address these first.

Use `comment-add` to leave comments while browsing. These attach to your session as `AUTHOR_TYPE_AGENT` and appear in the viewer sidebar when the user opens the viewer URL. Navigate to the **actual page** you're reviewing and comment there.

## Decision Logic

### Change type classification

| Type | Examples | Action |
|------|----------|--------|
| Functional | Fixed a bug, wired up handler, updated text, added a prop | Self-verify |
| Aesthetic | New component, changed colors/spacing/layout, added animations | Checkpoint with user |
| Style-touching | Modified CSS variables, theme classes, color/layout/responsive utilities | Check theme + viewport variants |

### "Do I need to screenshot?"

- Modified a `.tsx`/`.jsx`/`.vue`/`.css` file? **Yes**
- Change only touched logic inside a hook, handler, or utility? **No**
- Change touched JSX/template markup or className/style attributes? **Yes**

### "Do I need to check viewports?"

- Change uses responsive classes (`lg:`, `md:`, `sm:`) or media queries? **Yes**
- Change modifies grid/flex layout or spacing? **Yes**
- Change is text or color only? **No**

## After a design skill

If the agent just executed a design-focused skill (e.g., `frontend-design`) that produced UI code, treat the entire output as aesthetic and style-touching. This means:
- Always checkpoint with the user (Rule 2 — the changes are subjective by nature)
- Always check theme and viewport variants (Rule 3 — design skills make bold color/layout choices)

## Composition

- **Type:** Foundation/discipline skill — not a workflow, not routable. Applies during any UI work.
- **Used alongside:** Any workflow or task that modifies UI code (`bug-fix-workflow` validation, standalone UI work, design skills like `frontend-design`)
- **Complements:** `sightmap` (snapshots reveal sightmap gaps), `tunnel` (enables cloud agent access to localhost)
