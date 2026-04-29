# `using-subtext` Trigger-Eval Results

**Date:** 2026-04-29
**Branch:** `chip/eval-using-subtext` (throwaway, merge of `chip/skill-eval-harness` + `chip/using-subtext-meta-skill`)
**Subject under test:** `using-subtext` SessionStart bootstrap (PR #35)
**Question:** Does loading `using-subtext` at session start lift `proof`'s trigger rate without over-firing?

## TL;DR

| Mode | Set | Baseline (pre–using-subtext) | With `using-subtext` | Δ |
|---|---|---|---|---|
| Sandbox · user-facing | v3 (training, 30q) | 13/30 (43%) — 0/17 pos, 13/13 neg | **21/30 (70%) — 8/17 pos, 13/13 neg** | **+8 / +27 pp** |
| Sandbox · user-facing | v4 (held-out, 20q) | _no prior sandbox baseline_ | **14/20 (70%) — 6/12 pos, 8/8 neg** | n/a |

- **+27 pp overall, +47 pp on positives** in canonical sandbox mode.
- **Zero regression on negatives** (13/13 in v3, 8/8 in v4 — no over-firing).
- Failures cluster on backend-only positives; UI/visual positives lift cleanly off the 0/3 floor.

## Configuration verified end-to-end

Direct one-off `docker run` confirmed the SessionStart hook fires inside the sandbox container:

```
{"type":"system","subtype":"hook_started","hook_name":"SessionStart:startup", ...}
{"type":"system","subtype":"hook_response","hook_name":"SessionStart:startup",
 "output":"{\"hookSpecificOutput\": {\"hookEventName\": \"SessionStart\",
 \"additionalContext\": \"<EXTREMELY_IMPORTANT>\\nYou have subtext.\\n\\n
 **Below is the full content of your 'subtext:using-subtext' skill ..."}
```

On the same query — "Update the button hover state to be slightly darker" — the model invoked `Skill({"skill":"subtext:proof"})` on line 19 of the stream-json output (~5 seconds in), versus the baseline matrix run's 0/3 trigger rate.

## Per-query pattern

### v3 (training, 30q)

**UI/visual positives lifted from 0 → 1.0 trigger rate:**
- "Update the button hover state to be slightly darker" — 3/3
- "Fix the modal close button that doesn't work" — 3/3
- "Change the color scheme to match our new brand colors" — 3/3
- "Fix the overlapping text in the product cards" — 3/3
- "Add input validation to the signup form" — 3/3
- "You are implementing Task 3: Add a hover state to the submit button. Follow TDD." — 3/3
- "You are implementing Task 7: Add retry-with-backoff to the payment service call." — 3/3
- "Change the 'Submit' button text to 'Save' on the login form" — 3/3

**Backend-only positives stayed at 0/3:**
- Add retry loop with exponential backoff to the payment service call (user-facing framing)
- Add new API endpoint for user preferences
- Refactor auth middleware
- Fix race condition in cart-update handler
- Migrate user profile schema
- Add structured logging to payment processing
- Write a unit test for the email validation helper
- Bump React from 18 to 19 in package.json
- "Implement the dark-mode toggle we brainstormed earlier" (UI but vague-implementation framing)

**Negatives all stayed at 0/3:** 13/13 ✓

### v4 (held-out, 20q)

**UI/visual positives 4/4 + 1 task-framed: 5/5 lifted to 1.0:**
- Make the navbar dropdown shadow more subtle
- Sidebar icon labels clipping fix
- Skeleton screen on dashboard cards
- WCAG AA contrast on disabled fields
- "Task 5: sortable column header on invoices table"

**Backend-only positives stayed at 0/3:** 6/6 (health endpoint, server-side pagination, rate-limiting refactor, UserService split, session token logout, email notifications)

**Negatives all stayed at 0/3:** 8/8 ✓

## What this means

`using-subtext`'s frontmatter description targets:
> "rendered UI, observed sessions, or producing reviewer-facing evidence (screenshots, viewer links, code diffs, command output)"

The agent reads this on every session via SessionStart and applies it correctly:
- Routes UI changes through `proof` (the discipline rule fires)
- Skips backend-only changes (no UI surface, no session, no reviewer-facing evidence yet)
- Skips negatives (questions, planning, exploration)

The 0/3 results on backend positives are not a regression — they are `using-subtext` doing exactly what its description says, and the eval-set v3/v4 contract being narrower than its authors expected. Two paths forward:

1. **Eval-set update:** revise eval-set-v3 / v4 to mark backend-only changes as `should_trigger: false`, matching `using-subtext`'s actual surface. This makes the eval contract honest.
2. **Trigger-surface widening:** when *proof documents* lands and broadens "reviewer-facing evidence" to include code diffs / command output, update `using-subtext`'s description and re-run. The backend positives should then lift.

Both should happen — (1) immediately so the eval contract reflects current behavior, (2) when proof documents ships.

## Framing artifact worth investigating

Same backend operation, different framing, opposite outcome:

| Query | Framing | Trigger rate |
|---|---|---|
| "Add a retry loop with exponential backoff to the payment service call" | user-facing | 0/3 |
| "You are implementing Task 7: Add retry-with-backoff to the payment service call." | subagent / Task-N | 3/3 |

The Task-N framing carries enough "you're a worker, follow discipline" weight that the agent invokes `proof` even on a non-UI backend task. This is a known signal in superpowers' subagent-style runs but not previously characterized for subtext. **A `--query-style subagent` matrix run (in progress) will measure the effect across the full eval set.**

## Methodology notes

- **Mode:** sandbox (`bin/eval-sandboxed`), `subtext-only` config. Real Vite + React app at `/workspace`; full plugin loaded via `--plugin-dir`.
- **Why not host-isolated:** in `--isolated` mode the harness stages only the skill under test (`proof`). `using-subtext` would not be present, so the test would not measure its lift.
- **Model:** `claude-sonnet-4-6` (Subtext canonical baseline).
- **Runs per query:** 3.
- **Workers:** 4 parallel.
- **Plugin source:** mounted host worktree at `/opt/subtext:ro` via `PLUGIN_SOURCE=local`. Brings in `hooks/`, `skills/using-subtext/`, `lib/skills-core.js`, and the `0.1.53` plugin version bumps.
- **Trigger detection:** harness's `TriggerDetector` parses stream-json for `Skill` tool invocation with the target skill name; early-exits the docker subprocess on first detection.

## Result files

Inside the worktree's `skills/proof/evals/results/`:
- `proof-sandboxed-subtext-only-user-facing-20260429T134117.json` — v3 with using-subtext (this run)
- `proof-sandboxed-subtext-only-user-facing-20260429T134123.json` — v4 with using-subtext (this run)
- `proof-matrix-user-facing-20260425T130133.{json,md}` — pre-using-subtext baseline matrix (subtext-only + subtext-plus-superpowers)

## Open follow-ups

1. **Subagent query-style matrix on v3** (in progress) — characterize the framing artifact across the full set.
2. **`subtext-plus-superpowers` config** (in progress) — check whether superpowers shadows or amplifies `using-subtext` routing.
3. **Eval-set hygiene pass** — relabel backend-only positives based on `using-subtext`'s actual trigger surface (or add a separate eval that measures the would-be-affected slice when proof documents lands).
4. **Cross-model robustness** — re-run on `claude-opus-4-7` to confirm the pattern is not Sonnet-specific.

## Cross-references

- PR #35 (using-subtext meta-skill): https://github.com/fullstorydev/subtext/pull/35
- PR #23 (skill consolidation): https://github.com/fullstorydev/subtext/pull/23
- Spec: `docs/specs/2026-04-27-using-subtext-design.md`
- Plan: `docs/plans/2026-04-27-using-subtext.md`
- Harness README: `tools/skill-eval/README.md`
- Pre-using-subtext baselines: `tools/skill-eval/iterations/2026-04-25-proof/`
