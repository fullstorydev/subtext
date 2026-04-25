# Round 1 — Variant 1

**Description:** You MUST use this skill when making any code change that affects what a user sees on screen. Establishes a before/after visual evidence trail and drives browser verification.
**Hypothesis:** This variant anchors invocation on the *outcome condition* — "affects what a user sees" — rather than file type or task label. The SKILL.md itself uses this exact phrase as its core gate, so matching that language should align the loader's routing with the skill's own decision logic. Axis: broad scope + outcome framing.
**SKILL.md SHA at time of run:** ca9b8602f24a136adc3627bc087a7ae5d6690383

## Results vs baseline (Δ from baselines.md)

| Cell | Baseline | Variant 1 | Δ |
|---|---|---|---|
| subtext-only / user-facing | 18/30 | 14/30 | -4 |
| subtext-only / subagent | 24/30 | 14/30 | -10 |
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
- Subtext-only delta ≥ −1 in both query styles: ❌ (UF: -4, SA: -10)
- Hard-negative pass = 13/13 in all four cells: ✅

**Verdict:** DISQUALIFIED — SP-cell never gained ≥ +2 and subtext-only regressed heavily in both query styles.

## Result file paths

- User-facing matrix: skills/proof/evals/results/proof-matrix-user-facing-20260425T124103.json
- Subagent matrix: skills/proof/evals/results/proof-matrix-subagent-20260425T124559.json
