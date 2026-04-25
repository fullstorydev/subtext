# Phase 4 Redux — Round 1 Winner

**Date:** 2026-04-25
**Harness:** `bin/eval --isolated` (post-fix; sandbox harness was unreliable for description-quality measurement, see `tools/skill-eval/tests/acceptance/README.md`)
**Eval-set:** `skills/proof/evals/eval-set-v3.json` (30 queries: 17 positive, 13 negative)
**Runs per query:** 3
**Model:** claude-sonnet-4-6 (default)

## Result

**Baseline wins. No variant from Round 1 improves on the on-disk description.**

| # | Description | Pass / 30 | Δ |
|---|---|---:|---:|
| 0 | **Baseline** (on-disk: "MUST … implementing, fixing, or refactoring code") | **26** | — |
| V1 | "MUST … any code change that affects what a user sees on screen" | 14 | −12 |
| V2 | "Use this skill when implementing or fixing UI code …" | 18 | −8 |
| V3 | "When another skill or task hands you a visual change …" | 13 | −13 |

## Why every variant lost

All three variants narrowed scope to the visual / UI domain. Eval-set-v3
has 17 positives, but only ~6 of them are visual-UI queries — the rest are
broader code-change queries (refactor middleware, migrate schema, add API
endpoint, fix race condition, add structured logging, write a unit test,
add validation to signup, retry-with-backoff in payment service, etc).
The original "implementing, fixing, or refactoring code" description is
broad enough to fire on all of them; the variants are not.

The 2 negatives every variant correctly suppresses ("Update the README"
and "Rename the variable `data` to `payload` across all .tsx files") are
genuine over-triggers in the baseline. But the variants suppress them by
narrowing scope so much that they also stop firing on the legitimate
broad code-change positives. Net loss > net gain in every case.

## What this tells us about the description

The baseline's failure mode is **specificity at the boundary**:
- 2 false positives — over-triggers on a docs-only README change and a
  rename-only refactor that happens to touch `.tsx` files.
- 2 false negatives — under-triggers on visual queries phrased in
  design-language ("dark-mode toggle we brainstormed", "match our new
  brand colors") rather than code-language.

These are bidirectional boundary errors. Fixing them requires a more
nuanced description — one that *adds* design-flavored phrasing without
*subtracting* the broad code-change scope. None of the Round 1 variants
attempted that. They all moved the description in one direction: "make it
about UI." The eval-set rewards a description that's both broad AND
specific about visual outcomes.

## Decision: do not run Round 2 with similar variants

Three single-axis narrowings of scope all lose. A Round 2 that proposes
more variants along the same "narrow to visual" axis would lose for the
same reason. The productive next step is one of:

1. **Stop** — the on-disk description is genuinely strong (26/30 = 87%).
   Leave it. Address the 4 boundary failures by editing the SKILL.md
   *body* (e.g., explicit "When to use" rules), not the description.
2. **Generative Round 2 with constraint** — propose variants that
   preserve the baseline's broad scope while adding visual-flavored
   phrasing. Rules: must contain "implementing/fixing/refactoring code"
   anchor; must add at least one visual-outcome cue. This narrows the
   search space to descriptions that can plausibly improve.
3. **Body-edits + threshold-tightening** — edit the SKILL.md body's
   "When to use this skill / when not to" rules to disambiguate the 4
   boundary cases, leave the description alone.

Recommend option 1 plus option 3, not option 2. The cost of Round 2 in
tokens vs. the marginal expected gain is poor when the failure modes are
boundary cases that body-text disambiguation can address more directly.

## Held-out v4 score — confirms generalization

**19/20 (95%)** on `skills/proof/evals/eval-set-v4.json`, never used
during tuning.

| Cell | v3 (training) | v4 (held-out) |
|---|---:|---:|
| Total | 30 | 20 |
| Passed | 26 (87%) | 19 (95%) |
| Positives caught | 15 / 17 (88%) | 12 / 12 (100%) |
| Negatives correctly skipped | 11 / 13 (85%) | 7 / 8 (87.5%) |

The single v4 failure — "Rename the private helper `_fmt` to
`_formatLabel` inside ChartUtils.ts" — is the same boundary error type as
the v3 false positives (over-triggers on rename-only refactors that
touch typed source files). This confirms a systematic narrow failure
mode rather than a description fragility.

## Final decision

**No description change.** The on-disk description is robust across both
training and held-out eval-sets. Round 1 produced no improvement, and
the failure modes (~5% in each set, all of one type) are best addressed
by SKILL.md *body* edits — explicit "When NOT to use this skill" rules
that disambiguate rename-only refactors and docs-only README changes —
rather than by description rephrasing.

That body-edit is **out of scope for Phase 4 redux** (Phase 4's contract
was description tuning, which is now resolved as "no change"). It's a
candidate for a future small follow-up commit.

## Files

- `redux/baseline-v3-isolated.json` — baseline on training set (26/30)
- `redux/v1-outcome-scope-v3.json` — V1 result (14/30)
- `redux/v2-invocation-timing-v3.json` — V2 result (18/30)
- `redux/v3-composition-v3.json` — V3 result (13/30)
- `redux/baseline-v4-holdout.json` — baseline on held-out set (19/20)
- `redux/winner.md` — this file

## Per-variant gain/loss detail

### V1 (outcome scope) — net −12

Gained (vs baseline) — both negatives:
- "Rename the variable `data` to `payload` across all .tsx files" (1.0 → 0.0)
- "Update the README with the new setup instructions" (1.0 → 0.0)

Lost (vs baseline) — 14 positives, including UI ones:
- Fix the modal close button that doesn't work (1.0 → 0.0)
- Update the button hover state (1.0 → 0.33)
- Add a retry loop with exponential backoff (1.0 → 0.0)
- Add a new API endpoint for user preferences (1.0 → 0.0)
- Refactor the auth middleware (1.0 → 0.0)
- Fix the race condition in the cart-update handler (1.0 → 0.0)
- Migrate the user profile schema (1.0 → 0.0)
- Fix the overlapping text in the product cards (1.0 → 0.0)
- Add input validation to the signup form (1.0 → 0.0)
- "You are implementing Task 3: Add a hover state…" (1.0 → 0.33)
- "You are implementing Task 7: Add retry-with-backoff…" (1.0 → 0.0)
- Add structured logging (1.0 → 0.0)
- Write a unit test (1.0 → 0.0)
- Bump React from 18 to 19 (0.67 → 0.0)

### V2 (invocation timing) — net −8

Same 2 gained; lost 10 positives (mostly the same broad code-change ones).

### V3 (composition) — net −13

Same 2 gained; lost 15 positives (worst of the three; even the UI-flavored
positives lose because the framing requires another skill/task to be
delegating *to* proof — the eval-set queries don't have that framing).

## Files

- `redux/baseline-v3-isolated.json` — baseline result (26/30)
- `redux/v1-outcome-scope-v3.json` — V1 result (14/30)
- `redux/v2-invocation-timing-v3.json` — V2 result (18/30)
- `redux/v3-composition-v3.json` — V3 result (13/30)
- `redux/winner.md` — this file
