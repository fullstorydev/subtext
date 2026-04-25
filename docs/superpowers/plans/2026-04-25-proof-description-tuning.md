# Proof Description Tuning Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tune the `subtext:proof` skill's frontmatter description to lift its routing hit rate inside Superpowers (the SP cell), without overfitting to eval-set-v3 trigger words and without regressing the hard negatives.

**Architecture:** A bounded train/test loop. Eval-set-v3 (30 queries) is the *training* set we iterate against. A new held-out eval-set-v4 (20 queries) is authored before any tuning begins and stays blind during iteration. Each round dispatches a fresh subagent with a *proposer* prompt that sees only the current `SKILL.md` body (never the eval queries) and emits ≤3 description variants with stated hypotheses. Each variant is swapped into the skill, scored on v3 with the existing sandbox matrix harness, and judged by quantitative criteria (SP-cell delta, no subtext-only regression, no hard-negative regression). After ≤2 rounds, the winning variant is locked in and scored once on v4 to produce the headline number. Findings land in `tools/skill-eval/sandbox/README.md`.

**Tech Stack:** Python 3 (existing harness), Docker (existing sandbox), Claude Sonnet 4.6 (canonical default), Agent tool (variant proposer dispatch). No new code — this plan is data + workflow + docs.

---

## Background

**Phase 3 baselines (Sonnet 4.6, n=3, eval-set-v3):**

| Config | User-facing | Subagent-style |
|---|---|---|
| `subtext-only` | 18/30 | 26/30 |
| `subtext-plus-superpowers` | 13/30 | 14/30 |

The headline finding from Phase 3: subagent-shape lifts `subtext-only` by +27pp but Superpowers eats those gains down to a single query of margin in the SP cell. **The headroom in this work is in the SP cell** — `subtext-only` subagent-style is already 26/30 and the remaining 4 misses may be irreducible noise. This plan optimizes the SP cell while protecting the others.

**Anti-overfit constraints (non-negotiable):**

1. **Proposer never sees eval queries.** The variant proposer subagent is given only the current `SKILL.md` body and instructions about MUST-style description format. It does not see eval-set-v3 or v4.
2. **No trigger-word stuffing.** Variants must change framing/scope/imperative posture, not vocabulary. Adding "screenshot/network trace/diff" laundry lists to the description is a disqualifier.
3. **Hard negatives are inviolable.** Any variant that flips a previously-passing hard negative (any of the 13 negatives in v3) is disqualified regardless of positive gains.
4. **Final scoring is on v4, not v3.** v3 is for iterating; v4 is the blind report number.

## Winner Criteria (quantitative)

A variant qualifies as the round winner if **all** hold against the current baseline on eval-set-v3 (Sonnet 4.6, n=3, both query styles, both configs):

- **SP-cell delta ≥ +2** in at least one query style (user-facing or subagent-style) on `subtext-plus-superpowers`.
- **Subtext-only delta ≥ −1** in both query styles (allow one-query slip from per-run noise; anything worse is a regression).
- **Hard-negative pass count = 13/13** in all four cells (no negative regression).

If multiple variants qualify, pick the one with the largest *combined* SP-cell delta across both query styles. Ties broken by the smallest absolute change to subtext-only (prefer the variant that moved the SP cell without disturbing the easy cell).

If **no variant qualifies in round 1**, run round 2 with a fresh proposer call. If no variant qualifies after round 2, accept the best partial improvement (largest SP-cell gain among non-disqualified variants) and document why criteria weren't met.

---

## File Structure

**Created:**
- `skills/proof/evals/eval-set-v4.json` — Held-out blind test set, 20 queries (12 positive, 8 negative). Same JSON schema as v3.
- `tools/skill-eval/iterations/2026-04-25-proof/round-1/proposals.md` — Round 1 proposer output (3 variants + hypotheses).
- `tools/skill-eval/iterations/2026-04-25-proof/round-1/variant-{1,2,3}-results.md` — Per-variant matrix run summaries.
- `tools/skill-eval/iterations/2026-04-25-proof/round-2/proposals.md` — Round 2 proposer output (only if needed).
- `tools/skill-eval/iterations/2026-04-25-proof/round-2/variant-{1,2,3}-results.md` — Round 2 results (only if needed).
- `tools/skill-eval/iterations/2026-04-25-proof/final/v4-results.md` — Held-out v4 score for the winning description.

