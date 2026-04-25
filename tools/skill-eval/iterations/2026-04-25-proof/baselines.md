# Pre-tuning Baselines

**SKILL.md commit:** 008b417c5f379a91bcc555604a9c1c0afdc9822c
**Description:** You MUST use this skill when implementing, fixing, or refactoring code. Captures evidence artifacts (screenshots, network traces, code diffs, trace session links) into a proof document as you work.
**Date:** 2026-04-25
**Model:** claude-sonnet-4-6
**Runs per query:** 3

## Eval-set-v3 (training)

| Config | User-facing | Subagent-style |
|---|---|---|
| subtext-only | 18/30 | 24/30 |
| subtext-plus-superpowers | 14/30 | 13/30 |

Hard-negative pass counts:
- User-facing: subtext-only 13/13, subtext-plus-superpowers 13/13
- Subagent-style: subtext-only 12/13, subtext-plus-superpowers 13/13

## Eval-set-v4 (held-out — sealed until Task 6)

| Config | User-facing | Subagent-style |
|---|---|---|
| subtext-only | 12/20 | 18/20 |
| subtext-plus-superpowers | 7/20 | 8/20 |

Hard-negative pass counts:
- User-facing: subtext-only 8/8, subtext-plus-superpowers 7/8
- Subagent-style: subtext-only 6/8, subtext-plus-superpowers 7/8

Result file paths:
- v3 user-facing: skills/proof/evals/results/proof-matrix-user-facing-20260425T120937.json
- v3 subagent: skills/proof/evals/results/proof-matrix-subagent-20260425T121452.json
- v4 user-facing: skills/proof/evals/results/proof-matrix-user-facing-20260425T121953.json
- v4 subagent: skills/proof/evals/results/proof-matrix-subagent-20260425T122303.json
