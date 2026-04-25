# Phase 4 Handoff — Round 1 Findings + Pivot to Diagnostic

**Date:** 2026-04-25
**Branch:** `chip/skill-eval-harness` (PR #31, draft)
**Latest commit:** `8d3b32c` — Round 1 variant scoring on eval-set-v3
**Pivot decision:** Option B — halt Round 2, run a diagnostic before any more description tuning.

This handoff is written so a fresh-context session can resume Phase 4 cleanly. Read this file, then `tools/skill-eval/iterations/2026-04-25-proof/round-1/winner.md` for the formal Round 1 close.

---

## Where we are

**Phases 0–3:** Complete, validated, pushed. Numbers in `tools/skill-eval/sandbox/README.md` (search for "Validation (Phase 3 clean re-baselines, 2026-04-25)"). Code-review punch list landed at `4698294`. PR #31 still draft.

**Phase 4 (description tuning of `subtext:proof`):** Plan at `docs/superpowers/plans/2026-04-25-proof-description-tuning.md`.

| Task | Status | Commit |
|---|---|---|
| 1. Author held-out eval-set-v4 | ✅ done | `362cbc8` |
| 2. Pre-tuning baselines on v3 + v4 | ✅ done | `9079ce2` |
| 3. Round 1 variant proposals | ✅ done | `5ff26ed` + `1a75d51` |
| 4. Round 1 scoring on v3 | ✅ done (spec review passed; code-quality review skipped pending pivot) | `8d3b32c` |
| 5. Round 2 | **HALTED** — see below | — |
| 6. Final v4 scoring | not started | — |
| 7. README writeup, version bump, push, Notion | not started | — |

---

## Phase 4 Round 1 results (one paragraph)

Three variants on distinct framing axes (outcome scope, invocation timing, inter-skill composition) were scored against eval-set-v3 baseline (UF subtext-only 18/30, UF SP 14/30, SA subtext-only 24/30, SA SP 13/30). **All three were disqualified.** Pattern: SP cell stayed flat at 13/30 SA, dropped 1 to 13/30 UF for every variant. Subtext-only SA cratered by -9 to -11 across all three. Hard negatives held 13/13 in all four cells for all three variants.

Per-variant detail: `tools/skill-eval/iterations/2026-04-25-proof/round-1/variant-{1,2,3}-results.md`. Winner.md says "(none — Round 2 required)".

---

## The two findings that triggered the pivot

These came out of the Phase 4 Task 4 spec review (independently re-derived from the matrix JSONs). They reframe what Phase 4 can plausibly accomplish.

### Finding 1: The SP cell is description-insensitive at this word count

**The exact same 13 query indices pass in the SP cell across all three variants — and all 13 are hard negatives.** Indices 15–24, 26, 27, 29 — queries like "Explain how React hooks work", "What's the difference between useState and useReducer?", "Plan the steps to migrate from REST to GraphQL". Zero positive queries reliably trigger in `subtext-plus-superpowers` under any of the three variants.

Re-reading the baselines through this lens:
- v3 SP baseline UF 14/30 = 13 hard-neg + **1 positive that triggered**
- v3 SP baseline SA 13/30 = 13 hard-neg + **0 positives**
- v3 SP variants UF 13/30 = 13 hard-neg + 0 positives (lost the 1 marginal baseline positive)
- v3 SP variants SA 13/30 = 13 hard-neg + 0 positives (no change)

**The "13/30 SP" floor is just the hard-neg pass count.** Description tuning cannot move it. Phase 4's headline goal ("lift the SP cell") is structurally misaligned with how the SP routing actually works — Superpowers' brainstorming/subagent skills appear to claim routing priority above `proof`'s frontmatter description, so no description text on `proof` budges the cell.

### Finding 2: The SA subtext-only "crater" (-9 to -11) is mixed in character

Of the ~10 queries that v1/v2/v3 lose vs baseline in SA subtext-only:

- **~5 are backend-only tasks the current description over-triggers on** (e.g., "Add a retry loop with exponential backoff to the payment service", "Add structured logging to the payment processing function", "You are implementing Task 7: Add retry-with-backoff…"). The current "implementing, fixing, or refactoring code" framing fires `proof` on these even though they have no UI surface. The new variants correctly *don't* trigger — that's a quality win disguised as a score regression.
- **~5-6 are clearly visual queries that should trigger but don't** under V1/V2/V3 (e.g., "Change the 'Submit' button text to 'Save' on the login form", "Implement the dark-mode toggle we brainstormed earlier", "Add a hover state to the submit button", "Change the color scheme to match our new brand colors"). These are baffling losses — V1's "affects what a user sees on screen" framing should fire on these with high confidence. The fact that they're consistent across all three variants suggests a config-level or measurement-level issue, not a per-variant flaw.

**This is the diagnostic target.** The unexpected losses on clearly-visual queries need to be understood before any more variant tuning.

---

## Pivot: Option B (chosen by user)

**Halt Round 2. Run a focused diagnostic.** Three things to check before deciding whether further description tuning is even tractable:

### Diagnostic 1: Is the description swap mechanism actually effective?

The harness passes `EVAL_DESCRIPTION` as a docker `-e` env var (`tools/skill-eval/lib/sandbox_runner.py:82`); the entrypoint stages it into the in-container SKILL.md before `claude -p` runs (see `subtext-sandbox/entrypoint.sh`, the `EVAL_QUERY` branch — uses `printf '%s'` to embed the description, switched from heredoc in Phase 2A Task 2 to handle special chars).

**Probe:** Manually run one docker invocation with a sentinel description value (e.g., `EVAL_DESCRIPTION="SENTINEL_DESC_ABC123"`), then `docker exec` into the container OR add a one-line debug print to entrypoint.sh that emits the first 200 chars of the staged SKILL.md to stderr before launching `claude -p`. Confirm the sentinel ends up in `/workspace/.../skills/proof/SKILL.md`.

If the swap is broken (or partial — e.g., escaping issue with `$` or backticks in some descriptions), all of Phase 4's measurements are suspect.

### Diagnostic 2: For the baffling visual losses, what does the model actually decide?

For one specific lost query (e.g., "Change the 'Submit' button text to 'Save' on the login form" with V1's description applied), capture the full stream-json output of a single `claude -p` run in the `subtext-only` config under subagent-style wrapping. Look for:
- The `system/init` event — confirms the right model loaded
- Which skills the model "saw" (skill listing in the init prompt)
- The first tool_use after the user message — did `proof` get invoked? Was something else invoked instead? Was *nothing* invoked (model just answered text-only)?

This tells us whether the model is rejecting `proof` (description gate failure) or never getting offered `proof` (skill discovery / loader issue).

### Diagnostic 3: Is SP's routing priority shadowing proof?

In `subtext-plus-superpowers`, the model has access to Superpowers' skill set. Look at the SP skill descriptions (the brainstorming, subagent-driven-development, and writing-plans skills are likely candidates) and check whether their frontmatter `description:` lines claim jurisdiction over the same query space `proof` should fire on.

If e.g. `superpowers:brainstorming` says "use this skill when starting any new feature work" and proof's variant says "use this skill when implementing", the loader may rank brainstorming first because its trigger phrase is broader. If so, **no description on `proof` will move the SP cell at the word counts we're constrained to** — the only fix would be at the SP-skill side (out of scope for this PR) or by adding explicit precedence/composition language (in-scope, but a different framing of the optimization).

### Outcome of the diagnostic determines next steps

- **Bug found in swap mechanism** → fix it, re-run Round 1 measurements, possibly retry Round 2 once numbers are trustworthy.
- **Visual losses are model-routing artifacts** → understand the pattern, then write proposer prompts that address it specifically (Round 2 with informed framing).
- **SP cell is genuinely description-insensitive** → write up the finding in the Phase 4 README section (Task 7), declare Phase 4's ceiling, optionally redefine "winner" criteria around SA subtext-only recovery instead of SP cell lift, run a tightened Round 2.
- **All three above** → some combination; let the data drive.

---

## Operational context the next session needs

**Working directory:** `/Users/chip/src/subtext/.worktrees/skill-eval-harness`

**Branch:** `chip/skill-eval-harness` — currently 1 commit ahead of `origin` after `8d3b32c`. Push state: `7a89bc3` and `ba2e41e` already pushed; `8d3b32c` not yet pushed (consider whether to push before compact).

Update: also unpushed are `4698294` (punch-list cleanup), `5ff26ed` + `1a75d51` (Round 1 proposals), `9079ce2` (baselines), `362cbc8` (eval-set-v4). These are all logical Phase 4 work-in-progress; pushing is fine — branch is a draft PR.

**ANTHROPIC_API_KEY:** Not in default Bash env. Source from `/Users/chip/src/subtext/bench/.env.local` before each matrix command. Pattern:
```bash
. /Users/chip/src/subtext/bench/.env.local && <matrix command>
```
Each Bash tool call is a fresh shell — repeat the source for every invocation.

**Sandbox images** (already built, cached):
- `subtext-sandbox-claude:latest` (config `subtext-only`)
- `subtext-sandbox-claude-superpowers:latest` (config `subtext-plus-superpowers`)

To rebuild without cache: `tools/skill-eval/sandbox/build.sh --config <name> --force-rebuild`. Default uses Docker layer cache (Phase 3 change).

**Eval set paths:**
- `skills/proof/evals/eval-set-v3.json` (training, 30 queries: 17 pos / 13 neg)
- `skills/proof/evals/eval-set-v4.json` (held-out, 20 queries: 12 pos / 8 neg) — **sealed; do not consult during diagnostic or any further tuning**
- `EVAL_SET_OVERRIDE=<path>` env var routes the matrix wrapper to a non-default eval set; propagates through to `bin/eval-sandboxed`.

**Tooling:**
- `tools/skill-eval/bin/eval-sandboxed proof --config <c> --query-style <s> --model claude-sonnet-4-6 --runs-per-query 3` — single config
- `tools/skill-eval/bin/eval-sandboxed-matrix proof --configs <c1,c2> --query-style <s> --model <m> --runs-per-query 3` — matrix
- `tools/skill-eval/sandbox/README.md` — phase validation log
- `tools/skill-eval/lib/sandbox_runner.py` — Popen + watchdog + early-exit on trigger
- `tools/skill-eval/lib/run_eval_sandbox.py` — ThreadPoolExecutor over (query, run) pairs
- `tools/skill-eval/lib/detect_trigger.py` — `TriggerDetector` class for stream-json
- `tools/skill-eval/tests/` — 44 tests, all passing

**Result file conventions:**
- `skills/proof/evals/results/proof-matrix-<query-style>-<ts>.{json,md}` — matrix consolidations
- `skills/proof/evals/results/proof-sandboxed-<config>-<query-style>-<ts>.json` — per-config raw runs
- Results dir is gitignored — use `git add -f` to commit specific result artifacts.

**Iteration logs (committed):**
- `tools/skill-eval/iterations/2026-04-25-proof/baselines.md` — pre-tuning baselines on v3 + v4
- `tools/skill-eval/iterations/2026-04-25-proof/round-1/proposals.md` — three Round 1 variants with hypotheses
- `tools/skill-eval/iterations/2026-04-25-proof/round-1/skill-input.md` — locked SKILL.md the proposer saw
- `tools/skill-eval/iterations/2026-04-25-proof/round-1/variant-{1,2,3}-results.md` — per-variant scoring
- `tools/skill-eval/iterations/2026-04-25-proof/round-1/winner.md` — formal "(none — Round 2)" result
- `tools/skill-eval/iterations/2026-04-25-proof/HANDOFF.md` — this file

---

## Things to NOT do in the next session

- **Do not run Round 2 blindly.** Round 2 will produce the same SP-cell flat-line result. Run the diagnostic first.
- **Do not consult eval-set-v4 during the diagnostic.** It's the sealed held-out set for the eventual Task 6 final score; reading it now risks overfit on any subsequent tuning.
- **Do not modify `skills/proof/SKILL.md`** until the diagnostic is complete. We need to understand why the variants behaved the way they did before locking any change.
- **Do not modify the harness** unless the swap-mechanism diagnostic finds a bug. Phase 3 froze the harness; further changes require their own validation pass.
- **Do not mark Task 4 code-quality review "skipped"** without surfacing it — if the diagnostic decides Phase 4 should continue, that review should still land.

---

## Open questions for the user (TODO before continuing)

1. **Strategic:** if the diagnostic confirms the SP cell is genuinely description-insensitive, do we (a) redefine the optimization target to SA subtext-only recovery + hard-neg precision, (b) write up the finding and stop Phase 4, or (c) escalate to a Superpowers-side conversation about routing priority?
2. **Tactical:** should we push the in-progress Phase 4 commits to the remote before compact, or hold them until Phase 4 reaches a natural stopping point?
3. **Scope:** the original Phase 4 plan included Task 7 (Notion update). If the diagnostic + writeup is the actual end of Phase 4, the Notion section will be a "Phase 4 finding, not a Phase 4 win" — do we still want to publish?

---

## Quick re-orientation script for the next session

```bash
# 1. Confirm working dir + branch state
cd /Users/chip/src/subtext/.worktrees/skill-eval-harness
git log --oneline -10
git status

# 2. Re-read this handoff
cat tools/skill-eval/iterations/2026-04-25-proof/HANDOFF.md

# 3. Re-read the Round 1 results in detail
cat tools/skill-eval/iterations/2026-04-25-proof/round-1/winner.md
cat tools/skill-eval/iterations/2026-04-25-proof/round-1/variant-1-results.md

# 4. Confirm sandbox images and API key access
docker images --format '{{.Repository}}:{{.Tag}}' | grep subtext-sandbox
. /Users/chip/src/subtext/bench/.env.local && echo "key set: ${ANTHROPIC_API_KEY:+yes}"
```
