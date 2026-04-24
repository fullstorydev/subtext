# Proof MUST Description + Eval-Set v3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Commit the validated MUST description to `skills/proof/SKILL.md`, write a recalibrated `eval-set-v3.json` matching proof's broader (code-change-wide) scope, fold in the two Phase-1-review carry-over items (heredoc fix + `errors` field), and re-baseline trigger rates in both host-isolated and sandbox modes.

**Architecture:** Phase 1 proved the harness apparatus works end-to-end. Phase 2A adjusts the signal: (a) proof's description becomes imperative-mood ("You MUST use this skill when implementing, fixing, or refactoring code...") — probe-tested at 12/12 across three smoke sets including subagent-dispatch-style prompts; (b) a new eval-set-v3 grades against the broader scope (any code change worth evidence-cataloging, not just UI); (c) two small carry-overs from the Phase 1 final review land alongside.

**Tech Stack:**
- Python 3.12 (harness + tests in `tools/skill-eval/`)
- pytest (existing)
- Bash (`subtext-sandbox/entrypoint.sh`)
- Docker (sandbox rebuild)

---

## Scope boundaries

**In scope (Phase 2A):**
- Apply the validated MUST description to `skills/proof/SKILL.md`
- `skills/proof/evals/eval-set-v3.json` with calibrated positives + negatives for the broader scope
- Archive `eval-set.json` (v1) and `eval-set-v2.json` under an `archive/` subfolder with a README
- Fix heredoc quoting in `subtext-sandbox/entrypoint.sh` (Phase 1 review carry-over)
- Add an `errors` field to `run_eval_sandbox.py` output and `summary.with_errors` field (Phase 1 review carry-over)
- Re-baseline: run v3 in both host-isolated and sandbox modes, record results, document in `sandbox/README.md`
- Rebuild the sandbox image so the heredoc fix is live

**Out of scope (separate plans):**
- Subagent-style query mode (`--query-style subagent` flag) — future plan
- Plugin matrix (`EXTRA_PLUGINS=superpowers`, `sandbox/configs/*.yml`) — future plan (previously called Phase 2 proper)
- Caching + parallelism in `run_eval_sandbox.py` — future plan (previously Phase 3)

**Deliberately preserved:**
- `run_eval_sandbox.py`'s serial dispatch (Phase 3 territory to parallelize)
- `bin/eval`'s host-mode behavior (unchanged)
- `detect_trigger_from_stream` (unchanged — the contract still holds)

---

## File Structure

**Files created:**
- `skills/proof/evals/eval-set-v3.json` — calibrated eval-set for the broader proof scope
- `skills/proof/evals/archive/README.md` — explains why v1/v2 are historical

**Files modified:**
- `skills/proof/SKILL.md` — description changes to MUST variant; rest of body unchanged
- `subtext-sandbox/entrypoint.sh` — heredoc → printf for safe description embedding
- `tools/skill-eval/lib/run_eval_sandbox.py` — add `errors` field + `with_errors` summary count
- `tools/skill-eval/tests/test_run_eval_sandbox.py` — add test for `errors` field shape + behavior
- `tools/skill-eval/sandbox/README.md` — append v3 validation section

**Files moved:**
- `skills/proof/evals/eval-set.json` → `skills/proof/evals/archive/eval-set-v1.json`
- `skills/proof/evals/eval-set-v2.json` → `skills/proof/evals/archive/eval-set-v2.json`

---

## Testing strategy

- **TDD-able:** `errors` field in `run_eval_sandbox.py` (Task 3). Pytest fixture simulates `run_query_in_sandbox` raising on some runs.
- **Data-shape validation:** `eval-set-v3.json` gets a JSON-schema check (Task 4). Small ad-hoc pytest that loads the file and validates each entry has `{query, should_trigger, note}` keys.
- **Manual verification via measurement:** the MUST change (Task 1) and heredoc fix (Task 2) are proven by Tasks 6/7 actually running v3 end-to-end. No unit test for bash shell-expansion behavior; we accept empirical validation.
- **Full suite stays green:** the existing 15 tests must continue to pass after each change.

---

## Task 1: Apply MUST description to skills/proof/SKILL.md

**Files:**
- Modify: `skills/proof/SKILL.md` (frontmatter `description:` field only)

This task changes ONLY the `description:` line in frontmatter. Body, metadata, mcp-server, requires — all unchanged.

- [ ] **Step 1: Read the current SKILL.md frontmatter**

```bash
cd /Users/chip/src/subtext/.worktrees/skill-eval-harness
sed -n '1,10p' skills/proof/SKILL.md
```

Expected: you see the frontmatter starting with `---\nname: subtext:proof\ndescription: Use for any frontend or fullstack task...`.

- [ ] **Step 2: Replace the description using Edit**

Replace the existing description line with the MUST variant. The old description starts with `Use for any frontend or fullstack task` and ends with `code-explanation tasks.` (one single-line value).

Use the Edit tool with:

