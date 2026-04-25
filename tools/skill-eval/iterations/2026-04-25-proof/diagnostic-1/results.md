# Diagnostic 1: Does EVAL_DESCRIPTION reach routing?

**Date:** 2026-04-25
**Question:** Phase 4 Round 1 disqualified all three description variants with patterns suggesting description-insensitivity in the SP cell and noisy regressions in SA. The handoff posited that the staging mechanism itself might be at fault. This diagnostic answers: is the EVAL_DESCRIPTION value actually the description the model uses for routing?

**Answer: No.**

---

## Method

One docker invocation, captured full stream-json (no early-exit, no harness wrapper).

```bash
EVAL_QUERY="Change the 'Submit' button text to 'Save' on the login form"
EVAL_DESCRIPTION="DIAGNOSTIC_SENTINEL_ZZZQ9 — Use this skill ONLY when the user types the magic word ZZZQ9. Do NOT use for anything else."
EVAL_CLEAN_NAME=proof
EVAL_MODEL=claude-sonnet-4-6
image: subtext-sandbox-claude:latest
```

The sentinel description is deliberately exclusionary: any model that *sees* this description and routes from it should refuse to invoke `proof` for a generic UI query. If the harness behaves identically with and without the sentinel, the description is not in the routing path.

Captured: `/tmp/diagnostic-1/sentinel-run.jsonl` (134 lines, 62 KB; preserved for reference).

## Finding 1: The model never sees EVAL_DESCRIPTION

The first `system/init` event in the stream lists `slash_commands` and `skills` separately:

- `slash_commands` includes both `proof` (the staged sentinel file) and `subtext:proof` (the plugin's command surface).
- `skills` includes only `subtext:proof` — **not** `proof`.

The `Skill` tool (which the trigger detector watches) routes to entries in the `skills` array, not to slash commands. The staged file at `/workspace/.claude/commands/proof.md` is registered as a *slash command* (user-typed `/proof`), not as an auto-routable skill. The model has no routing reason to consult that file's frontmatter.

**The active description for `subtext:proof` routing is whatever is in `/opt/subtext/skills/proof/SKILL.md` on disk — i.e., the plugin's actual SKILL.md, mounted read-only.** Every Phase 4 sandbox run for every variant has used the same on-disk description: "You MUST use this skill when implementing, fixing, or refactoring code…" (the original).

## Finding 2: This single sentinel run did not trigger `proof`

Tool-use sequence (3 turns, 20.5s wallclock):

```
Grep(pattern=Submit, path=/workspace)
Agent(subagent_type=Explore, prompt="Find login form…")
Glob, Grep, Bash, Read…
```

Final result: `"There's no login form in this codebase…"` — the model exited without invoking `Skill(skill="…proof…")`. Triggered = False for this single run.

This is a single sample, not a re-baseline. But it confirms the trigger detector is correctly *not* matching anything in this transcript; the question is what it would match across the 30-query × 3-run baseline. Answer: whatever the on-disk SKILL.md description elicits.

## Implications for Phase 4 measurements

1. **Variant trigger-rate deltas are not measuring description quality.** All four cells × three variants × 30 queries × 3 runs were run under identical actual descriptions. The deltas observed in Round 1 are run-to-run model variance, not signal from the variant text.

2. **The "SP cell description-insensitivity" finding partially survives.** The SP cell of 13/30 = exactly the 13 hard negatives is consistent with "the on-disk description plus Superpowers' descriptions yield ~13 hard-neg pass / ~0 positive trigger" — but it now means *the on-disk description and Superpowers's combined routing*, not "no description on `proof` can move SP." We do not know what a different on-disk description would do, because none was ever tested.

3. **The "SA crater" finding does not survive.** SA subtext-only dropping by -9 to -11 across all variants in Round 1 is now most plausibly run-to-run noise within the 90-dispatch sample, not a consequence of the variant text. The fact that the same ~5-6 visual queries lost across all three variants is consistent with those queries simply being borderline under the on-disk description.

4. **Baseline measurements (the v3 18/14/24/13 numbers) are valid as a measurement of the on-disk description's behavior.** They were the only configuration where EVAL_DESCRIPTION ≈ on-disk description (because the harness passes the on-disk text as EVAL_DESCRIPTION when no override is given). The numbers are real; they just describe the on-disk description's properties, not "the description we typed in."

## Implications for the harness

`tools/skill-eval/lib/sandbox_runner.py:82` and `subtext-sandbox/entrypoint.sh:23–33` together stage EVAL_DESCRIPTION as a slash command, not as a skill. The vendor's `vendor/skill-creator/scripts/run_eval.py:62-91` does the same thing — but it uses a unique-suffixed `clean_name` (e.g., `subtext-proof-skill-abc12345`) and runs in *isolated* mode where there's no competing plugin skill. In that vendor design the staged slash command is the only `proof`-substring entity in scope, so substring-matching `Skill` calls would pick it up.

Our sandbox mode broke that assumption: it loads the plugin (which advertises `subtext:proof` as both a real skill and a same-named slash command) *and* stages a slash command file. The model has a real auto-routable skill to choose from with its real on-disk description, and the staged sentinel file is a slash command the model has no routing reason to consult.

**`subtext-sandbox/README.md:65` is also wrong:** it says EVAL_DESCRIPTION "stages on the skill" — the implementation stages on a command.

## What this means for the Phase 4 plan

The Phase 4 plan presupposed that EVAL_DESCRIPTION drove routing. It did not. Round 1 produced no information about description quality. Round 2 with the current harness would also produce no information.

To recover Phase 4, the harness must be changed so EVAL_DESCRIPTION actually rewrites the on-disk SKILL.md the plugin loader sees. Three options for the fix; cheapest first:

**Option A — Writable plugin copy.** In the entrypoint, copy `/opt/subtext` to `/tmp/subtext-runtime`, rewrite `/tmp/subtext-runtime/skills/proof/SKILL.md`'s frontmatter `description:`, and pass `--plugin-dir /tmp/subtext-runtime`. Read-only mount stays as the source of truth. ~10 lines of shell. No host-side change.

**Option B — Bind-mount writable, restore on exit.** Drop `:ro` from the mount, modify in place, and use a trap to restore on container exit. Risky (mutates the host worktree if the trap doesn't fire), saves the copy.

**Option C — Stage as `.claude/skills/<name>/SKILL.md` instead of `.claude/commands/<name>.md`.** Project-level skills *are* auto-routable. But the plugin's `subtext:proof` would still be in the skills array and likely outrank a same-named project skill, so this is the most ambiguous fix.

Recommend **Option A**.

Side note: after the fix, the harness's existing baseline numbers also need re-baselining, since they were never measured against a description-controlled run.

## What this does not tell us

- Whether the Phase 4 *direction* (try MUST-style sentences, vary scope/timing/composition axes) is correct — we never measured it.
- Whether the SP cell will move at all once descriptions are actually in scope.
- Whether the SA cell variance is genuinely high or was an artifact of the particular runs.

These all become answerable once the harness is fixed.

## Files

- `/tmp/diagnostic-1/sentinel-run.jsonl` — full stream-json output (preserved on disk; not committed).
- `/tmp/diagnostic-1/sentinel-run.stderr` — stderr (empty).
- `tools/skill-eval/iterations/2026-04-25-proof/diagnostic-1/results.md` — this file.