**Modified:**
- `skills/proof/SKILL.md` — Frontmatter `description:` field only. Body untouched.
- `tools/skill-eval/sandbox/README.md` — Append "Phase 4: Description Tuning (2026-04-25)" section with before/after numbers, winning description text, hypothesis, and v4 score.
- `.claude-plugin/marketplace.json`, `.cursor-plugin/plugin.json`, `.codex-plugin/plugin.json`, `.mcp.json` — Plugin version bump (per repo convention).

**Untouched:**
- `skills/proof/evals/eval-set-v3.json` — Frozen training set; do not edit during this plan.
- `skills/proof/SKILL.md` body (everything below the closing `---` of frontmatter).
- `tools/skill-eval/lib/`, `tools/skill-eval/bin/` — Harness is feature-complete for this work.

---

### Task 1: Author held-out eval-set-v4

**Goal:** Produce a blind 20-query test set authored *before* tuning begins. Same recipe as v3, different surface forms.

**Files:**
- Create: `skills/proof/evals/eval-set-v4.json`

**Authoring rules:**
- 12 positive queries (`should_trigger: true`), 8 negative queries (`should_trigger: false`).
- Match the v3 category mix: positives include UI changes, backend impl, refactors, bug fixes, schema changes; negatives include questions, doc edits, config tweaks, exploration.
- **Use different surface forms than v3.** If v3 says "Update the button hover state to be slightly darker", v4 should say something like "Make the navbar dropdown shadow more subtle" — same intent class, different verbs/nouns.
- Each query must have a `note` field explaining its category and why it's in the set, just like v3.
- Include 2 "subagent-style dispatch wrapper" positives (mirroring the v3 entry "You are implementing Task 3: …. Follow TDD."), since Phase 2C established this is a high-signal axis.

- [ ] **Step 1: Read v3 in full to understand the recipe**

```bash
cat skills/proof/evals/eval-set-v3.json
```

Note the category mix and the `note` field conventions.

- [ ] **Step 2: Author the 20 v4 queries**

Write `skills/proof/evals/eval-set-v4.json` as a JSON array. Schema:

```json
[
  {
    "query": "<the user message that the harness will send>",
    "should_trigger": true,
    "note": "<category — short explanation>"
  }
]
```

Required category coverage:
- 4 UI/visual change positives ("change the X color", "fix overlapping Y", "make Z bigger on mobile")
- 3 backend implementation positives ("add endpoint", "implement retry", "add validation")
- 2 refactor/restructure positives
- 1 bug-fix positive
- 2 subagent-style wrapper positives (e.g., `"You are implementing Task N: <something concrete>. Follow TDD."`)
- 3 question/exploration negatives ("what does X do?", "how should we structure Y?")
- 2 doc/comment-only negatives
- 2 config/non-code-touching negatives
- 1 trivially small change that arguably shouldn't trigger ("rename this private variable")

- [ ] **Step 3: Validate JSON parses and counts are right**

Run:

```bash
python3 -c "
import json
d = json.load(open('skills/proof/evals/eval-set-v4.json'))
pos = sum(1 for q in d if q['should_trigger'])
neg = sum(1 for q in d if not q['should_trigger'])
print(f'total={len(d)} pos={pos} neg={neg}')
assert len(d) == 20 and pos == 12 and neg == 8, 'count mismatch'
print('OK')
"
```

Expected output: `total=20 pos=12 neg=8\nOK`

- [ ] **Step 4: Sanity-check no surface-form overlap with v3**

Run:

```bash
python3 -c "
import json
v3 = {q['query'].lower() for q in json.load(open('skills/proof/evals/eval-set-v3.json'))}
v4 = [q['query'] for q in json.load(open('skills/proof/evals/eval-set-v4.json'))]
overlap = [q for q in v4 if q.lower() in v3]
print(f'overlap={len(overlap)}')
for q in overlap: print(' -', q)
assert not overlap, 'v4 reuses v3 queries verbatim'
print('OK')
"
```

Expected: `overlap=0\nOK`

- [ ] **Step 5: Commit**

```bash
git add skills/proof/evals/eval-set-v4.json
git commit -m "feat(proof): add held-out eval-set-v4 for description tuning"
```

