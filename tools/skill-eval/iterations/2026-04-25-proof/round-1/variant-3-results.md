# Round 1 — Variant 3

**Description:** When another skill or task hands you a visual change, you MUST invoke this skill. It owns live browser state and verification so callers don't have to.
**Hypothesis:** This variant shifts the axis to *composition* — positioning the skill as a downstream receiver invoked by other skills, matching the "Triggers from" and "Composition" sections of the SKILL.md. Framing it as a service that absorbs browser and session management targets the case where a higher-level agent delegates UI work. Axis: inter-skill invocation and delegation.
**SKILL.md SHA at time of run:** 105e25048d2b9b059f20833ffb042d24543d44ed

## Results vs baseline (Δ from baselines.md)

| Cell | Baseline | Variant 3 | Δ |
|---|---|---|---|
| subtext-only / user-facing | 18/30 | 13/30 | -5 |
| subtext-only / subagent | 24/30 | 13/30 | -11 |
| subtext-plus-superpowers / user-facing | 14/30 | 13/30 | -1 |
| subtext-plus-superpowers / subagent | 13/30 | 13/30 | 0 |

## Hard-negative pass counts

| Cell | Pass / Total |
|---|---|
| subtext-only / user-facing | 13/13 |
| subtext-only / subagent | 13/13 |
| subtext-plus-superpowers / user-facing | 13/13 |
| subtext-plus-superpowers / subagent | 13/13 |

## Criteria check

- SP-cell delta ≥ +2 in at least one query style: ❌ (UF: -1, SA: 0)
- Subtext-only delta ≥ −1 in both query styles: ❌ (UF: -5, SA: -11)
- Hard-negative pass = 13/13 in all four cells: ✅

**Verdict:** DISQUALIFIED — SP-cell never gained ≥ +2 and subtext-only regressed severely in both query styles, especially subagent at -11.

## Result file paths

- User-facing matrix: skills/proof/evals/results/proof-matrix-user-facing-20260425T130133.json
- Subagent matrix: skills/proof/evals/results/proof-matrix-subagent-20260425T130623.json
