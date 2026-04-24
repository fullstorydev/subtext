# Archived proof eval-sets

Historical eval-sets that are no longer the default grading target. Kept
for comparison and for reproducing past results.

## eval-set-v1.json (~2026-04-20)

22 queries. First proof eval-set, written when proof was a visual-only
skill. Positives: canonical visual property changes. Negatives:
backend-only, docs, tests, refactors with no visual output.

Commit that introduced it: `4427f5f` (`feat(proof): add trigger-eval test set`).

## eval-set-v2.json (~2026-04-21)

26 queries. Added coverage for subjective ("feels cluttered"), a11y
("focus ring"), copy edits ("Submit → Save"), fullstack (server-side
feature flag for UI), and two mid-flow execution-stage prompts.

Scope was still proof-as-UI-skill. Many v2 positives would be reclassified
or become soft under v3's broader scope (any code change worth
evidence-cataloging).

Commit that introduced it: `155e31c` (`feat(proof-evals): add eval-set v2
with improved coverage`).

## Why they're archived

v3 widens proof's scope beyond UI. Several v1/v2 queries:

- Positives that are still positives under v3: visual/styling tweaks,
  component refactors, layout bugs.
- Positives that stay positive but with different rationale: bug fixes
  that touch UI code.
- Negatives that are now positives: "Add a new API endpoint" — this is
  still a code change with observable effects.
- Soft under v3: dep bumps, variable renames, doc-only edits.

Don't benchmark v3 results against v1/v2 directly — they measure
different things.

## Running an archived eval-set

```bash
EVAL_SET_OVERRIDE=skills/proof/evals/archive/eval-set-v1.json \
  ./tools/skill-eval/bin/eval proof --isolated
```