---

### Task 2: Confirm pre-tuning baselines on v3 and v4

**Goal:** Capture exact "before" numbers on both v3 (training) and v4 (held-out) under the *current* `skills/proof/SKILL.md` description. v4 baseline is recorded once now and never re-run during tuning.

**Files:**
- No source changes. Output recorded in plan output and committed result JSON files.

- [ ] **Step 1: Confirm current proof description hash**

Run:

```bash
git log -1 --format='%H %s' skills/proof/SKILL.md
sed -n '1,8p' skills/proof/SKILL.md
```

Note the commit SHA and the current `description:` line for the README writeup later.

- [ ] **Step 2: Run baseline matrix on v3 (user-facing)**

Run from the repo root:

```bash
EVAL_SET_OVERRIDE=skills/proof/evals/eval-set-v3.json \
  tools/skill-eval/bin/eval-sandboxed-matrix proof \
    --configs subtext-only,subtext-plus-superpowers \
    --query-style user-facing \
    --model claude-sonnet-4-6 \
    --runs-per-query 3
```

Note: the matrix wrapper takes the skill name as a positional (`proof`, the directory under `skills/`). `EVAL_SET_OVERRIDE` is read by `bin/eval-sandboxed` and the env var propagates from the matrix wrapper to it.

Expected: ~4 min wallclock. Output a `proof-matrix-user-facing-<ts>.{json,md}` pair in `skills/proof/evals/results/`. Record the per-config pass counts.

- [ ] **Step 3: Run baseline matrix on v3 (subagent-style)**

```bash
EVAL_SET_OVERRIDE=skills/proof/evals/eval-set-v3.json \
  tools/skill-eval/bin/eval-sandboxed-matrix proof \
    --configs subtext-only,subtext-plus-superpowers \
    --query-style subagent \
    --model claude-sonnet-4-6 \
    --runs-per-query 3
```

Expected pass counts (Phase 3 reference): subtext-only 26/30, subtext-plus-superpowers 14/30. If counts differ by more than 2, something has changed in the harness or skill — pause and investigate before tuning.

- [ ] **Step 4: Run baseline matrix on v4 (both query styles)**

```bash
EVAL_SET_OVERRIDE=skills/proof/evals/eval-set-v4.json \
  tools/skill-eval/bin/eval-sandboxed-matrix proof \
    --configs subtext-only,subtext-plus-superpowers \
    --query-style user-facing \
    --model claude-sonnet-4-6 \
    --runs-per-query 3

EVAL_SET_OVERRIDE=skills/proof/evals/eval-set-v4.json \
  tools/skill-eval/bin/eval-sandboxed-matrix proof \
    --configs subtext-only,subtext-plus-superpowers \
    --query-style subagent \
    --model claude-sonnet-4-6 \
    --runs-per-query 3
```

Record both v4 baseline pass counts. **These v4 numbers go into the iteration log now and are not consulted again until Task 6.**

- [ ] **Step 5: Record baselines in iteration log**

Create `tools/skill-eval/iterations/2026-04-25-proof/baselines.md`:

```markdown
# Pre-tuning Baselines

**SKILL.md commit:** <sha from Step 1>
**Description:** <copy current description: line>
**Date:** 2026-04-25
**Model:** claude-sonnet-4-6
**Runs per query:** 3

## Eval-set-v3 (training)

| Config | User-facing | Subagent-style |
|---|---|---|
| subtext-only | <X>/30 | <X>/30 |
| subtext-plus-superpowers | <X>/30 | <X>/30 |

Hard-negative pass counts: <X>/13 (user-facing), <X>/13 (subagent-style) per config.

## Eval-set-v4 (held-out — sealed until Task 6)

| Config | User-facing | Subagent-style |
|---|---|---|
| subtext-only | <X>/20 | <X>/20 |
| subtext-plus-superpowers | <X>/20 | <X>/20 |

Hard-negative pass counts: <X>/8 (user-facing), <X>/8 (subagent-style) per config.

Result file paths:
- v3 user-facing: <path>
- v3 subagent: <path>
- v4 user-facing: <path>
- v4 subagent: <path>
```

Compute the hard-negative pass count from the result JSON's `queries[]` array (filter `should_trigger == false` and count `pass == true`).

