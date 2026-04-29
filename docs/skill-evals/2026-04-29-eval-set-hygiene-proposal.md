# Eval-Set Hygiene Proposal — Surface-Tagging for using-subtext Era

**Date:** 2026-04-29
**Author:** chip + agent
**Status:** Proposal — review before applying

## Background

The 2026-04-29 sandbox eval run on the using-subtext branch revealed that `eval-set-v3` and `eval-set-v4` have a contract mismatch with using-subtext's actual trigger surface:

- **using-subtext** narrows proof's invocation trigger to: rendered UI, observed sessions, or producing reviewer-facing evidence (screenshots, viewer links, code diffs, command output).
- **The eval-sets** were authored before using-subtext shipped, with `should_trigger: true` on every code-modifying query — including pure backend changes, refactors, schema migrations, and dependency bumps that have no UI surface.

The result: positives that scored 0/3 in the eval are arguably correct skips, not regressions. The eval contract is broader than reality.

This proposal adds a non-destructive `surface` tag to each query so we can:
1. Keep all existing entries intact (don't rewrite history).
2. Filter eval runs by surface for cleaner per-axis measurement.
3. Naturally accommodate the trigger-surface widening when *proof documents* ships (queries with `surface: "code-only"` will start passing once code-diff evidence is first-class).

## Proposed `surface` taxonomy

| Tag | Meaning | Should fire today? | Will fire post-proof-documents? |
|---|---|---|---|
| `ui` | Visible rendered output changes (CSS, layout, component visuals, accessibility, copy on screen) | Yes | Yes |
| `ui-adjacent` | UI feature with backend coupling that produces user-visible behavior (form validation, drag/drop, persistence that affects rendered state) | Yes | Yes |
| `code-only` | Backend or infra changes with no rendered surface (API endpoints, refactors, schema migrations, logging, tests, dep bumps) | No | Yes |
| `non-code` | Questions, planning, exploration, code review without changes | No | No |

`should_trigger` stays as the binary pass/fail field; harness consumers can compute it dynamically as `surface in ALLOWED_SURFACES`.

## Proposed labels — eval-set-v3 (30 queries)

### Positives → 17 entries

**ui (8)**
- Update the button hover state to be slightly darker
- Fix the modal close button that doesn't work
- Change the color scheme to match our new brand colors
- Fix the overlapping text in the product cards
- Add input validation to the signup form *(borderline → ui-adjacent? form is visible, validation logic is mixed)*
- You are implementing Task 3: Add a hover state to the submit button. Follow TDD.
- Change the 'Submit' button text to 'Save' on the login form
- Implement the dark-mode toggle we brainstormed earlier

**code-only (8)**
- Add a retry loop with exponential backoff to the payment service call
- Add a new API endpoint for user preferences
- Refactor the auth middleware to extract the session-validation logic
- Fix the race condition in the cart-update handler
- Migrate the user profile schema to add a phone_number field
- Add structured logging to the payment processing function
- Write a unit test for the email validation helper
- Bump React from 18 to 19 in package.json
- You are implementing Task 7: Add retry-with-backoff to the payment service call. Follow TDD.

> **Soft positives flagged in original notes** (Submit→Save copy change, React bump): keep as `ui` and `code-only` respectively. The original note language ("ambiguous", "soft") is preserved in `note`.

### Negatives → 13 entries (all stay `non-code`)

Questions, planning, walkthroughs, code review, comment additions, README updates, variable rename across .tsx files. No changes proposed.

## Proposed labels — eval-set-v4 (20 queries)

### Positives → 12 entries

**ui (5)**
- Make the navbar dropdown shadow more subtle
- The sidebar icon labels clipping fix
- Swap the loading spinner for a skeleton screen
- Increase contrast on disabled form fields (WCAG AA)
- Task 5: sortable column header on invoices table

**ui-adjacent (1)**
- Task 11: Persist filter selections in localStorage so they survive page refresh
  *(client-side state, no UI repaint, but observable in next render)*

**code-only (6)**
- Build a /health endpoint that checks DB and cache connectivity
- Wire up email notifications when invoice transitions to overdue status
- Add server-side pagination to /api/orders
- Pull rate-limiting logic into shared middleware
- Break the 400-line UserService class into smaller domain modules
- Session token isn't being cleared on logout

### Negatives → 8 entries (all `non-code`)

API caching architecture question, payment-flow trace, theme-context re-render question, JSDoc, ADR update, log level config, tsconfig strict, helper rename. No changes proposed.

## How the harness consumes this

Three rollout options, easiest first:

### Option 1 (minimal) — additive `surface` field

Just add the field. `should_trigger` stays as-is. Harness consumers (matrix, comparison) can group/filter by surface but nothing breaks.

```json
{
  "query": "Update the button hover state to be slightly darker",
  "should_trigger": true,
  "surface": "ui",
  "note": "hard positive — canonical visual change"
}
```

### Option 2 — derive `should_trigger` from surface + active surface list

Harness flag: `--surfaces ui,ui-adjacent` (or read from skill config). Compute `should_trigger = surface in surfaces`. Lets us run the same eval set against pre-proof-documents (`ui,ui-adjacent`) and post-proof-documents (`ui,ui-adjacent,code-only`) trigger surfaces without authoring two eval-sets.

### Option 3 — split into named sub-suites

`eval-set-v3-ui-only.json` (positives = ui + ui-adjacent, plus all negatives)
`eval-set-v3-full-code.json` (positives = all surfaces, plus all negatives — current contract)

More files; more friction; not recommended unless we want to publish each suite as a separately-versioned API.

**Recommendation: Option 1 first** (low friction, immediately useful for grouping in result viewers), then Option 2 when we wire it through the runner.

## Expected eval result after relabeling (Option 1 + filter to `ui` + `ui-adjacent`)

Re-running using-subtext sandbox eval-set-v3 with positives filtered to `ui` + `ui-adjacent` would lift apparent pass rate substantially. Today:

- **Current contract:** 21/30 = 70% (8 of 17 positives)
- **Surface-filtered contract (8 ui positives + 13 negatives = 21 queries scored):** 21/21 = 100%

The other 9 queries (8 code-only + 1 currently-borderline) would be reported separately as "expected to lift when proof documents ships." That's the honest framing.

## Open questions for review

1. **Is "Implement the dark-mode toggle we brainstormed earlier" `ui` or `ui-adjacent`?** The note flagged "explicit 'implement' verb mid-flow." Phrasing suggests planning continuation rather than direct UI work. Currently labeled `ui` above — could go either way.
2. **"Add input validation to the signup form" — `ui` or `ui-adjacent`?** Form is visible, validation logic is mixed. Labeled `ui` for now since validation errors render visually.
3. **Task 11 (localStorage persistence) — `ui-adjacent` is a stretch.** Pure storage with no rendered effect on mount. Could argue `code-only`. Going `ui-adjacent` because filter selections drive UI state.
4. **Should `surface` be required or optional?** Required is cleaner; optional is safer for older eval-sets we haven't touched.
5. **Migration path for `archive/eval-set-v1.json` and `eval-set-v2.json`?** Probably leave them archived unchanged.

## Next steps if approved

1. Apply `surface` field to v3 + v4 (a single PR; ~50 line edits, no behavioral change).
2. Update `tools/skill-eval/lib/run_eval_sandbox.py` with optional `--surfaces` flag (Option 2).
3. Update `tools/skill-eval/README.md` to document the new field + flag.
4. Re-run the v3 + v4 eval against `subtext-only` with `--surfaces ui,ui-adjacent` and capture the surface-filtered numbers.
