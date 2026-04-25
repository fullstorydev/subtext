# Subagent-Style Query Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `--query-style subagent` mode to the sandbox eval harness that wraps each query in a subagent-dispatch-prompt template before feeding to `claude -p`. This measures how skill-loader routing differs between user-typed prompts (default) and framework-dispatched subagent prompts (the routing surface that matters most for Superpowers-style flows).

**Architecture:** Pure wrap function (`lib/subagent_wrap.py`) plus a `--query-style` flag plumbed through `run_eval_sandbox.py`, `bin/eval-sandboxed`, and `bin/eval-sandboxed-matrix`. Wrapping happens at runtime — same `eval-set-v3.json` drives both modes. Output filenames always include the style suffix for unambiguous matrix lookup. Phase 2C runs each query-style as a separate matrix sweep; Phase 3 caching/parallelism will collapse them into one combined sweep.

**Tech Stack:**
- Python 3.12 + pytest (wrap function + harness integration)
- Bash (forward flags through wrappers)

---

## Scope boundaries

**In scope (Phase 2C):**
- `lib/subagent_wrap.py` — pure `wrap_subagent_query(query, task_num)` function
- `--query-style {user-facing,subagent}` flag on `run_eval_sandbox.py`
- Same flag forwarded through `bin/eval-sandboxed` and `bin/eval-sandboxed-matrix`
- Output filename ALWAYS includes the style suffix (`<skill>-sandboxed-<config>-<style>-<ts>.json`)
- First subagent-style matrix run: `eval-set-v3` × `[subtext-only, subtext-plus-superpowers]` at `runs_per_query=1`
- Validation writeup comparing Phase 2C subagent-style matrix to Phase 2B user-facing matrix

**Out of scope (deferred to later phases):**
- Both-styles-in-one-run matrix (Phase 3)
- Caching / parallelism (Phase 3)
- Detecting *which* skill triggered (not just whether `subtext:proof` did) — broader feature work
- Subagent-style queries in `eval-set-v3.json` itself (currently 2 of the 30 are pre-wrapped; Phase 2C wraps ALL 30)

**Deliberately preserved:**
- `eval-set-v3.json` unchanged
- `lib/sandbox_runner.py` unchanged (wrapping happens upstream in `run_eval_sandbox`)
- `lib/matrix.py` unchanged (matrix consumes per-config result JSONs regardless of style)
- All existing tests (24/24) must continue to pass

---

## File Structure

**Files created:**
- `tools/skill-eval/lib/subagent_wrap.py` — pure wrap function
- `tools/skill-eval/tests/test_subagent_wrap.py` — pytest suite for the wrap function

**Files modified:**
- `tools/skill-eval/lib/run_eval_sandbox.py` — add `--query-style` argparse flag, conditionally wrap queries before dispatching to `run_query_in_sandbox`
- `tools/skill-eval/tests/test_run_eval_sandbox.py` — add a test verifying the wrapping integration
- `tools/skill-eval/bin/eval-sandboxed` — accept `--query-style`, forward, append style to output filename
- `tools/skill-eval/bin/eval-sandboxed-matrix` — accept `--query-style`, forward, look up per-config result file with style-aware glob
- `tools/skill-eval/sandbox/README.md` — append Phase 2C validation section

**Important behavior change:** result filenames now ALWAYS include the style suffix. Phase 2B-era filenames (`proof-sandboxed-subtext-only-<ts>.json` without style suffix) become a one-time rename. The Phase 2B matrix file (`proof-matrix-20260424T192616.json`) is unaffected — matrix files were always named without per-style. Result files in `skills/proof/evals/results/` are gitignored, so no permanent reference to the old naming.

---

## Testing strategy