- [ ] **Step 6: Commit baselines**

```bash
git add tools/skill-eval/iterations/2026-04-25-proof/baselines.md \
        skills/proof/evals/results/proof-matrix-*-2026*.{json,md}
git commit -m "test(proof): record pre-tuning baselines on eval-set-v3 and held-out v4"
```

---

### Task 3: Generate Round 1 variant proposals

**Goal:** Dispatch a fresh subagent with a *proposer* prompt that sees only the current `SKILL.md` body and the description-format constraints. Output: 3 candidate descriptions with stated hypotheses.

**Files:**
- Create: `tools/skill-eval/iterations/2026-04-25-proof/round-1/proposals.md`

- [ ] **Step 1: Capture current SKILL.md body**

Run:

```bash
cp skills/proof/SKILL.md tools/skill-eval/iterations/2026-04-25-proof/round-1/skill-input.md
```

This locks the input the proposer will see.

- [ ] **Step 2: Dispatch the proposer subagent**

Use the Agent tool (`subagent_type: general-purpose`, model `sonnet`) with this exact prompt. **Do not provide eval-set-v3, eval-set-v4, or the baseline numbers.** The proposer must work from the SKILL.md body alone.

```
You are proposing variants of a Claude Code skill's frontmatter `description:` field.

## What you are given

The full SKILL.md of `subtext:proof` is below. Read its body to understand what the skill actually does, when it should be invoked, and what gates it enforces. Then propose three alternative `description:` lines that would each route Claude to invoke this skill at the right times — and only at the right times.

<SKILL.md>
{contents of tools/skill-eval/iterations/2026-04-25-proof/round-1/skill-input.md}
</SKILL.md>

## Constraints (non-negotiable)

1. Output exactly 3 variants. Each variant is a single `description:` line value (no surrounding YAML, no quotes, just the text).
2. Each variant uses MUST-style imperative framing: tell the loader *when* the skill applies, in plain English. Examples of the form: "Use this skill when…", "You MUST use this skill when…".
3. Do NOT enumerate trigger artifacts as a list. Phrases like "screenshots, network traces, code diffs" are vocabulary stuffing and disqualified. Describe the *condition for invocation* and the *purpose*, not the deliverable list.
4. Each variant must be ≤ 30 words. Concision matters — Claude's loader weighs each clause.
5. Each variant should change the framing in a meaningfully different direction from the others. Examples of axes: scope of "code change" (broad vs narrow), explicit ownership of mid-flow invocation (when handed a task by another skill), strength of the imperative ("MUST" vs "Use when"), focus on visible outcome vs internal correctness.
6. Do NOT reference any specific user query, eval set, or test scenario. You have not been shown any.

## Output format

For each variant, write:

### Variant N

**Description:** <the single description line, ≤30 words>

**Hypothesis:** <2–3 sentences explaining what framing change you're testing and why you think it would route better. Name the axis you're moving along.>

**Risk:** <1 sentence on what this variant might over-trigger or under-trigger on, given the SKILL.md body.>

That's it. No preamble, no closing summary. Three variants, each in the format above.
```

Save the subagent's reply verbatim to `tools/skill-eval/iterations/2026-04-25-proof/round-1/proposals.md`.

- [ ] **Step 3: Sanity-check the proposals**

Eyeball the file. Reject and re-dispatch if any variant:
- Is over 30 words.
- Lists trigger artifacts ("screenshots, traces, diffs, …").
- Quotes specific user phrases that smell like eval-set queries.
- Is structurally identical to the current description (no axis moved).

If you re-dispatch, save the original to `proposals-rejected.md` first and add a one-line `rejection-reason.md` next to it.

- [ ] **Step 4: Commit**

```bash
git add tools/skill-eval/iterations/2026-04-25-proof/round-1/
git commit -m "test(proof): record Round 1 description variant proposals"
```

---

### Task 4: Score Round 1 variants on v3

**Goal:** For each of the 3 variants, swap into `skills/proof/SKILL.md`, run the matrix on v3 (both query styles, both configs, n=3, Sonnet 4.6), revert. Pick the round winner per the quantitative criteria.