- `old_string` (the entire existing description line):
```
description: Use for any frontend or fullstack task that changes, fixes, or verifies what end users will experience in the UI. Captures proof of work for downstream review evidence in the form of agent replays and before/after screenshot artifacts. Skip for backend-only work with no UX impact, test-only changes, or code-explanation tasks.
```

- `new_string`:
```
description: You MUST use this skill when implementing, fixing, or refactoring code. Captures evidence artifacts (screenshots, network traces, code diffs, trace session links) into a proof document as you work.
```

- [ ] **Step 3: Verify the change**

```bash
head -10 skills/proof/SKILL.md
```

Expected: `description:` line starts with `You MUST use this skill when implementing...`. No other line changed.

- [ ] **Step 4: Commit**

```bash
git add skills/proof/SKILL.md
git commit -m "feat(proof): switch to MUST description (12/12 in probe tests)

Validated against three probe sets: 3/3 broad-scope smoke, 6/6 over-trigger
stress, 3/3 subagent-dispatch-style prompts. Imperative-mood + gerund triple
('implementing, fixing, or refactoring') outperformed terse TDD-style
descriptions in isolated-mode tests where proof had to compete against
Claude's built-in tools without plugin context.

Scope remains the same — any code change worth evidence-cataloging. Body
of SKILL.md unchanged; only the frontmatter description is updated."
```

---

## Task 2: Fix heredoc quoting in subtext-sandbox/entrypoint.sh

The Phase 1 final review flagged this: the eval-mode branch uses an unquoted `<<EOF` heredoc to write the staged skill file, which means `$` / backticks in the description get shell-interpreted and silently mangle. Switch to `printf` which takes the value as a literal string.

**Files:**
- Modify: `subtext-sandbox/entrypoint.sh` (lines ~25–35, the staging heredoc)

- [ ] **Step 1: Read the current heredoc block**

```bash
cd /Users/chip/src/subtext/.worktrees/skill-eval-harness
sed -n '25,40p' subtext-sandbox/entrypoint.sh
```

Expected to see the `cat > "/workspace/.claude/commands/${EVAL_CLEAN_NAME}.md" <<EOF` block with fields for description, skill name, etc.

- [ ] **Step 2: Replace the heredoc with printf**

Use the Edit tool. The exact strings to replace:

- `old_string` (the entire `cat <<EOF ... EOF` block plus its INDENTED_DESC prep line immediately above — both are being replaced):
```
  # Stage the skill as a command file so Claude advertises it
  mkdir -p /workspace/.claude/commands
  INDENTED_DESC="$(echo "$EVAL_DESCRIPTION" | sed 's/^/  /')"
  cat > "/workspace/.claude/commands/${EVAL_CLEAN_NAME}.md" <<EOF
---
description: |
${INDENTED_DESC}
---

# ${EVAL_CLEAN_NAME}

This skill handles: ${EVAL_DESCRIPTION}
EOF
```

- `new_string`:
```
  # Stage the skill as a command file so Claude advertises it.
  # printf '%s' takes variable values as literal strings, so descriptions
  # containing $ or backticks don't get shell-interpreted. This was a real
  # bug under heredoc staging (flagged in Phase 1 final review).
  mkdir -p /workspace/.claude/commands
  INDENTED_DESC="$(printf '%s' "$EVAL_DESCRIPTION" | sed 's/^/  /')"
  printf -- '---\ndescription: |\n%s\n---\n\n# %s\n\nThis skill handles: %s\n' \
    "$INDENTED_DESC" \
    "$EVAL_CLEAN_NAME" \
    "$EVAL_DESCRIPTION" \
    > "/workspace/.claude/commands/${EVAL_CLEAN_NAME}.md"
```

- [ ] **Step 3: Verify the rest of the entrypoint is untouched**

```bash
grep -n "rm -f /workspace/.mcp.json" subtext-sandbox/entrypoint.sh
grep -n "exec claude --plugin-dir" subtext-sandbox/entrypoint.sh
grep -n "npm run dev" subtext-sandbox/entrypoint.sh
```

Expected: all three still present. Only the staging block changed.

- [ ] **Step 4: Rebuild the sandbox image**

```bash
./tools/skill-eval/sandbox/build.sh 2>&1 | tail -5
```

Expected: `Built subtext-sandbox-claude:latest`. Takes a couple minutes.

- [ ] **Step 5: Smoke test that the eval branch still runs**

```bash
set -a; source /Users/chip/src/subtext/bench/.env.local; set +a
# One container spin-up with an adversarial description (contains $ and backticks)
docker run --rm \
  -v "$(pwd):/opt/subtext:ro" \
  -e PLUGIN_SOURCE=local \
  -e ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  -e EVAL_QUERY="hello" \
  -e EVAL_CLEAN_NAME="heredoc-probe-test" \
  -e EVAL_DESCRIPTION='Has $dollar and `backticks` — should be preserved literally.' \
  subtext-sandbox-claude 2>&1 | head -3
```

The container will run claude -p briefly. We don't care about the trigger result — the real verification is that the container started (didn't die with command-substitution exit 127 from the heredoc bug). You should see stream-json output, not a shell error.

