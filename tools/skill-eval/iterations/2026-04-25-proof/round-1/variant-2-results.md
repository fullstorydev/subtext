# Round 1 — Variant 2

**Description:** Use this skill when implementing or fixing UI code. It owns browser-connected verification throughout the task and must not be deferred until the change is complete.
**Hypothesis:** This variant explicitly addresses mid-flow ownership — the phrase "must not be deferred" targets the failure mode where the model finishes editing and only then tries to verify. The SKILL.md's loop is designed to interleave editing and verification, so signaling that the skill runs *during* the task, not after, should improve routing fidelity. Axis: timing of invocation within a task.
**SKILL.md SHA at time of run:** 40fa72ba10e7f21f180d2c99d3c0a507965dbb43

## Results vs baseline (Δ from baselines.md)

| Cell | Baseline | Variant 2 | Δ |
|---|---|---|---|
| subtext-only / user-facing | 18/30 | 15/30 | -3 |
| subtext-only / subagent | 24/30 | 15/30 | -9 |
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
- Subtext-only delta ≥ −1 in both query styles: ❌ (UF: -3, SA: -9)
- Hard-negative pass = 13/13 in all four cells: ✅

**Verdict:** DISQUALIFIED — SP-cell never gained ≥ +2 and subtext-only regressed significantly in both query styles.

## Result file paths

- User-facing matrix: skills/proof/evals/results/proof-matrix-user-facing-20260425T125128.json
- Subagent matrix: skills/proof/evals/results/proof-matrix-subagent-20260425T125609.json