**Files:**
- Modify (temporarily, then revert): `skills/proof/SKILL.md` (frontmatter only)
- Create: `tools/skill-eval/iterations/2026-04-25-proof/round-1/variant-{1,2,3}-results.md`
- Create: `tools/skill-eval/iterations/2026-04-25-proof/round-1/winner.md`

For each variant N (1, 2, 3), repeat steps 1–6 below:

- [ ] **Step 1: Apply variant N to SKILL.md frontmatter**

Use the Edit tool to replace the current `description:` line with variant N's text. Touch nothing else in the file.

- [ ] **Step 2: Verify the swap landed cleanly**

Run:

```bash
sed -n '1,5p' skills/proof/SKILL.md
```

Expected: the new description line is present, no other frontmatter fields changed, no body changes.

- [ ] **Step 3: Run v3 user-facing matrix**

```bash
EVAL_SET_OVERRIDE=skills/proof/evals/eval-set-v3.json \
  tools/skill-eval/bin/eval-sandboxed-matrix proof \
    --configs subtext-only,subtext-plus-superpowers \
    --query-style user-facing \
    --model claude-sonnet-4-6 \
    --runs-per-query 3
```

Note the resulting matrix JSON path.

- [ ] **Step 4: Run v3 subagent-style matrix**

```bash
EVAL_SET_OVERRIDE=skills/proof/evals/eval-set-v3.json \
  tools/skill-eval/bin/eval-sandboxed-matrix proof \
    --configs subtext-only,subtext-plus-superpowers \
    --query-style subagent \
    --model claude-sonnet-4-6 \
    --runs-per-query 3
```

- [ ] **Step 5: Compute hard-negative pass counts and write results file**

Run, replacing `<UF_JSON>` and `<SA_JSON>` with the matrix JSON paths from Steps 3 and 4:

```bash
python3 - <<'PY'
import json, sys
def hardneg(path, cfg):
    d = json.load(open(path))
    cell = next(c for c in d['configs'] if c['config'] == cfg)
    qs = cell['result']['queries']
    return sum(1 for q in qs if not q['should_trigger'] and q['pass']), sum(1 for q in qs if not q['should_trigger'])
for path in ['<UF_JSON>', '<SA_JSON>']:
    for cfg in ['subtext-only', 'subtext-plus-superpowers']:
        passed, total = hardneg(path, cfg)
        print(f'{path} {cfg}: hard-neg {passed}/{total}')
PY
```

Then create `tools/skill-eval/iterations/2026-04-25-proof/round-1/variant-N-results.md`:

```markdown
# Round 1 — Variant N

**Description:** <variant N text>
**Hypothesis:** <variant N hypothesis from proposals.md>
**SKILL.md SHA at time of run:** <git hash-object skills/proof/SKILL.md>

## Results vs baseline (Δ from baselines.md)

| Cell | Baseline | Variant N | Δ |
|---|---|---|---|
| subtext-only / user-facing | <X>/30 | <Y>/30 | <±N> |
| subtext-only / subagent | <X>/30 | <Y>/30 | <±N> |
| subtext-plus-superpowers / user-facing | <X>/30 | <Y>/30 | <±N> |
| subtext-plus-superpowers / subagent | <X>/30 | <Y>/30 | <±N> |

## Hard-negative pass counts

| Cell | Pass / Total |
|---|---|
| subtext-only / user-facing | <X>/13 |
| subtext-only / subagent | <X>/13 |
| subtext-plus-superpowers / user-facing | <X>/13 |
| subtext-plus-superpowers / subagent | <X>/13 |

## Criteria check

- SP-cell delta ≥ +2 in at least one query style: ✅/❌
- Subtext-only delta ≥ −1 in both query styles: ✅/❌
- Hard-negative pass = 13/13 in all four cells: ✅/❌

**Verdict:** QUALIFIED / DISQUALIFIED — <one-sentence reason>

## Result file paths

- User-facing matrix: <UF_JSON path>
- Subagent matrix: <SA_JSON path>
```

- [ ] **Step 6: Revert SKILL.md**

```bash
git checkout skills/proof/SKILL.md
sed -n '1,5p' skills/proof/SKILL.md
```

Expected: the original description is back. Now repeat Steps 1–6 for the next variant.

- [ ] **Step 7: Pick the round winner**