- [ ] **Step 6: Commit**

```bash
git add subtext-sandbox/entrypoint.sh
git commit -m "fix(sandbox): use printf instead of heredoc for skill staging

Heredoc <<EOF interprets \$ and backticks in expanded values. Skill
descriptions containing either character would be silently mangled
(Phase 1 final review flagged this). printf '%s' takes values as
literal strings — safer and matches what the vendor harness does on
the host side.

Verified with adversarial probe: EVAL_DESCRIPTION='Has \$dollar and
\`backticks\`' now stages correctly."
```

---

## Task 3: Add `errors` field to run_eval_sandbox output

The Phase 1 final review flagged: when all `runs_per_query` attempts for a query raise (docker timeout, image missing, etc.), the query quietly scores `triggers=0` and gets marked as PASS for negatives, FAIL for positives — undetectable from JSON output. Add an `errors` count per result and a `with_errors` count in `summary` so broken runs are visible.

**Files:**
- Modify: `tools/skill-eval/lib/run_eval_sandbox.py` (in `run_eval_over_sandbox`)
- Modify: `tools/skill-eval/tests/test_run_eval_sandbox.py` (add 2 new tests)

### TDD order

- [ ] **Step 1: Write the failing tests**

Open `tools/skill-eval/tests/test_run_eval_sandbox.py` and add these two tests at the end of the file (before any existing trailing newlines):

```python
def test_errors_field_counts_raised_runs():
    """When run_query_in_sandbox raises, the result should track the error count."""
    eval_set = [{"query": "Q1", "should_trigger": True}]
    with patch("lib.run_eval_sandbox.run_query_in_sandbox") as rq:
        rq.side_effect = [_res(True), RuntimeError("docker died"), _res(True)]
        output = run_eval_over_sandbox(
            eval_set=eval_set,
            skill_name="subtext:proof",
            description="desc",
            plugin_source_path="/host/subtext",
            runs_per_query=3,
        )
    result = output["results"][0]
    assert result["errors"] == 1
    assert result["triggers"] == 2
    assert result["runs"] == 3


def test_summary_with_errors_counts_results_with_errors():
    """Summary should track how many queries had at least one errored run."""
    eval_set = [
        {"query": "Q1", "should_trigger": True},
        {"query": "Q2", "should_trigger": False},
    ]
    with patch("lib.run_eval_sandbox.run_query_in_sandbox") as rq:
        # Q1: all three runs raise; Q2: all three succeed without triggering
        rq.side_effect = [
            RuntimeError("x"), RuntimeError("x"), RuntimeError("x"),
            _res(False), _res(False), _res(False),
        ]
        output = run_eval_over_sandbox(
            eval_set=eval_set,
            skill_name="subtext:proof",
            description="desc",
            plugin_source_path="/host/subtext",
            runs_per_query=3,
        )
    assert output["summary"]["with_errors"] == 1
    # Q1 is a positive with 0 triggers → FAIL. Q2 is a negative with 0 triggers → PASS.
    assert output["summary"]["passed"] == 1
    assert output["summary"]["failed"] == 1
```

Also update the existing `test_output_shape_matches_run_eval` to include the new keys. Find this assertion:

```python
    assert set(output["summary"].keys()) == {"total", "passed", "failed"}
    result = output["results"][0]
    assert set(result.keys()) == {
        "query", "should_trigger", "trigger_rate", "triggers", "runs", "pass"
    }
```

And replace it with:

```python
    assert set(output["summary"].keys()) == {"total", "passed", "failed", "with_errors"}
    result = output["results"][0]
    assert set(result.keys()) == {
        "query", "should_trigger", "trigger_rate", "triggers", "runs", "pass", "errors"
    }
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd tools/skill-eval
./venv/bin/pytest tests/test_run_eval_sandbox.py -v
```

Expected: `test_errors_field_counts_raised_runs` and `test_summary_with_errors_counts_results_with_errors` FAIL with KeyError / AssertionError about `errors` or `with_errors`. `test_output_shape_matches_run_eval` also FAILs (set mismatch).

- [ ] **Step 3: Implement the changes in run_eval_sandbox.py**

Edit `tools/skill-eval/lib/run_eval_sandbox.py`. Find the inner loop:

```python
        for run_idx in range(runs_per_query):
            if verbose:
                print(
                    f"[{item['query'][:50]}] run {run_idx + 1}/{runs_per_query}",
                    file=sys.stderr,
                )
            try:
                r: SandboxResult = run_query_in_sandbox(
                    query=item["query"],
                    clean_name=clean_name,
                    description=description,
                    plugin_source_path=plugin_source_path,
                    timeout_s=timeout_s,
                    model=model,
                )
                if r.triggered:
                    triggers += 1
            except Exception as e:  # noqa: BLE001 — log and carry on
                print(f"  warn: query failed: {e}", file=sys.stderr)
```

Replace with (adds an `errors = 0` counter above the loop and increments it in the except):