- **TDD-able (8 tests):** `subagent_wrap.py` is a pure function — tests cover task framing, query embedding, conditional TDD phrasing (matches SP's literal `(following TDD if task says to)`), absence of unconditional TDD anchoring, structural Your Job numbered list, default and custom task numbers, special-char handling.
- **Integration test (2 new tests):** `run_eval_sandbox.py` integration — mock `run_query_in_sandbox`, verify it receives a wrapped query when `query_style="subagent"` and the original query when `query_style="user-facing"`.
- **Manual verification:** smoke test the bash flag forwarding (already-validated pattern from Phase 2B Task 3).
- **Live verification:** Task 5's matrix run against real `claude -p`.
- **Full suite stays green:** 24 prior + 8 wrap tests + 2 integration tests = 34 passing pytest.

---

## Task 1: TDD `lib/subagent_wrap.py`

**Files:**
- Create: `tools/skill-eval/lib/subagent_wrap.py`
- Create: `tools/skill-eval/tests/test_subagent_wrap.py`

The wrap function takes a user-facing query string and returns a subagent-dispatch-style prompt that mirrors the shape of prompts dispatched by Superpowers' `subagent-driven-development` workflow.

### Step 1: Write the failing tests

Create `tools/skill-eval/tests/test_subagent_wrap.py`:

```python
"""Unit tests for lib.subagent_wrap.

Verifies the subagent-dispatch-prompt template embeds the original query and
mirrors the shape used by Superpowers' subagent-driven-development workflow.
"""

from lib.subagent_wrap import wrap_subagent_query


def test_wrap_includes_task_framing():
    out = wrap_subagent_query("Add input validation to the signup form")
    assert out.startswith("You are implementing Task 1.")


def test_wrap_includes_original_query():
    query = "Refactor the auth middleware"
    out = wrap_subagent_query(query)
    assert query in out


def test_wrap_uses_conditional_tdd_phrasing():
    """The wrap mirrors SP's literal `(following TDD if task says to)` —
    TDD is conditional on the task, not anchored unconditionally on every
    dispatched query. Critical: anchoring would confound subagent-shape
    signal with the TDD-cue effect we already measured in Phase 2B.
    """
    out = wrap_subagent_query("Fix the modal close button")
    assert "following TDD if task says to" in out


def test_wrap_does_not_unconditionally_anchor_on_tdd():
    """Guard against accidentally re-introducing a `Follow TDD` directive
    that would skew routing across all 30 queries toward TDD.
    """
    out = wrap_subagent_query("Add a retry loop")
    # No top-level imperative "Follow TDD" directive (only the conditional one inside the numbered list)
    assert "Follow TDD" not in out


def test_wrap_includes_your_job_numbered_list():
    """Mirrors SP's structural elements — '## Your Job' header + numbered list."""
    out = wrap_subagent_query("Add input validation")
    assert "## Your Job" in out
    assert "1. Implement" in out
    assert "2. Write tests" in out


def test_wrap_default_task_num_is_one():
    out = wrap_subagent_query("Add a retry loop")
    assert "Task 1." in out
    assert "Task 2." not in out


def test_wrap_custom_task_num():
    out = wrap_subagent_query("Add a retry loop", task_num=7)
    assert "Task 7." in out


def test_wrap_handles_query_with_special_chars():
    """Queries can contain $, backticks, and newlines without breaking the wrap."""
    query = "Rename `data` to `payload`; cost: $5\nin tokens"
    out = wrap_subagent_query(query)
    assert query in out
    assert "Task 1." in out
```

### Step 2: Run tests to verify failure

```bash
cd /Users/chip/src/subtext/.worktrees/skill-eval-harness/tools/skill-eval
./venv/bin/pytest tests/test_subagent_wrap.py -v 2>&1 | tail -10
```

Expected: `ModuleNotFoundError: No module named 'lib.subagent_wrap'` for all 6 tests.

### Step 3: Implement the wrap function

Create `tools/skill-eval/lib/subagent_wrap.py`:

```python
"""Subagent-dispatch-prompt wrapping for skill-eval.

When the harness runs in --query-style subagent mode, each query gets wrapped
in a subagent-dispatch template before being sent to claude -p. This measures
how skill-loader routing differs between user-typed prompts and framework-
dispatched subagent prompts — the routing surface that matters most for
flows like Superpowers' subagent-driven-development.

The template mirrors the shape of subagent prompts that those frameworks
actually dispatch:
  - 'You are implementing Task N.' framing
  - The original query as Task Description
  - A short TDD-flavored 'Your Job' instruction
  - Status-report sign-off

Pure stdlib. No subprocess. Used by lib.run_eval_sandbox.
"""

from __future__ import annotations


SUBAGENT_TEMPLATE = """You are implementing Task {task_num}.

## Task Description

{query}

## Your Job

1. Implement exactly what the task specifies
2. Write tests (following TDD if task says to)
3. Verify implementation works
4. Commit your work
5. Self-review
6. Report back

Work from the current directory.

When done, report status (DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT), files changed, test results, and any concerns."""


def wrap_subagent_query(query: str, task_num: int = 1) -> str:
    """Wrap a user-facing query in a subagent-dispatch-prompt template.

    The template faithfully mirrors SP's
    skills/subagent-driven-development/implementer-prompt.md — including the
    conditional TDD phrasing `(following TDD if task says to)`. We deliberately
    do NOT anchor on unconditional 'Follow TDD' framing — Phase 2B showed
    that explicit TDD cues cost proof routing wins to
    superpowers:test-driven-development, and we want to measure subagent-shape
    signal cleanly without that confounder.

    Args:
        query: the original user-facing query (as it appears in the eval-set).
        task_num: the task number to embed in the prompt header. Default 1.
            The eval orchestrator typically passes the 1-indexed query position
            so each wrapped prompt has a slightly different header — closer to
            how real subagent dispatches reference plan task numbers.

    Returns:
        A subagent-dispatch-style prompt that embeds the original query and
        leaves work-style framing (TDD or otherwise) conditional on what the
        original query asks for.
    """
    return SUBAGENT_TEMPLATE.format(task_num=task_num, query=query)
```

### Step 4: Run tests to verify pass

```bash
./venv/bin/pytest tests/test_subagent_wrap.py -v 2>&1 | tail -10
```

Expected: 8 passed.

### Step 5: Full suite for regressions

```bash
./venv/bin/pytest tests/ -v 2>&1 | tail -3
```

Expected: 32 passed (24 prior + 8 new).

### Step 6: Commit

```bash
cd /Users/chip/src/subtext/.worktrees/skill-eval-harness
git add tools/skill-eval/lib/subagent_wrap.py tools/skill-eval/tests/test_subagent_wrap.py
git commit -m "feat(skill-eval): add subagent-dispatch-prompt wrap function

lib.subagent_wrap.wrap_subagent_query takes a user-facing query and returns
a subagent-dispatch-style prompt that faithfully mirrors SP's
skills/subagent-driven-development/implementer-prompt.md: 'You are
implementing Task N.' framing + Task Description + a Your Job numbered
list with SP's literal phrasing including '(following TDD if task
says to)' as the conditional — NOT an unconditional 'Follow TDD'
directive.

Why the conditional matters: Phase 2B showed that explicit 'Follow TDD'
cues in queries cost proof routing wins to
superpowers:test-driven-development. Anchoring every Phase 2C wrapped
query on 'Follow TDD' would confound subagent-shape signal with the
TDD-cue effect we already measured. Two tests guard against accidental
re-introduction of the unconditional anchor.

Used by Phase 2C's --query-style subagent mode to measure how
skill-loader routing differs between user-typed prompts (default) and
framework-dispatched subagent prompts.

8 unit tests: task framing, query embedding, conditional TDD phrasing,
absence of unconditional TDD anchor, structural Your Job numbered list,
default and custom task numbers, special-char handling."
```

---

## Task 2: Wire `--query-style` into `lib/run_eval_sandbox.py`

**Files:**
- Modify: `tools/skill-eval/lib/run_eval_sandbox.py`
- Modify: `tools/skill-eval/tests/test_run_eval_sandbox.py`

The orchestrator's per-query loop becomes responsible for choosing whether to wrap. Default is `user-facing` (no wrapping, backward compatible).

### Step 1: Write the failing integration test

Add this test at the end of `tools/skill-eval/tests/test_run_eval_sandbox.py` (before any existing trailing newline or end-of-file):

```python
def test_subagent_query_style_wraps_query_before_dispatch():
    """When query_style='subagent', run_query_in_sandbox should receive a
    wrapped prompt (not the raw query). The wrap is verified by checking the
    'You are implementing Task' framing in the dispatched query."""
    eval_set = [{"query": "Add input validation", "should_trigger": True}]
    captured_queries = []

    def capture_query(**kwargs):
        captured_queries.append(kwargs["query"])
        return _res(True)

    with patch("lib.run_eval_sandbox.run_query_in_sandbox", side_effect=capture_query):
        run_eval_over_sandbox(
            eval_set=eval_set,
            skill_name="subtext:proof",
            description="desc",
            plugin_source_path="/host/subtext",
            runs_per_query=1,
            query_style="subagent",
        )
    assert len(captured_queries) == 1
    assert captured_queries[0].startswith("You are implementing Task")
    assert "Add input validation" in captured_queries[0]


def test_user_facing_query_style_passes_query_unchanged():
    """When query_style='user-facing' (default), run_query_in_sandbox should
    receive the raw query unchanged."""
    eval_set = [{"query": "Add input validation", "should_trigger": True}]
    captured_queries = []

    def capture_query(**kwargs):
        captured_queries.append(kwargs["query"])
        return _res(True)

    with patch("lib.run_eval_sandbox.run_query_in_sandbox", side_effect=capture_query):
        run_eval_over_sandbox(
            eval_set=eval_set,
            skill_name="subtext:proof",
            description="desc",
            plugin_source_path="/host/subtext",
            runs_per_query=1,
            # query_style defaults to user-facing
        )
    assert captured_queries == ["Add input validation"]
```

### Step 2: Run tests to verify failure

```bash
./venv/bin/pytest tests/test_run_eval_sandbox.py -v 2>&1 | tail -15
```

Expected: 2 new tests fail with `TypeError: ... got an unexpected keyword argument 'query_style'` (because `run_eval_over_sandbox` doesn't accept that arg yet).

### Step 3: Add `query_style` parameter to `run_eval_over_sandbox`

Open `tools/skill-eval/lib/run_eval_sandbox.py`. Find `run_eval_over_sandbox`'s signature:

```python
def run_eval_over_sandbox(
    eval_set: list[dict],
    skill_name: str,
    description: str,
    plugin_source_path: str,
    runs_per_query: int = 3,
    trigger_threshold: float = 0.5,
    model: str | None = None,
    timeout_s: int = 180,
    verbose: bool = False,
) -> dict:
```

Use Edit. Add `query_style` param + import:

- `old_string`:
```
from lib.sandbox_runner import run_query_in_sandbox, SandboxResult


def _parse_skill_md(skill_path: Path) -> tuple[str, str]:
```

- `new_string`:
```
from lib.sandbox_runner import run_query_in_sandbox, SandboxResult
from lib.subagent_wrap import wrap_subagent_query


def _parse_skill_md(skill_path: Path) -> tuple[str, str]:
```

Now add the parameter and use it in the loop. Find the `run_eval_over_sandbox` signature and modify it:

- `old_string`:
```
def run_eval_over_sandbox(
    eval_set: list[dict],
    skill_name: str,
    description: str,
    plugin_source_path: str,
    runs_per_query: int = 3,
    trigger_threshold: float = 0.5,
    model: str | None = None,
    timeout_s: int = 180,
    verbose: bool = False,
) -> dict:
```

- `new_string`:
```
def run_eval_over_sandbox(
    eval_set: list[dict],
    skill_name: str,
    description: str,
    plugin_source_path: str,
    runs_per_query: int = 3,
    trigger_threshold: float = 0.5,
    model: str | None = None,
    timeout_s: int = 180,
    verbose: bool = False,
    query_style: str = "user-facing",
) -> dict:
```

Now find the inner loop where `run_query_in_sandbox` is called:

- `old_string`:
```
            try:
                r: SandboxResult = run_query_in_sandbox(
                    query=item["query"],
                    clean_name=clean_name,
                    description=description,
                    plugin_source_path=plugin_source_path,
                    timeout_s=timeout_s,
                    model=model,
                )
```

- `new_string`:
```
            try:
                # Phase 2C: optionally wrap the query as a subagent-dispatch
                # prompt to measure framework-flow routing surface.
                effective_query = (
                    wrap_subagent_query(item["query"], task_num=item_index + 1)
                    if query_style == "subagent"
                    else item["query"]
                )
                r: SandboxResult = run_query_in_sandbox(
                    query=effective_query,
                    clean_name=clean_name,
                    description=description,
                    plugin_source_path=plugin_source_path,
                    timeout_s=timeout_s,
                    model=model,
                )
```

The new code references `item_index`. We need to introduce that. Find the outer for-loop:

- `old_string`:
```
    results = []
    for item in eval_set:
        triggers = 0
```

- `new_string`:
```
    results = []
    for item_index, item in enumerate(eval_set):
        triggers = 0
```

### Step 4: Add CLI argparse for `--query-style`

Find the `main()` function in `run_eval_sandbox.py`. Find the existing argparse calls:

- `old_string`:
```
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()
```

- `new_string`:
```
    parser.add_argument("--verbose", action="store_true")
    parser.add_argument(
        "--query-style",
        choices=["user-facing", "subagent"],
        default="user-facing",
        help="user-facing (default): pass queries to claude -p as-is. "
             "subagent: wrap each query in a subagent-dispatch-prompt template "
             "to measure framework-flow routing surface.",
    )
    args = parser.parse_args()
```

Find the `run_eval_over_sandbox` call inside `main()` and pass `query_style` through:

- `old_string`:
```
    output = run_eval_over_sandbox(
        eval_set=eval_set,
        skill_name=skill_name,
        description=description,
        plugin_source_path=str(Path(args.plugin_source).resolve()),
        runs_per_query=args.runs_per_query,
        trigger_threshold=args.trigger_threshold,
        timeout_s=args.timeout,
        model=args.model,
        verbose=args.verbose,
    )
```

- `new_string`:
```
    output = run_eval_over_sandbox(
        eval_set=eval_set,
        skill_name=skill_name,
        description=description,
        plugin_source_path=str(Path(args.plugin_source).resolve()),
        runs_per_query=args.runs_per_query,
        trigger_threshold=args.trigger_threshold,
        timeout_s=args.timeout,
        model=args.model,
        verbose=args.verbose,
        query_style=args.query_style,
    )
```

### Step 5: Run tests

```bash
cd tools/skill-eval
./venv/bin/pytest tests/test_run_eval_sandbox.py -v 2>&1 | tail -10
```

Expected: 8 passed (6 prior + 2 new in this file).

```bash
./venv/bin/pytest tests/ -v 2>&1 | tail -3
```

Expected: 34 passed (24 prior + 8 from Task 1 + 2 from Task 2).

### Step 6: Smoke-test CLI

```bash
./venv/bin/python -m lib.run_eval_sandbox --help 2>&1 | grep -A 2 "query-style"
```

Expected: `--query-style {user-facing,subagent}` with the choices listed.

### Step 7: Commit

```bash
cd /Users/chip/src/subtext/.worktrees/skill-eval-harness
git add tools/skill-eval/lib/run_eval_sandbox.py tools/skill-eval/tests/test_run_eval_sandbox.py
git commit -m "feat(skill-eval): --query-style flag on run_eval_sandbox

Adds --query-style {user-facing,subagent} flag to run_eval_sandbox CLI and
the corresponding query_style parameter on run_eval_over_sandbox(). When
'subagent', each query is wrapped via lib.subagent_wrap.wrap_subagent_query
before dispatch.

Default 'user-facing' preserves Phase 2B behavior (no wrapping). 2 new
integration tests verify both modes route to the correct dispatch query."
```

---

## Task 3: Forward `--query-style` through `bin/eval-sandboxed` + style-aware filename

**Files:**
- Modify: `tools/skill-eval/bin/eval-sandboxed`

The wrapper accepts `--query-style`, forwards it to `python -m lib.run_eval_sandbox`, and includes the style in the output filename ALWAYS (so subagent-style and user-facing runs don't collide on disk).

### Step 1: Read current eval-sandboxed structure

```bash
cat /Users/chip/src/subtext/.worktrees/skill-eval-harness/tools/skill-eval/bin/eval-sandboxed
```

The current arg-parsing loop accepts `--config`. Add `--query-style` to the same loop.

### Step 2: Edit arg parsing to accept `--query-style`

Use Edit. Find the existing arg-parsing block:

- `old_string`:
```
CONFIG="subtext-only"
FORWARDED_ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --config)
      CONFIG="$2"
      shift 2
      ;;
    --config=*)
      CONFIG="${1#*=}"
      shift
      ;;
    *)
      FORWARDED_ARGS+=("$1")
      shift
      ;;
  esac
done
```

- `new_string`:
```
CONFIG="subtext-only"
QUERY_STYLE="user-facing"
FORWARDED_ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --config)
      CONFIG="$2"
      shift 2
      ;;
    --config=*)
      CONFIG="${1#*=}"
      shift
      ;;
    --query-style)
      QUERY_STYLE="$2"
      shift 2
      ;;
    --query-style=*)
      QUERY_STYLE="${1#*=}"
      shift
      ;;
    *)
      FORWARDED_ARGS+=("$1")
      shift
      ;;
  esac
done

case "$QUERY_STYLE" in
  user-facing|subagent) ;;
  *)
    echo "Error: unknown --query-style '$QUERY_STYLE'" >&2
    echo "Known styles: user-facing, subagent" >&2
    exit 1
    ;;
esac
```

### Step 3: Update output filename to include the style

Find the existing OUT path construction:

- `old_string`:
```
mkdir -p "$RESULTS_DIR"
TIMESTAMP="$(date +%Y%m%dT%H%M%S)"
OUT="$RESULTS_DIR/${SKILL_NAME}-sandboxed-${CONFIG}-${TIMESTAMP}.json"
```

- `new_string`:
```
mkdir -p "$RESULTS_DIR"
TIMESTAMP="$(date +%Y%m%dT%H%M%S)"
OUT="$RESULTS_DIR/${SKILL_NAME}-sandboxed-${CONFIG}-${QUERY_STYLE}-${TIMESTAMP}.json"
```

### Step 4: Update the banner to show query-style

Find the banner block:

- `old_string`:
```
echo "Running sandbox eval for '$SKILL_NAME'"
echo "  config:       $CONFIG"
echo "  image:        $IMAGE"
echo "  skill:        $SKILL_PATH"
echo "  eval-set:     $EVAL_SET"
echo "  plugin src:   $PLUGIN_SOURCE"
echo "  output:       $OUT"
echo
```

- `new_string`:
```
echo "Running sandbox eval for '$SKILL_NAME'"
echo "  config:       $CONFIG"
echo "  query style:  $QUERY_STYLE"
echo "  image:        $IMAGE"
echo "  skill:        $SKILL_PATH"
echo "  eval-set:     $EVAL_SET"
echo "  plugin src:   $PLUGIN_SOURCE"
echo "  output:       $OUT"
echo
```

### Step 5: Forward `--query-style` to the Python module

Find the python invocation:

- `old_string`:
```
cd "$HARNESS_DIR"
SANDBOX_IMAGE="$IMAGE" "$PYTHON_BIN" -m lib.run_eval_sandbox \
  --skill-path "$SKILL_PATH" \
  --eval-set "$EVAL_SET" \
  --plugin-source "$PLUGIN_SOURCE" \
  --verbose \
  "${FORWARDED_ARGS[@]}" \
  | tee "$OUT"
```

- `new_string`:
```
cd "$HARNESS_DIR"
SANDBOX_IMAGE="$IMAGE" "$PYTHON_BIN" -m lib.run_eval_sandbox \
  --skill-path "$SKILL_PATH" \
  --eval-set "$EVAL_SET" \
  --plugin-source "$PLUGIN_SOURCE" \
  --query-style "$QUERY_STYLE" \
  --verbose \
  "${FORWARDED_ARGS[@]}" \
  | tee "$OUT"
```

### Step 6: Smoke-test error paths and banner

```bash
cd /Users/chip/src/subtext/.worktrees/skill-eval-harness
# Usage banner
./tools/skill-eval/bin/eval-sandboxed 2>&1 | head -3
# Expected: Usage: eval-sandboxed <skill-name> [--config <name>] [extra args...]

# Unknown query-style rejected
./tools/skill-eval/bin/eval-sandboxed proof --query-style bogus 2>&1 | head -3
# Expected: Error: unknown --query-style 'bogus'
```

### Step 7: Smoke-test that the banner shows query-style

```bash
set -a; source /Users/chip/src/subtext/bench/.env.local; set +a
./tools/skill-eval/bin/eval-sandboxed proof --config subtext-only --query-style subagent 2>&1 | head -10 &
PID=$!
sleep 5 && kill $PID 2>/dev/null
wait 2>/dev/null
# Expected: banner shows 'query style:  subagent' line and output filename
# contains '-subagent-'
```

### Step 8: Commit

```bash
git add tools/skill-eval/bin/eval-sandboxed
git commit -m "feat(skill-eval): --query-style flag on bin/eval-sandboxed

Forwards --query-style {user-facing,subagent} to the Python module.
Output filename ALWAYS includes the style suffix:
  proof-sandboxed-subtext-only-user-facing-<ts>.json
  proof-sandboxed-subtext-only-subagent-<ts>.json

Breaking change vs Phase 2B: result files now always carry the style
suffix. Phase 2B-era files (without suffix) remain on disk but are
gitignored anyway. Downstream tools (matrix wrapper) updated separately."
```

---

## Task 4: Forward `--query-style` through `bin/eval-sandboxed-matrix`

**Files:**
- Modify: `tools/skill-eval/bin/eval-sandboxed-matrix`

### Step 1: Read current matrix wrapper

```bash
cat /Users/chip/src/subtext/.worktrees/skill-eval-harness/tools/skill-eval/bin/eval-sandboxed-matrix
```

### Step 2: Add `--query-style` to arg parsing

Use Edit. Find the arg-parsing block:

- `old_string`:
```
CONFIGS="subtext-only,subtext-plus-superpowers"
FORWARDED_ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --configs)
      CONFIGS="$2"
      shift 2
      ;;
    --configs=*)
      CONFIGS="${1#*=}"
      shift
      ;;
    *)
      FORWARDED_ARGS+=("$1")
      shift
      ;;
  esac
done
```

- `new_string`:
```
CONFIGS="subtext-only,subtext-plus-superpowers"
QUERY_STYLE="user-facing"
FORWARDED_ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --configs)
      CONFIGS="$2"
      shift 2
      ;;
    --configs=*)
      CONFIGS="${1#*=}"
      shift
      ;;
    --query-style)
      QUERY_STYLE="$2"
      shift 2
      ;;
    --query-style=*)
      QUERY_STYLE="${1#*=}"
      shift
      ;;
    *)
      FORWARDED_ARGS+=("$1")
      shift
      ;;
  esac
done
```

### Step 3: Update the per-config dispatch + lookup glob

Find the per-config loop:

- `old_string`:
```
for cfg in "${CONFIG_ARRAY[@]}"; do
  echo "=== Running config: $cfg ==="
  "$SCRIPT_DIR/eval-sandboxed" "$SKILL_NAME" --config "$cfg" "${FORWARDED_ARGS[@]}"
  # The most recent result file for this config.
  LATEST="$(ls -t "$RESULTS_DIR"/"$SKILL_NAME"-sandboxed-"$cfg"-*.json 2>/dev/null | head -1)"
```

- `new_string`:
```
for cfg in "${CONFIG_ARRAY[@]}"; do
  echo "=== Running config: $cfg (query-style: $QUERY_STYLE) ==="
  "$SCRIPT_DIR/eval-sandboxed" "$SKILL_NAME" --config "$cfg" --query-style "$QUERY_STYLE" "${FORWARDED_ARGS[@]}"
  # The most recent result file for this config + style.
  LATEST="$(ls -t "$RESULTS_DIR"/"$SKILL_NAME"-sandboxed-"$cfg"-"$QUERY_STYLE"-*.json 2>/dev/null | head -1)"
```

### Step 4: Update the matrix output filename to include the style

Find the matrix file naming:

- `old_string`:
```
MATRIX_JSON="$RESULTS_DIR/${SKILL_NAME}-matrix-${TIMESTAMP}.json"
MATRIX_MD="$RESULTS_DIR/${SKILL_NAME}-matrix-${TIMESTAMP}.md"
```

- `new_string`:
```
MATRIX_JSON="$RESULTS_DIR/${SKILL_NAME}-matrix-${QUERY_STYLE}-${TIMESTAMP}.json"
MATRIX_MD="$RESULTS_DIR/${SKILL_NAME}-matrix-${QUERY_STYLE}-${TIMESTAMP}.md"
```

### Step 5: Update banner

Find the banner line:

- `old_string`:
```
echo "Matrix eval for '$SKILL_NAME' across configs: $CONFIGS"
echo
```

- `new_string`:
```
echo "Matrix eval for '$SKILL_NAME' across configs: $CONFIGS"
echo "Query style: $QUERY_STYLE"
echo
```

### Step 6: Smoke-test the wrapper

```bash
cd /Users/chip/src/subtext/.worktrees/skill-eval-harness
./tools/skill-eval/bin/eval-sandboxed-matrix 2>&1 | head -3
# Expected: Usage banner

./tools/skill-eval/bin/eval-sandboxed-matrix proof --query-style bogus 2>&1 | head -5
# Expected: error from eval-sandboxed (unknown query-style) — propagates up
# because of set -e
```

### Step 7: Commit

```bash
git add tools/skill-eval/bin/eval-sandboxed-matrix
git commit -m "feat(skill-eval): --query-style flag on bin/eval-sandboxed-matrix

Forwards --query-style to each per-config eval-sandboxed call. Per-config
result-file lookup now uses the style-aware glob:
  <skill>-sandboxed-<cfg>-<style>-*.json

Matrix output filename also includes the style:
  <skill>-matrix-<style>-<ts>.{json,md}

Default --query-style user-facing matches Phase 2B behavior."
```

---

## Task 5: Run subagent-style matrix live

**Files:** records output under `skills/proof/evals/results/`. Gitignored.

This is a ~60 minute background run, mirroring Phase 2B Task 7's pattern.

### Step 1: Source API key

```bash
cd /Users/chip/src/subtext/.worktrees/skill-eval-harness
set -a; source /Users/chip/src/subtext/bench/.env.local; set +a
echo "key length: ${#ANTHROPIC_API_KEY}"
```

Expected: non-zero length.

### Step 2: Verify both images exist

```bash
docker images | grep subtext-sandbox-claude
```

Expected:
```
subtext-sandbox-claude                  latest    ...
subtext-sandbox-claude-superpowers      latest    ...
```

If either is missing, build via `./tools/skill-eval/sandbox/build.sh --config <name>`.

### Step 3: Launch the subagent-style matrix run

```bash
time ./tools/skill-eval/bin/eval-sandboxed-matrix proof --query-style subagent --runs-per-query 1 --timeout 300 > /tmp/matrix-subagent-run.log 2>&1 &
echo "PID: $!"
```

This dispatches the matrix in the background. Expected runtime: ~60 minutes (2 configs × 30 queries × ~58s/query).

### Step 4: Monitor progress

```bash
tail -10 /tmp/matrix-subagent-run.log
grep -c 'run 1/1' /tmp/matrix-subagent-run.log   # 60 = done
pgrep -f "eval-sandboxed-matrix" && echo "(still running)" || echo "(finished)"
```

The matrix is done when pgrep returns empty and the log ends with `Matrix written to: ...`.

### Step 5: Inspect the matrix output

```bash
MATRIX_JSON=$(ls -t skills/proof/evals/results/proof-matrix-subagent-*.json | head -1)
MATRIX_MD=$(ls -t skills/proof/evals/results/proof-matrix-subagent-*.md | head -1)
echo "JSON:     $MATRIX_JSON"
echo "Markdown: $MATRIX_MD"
echo
cat "$MATRIX_MD"
```

Expected output: summary table (2 configs, subagent-style), per-query table, divergences list.

Record the matrix filename, per-config pass counts, and divergences for Task 6.

### Step 6: No commit

Result files are gitignored.

---

## Task 6: Update `sandbox/README.md` with Phase 2C subagent-style validation

**Files:**
- Modify: `tools/skill-eval/sandbox/README.md`

Append a new Phase 2C validation section. Compare the subagent-style numbers against the Phase 2B user-facing numbers to surface what changes when the prompts are reframed as subagent dispatches.

### Step 1: Inspect the existing structure

```bash
grep -n '^##' tools/skill-eval/sandbox/README.md
```

Phase 2A and Phase 2B sections should both be visible. Phase 2C goes after Phase 2B.

### Step 2: Append Phase 2C section

Find the end of the Phase 2B Validation section (last line is the Environment line). Use Edit.

- `old_string`:
```
Environment: docker images `subtext-sandbox-claude:latest`, `subtext-sandbox-claude-superpowers:latest`, `Darwin arm64 (Apple Silicon)` host.
```

- `new_string`:
```
Environment: docker images `subtext-sandbox-claude:latest`, `subtext-sandbox-claude-superpowers:latest`, `Darwin arm64 (Apple Silicon)` host.

## Validation (Phase 2C subagent-style matrix, <fill-in date>)

Same matrix as Phase 2B (`eval-set-v3` × `[subtext-only, subtext-plus-superpowers]`, `runs_per_query=1`), with each query wrapped in a subagent-dispatch-prompt template via `--query-style subagent`. Tests how skill-loader routing differs between user-typed prompts (Phase 2B) and framework-dispatched subagent prompts (this section).

### Per-config summary

| Config | Passed (subagent) | Passed (user-facing, from 2B) | Delta |
|---|---|---|---|
| subtext-only | <fill-in>/30 | 16/30 | <fill-in> |
| subtext-plus-superpowers | <fill-in>/30 | 14/30 | <fill-in> |

Matrix JSON: `skills/proof/evals/results/<fill-in filename>`
Matrix markdown: `skills/proof/evals/results/<fill-in filename>`

### Divergences (≥0.5 trigger-rate gap, subagent-style only)

<fill-in from matrix markdown — or "No divergences at this threshold." if empty>

### How subagent-style framing changes routing

<fill-in 2-4 bullets based on cross-reference between subagent and user-facing matrices. Examples to adapt:>

- "Queries that triggered proof in user-facing mode but did NOT in subagent mode: <list>. Subagent shape alone (without explicit framework cues — see `lib/subagent_wrap.py`'s docstring) is sufficient to redirect routing. Hypothesis: the 'You are implementing Task N' framing makes the implementation phase explicit enough that SP's TDD picks up on the conditional `(following TDD if task says to)` clause."
- "Queries that did NOT trigger proof in user-facing but DID in subagent: <list>. Likely cause: the 'You are implementing Task N' framing makes the implementation phase explicit, helping proof's MUST description fire."
- "Net effect of subagent framing on subtext-only: <e.g., +/- N positives>. On subtext-plus-superpowers: <e.g., +/- N positives>."

### Phase 2C conclusion

<fill-in 1-2 sentences>:
- If subagent-style numbers are MEANINGFULLY worse than user-facing on subtext-plus-superpowers (e.g., -5 or more positives lost): Phase 3 priority should be measuring exactly which SP skill wins each routing contest (a new harness feature).
- If subagent-style numbers are about the same: the MUST description survives subagent framing well; the Phase 2B "Follow TDD" routing loss was an isolated explicit-cue case (a query that literally said "Follow TDD"), not a general consequence of subagent shape itself.

Environment: docker images `subtext-sandbox-claude:latest`, `subtext-sandbox-claude-superpowers:latest`, `Darwin arm64 (Apple Silicon)` host.
```

### Step 3: Fill in placeholders from Task 5's output

Edit each `<fill-in>` with real values from Task 5. The matrix markdown file is the source of truth.

### Step 4: Verify no `<fill-in>` placeholders remain

```bash
grep '<fill-in>' tools/skill-eval/sandbox/README.md && echo "STILL HAS PLACEHOLDERS" || echo "OK: no placeholders"
```

Expected: `OK: no placeholders`.

### Step 5: Commit

```bash
git add tools/skill-eval/sandbox/README.md
git commit -m "docs(skill-eval): record Phase 2C subagent-style matrix baseline

Same matrix as Phase 2B (eval-set-v3 × subtext-only + subtext-plus-superpowers
at n=1) with --query-style subagent so each query is wrapped in a
subagent-dispatch-prompt template before dispatch. Documents per-config
pass counts, deltas vs Phase 2B user-facing, divergences, and the
Phase 3 priority signal."
```

---

## Final review

- [ ] **Run the full test suite**

```bash
cd tools/skill-eval
./venv/bin/pytest tests/ -v 2>&1 | tail -3
```

Expected: 34 passed (24 prior + 8 from Task 1 + 2 from Task 2).

- [ ] **Verify wrappers accept `--query-style`**

```bash
./tools/skill-eval/bin/eval-sandboxed --query-style bogus proof 2>&1 | head -3
./tools/skill-eval/bin/eval-sandboxed-matrix --query-style bogus proof 2>&1 | head -5
./tools/skill-eval/venv/bin/python -m lib.run_eval_sandbox --help 2>&1 | grep query-style
```

Expected: errors propagate from each level.

- [ ] **Vendored scripts unchanged**

```bash
cd /Users/chip/src/subtext/.worktrees/skill-eval-harness
git diff origin/main -- tools/skill-eval/vendor/ | wc -l
```

Expected: `0`.

---

## Phase 3 roadmap (separate plan)

Once Phase 2C's numbers are in:

- **Phase 3 — Caching + parallelism.** Two-stage Dockerfile (`Dockerfile.base` cached per config-hash, `Dockerfile.query` thin layer). Worker pool inside `run_eval_sandbox.py`. Target: 30 queries × 3 runs × N configs × M query-styles in <10 minutes total. The `--query-style` flag remains; what changes is being able to run BOTH styles in a single sweep cheaply.

- **Optional Phase 4 work — *which* skill triggered.** The current detector returns a `bool`. A future feature would parse the assistant message to identify the WINNING skill name, not just whether `subtext:proof` won. Useful when matrix divergences point at "SP took this routing win — but which SP skill?"

Both deferred to their own plans once Phase 2C closes.