After all 3 variants are scored, write `tools/skill-eval/iterations/2026-04-25-proof/round-1/winner.md`:

```markdown
# Round 1 Winner

## Qualified variants

<list each qualified variant with its combined SP-cell delta>

## Selection

**Winner:** Variant <N>
**Combined SP-cell delta:** <sum of UF + SA deltas on subtext-plus-superpowers>
**Reason chosen:** <one sentence>

## Decision

- [ ] At least one variant qualified → proceed to **Task 6** (final v4 scoring on the winner).
- [ ] No variant qualified → proceed to **Task 5** (Round 2).
```

Check the appropriate decision box.

- [ ] **Step 8: Commit Round 1**

```bash
git add tools/skill-eval/iterations/2026-04-25-proof/round-1/ \
        skills/proof/evals/results/proof-matrix-*-2026*.{json,md}
git commit -m "test(proof): score Round 1 description variants on eval-set-v3"
```

---

### Task 5: Round 2 (only if Round 1 produced no qualified variant)

**Goal:** Re-dispatch the proposer with light feedback from Round 1 results, score 3 more variants. Same structure as Round 1.

**Skip this task if Round 1 produced a qualified winner.**

> **Controller note (subagent-driven execution):** Task 5's scoring step (Step 3 below) reuses Task 4's per-variant loop verbatim. When dispatching a subagent for Task 5, include the full text of Task 4 Steps 1–6 alongside Task 5's text, since the subagent cannot read sibling tasks.

**Files:**
- Create: `tools/skill-eval/iterations/2026-04-25-proof/round-2/proposals.md`
- Create: `tools/skill-eval/iterations/2026-04-25-proof/round-2/variant-{1,2,3}-results.md`
- Create: `tools/skill-eval/iterations/2026-04-25-proof/round-2/winner.md`

- [ ] **Step 1: Build Round 2 feedback summary**

Create `tools/skill-eval/iterations/2026-04-25-proof/round-2/round-1-summary.md` with high-level deltas per variant — *no* per-query breakdowns:

```markdown
# Round 1 Summary (input to Round 2 proposer)

Three variants were tried. None qualified.

## Variant 1
- Framing: <axis moved from proposals.md>
- SP-cell combined delta: <±N>
- Disqualifier: <which criterion failed>

## Variant 2
- Framing: <…>
- SP-cell combined delta: <…>
- Disqualifier: <…>

## Variant 3
- Framing: <…>
- SP-cell combined delta: <…>
- Disqualifier: <…>
```

- [ ] **Step 2: Dispatch Round 2 proposer**

Same proposer prompt as Round 1 (Task 3 Step 2), but append this section before the `## Output format` section:

```
## Prior round feedback

Three variants were tried in Round 1. None qualified. Summary of what failed:

<contents of tools/skill-eval/iterations/2026-04-25-proof/round-2/round-1-summary.md>

For Round 2, propose variants that move along axes NOT explored in Round 1. Do not repeat any framing direction that already failed.
```

Save reply to `tools/skill-eval/iterations/2026-04-25-proof/round-2/proposals.md`.

- [ ] **Step 3: Score Round 2 variants**

Repeat Task 4 Steps 1–6 for each of the 3 Round 2 variants. Save results to `tools/skill-eval/iterations/2026-04-25-proof/round-2/variant-{1,2,3}-results.md`.

- [ ] **Step 4: Pick Round 2 winner**

Write `tools/skill-eval/iterations/2026-04-25-proof/round-2/winner.md` using the same structure as Round 1's `winner.md`. If still no qualified variant, the winner is the highest combined SP-cell delta among non-disqualified variants. Document the criteria miss explicitly.

- [ ] **Step 5: Commit Round 2**

```bash
git add tools/skill-eval/iterations/2026-04-25-proof/round-2/ \
        skills/proof/evals/results/proof-matrix-*-2026*.{json,md}
git commit -m "test(proof): score Round 2 description variants on eval-set-v3"
```

---

### Task 6: Final scoring on held-out eval-set-v4 + lock winner

**Goal:** Apply the winning description from Round 1 (or Round 2 if reached). Score once on v4. Compare v4 result to v4 baseline. Commit the locked SKILL.md change.

**Files:**
- Modify: `skills/proof/SKILL.md` (description line — final, not reverted)
- Create: `tools/skill-eval/iterations/2026-04-25-proof/final/v4-results.md`