```python
        errors = 0
        for run_idx in range(runs_per_query):
            if verbose:
                print(
                    f"[{item['query'][:50]}] run {run_idx + 1}/{runs_per_query}",
                    file=sys.stderr,
                )
            try:
                r: SandboxResult = run_query_in_sandbox(
                    query=item["query"],
                    clean_name=clean_name,
                    description=description,
                    plugin_source_path=plugin_source_path,
                    timeout_s=timeout_s,
                    model=model,
                )
                if r.triggered:
                    triggers += 1
            except Exception as e:  # noqa: BLE001 — log and carry on
                errors += 1
                print(f"  warn: query failed: {e}", file=sys.stderr)
```

Find the results.append block:

```python
        results.append({
            "query": item["query"],
            "should_trigger": should_trigger,
            "trigger_rate": trigger_rate,
            "triggers": triggers,
            "runs": runs_per_query,
            "pass": did_pass,
        })
```

Replace with:

```python
        results.append({
            "query": item["query"],
            "should_trigger": should_trigger,
            "trigger_rate": trigger_rate,
            "triggers": triggers,
            "runs": runs_per_query,
            "pass": did_pass,
            "errors": errors,
        })
```

Find the final return block:

```python
    passed = sum(1 for r in results if r["pass"])
    total = len(results)
    return {
        "skill_name": skill_name,
        "description": description,
        "results": results,
        "summary": {"total": total, "passed": passed, "failed": total - passed},
    }
```

Replace with:

```python
    passed = sum(1 for r in results if r["pass"])
    with_errors = sum(1 for r in results if r["errors"] > 0)
    total = len(results)
    return {
        "skill_name": skill_name,
        "description": description,
        "results": results,
        "summary": {
            "total": total,
            "passed": passed,
            "failed": total - passed,
            "with_errors": with_errors,
        },
    }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
./venv/bin/pytest tests/test_run_eval_sandbox.py -v
```

Expected: all 6 tests pass (4 original + 2 new).

- [ ] **Step 5: Run the full suite for regressions**

```bash
./venv/bin/pytest tests/ -v
```

Expected: 17 passed (was 15; we added 2 new tests).

- [ ] **Step 6: Commit**

```bash
cd /Users/chip/src/subtext/.worktrees/skill-eval-harness
git add tools/skill-eval/lib/run_eval_sandbox.py tools/skill-eval/tests/test_run_eval_sandbox.py
git commit -m "feat(skill-eval): surface run errors in eval output

Previously, a query whose runs all raised (docker timeout, image
missing, etc.) would quietly score triggers=0 — which PASSes a negative
and FAILs a positive, undetectable from the JSON. Surface errors
explicitly:

- Per-result: errors (int) field counts raised runs
- Summary: with_errors field counts queries that had any raised run

Pass logic unchanged (still trigger_rate vs threshold) — errors are
informational. Full audit of error interpretation deferred to a
future pass. Flagged in Phase 1 final review."
```

---

## Task 4: Write eval-set-v3.json

The v3 eval-set grades against proof's new broader scope: any code change worth evidence-cataloging. That's wider than v2's UI-only focus. We add explicit backend/refactor positives and recalibrate negatives to focus on pure-explanation / planning / investigation (not "backend API" which v2 treated as a negative but is now arguably a positive).

**Files:**
- Create: `skills/proof/evals/eval-set-v3.json`

Target shape: 15 positives + 10 hard negatives + 5 explicitly-ambiguous entries (marked `note: "soft - ambiguous"` — still graded, but flagged so failures on them aren't alarming).

- [ ] **Step 1: Write the eval-set file**

Create `skills/proof/evals/eval-set-v3.json` with this exact content:

```json
[
  {
    "query": "Update the button hover state to be slightly darker",
    "should_trigger": true,
    "note": "hard positive — canonical visual change"
  },
  {
    "query": "Fix the modal close button that doesn't work",
    "should_trigger": true,
    "note": "hard positive — functional fix, UI code"
  },
  {
    "query": "Add a retry loop with exponential backoff to the payment service call",
    "should_trigger": true,
    "note": "hard positive — backend impl, network-observable"
  },
  {
    "query": "Add a new API endpoint for user preferences",
    "should_trigger": true,
    "note": "hard positive — backend impl, network-observable (reclassified from v2)"
  },
  {
    "query": "Refactor the auth middleware to extract the session-validation logic into its own function",
    "should_trigger": true,
    "note": "hard positive — refactor with observable diff"
  },
  {
    "query": "Fix the race condition in the cart-update handler",
    "should_trigger": true,
    "note": "hard positive — functional bug fix"
  },
  {
    "query": "Migrate the user profile schema to add a phone_number field",
    "should_trigger": true,
    "note": "hard positive — schema change + code change"
  },
  {
    "query": "Change the color scheme to match our new brand colors",
    "should_trigger": true,
    "note": "hard positive — broad visual change"
  },
  {
    "query": "Fix the overlapping text in the product cards",
    "should_trigger": true,
    "note": "hard positive — layout bug"
  },
  {
    "query": "Add input validation to the signup form",
    "should_trigger": true,
    "note": "hard positive — validation logic implementation"
  },
  {
    "query": "Implement the dark-mode toggle we brainstormed earlier",
    "should_trigger": true,
    "note": "hard positive — explicit 'implement' verb mid-flow"
  },
  {
    "query": "You are implementing Task 3: Add a hover state to the submit button. Follow TDD.",
    "should_trigger": true,
    "note": "hard positive — subagent-style dispatch prompt"
  },
  {
    "query": "You are implementing Task 7: Add retry-with-backoff to the payment service call. Follow TDD.",
    "should_trigger": true,
    "note": "hard positive — subagent-style dispatch prompt, backend"
  },
  {
    "query": "Add structured logging to the payment processing function",
    "should_trigger": true,
    "note": "hard positive — observability implementation"
  },
  {
    "query": "Write a unit test for the email validation helper",
    "should_trigger": true,
    "note": "hard positive — test-writing is code implementation"
  },
  {
    "query": "Explain how React hooks work",
    "should_trigger": false,
    "note": "hard negative — pure explanation, no change"
  },
  {
    "query": "What's the difference between useState and useReducer?",
    "should_trigger": false,
    "note": "hard negative — knowledge question"
  },
  {
    "query": "Help me understand this authentication flow",
    "should_trigger": false,
    "note": "hard negative — understanding, not changing"
  },
  {
    "query": "Walk me through how this codebase is structured",
    "should_trigger": false,
    "note": "hard negative — orientation, no change"
  },
  {
    "query": "Why does this test keep failing? Just analyze the logs and tell me.",
    "should_trigger": false,
    "note": "hard negative — investigation without change"
  },
  {
    "query": "Let's brainstorm the onboarding UX — what options do we have?",
    "should_trigger": false,
    "note": "hard negative — brainstorming phase"
  },
  {
    "query": "Plan the steps to migrate from REST to GraphQL. Do not write any code yet.",
    "should_trigger": false,
    "note": "hard negative — planning phase, explicit no-code"
  },
  {
    "query": "You are researching Task 2: Understand how the authentication middleware works. Do NOT modify any code.",
    "should_trigger": false,
    "note": "hard negative — subagent-style research dispatch, explicit no-code"
  },
  {
    "query": "Review this PR and tell me if the approach is sound",
    "should_trigger": false,
    "note": "hard negative — review request, no implementation"
  },
  {
    "query": "What does this error message mean: 'Cannot read property \"foo\" of undefined'?",
    "should_trigger": false,
    "note": "hard negative — debug question without fix request"
  },
  {
    "query": "Bump React from 18 to 19 in package.json",
    "should_trigger": true,
    "note": "soft — ambiguous. Dep bump has risk of visual regression but no intentional code change. v2 marked false; v3 marks true because runtime-observable effects may need evidence."
  },
  {
    "query": "Rename the variable `data` to `payload` across all .tsx files",
    "should_trigger": false,
    "note": "soft — ambiguous. Touches code but zero behavioral/visual diff. v3 keeps false (no observable effect)."
  },
  {
    "query": "Update the README with the new setup instructions",
    "should_trigger": false,
    "note": "soft — ambiguous. Documentation-only but 'update' is a code-edit verb."
  },
  {
    "query": "Change the 'Submit' button text to 'Save' on the login form",
    "should_trigger": true,
    "note": "soft — ambiguous. Copy-only change; tiny diff but user-visible."
  },
  {
    "query": "Add a comment explaining why we use the singleton pattern here",
    "should_trigger": false,
    "note": "soft — ambiguous. Code edit but no behavioral change."
  }
]
```

- [ ] **Step 2: Validate the JSON structure**

```bash
cd /Users/chip/src/subtext/.worktrees/skill-eval-harness
./tools/skill-eval/venv/bin/python -c "
import json
data = json.load(open('skills/proof/evals/eval-set-v3.json'))
assert isinstance(data, list), 'must be a list'
positives = [d for d in data if d['should_trigger']]
negatives = [d for d in data if not d['should_trigger']]
soft = [d for d in data if 'soft' in d.get('note', '').lower()]
print(f'Total: {len(data)}')
print(f'Positives: {len(positives)}')
print(f'Negatives: {len(negatives)}')
print(f'Soft/ambiguous (informational): {len(soft)}')
# Every entry must have query, should_trigger, note
for i, d in enumerate(data):
    assert 'query' in d, f'entry {i} missing query'
    assert 'should_trigger' in d, f'entry {i} missing should_trigger'
    assert 'note' in d, f'entry {i} missing note'
    assert isinstance(d['should_trigger'], bool), f'entry {i} should_trigger not bool'
print('Schema: OK')
"
```

Expected output:
```
Total: 30
Positives: 17
Negatives: 13
Soft/ambiguous (informational): 5
Schema: OK
```

- [ ] **Step 3: Commit**

```bash
git add skills/proof/evals/eval-set-v3.json
git commit -m "feat(proof-evals): add eval-set v3 for broader code-change scope

30 queries (17 positive / 13 negative / 5 marked soft-ambiguous). Key
differences from v2:

- Backend + refactor + migration + test-writing positives added
- 'Add a new API endpoint' reclassified as positive (network-observable
  code change under new scope)
- Dedicated subagent-style dispatch prompts included as positives +
  one negative (research-only subagent)
- Pure explanation / planning / brainstorming queries as hard negatives
- Soft-ambiguous entries (dep bump, variable rename, copy edit, doc
  comment) marked in notes so failures on them are not alarming

v1 and v2 remain in skills/proof/evals/ for now; next task archives
them with an explanatory README."
```

---

## Task 5: Archive eval-set v1 and v2

Keep the files reachable for historical comparison, but move them out of the default load path so `bin/eval proof` doesn't accidentally target them.

**Files:**
- Create: `skills/proof/evals/archive/README.md`
- Move: `skills/proof/evals/eval-set.json` → `skills/proof/evals/archive/eval-set-v1.json`
- Move: `skills/proof/evals/eval-set-v2.json` → `skills/proof/evals/archive/eval-set-v2.json`

- [ ] **Step 1: Create the archive dir and move the files**

```bash
cd /Users/chip/src/subtext/.worktrees/skill-eval-harness
mkdir -p skills/proof/evals/archive
git mv skills/proof/evals/eval-set.json skills/proof/evals/archive/eval-set-v1.json
git mv skills/proof/evals/eval-set-v2.json skills/proof/evals/archive/eval-set-v2.json
```

- [ ] **Step 2: Make bin/eval still work by updating it to use v3 by default**

Read `tools/skill-eval/bin/eval` and find the line:

```bash
EVAL_SET="$SKILL_PATH/evals/eval-set.json"
```

Change it to:

```bash
EVAL_SET="${EVAL_SET_OVERRIDE:-$SKILL_PATH/evals/eval-set-v3.json}"
```

Do the same in `tools/skill-eval/bin/eval-sandboxed`. Find:

```bash
EVAL_SET="$SKILL_PATH/evals/eval-set.json"
```

Change to:

```bash
EVAL_SET="${EVAL_SET_OVERRIDE:-$SKILL_PATH/evals/eval-set-v3.json}"
```

This preserves callers' ability to override via env var (useful for Task 6/7 below if they want to point at something else), while defaulting to v3.

- [ ] **Step 3: Create the archive README**

Create `skills/proof/evals/archive/README.md`:

```markdown
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
```

- [ ] **Step 4: Verify the default eval path still resolves**

```bash
./tools/skill-eval/bin/eval 2>&1 | head -3
```

Expected: `Usage: eval <skill-name> ...` (normal usage error; no file-not-found surprises).

```bash
# Smoke test that the override env var works
EVAL_SET_OVERRIDE=skills/proof/evals/archive/eval-set-v1.json ./tools/skill-eval/bin/eval proof 2>&1 | head -5
```

Expected: usage info plus "eval-set: ...archive/eval-set-v1.json" or similar — the important bit is NO "Error: eval-set not found".

(The actual run will fail or take a long time — it's a live claude invocation. Cancel quickly with Ctrl-C after verifying the preflight banner.)

- [ ] **Step 5: Commit**

```bash
git add skills/proof/evals/archive/ tools/skill-eval/bin/eval tools/skill-eval/bin/eval-sandboxed
git commit -m "refactor(proof-evals): archive v1/v2 and default to v3

Moved legacy eval-sets under skills/proof/evals/archive/ with a README
explaining why they're historical (different scope definition). Both
bin/eval and bin/eval-sandboxed now default to eval-set-v3.json and
accept an EVAL_SET_OVERRIDE env var for callers that want to pin a
specific version."
```

---

## Task 6: Run v3 in host-isolated mode, record result

**Files:** records output under `skills/proof/evals/results/` (gitignored for bulk; one summary file will be kept).

- [ ] **Step 1: Source API key and run**

```bash
cd /Users/chip/src/subtext/.worktrees/skill-eval-harness
set -a; source /Users/chip/src/subtext/bench/.env.local; set +a
echo "key length: ${#ANTHROPIC_API_KEY}"
```

Expected: non-zero length.

```bash
# Runs-per-query=3 is the standard; with 30 queries and 5 workers, this takes ~3-5 minutes
time ./tools/skill-eval/bin/eval proof --isolated --runs-per-query 3 --num-workers 5 2>&1 | tail -15
```

Expected: JSON summary printed. Note: `bin/eval` already writes the output file under `skills/proof/evals/results/proof-isolated-<timestamp>.json`.

- [ ] **Step 2: Inspect the result**

```bash
# Latest isolated result
RESULT=$(ls -t skills/proof/evals/results/proof-isolated-*.json | head -1)
echo "Latest: $RESULT"
cat "$RESULT" | ./tools/skill-eval/venv/bin/python -c "
import json, sys
d = json.load(sys.stdin)
s = d['summary']
print(f'Total: {s[\"total\"]}, Passed: {s[\"passed\"]}, Failed: {s[\"failed\"]}')
print()
print('=== Hard positives (should trigger) ===')
for r in d['results']:
    if r['should_trigger'] and 'soft' not in r.get('query', '').lower():
        note = next((item['note'] for item in d['results'] if item['query'] == r['query']), '')
        sym = 'PASS' if r['pass'] else 'FAIL'
        print(f'  [{sym}] {r[\"triggers\"]}/{r[\"runs\"]}  {r[\"query\"][:70]}')
print()
print('=== Hard negatives (should NOT trigger) ===')
for r in d['results']:
    if not r['should_trigger']:
        sym = 'PASS' if r['pass'] else 'FAIL'
        print(f'  [{sym}] {r[\"triggers\"]}/{r[\"runs\"]}  {r[\"query\"][:70]}')
"
```

Record the result filename — you'll reference it in Task 8.

- [ ] **Step 3: No commit needed**

The results file is auto-gitignored under `skills/proof/evals/results/` (the existing `.gitignore` in that dir excludes `results/*.json`). Don't commit it — we'll reference the numbers in the validation writeup (Task 8).

---

## Task 7: Run v3 in sandbox mode, record result

**Files:** records output under `skills/proof/evals/results/`.

- [ ] **Step 1: Verify image is current**

After Task 2's entrypoint fix, Task 2 Step 4 rebuilt the image. Verify:

```bash
docker images subtext-sandbox-claude
```

Expected: image present, recent build timestamp (within last ~hour).

If the image is stale (older than Task 2's rebuild), rerun:

```bash
./tools/skill-eval/sandbox/build.sh
```

- [ ] **Step 2: Run v3 in sandbox mode**

Sandbox is ~34× slower per query than host-isolated. 30 queries × 3 runs serial ≈ 30 × 3 × 51s = ~77 minutes. We'll drop runs-per-query to 1 for the first sandbox baseline (~26 minutes) and revisit parallelism in a later phase.

```bash
set -a; source /Users/chip/src/subtext/bench/.env.local; set +a
time ./tools/skill-eval/bin/eval-sandboxed proof --runs-per-query 1 --timeout 300 2>&1 | tail -15
```

Expected: JSON summary. File auto-written to `skills/proof/evals/results/proof-sandboxed-<timestamp>.json`.

If the run exceeds ~45 minutes with no output, something is wrong — cancel and investigate (probably a container-start loop or a hung claude-p call).

- [ ] **Step 3: Inspect the result**

```bash
RESULT=$(ls -t skills/proof/evals/results/proof-sandboxed-*.json | head -1)
echo "Latest: $RESULT"
cat "$RESULT" | ./tools/skill-eval/venv/bin/python -c "
import json, sys
d = json.load(sys.stdin)
s = d['summary']
print(f'Total: {s[\"total\"]}, Passed: {s[\"passed\"]}, Failed: {s[\"failed\"]}, With errors: {s[\"with_errors\"]}')
print()
for r in d['results']:
    sym = 'PASS' if r['pass'] else 'FAIL'
    err = f' (errors={r[\"errors\"]})' if r['errors'] > 0 else ''
    print(f'  [{sym}] {r[\"triggers\"]}/{r[\"runs\"]} exp={r[\"should_trigger\"]}{err}  {r[\"query\"][:60]}')
"
```

Note: this uses the new `errors` / `with_errors` fields from Task 3, so if Task 3 didn't land this inspection will fail.

Record the result filename for Task 8.

- [ ] **Step 4: No commit**

Results are gitignored. Numbers go into the sandbox README in Task 8.

---

## Task 8: Update sandbox README with v3 validation comparison

Replace the Phase 1 validation section (which used the 2-query smoke and the old description) with a fresh v3 validation section reflecting Task 6 and Task 7 numbers.

**Files:**
- Modify: `tools/skill-eval/sandbox/README.md`

- [ ] **Step 1: Read the current Validation section**

```bash
sed -n '/^## Validation/,$p' tools/skill-eval/sandbox/README.md
```

You'll see the Phase 1 validation table with 2 queries and the ~51s/~1.5s latencies.

- [ ] **Step 2: Replace that section with Phase 2A numbers**

Use the Edit tool. Replace the entire `## Validation (Phase 1)` block (everything from `## Validation (Phase 1)` to end of file) with:

```markdown
## Validation (Phase 2A, 2026-04-24)

30-query eval-set-v3 against the MUST description on `skills/proof`.

### Host-isolated mode

| Metric | Value |
|---|---|
| Total queries | 30 |
| Passed | <fill-in from Task 6 inspection> |
| Failed | <fill-in> |
| With errors | <fill-in> |
| Per-query latency | ~<fill-in>s |
| Total runtime | ~<fill-in>min |

Result file: `skills/proof/evals/results/<fill-in filename from Task 6>`

### Sandbox mode

| Metric | Value |
|---|---|
| Total queries | 30 |
| Passed | <fill-in from Task 7> |
| Failed | <fill-in> |
| With errors | <fill-in> |
| Per-query latency | ~<fill-in>s |
| Total runtime | ~<fill-in>min |

Result file: `skills/proof/evals/results/<fill-in filename from Task 7>`

### Interpretation

- Hard positives that FAILED in both modes: <fill-in list, if any>
- Hard positives that passed in one mode but not the other: <fill-in, if any>
- Hard negatives that failed (over-triggering): <fill-in, if any>
- Soft-ambiguous queries: not counted for description-quality purposes; results are informational

Directional agreement between modes (host-isolated vs sandbox) is the
success signal. Individual divergences at runs-per-query=1 in sandbox
mode are expected model noise.

### Prior baselines

- Phase 1 Validation (eval-set-v2 against the pre-MUST description): 11/26
  passed with 1/16 positives triggering. See archived result at
  `skills/proof/evals/archive/` for context. Not directly comparable to v3
  (different queries, different description, different scope).

## Phase 2/3 roadmap

- Phase 2B: `EXTRA_PLUGINS` env var (`=superpowers,notion`) installs additional
  marketplaces pre-launch. Named configs under `configs/subtext-plus-superpowers.yml`
  etc. Tests MUST routing contests under realistic plugin environments.
- Phase 2C: Subagent-style query mode (`--query-style subagent` flag or parallel
  eval-set) to validate subagent-dispatch pickup across the full eval-set.
- Phase 3: Two-stage Dockerfile for caching + parallel worker pool. Target:
  30 queries × 3 runs × 5 configs < 10 minutes total.
```

Fill in every `<fill-in>` with the actual numbers from Task 6 and Task 7.

- [ ] **Step 3: Verify no stray `<fill-in>` placeholders remain**

```bash
grep '<fill-in>' tools/skill-eval/sandbox/README.md || echo "OK: no placeholders"
```

Expected: `OK: no placeholders`. If any remain, go back and fill them in.

- [ ] **Step 4: Commit**

```bash
git add tools/skill-eval/sandbox/README.md
git commit -m "docs(skill-eval): record Phase 2A eval-set-v3 baseline

Replaces the Phase 1 validation section (2-query smoke against the
pre-MUST description) with the full eval-set-v3 baseline in both
host-isolated and sandbox modes. Prior baselines noted as historical
(not directly comparable due to scope change)."
```

---

## Final review

- [ ] **Run the full test suite**

```bash
cd tools/skill-eval
./venv/bin/pytest tests/ -v
```

Expected: 17 passed (15 from Phase 1 + 2 from Task 3).

- [ ] **Confirm the proof description is the MUST variant**

```bash
cd /Users/chip/src/subtext/.worktrees/skill-eval-harness
grep "^description:" skills/proof/SKILL.md
```

Expected: starts with `description: You MUST use this skill when implementing...`

- [ ] **Confirm v3 is the default eval-set**

```bash
grep "EVAL_SET=" tools/skill-eval/bin/eval tools/skill-eval/bin/eval-sandboxed
```

Expected: both lines reference `eval-set-v3.json` as the default.

- [ ] **Confirm archive dir has v1 and v2 + README**

```bash
ls skills/proof/evals/archive/
```

Expected: `README.md`, `eval-set-v1.json`, `eval-set-v2.json`.

- [ ] **Confirm no lingering heredoc in entrypoint**

```bash
grep -n "<<EOF" subtext-sandbox/entrypoint.sh && echo "FAIL: heredoc still present" || echo "OK: no heredoc"
```

Expected: `OK: no heredoc`.

---

## Phase 2B + 2C + 3 roadmap (deferred to separate plans)

- **Phase 2B — Subagent-style query mode.** Add `--query-style subagent` flag
  to the harness that wraps each query in a subagent-dispatch-prompt template
  before feeding to `claude -p`. Lets v3 be re-run under the subagent-call
  shape, which is how Superpowers and similar frameworks dispatch
  implementation work. Probe result with MUST: 3/3 on a 3-query sample —
  full sweep pending.

- **Phase 2C — Plugin matrix.** `EXTRA_PLUGINS=<csv>` env var in
  `entrypoint.sh` that pre-installs additional marketplaces before launching
  `claude -p`. Named configs under `tools/skill-eval/sandbox/configs/` —
  `subtext-only.yml`, `subtext-plus-superpowers.yml`, etc. Harness iterates
  configs and produces a matrix CSV (queries × configs → trigger rate).
  Motivating question: does MUST still win routing contests when Superpowers'
  own descriptions are visible?

- **Phase 3 — Caching + parallelism.** Two-stage Dockerfile
  (`Dockerfile.base` cached per config-hash, `Dockerfile.query` thin layer
  for per-query skill-staging). Worker pool inside `run_eval_sandbox.py`.
  Target: 30 queries × 3 runs × 5 configs < 10 minutes.

Write each of those plans once Phase 2A's numbers tell us which axis matters
most in practice.