- [ ] **Step 1: Apply the winning description to SKILL.md**

Use the Edit tool to set `description:` to the winning variant's text. This is the keep-it change.

- [ ] **Step 2: Verify the swap and run v4 user-facing matrix**

```bash
sed -n '1,5p' skills/proof/SKILL.md

EVAL_SET_OVERRIDE=skills/proof/evals/eval-set-v4.json \
  tools/skill-eval/bin/eval-sandboxed-matrix proof \
    --configs subtext-only,subtext-plus-superpowers \
    --query-style user-facing \
    --model claude-sonnet-4-6 \
    --runs-per-query 3
```

- [ ] **Step 3: Run v4 subagent-style matrix**

```bash
EVAL_SET_OVERRIDE=skills/proof/evals/eval-set-v4.json \
  tools/skill-eval/bin/eval-sandboxed-matrix proof \
    --configs subtext-only,subtext-plus-superpowers \
    --query-style subagent \
    --model claude-sonnet-4-6 \
    --runs-per-query 3
```

- [ ] **Step 4: Compute v4 hard-negative pass counts**

Same Python snippet as Task 4 Step 5, but pointed at the new v4 result JSONs and totaling out of 8 (v4 has 8 negatives).

- [ ] **Step 5: Write final v4 results file**

Create `tools/skill-eval/iterations/2026-04-25-proof/final/v4-results.md`:

```markdown
# Final v4 Score (Held-out)

**Winning description:** <the variant text>
**Source:** Round <1 or 2>, Variant <N>
**Hypothesis:** <variant hypothesis>
**Date:** 2026-04-25
**Model:** claude-sonnet-4-6
**Runs per query:** 3

## v4 results vs v4 baseline

| Cell | v4 Baseline | v4 Final | Δ |
|---|---|---|---|
| subtext-only / user-facing | <X>/20 | <Y>/20 | <±N> |
| subtext-only / subagent | <X>/20 | <Y>/20 | <±N> |
| subtext-plus-superpowers / user-facing | <X>/20 | <Y>/20 | <±N> |
| subtext-plus-superpowers / subagent | <X>/20 | <Y>/20 | <±N> |

## Hard-negative pass counts on v4

| Cell | Pass / Total |
|---|---|
| subtext-only / user-facing | <X>/8 |
| subtext-only / subagent | <X>/8 |
| subtext-plus-superpowers / user-facing | <X>/8 |
| subtext-plus-superpowers / subagent | <X>/8 |

## Result file paths

- User-facing matrix: <UF_JSON path>
- Subagent matrix: <SA_JSON path>

## Sanity check

Compare v4 SP-cell delta to v3 SP-cell delta. If v4 ≪ v3 (e.g., v3 +5 but v4 +1), suspect overfit and document.
```

- [ ] **Step 6: Commit the description change and v4 results**

```bash
git add skills/proof/SKILL.md \
        tools/skill-eval/iterations/2026-04-25-proof/final/ \
        skills/proof/evals/results/proof-matrix-*-2026*.{json,md}
git commit -m "feat(proof): tune frontmatter description (Phase 4 winner)"
```

The commit message body should include the v4 SP-cell delta as the headline number.

---

### Task 7: Update sandbox README, bump plugin version, push

**Goal:** Document Phase 4 in `tools/skill-eval/sandbox/README.md`. Bump plugin manifests. Push branch.

**Files:**
- Modify: `tools/skill-eval/sandbox/README.md`
- Modify: `.claude-plugin/marketplace.json`, `.cursor-plugin/plugin.json`, `.codex-plugin/plugin.json`, `.mcp.json`

- [ ] **Step 1: Append Phase 4 section to sandbox README**

Use the Edit tool to add this section after the existing "Validation (Phase 3 clean re-baselines, 2026-04-25)" section in `tools/skill-eval/sandbox/README.md`:

```markdown
## Phase 4: Description Tuning (2026-04-25)

Tuned `subtext:proof`'s frontmatter description against eval-set-v3, then scored once on a held-out eval-set-v4 (20 queries, 12 positive / 8 negative, authored before tuning began).

### Method

- **Train set:** eval-set-v3 (30 queries, frozen).
- **Held-out test set:** eval-set-v4 (20 queries, blind during iteration).
- **Proposer:** Fresh subagent given only `SKILL.md` body. No eval queries shown. Constraint: MUST-style framing, no trigger-word stuffing.
- **Winner criteria:** SP-cell delta ≥ +2 in some query style; subtext-only delta ≥ −1 in both query styles; 13/13 hard negatives in all four cells.
- **Rounds:** <1 / 2>.

### Before / after on eval-set-v3

| Cell | Before | After | Δ |
|---|---|---|---|
| subtext-only / user-facing | <X>/30 | <Y>/30 | <±N> |
| subtext-only / subagent | <X>/30 | <Y>/30 | <±N> |
| subtext-plus-superpowers / user-facing | <X>/30 | <Y>/30 | <±N> |
| subtext-plus-superpowers / subagent | <X>/30 | <Y>/30 | <±N> |

### Held-out v4 (the headline number)

| Cell | Baseline (old desc) | Final (new desc) | Δ |
|---|---|---|---|
| subtext-only / user-facing | <X>/20 | <Y>/20 | <±N> |
| subtext-only / subagent | <X>/20 | <Y>/20 | <±N> |
| subtext-plus-superpowers / user-facing | <X>/20 | <Y>/20 | <±N> |
| subtext-plus-superpowers / subagent | <X>/20 | <Y>/20 | <±N> |

### Winning description

```
<paste the new description: line>
```

**Hypothesis (kept):** <one-paragraph version of the variant hypothesis>

### What we learned

- <2–3 bullets on which framing axes moved the SP cell, which didn't, and any v3-vs-v4 deltas that suggest overfit.>

### What we did NOT change

- Body of `skills/proof/SKILL.md` (untouched).
- Eval-set-v3 (frozen — used only as training).
- Harness code (Phase 3 was the last harness change).
```

Replace `<X>`, `<Y>`, `<±N>`, the description, hypothesis, and "What we learned" bullets with the actual numbers and content from `final/v4-results.md` and the round winner files.

- [ ] **Step 2: Bump plugin manifest versions**

Read each manifest, increment the patch version (e.g., 0.7.4 → 0.7.5), and update all four to the same number:

```bash
for f in .claude-plugin/marketplace.json .cursor-plugin/plugin.json .codex-plugin/plugin.json .mcp.json; do
  echo "=== $f ==="
  grep -E '"version"' "$f"
done
```

Use the Edit tool on each file to bump the version. Verify they all match after editing.

- [ ] **Step 3: Run the harness test suite once to confirm no regressions**

```bash
cd tools/skill-eval && python3 -m pytest tests/ -v
```

Expected: all tests pass (44/44 from Phase 3, possibly more if any test additions sneaked in).

- [ ] **Step 4: Commit and push**

```bash
git add tools/skill-eval/sandbox/README.md \
        .claude-plugin/marketplace.json \
        .cursor-plugin/plugin.json \
        .codex-plugin/plugin.json \
        .mcp.json
git commit -m "docs(skill-eval): record Phase 4 description tuning results"

git push origin chip/skill-eval-harness
```

- [ ] **Step 5: Update Notion**

Add a "Phase 4 Update (2026-04-25)" section to the existing Notion page (subpage of the Skill Enhancements page) with:
- Headline: v4 SP-cell delta number
- Method paragraph (1–2 sentences on the train/test split + anti-overfit constraints)
- Before/after table (v4 only)
- Winning description (verbatim)
- Hypothesis (one sentence)
- What we learned (2–3 bullets)

Match the formatting and tone of the existing "Phase 3 Update" section.

---

## Self-review checklist (run before handoff)

- [ ] Every task has at least one commit step.
- [ ] No placeholders like "TODO" or "fill in" in any task.
- [ ] Every bash command is exact, not pseudocode.
- [ ] Eval-set-v4 schema matches eval-set-v3 (verified by Task 1 Step 3).
- [ ] Winner criteria are quantitative, not "looks good".
- [ ] Held-out v4 is scored exactly once with the final winning description (Task 6), never during iteration.
- [ ] Proposer subagent is dispatched with `SKILL.md` body only — never the eval queries.
- [ ] Plugin manifests bumped (Task 7 Step 2) per repo convention.
