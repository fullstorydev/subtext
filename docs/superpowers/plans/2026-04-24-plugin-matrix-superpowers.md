# Plugin Matrix (Superpowers First) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the sandbox eval harness with a plugin-matrix capability: run the same eval-set under multiple plugin configurations (starting with `subtext-only` vs `subtext-plus-superpowers`) and produce a consolidated matrix output (JSON + markdown) so we can see where MUST routing contests are won or lost when other frameworks are loaded.

**Architecture:** Image-per-config rather than runtime install. A new `Dockerfile.superpowers` extends the base sandbox Dockerfile with `claude plugin install superpowers@superpowers-marketplace` at build time. `sandbox/build.sh` gains a `--config <name>` flag that picks the right Dockerfile + image tag. `bin/eval-sandboxed` gains a matching `--config` flag. A new `lib/matrix.py` loads per-config result JSONs and emits consolidated matrix JSON + markdown rendering. A new `bin/eval-sandboxed-matrix` wrapper runs the eval-set under each config in sequence and tabulates. This preserves per-query latency (no install-per-query overhead) and anticipates Phase 3's caching direction.

**Tech Stack:**
- Bash (sandbox build + wrappers)
- Docker (image per config)
- Python 3.12 + pytest (matrix aggregation module)

---

## Scope boundaries

**In scope (Phase 2B):**
- `Dockerfile.superpowers` extending the base sandbox Dockerfile with Superpowers pre-installed
- `sandbox/build.sh --config <name>` flag + config→Dockerfile/tag mapping
- `bin/eval-sandboxed --config <name>` flag + config→image-tag mapping
- `lib/matrix.py` — pure Python matrix aggregator (TDD-able)
- `bin/eval-sandboxed-matrix` — wrapper that iterates configs and produces consolidated output
- First live matrix run: `eval-set-v3` across `[subtext-only, subtext-plus-superpowers]` at `runs_per_query=1`
- `docs/skill-eval-research/framework-targets.md` — light inventory of additional plugin candidates (frontend-design, code-review, others) with collision-vector notes for future matrix expansion
- Validation writeup update in `tools/skill-eval/sandbox/README.md`

**Out of scope (future plans):**
- Additional configs beyond `subtext-plus-superpowers` — added in future PRs as we pick targets from the research doc
- Subagent-style query mode (Phase 2C — still needed)
- Caching optimizations at the per-query level (Phase 3)
- Parallelism within a single config's sweep (Phase 3)

**Deliberately preserved:**
- Existing `subtext-only` image (unchanged) remains the default image when `--config` is not passed
- `run_eval_sandbox.py` unchanged — matrix work wraps it, doesn't modify it
- Current JSON output shape per-run (backwards compatible)

---

## File Structure

**Files created:**
- `subtext-sandbox/Dockerfile.superpowers` — extends base Dockerfile with SP install layer
- `tools/skill-eval/lib/matrix.py` — matrix aggregation + markdown rendering
- `tools/skill-eval/tests/test_matrix.py` — pytest suite for matrix module
- `tools/skill-eval/tests/fixtures/matrix/config_a_result.json` — fixture: a per-config result used by matrix tests
- `tools/skill-eval/tests/fixtures/matrix/config_b_result.json` — fixture: a differing per-config result used by matrix tests
- `tools/skill-eval/bin/eval-sandboxed-matrix` — matrix orchestration wrapper
- `docs/skill-eval-research/framework-targets.md` — inventory of candidate plugin frameworks

**Files modified:**
- `tools/skill-eval/sandbox/build.sh` — add `--config` flag
- `tools/skill-eval/bin/eval-sandboxed` — add `--config` flag
- `tools/skill-eval/sandbox/README.md` — add matrix validation section

**Unchanged (by design):**
- `tools/skill-eval/lib/run_eval_sandbox.py` — matrix wraps; doesn't modify
- `tools/skill-eval/lib/sandbox_runner.py` — matrix uses by reference; doesn't modify
- `subtext-sandbox/Dockerfile` — base; `Dockerfile.superpowers` extends it

---

## Testing strategy

- **TDD-able:** `lib/matrix.py` — pure aggregation + markdown rendering logic. Fixtures simulate per-config run output.
- **Manual verification:** Dockerfile.superpowers builds + SP skills visible in `claude plugin list` inside the built container. `bin/eval-sandboxed --config subtext-plus-superpowers` smoke test.
- **Live run:** Task 7's full matrix sweep produces real numbers. Expected ~60 minutes total (2 configs × ~29 min each at n=1).
- **Full suite stays green:** the existing 17 tests must continue to pass plus the new matrix tests (~4-5 additions).

---

## Task 1: Add `--config` flag to `sandbox/build.sh` + create `Dockerfile.superpowers`

**Files:**
- Create: `subtext-sandbox/Dockerfile.superpowers`
- Modify: `tools/skill-eval/sandbox/build.sh`

- [ ] **Step 1: Read the current build.sh**

```bash
cat /Users/chip/src/subtext/.worktrees/skill-eval-harness/tools/skill-eval/sandbox/build.sh
```

Expected: a short bash script that runs `docker build --no-cache -t subtext-sandbox-claude <sandbox_dir>`.

- [ ] **Step 2: Create `Dockerfile.superpowers`**

Create `/Users/chip/src/subtext/.worktrees/skill-eval-harness/subtext-sandbox/Dockerfile.superpowers`:

```dockerfile
# Extends the base sandbox image with Superpowers pre-installed.
# Used for skill-collision matrix testing under frameworks that load MUST-tier skills.
FROM subtext-sandbox-claude:latest

# Superpowers marketplace on GitHub — public, no auth needed.
# `claude plugin marketplace add` accepts owner/repo shorthand.
RUN claude plugin marketplace add obra/superpowers-marketplace \
    && claude plugin install superpowers@superpowers-marketplace

# Sanity-check: show installed plugins at build time so build logs surface failures.
RUN claude plugin list
```

- [ ] **Step 3: Rewrite `sandbox/build.sh` with a `--config` flag**

Use the Edit tool. Replace the entire content of `/Users/chip/src/subtext/.worktrees/skill-eval-harness/tools/skill-eval/sandbox/build.sh` with:

```bash
#!/usr/bin/env bash
# Build the subtext-sandbox image tagged for skill-eval consumption.
#
# Usage:
#   ./tools/skill-eval/sandbox/build.sh                  # default: subtext-only
#   ./tools/skill-eval/sandbox/build.sh --config subtext-only
#   ./tools/skill-eval/sandbox/build.sh --config subtext-plus-superpowers
#
# Config → (dockerfile, image-tag) mapping is hardcoded here. Add a case
# below when introducing a new config. Keep this file short and explicit
# rather than growing a YAML abstraction before we have ≥3 configs.
set -euo pipefail

CONFIG="subtext-only"
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
      echo "Error: unknown argument '$1'" >&2
      echo "Usage: $(basename "$0") [--config <subtext-only|subtext-plus-superpowers>]" >&2
      exit 2
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
SANDBOX_DIR="$REPO_ROOT/subtext-sandbox"

if [ ! -d "$SANDBOX_DIR" ]; then
  echo "Error: sandbox dir not found at $SANDBOX_DIR" >&2
  exit 1
fi

case "$CONFIG" in
  subtext-only)
    DOCKERFILE="$SANDBOX_DIR/Dockerfile"
    TAG="subtext-sandbox-claude:latest"
    ;;
  subtext-plus-superpowers)
    DOCKERFILE="$SANDBOX_DIR/Dockerfile.superpowers"
    TAG="subtext-sandbox-claude-superpowers:latest"
    ;;
  *)
    echo "Error: unknown config '$CONFIG'" >&2
    echo "Known configs: subtext-only, subtext-plus-superpowers" >&2
    exit 1
    ;;
esac

echo "Building config '$CONFIG' (tag: $TAG) from $DOCKERFILE..."
docker build --no-cache -t "$TAG" -f "$DOCKERFILE" "$SANDBOX_DIR"
echo "Built $TAG"
```

- [ ] **Step 4: Verify the default config still works as before**

```bash
cd /Users/chip/src/subtext/.worktrees/skill-eval-harness
./tools/skill-eval/sandbox/build.sh 2>&1 | head -3
# Expected first line: "Building config 'subtext-only' (tag: subtext-sandbox-claude:latest) from .../subtext-sandbox/Dockerfile..."
```

Cancel with Ctrl-C after confirming the banner — no need to spend ~5 minutes rebuilding the base image just to test the flag parsing.

- [ ] **Step 5: Verify unknown config is rejected**

```bash
./tools/skill-eval/sandbox/build.sh --config bogus 2>&1 | head -3
```

Expected: `Error: unknown config 'bogus'` with exit code 1.

- [ ] **Step 6: Commit**

```bash
git add subtext-sandbox/Dockerfile.superpowers tools/skill-eval/sandbox/build.sh
git commit -m "feat(skill-eval): config-aware sandbox build + Dockerfile.superpowers

Adds a --config flag to sandbox/build.sh and a new Dockerfile.superpowers
that extends the base sandbox image with Superpowers pre-installed via
claude plugin marketplace add + plugin install. Image-per-config avoids
install-per-query overhead at eval time (~20-30s saved per query × N
queries × M configs).

Known configs so far: subtext-only (existing base image),
subtext-plus-superpowers (new, SP pre-installed). Config-to-tag mapping
is explicit case statement — no YAML abstraction until we have ≥3 configs."
```

---

## Task 2: Build `subtext-plus-superpowers` image + verify SP skills visible

**Files:** no code changes — this task builds and verifies.

- [ ] **Step 1: Source API keys (needed in case plugin install contacts anything auth-gated)**

```bash
cd /Users/chip/src/subtext/.worktrees/skill-eval-harness
set -a; source /Users/chip/src/subtext/bench/.env.local; set +a
echo "key length: ${#ANTHROPIC_API_KEY}"
```

Expected: non-zero length.

- [ ] **Step 2: Build the superpowers-augmented image**

```bash
time ./tools/skill-eval/sandbox/build.sh --config subtext-plus-superpowers 2>&1 | tail -20
```

Expected last line: `Built subtext-sandbox-claude-superpowers:latest`. Build takes ~3-5 min (clones SP marketplace during `claude plugin install`).

If the build fails on `claude plugin marketplace add obra/superpowers-marketplace`, the command syntax may differ. Check `docker run --rm subtext-sandbox-claude claude plugin marketplace --help` to find the right invocation and adjust `Dockerfile.superpowers` accordingly.

- [ ] **Step 3: Verify image + SP are installed**

```bash
docker images subtext-sandbox-claude-superpowers
# Expected: image present with recent CREATED timestamp
```

```bash
docker run --rm subtext-sandbox-claude-superpowers claude plugin list 2>&1 | head -20
# Expected: output contains 'superpowers' in the plugin list
```

- [ ] **Step 4: Verify SP skills are visible to a non-interactive claude -p**

This is the signal that matters for eval — does Claude see SP's skills when routing?

```bash
docker run --rm \
  -e ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  -e EVAL_QUERY="list available slash commands" \
  -e EVAL_CLEAN_NAME="sp-probe-test" \
  -e EVAL_DESCRIPTION="dummy probe" \
  subtext-sandbox-claude-superpowers 2>/dev/null \
  | /usr/bin/python3 -c "
import json, sys
for line in sys.stdin:
    line = line.strip()
    if not line: continue
    try: e = json.loads(line)
    except: continue
    if e.get('type') == 'system' and e.get('subtype') == 'init':
        cmds = e.get('slash_commands', [])
        sp_cmds = [c for c in cmds if c.startswith('superpowers:')]
        print(f'Total slash_commands: {len(cmds)}')
        print(f'Superpowers commands visible: {len(sp_cmds)}')
        for c in sp_cmds[:5]:
            print(f'  - {c}')
        break
"
```

Expected: `Superpowers commands visible: 15+` with names like `superpowers:brainstorming`, `superpowers:test-driven-development`, etc.

If `Superpowers commands visible: 0` despite plugin install succeeding, the skills may be loading from a path that the eval-mode entrypoint blocks (e.g., if we reset `CLAUDE_CONFIG_DIR`). Check the entrypoint and report BLOCKED if so — Phase 2B needs SP skills actually visible.

- [ ] **Step 5: No commit — this task is verification only**

---

## Task 3: Add `--config` flag to `bin/eval-sandboxed`

**Files:**
- Modify: `tools/skill-eval/bin/eval-sandboxed`

The eval-sandboxed wrapper today hardcodes the image name `subtext-sandbox-claude`. Add a `--config` flag that picks a per-config image tag, with the same config→tag mapping as `build.sh`. The result filename suffix also adjusts so `subtext-only` and `subtext-plus-superpowers` don't overwrite each other.

- [ ] **Step 1: Read the current eval-sandboxed**

```bash
cat /Users/chip/src/subtext/.worktrees/skill-eval-harness/tools/skill-eval/bin/eval-sandboxed
```

Note the `docker image inspect subtext-sandbox-claude` preflight check on line ~46 and the `OUT=.../${SKILL_NAME}-sandboxed-${TIMESTAMP}.json` line ~55.

- [ ] **Step 2: Rewrite eval-sandboxed with `--config` support**

Replace the entire file content. Use the Write tool since this is a targeted refactor. New content:

```bash
#!/usr/bin/env bash
# Run trigger eval for a subtext skill inside a subtext-sandbox container.
#
# Usage:
#   ./tools/skill-eval/bin/eval-sandboxed <skill-name> [--config <name>] [extra args...]
#
# Config selects which pre-built sandbox image to use:
#   subtext-only               (default) — image tag: subtext-sandbox-claude:latest
#   subtext-plus-superpowers   — image tag: subtext-sandbox-claude-superpowers:latest
#
# Build a config's image first with: ./tools/skill-eval/sandbox/build.sh --config <name>
#
# Environment:
#   ANTHROPIC_API_KEY  (required) — forwarded to the container
#
# Interactive sandbox mode (subtext-sandbox/run.sh) additionally requires
# FULLSTORY_API_KEY for MCP auth, but eval mode deletes the MCP manifest
# before launching claude -p, so the key isn't needed here.
#
# Extra args are forwarded to run_eval_sandbox.py after the config handling.
# Notable: --runs-per-query N, --model NAME, --verbose, --timeout S.
#
# Results written to skills/<name>/evals/results/<name>-sandboxed-<config>-<ts>.json.

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $(basename "$0") <skill-name> [--config <name>] [extra args...]" >&2
  exit 2
fi

SKILL_NAME="$1"; shift

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

case "$CONFIG" in
  subtext-only)
    IMAGE="subtext-sandbox-claude:latest"
    ;;
  subtext-plus-superpowers)
    IMAGE="subtext-sandbox-claude-superpowers:latest"
    ;;
  *)
    echo "Error: unknown config '$CONFIG'" >&2
    echo "Known configs: subtext-only, subtext-plus-superpowers" >&2
    exit 1
    ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HARNESS_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(cd "$HARNESS_DIR/../.." && pwd)"

SKILL_PATH="$REPO_ROOT/skills/$SKILL_NAME"
EVAL_SET="${EVAL_SET_OVERRIDE:-$SKILL_PATH/evals/eval-set-v3.json}"
RESULTS_DIR="$SKILL_PATH/evals/results"
PLUGIN_SOURCE="$REPO_ROOT"

if [ ! -d "$SKILL_PATH" ]; then
  echo "Error: skill not found at $SKILL_PATH" >&2
  exit 1
fi
if [ ! -f "$EVAL_SET" ]; then
  echo "Error: eval-set not found at $EVAL_SET" >&2
  exit 1
fi

if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  echo "Error: ANTHROPIC_API_KEY not set" >&2
  exit 1
fi

if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "Error: image '$IMAGE' not built. Run:" >&2
  echo "  ./tools/skill-eval/sandbox/build.sh --config $CONFIG" >&2
  exit 1
fi

mkdir -p "$RESULTS_DIR"
TIMESTAMP="$(date +%Y%m%dT%H%M%S)"
OUT="$RESULTS_DIR/${SKILL_NAME}-sandboxed-${CONFIG}-${TIMESTAMP}.json"

PYTHON_BIN="$HARNESS_DIR/venv/bin/python"
if [ ! -x "$PYTHON_BIN" ]; then PYTHON_BIN="python3"; fi

echo "Running sandbox eval for '$SKILL_NAME'"
echo "  config:       $CONFIG"
echo "  image:        $IMAGE"
echo "  skill:        $SKILL_PATH"
echo "  eval-set:     $EVAL_SET"
echo "  plugin src:   $PLUGIN_SOURCE"
echo "  output:       $OUT"
echo

cd "$HARNESS_DIR"
SANDBOX_IMAGE="$IMAGE" "$PYTHON_BIN" -m lib.run_eval_sandbox \
  --skill-path "$SKILL_PATH" \
  --eval-set "$EVAL_SET" \
  --plugin-source "$PLUGIN_SOURCE" \
  --verbose \
  "${FORWARDED_ARGS[@]}" \
  | tee "$OUT"

echo
echo "Results written to $OUT"
```

Note: the wrapper sets `SANDBOX_IMAGE="$IMAGE"` before calling `python -m lib.run_eval_sandbox`. That requires the Python side to read the image from env.

- [ ] **Step 3: Teach `lib/sandbox_runner.py` to read the image tag from env**

Open `/Users/chip/src/subtext/.worktrees/skill-eval-harness/tools/skill-eval/lib/sandbox_runner.py`. Find the `run_query_in_sandbox` signature and its `image` default.

Current (approximately):

```python
def run_query_in_sandbox(
    query: str,
    clean_name: str,
    description: str,
    plugin_source_path: str,
    timeout_s: int = 180,
    image: str = "subtext-sandbox-claude",
    model: str | None = None,
) -> SandboxResult:
```

Use Edit. Change the default image value:

- `old_string`:
```
    image: str = "subtext-sandbox-claude",
```
- `new_string`:
```
    image: str = os.environ.get("SANDBOX_IMAGE", "subtext-sandbox-claude"),
```

The `os` import is already present near the top of the file (verify first).

- [ ] **Step 4: Run the unit tests to confirm no regression**

```bash
cd tools/skill-eval
./venv/bin/pytest tests/ -v 2>&1 | tail -5
```

Expected: 17 passed (no regression).

Note: the existing `test_docker_command_shape` test doesn't assert on the specific image name — it just verifies `docker run --rm` structure and env vars — so the image default change shouldn't break it.

- [ ] **Step 5: Smoke-test error paths still work**

```bash
cd /Users/chip/src/subtext/.worktrees/skill-eval-harness
./tools/skill-eval/bin/eval-sandboxed 2>&1 | head -3
# Expected: usage banner
```

```bash
./tools/skill-eval/bin/eval-sandboxed proof --config bogus 2>&1 | head -3
# Expected: Error: unknown config 'bogus'
```

```bash
./tools/skill-eval/bin/eval-sandboxed proof --config subtext-only 2>&1 | head -8
# Expected: preflight banner showing config, image, output path
# (Cancel with Ctrl-C after seeing banner; don't run the full eval yet)
```

- [ ] **Step 6: Commit**

```bash
git add tools/skill-eval/bin/eval-sandboxed tools/skill-eval/lib/sandbox_runner.py
git commit -m "feat(skill-eval): --config flag on eval-sandboxed + env-driven image selection

Adds --config to bin/eval-sandboxed matching build.sh's flag. Maps
subtext-only → subtext-sandbox-claude:latest and
subtext-plus-superpowers → subtext-sandbox-claude-superpowers:latest.

sandbox_runner.run_query_in_sandbox now reads SANDBOX_IMAGE from env
(default subtext-sandbox-claude) so the wrapper can thread the image
choice in without changing the Python API.

Result filename includes the config so different configs don't
overwrite each other: proof-sandboxed-subtext-only-<ts>.json."
```

---

## Task 4: TDD `lib/matrix.py` (aggregation + markdown)

**Files:**
- Create: `tools/skill-eval/lib/matrix.py`
- Create: `tools/skill-eval/tests/test_matrix.py`
- Create: `tools/skill-eval/tests/fixtures/matrix/config_a_result.json`
- Create: `tools/skill-eval/tests/fixtures/matrix/config_b_result.json`

The matrix module consumes N per-config result JSONs and emits (a) a consolidated matrix JSON with `queries[].results[config] → {trigger_rate, triggers, runs, pass, errors}` and `summary[config] → {total, passed, failed, with_errors}`, and (b) a markdown string with a summary table, per-query table, and divergences list.

### Step 1: Create fixtures

```bash
cd /Users/chip/src/subtext/.worktrees/skill-eval-harness
mkdir -p tools/skill-eval/tests/fixtures/matrix
```

Create `tools/skill-eval/tests/fixtures/matrix/config_a_result.json`:

```json
{
  "skill_name": "subtext:proof",
  "description": "dummy",
  "results": [
    {
      "query": "Update the button hover state",
      "should_trigger": true,
      "trigger_rate": 1.0,
      "triggers": 3,
      "runs": 3,
      "pass": true,
      "errors": 0
    },
    {
      "query": "Explain React hooks",
      "should_trigger": false,
      "trigger_rate": 0.0,
      "triggers": 0,
      "runs": 3,
      "pass": true,
      "errors": 0
    },
    {
      "query": "Add a retry loop to payment service",
      "should_trigger": true,
      "trigger_rate": 1.0,
      "triggers": 3,
      "runs": 3,
      "pass": true,
      "errors": 0
    }
  ],
  "summary": {"total": 3, "passed": 3, "failed": 0, "with_errors": 0}
}
```

Create `tools/skill-eval/tests/fixtures/matrix/config_b_result.json`:

```json
{
  "skill_name": "subtext:proof",
  "description": "dummy",
  "results": [
    {
      "query": "Update the button hover state",
      "should_trigger": true,
      "trigger_rate": 0.33,
      "triggers": 1,
      "runs": 3,
      "pass": false,
      "errors": 0
    },
    {
      "query": "Explain React hooks",
      "should_trigger": false,
      "trigger_rate": 0.0,
      "triggers": 0,
      "runs": 3,
      "pass": true,
      "errors": 0
    },
    {
      "query": "Add a retry loop to payment service",
      "should_trigger": true,
      "trigger_rate": 1.0,
      "triggers": 3,
      "runs": 3,
      "pass": true,
      "errors": 0
    }
  ],
  "summary": {"total": 3, "passed": 2, "failed": 1, "with_errors": 0}
}
```

### Step 2: Write the failing tests

Create `tools/skill-eval/tests/test_matrix.py`:

```python
"""Unit tests for lib.matrix.

Fixtures under tests/fixtures/matrix/ simulate two per-config run outputs.
config_a: 3/3 passed; config_b: 2/3 (the first query drops from 3/3 to 1/3
triggers — simulates a routing-contest loss when another framework is loaded).
"""

import json
from pathlib import Path

from lib.matrix import build_matrix, render_matrix_markdown, find_divergences

FIXTURES = Path(__file__).parent / "fixtures" / "matrix"


def _load_configs() -> dict:
    return {
        "config_a": json.loads((FIXTURES / "config_a_result.json").read_text()),
        "config_b": json.loads((FIXTURES / "config_b_result.json").read_text()),
    }


def test_build_matrix_has_expected_keys():
    matrix = build_matrix(_load_configs())
    assert set(matrix.keys()) == {"configs", "queries", "summary"}
    assert matrix["configs"] == ["config_a", "config_b"]
    assert len(matrix["queries"]) == 3


def test_build_matrix_preserves_per_query_per_config_results():
    matrix = build_matrix(_load_configs())
    # First query: config_a 3/3, config_b 1/3
    q0 = matrix["queries"][0]
    assert q0["query"] == "Update the button hover state"
    assert q0["should_trigger"] is True
    assert q0["results"]["config_a"]["triggers"] == 3
    assert q0["results"]["config_a"]["pass"] is True
    assert q0["results"]["config_b"]["triggers"] == 1
    assert q0["results"]["config_b"]["pass"] is False


def test_build_matrix_summary_per_config():
    matrix = build_matrix(_load_configs())
    assert matrix["summary"]["config_a"] == {"total": 3, "passed": 3, "failed": 0, "with_errors": 0}
    assert matrix["summary"]["config_b"] == {"total": 3, "passed": 2, "failed": 1, "with_errors": 0}


def test_find_divergences_flags_big_trigger_rate_gaps():
    matrix = build_matrix(_load_configs())
    divs = find_divergences(matrix, min_gap=0.5)
    # Only the first query has a gap >= 0.5 (1.0 vs 0.33)
    assert len(divs) == 1
    assert divs[0]["query"] == "Update the button hover state"


def test_find_divergences_threshold():
    matrix = build_matrix(_load_configs())
    # A tighter threshold (0.3) still catches the 1.0 vs 0.33 query but no more.
    divs = find_divergences(matrix, min_gap=0.3)
    assert len(divs) == 1


def test_render_matrix_markdown_contains_summary_row_per_config():
    matrix = build_matrix(_load_configs())
    md = render_matrix_markdown(matrix)
    # Summary table should mention both configs
    assert "config_a" in md
    assert "config_b" in md
    # Per-query table should have a divergence-flagged row
    assert "Update the button hover state" in md
    # Divergences section present
    assert "Divergences" in md or "divergence" in md.lower()


def test_build_matrix_with_missing_query_raises():
    """All configs must have the same set of queries; mismatch is an error."""
    import pytest
    configs = _load_configs()
    # Drop the last query from config_b to create a mismatch
    configs["config_b"]["results"] = configs["config_b"]["results"][:-1]
    with pytest.raises(ValueError, match="query"):
        build_matrix(configs)
```

### Step 3: Run tests to verify they fail

```bash
cd tools/skill-eval
./venv/bin/pytest tests/test_matrix.py -v 2>&1 | tail -15
```

Expected: `ModuleNotFoundError: No module named 'lib.matrix'` across all tests.

### Step 4: Implement `lib/matrix.py`

Create `tools/skill-eval/lib/matrix.py`:

```python
"""Matrix aggregation + markdown rendering for cross-config eval results.

Consumes the per-config result JSONs produced by run_eval_sandbox and emits
a consolidated matrix (queries × configs → per-query-per-config trigger rate)
plus a markdown rendering suitable for pasting into PR comments and docs.

Pure stdlib. No subprocess. Fed by bin/eval-sandboxed-matrix which orchestrates
the per-config runs.
"""

from __future__ import annotations

from typing import Any


def build_matrix(configs: dict[str, dict]) -> dict:
    """Consolidate per-config result JSONs into a single matrix.

    Input:
        configs: {config_name: run_eval_sandbox_output_dict}
    Returns:
        {
            "configs": [config_name, ...],
            "queries": [
                {
                    "query": str,
                    "should_trigger": bool,
                    "results": {config_name: {trigger_rate, triggers, runs, pass, errors}}
                },
                ...
            ],
            "summary": {config_name: {total, passed, failed, with_errors}}
        }

    Raises ValueError if configs don't share the same query set (in matching order).
    """
    config_names = list(configs.keys())
    if not config_names:
        raise ValueError("at least one config required")

    # Pin the query list from the first config; all others must match it exactly.
    first_cfg = configs[config_names[0]]
    canonical_queries = [r["query"] for r in first_cfg["results"]]
    for name in config_names[1:]:
        other_queries = [r["query"] for r in configs[name]["results"]]
        if other_queries != canonical_queries:
            raise ValueError(
                f"query set mismatch between '{config_names[0]}' and '{name}' "
                f"(matrix requires identical queries in identical order)"
            )

    # Build query list with per-config sub-results.
    matrix_queries = []
    for idx, query_text in enumerate(canonical_queries):
        first_result = first_cfg["results"][idx]
        per_cfg: dict[str, dict[str, Any]] = {}
        for name in config_names:
            r = configs[name]["results"][idx]
            per_cfg[name] = {
                "trigger_rate": r["trigger_rate"],
                "triggers": r["triggers"],
                "runs": r["runs"],
                "pass": r["pass"],
                "errors": r.get("errors", 0),  # Older results (vendor/host) may lack this.
            }
        matrix_queries.append({
            "query": query_text,
            "should_trigger": first_result["should_trigger"],
            "results": per_cfg,
        })

    # Build per-config summary block.
    summary = {
        name: {
            "total": configs[name]["summary"]["total"],
            "passed": configs[name]["summary"]["passed"],
            "failed": configs[name]["summary"]["failed"],
            "with_errors": configs[name]["summary"].get("with_errors", 0),
        }
        for name in config_names
    }

    return {
        "configs": config_names,
        "queries": matrix_queries,
        "summary": summary,
    }


def find_divergences(matrix: dict, min_gap: float = 0.5) -> list[dict]:
    """Return queries where the max-min trigger_rate across configs is >= min_gap.

    Useful for surfacing routing-contest changes: a query that triggers reliably
    in one config and unreliably in another is the primary skill-collision signal.
    """
    divs = []
    for q in matrix["queries"]:
        rates = [res["trigger_rate"] for res in q["results"].values()]
        if not rates:
            continue
        gap = max(rates) - min(rates)
        if gap >= min_gap:
            divs.append({
                "query": q["query"],
                "should_trigger": q["should_trigger"],
                "gap": gap,
                "rates": {cfg: q["results"][cfg]["trigger_rate"] for cfg in matrix["configs"]},
            })
    return divs


def render_matrix_markdown(matrix: dict, divergence_threshold: float = 0.5) -> str:
    """Render the matrix as a markdown document suitable for docs + PR comments."""
    configs = matrix["configs"]
    lines: list[str] = []

    # Summary table: one row per config.
    lines.append("## Matrix summary\n")
    lines.append("| Config | Passed | Failed | With errors |")
    lines.append("|---|---|---|---|")
    for cfg in configs:
        s = matrix["summary"][cfg]
        lines.append(f"| {cfg} | {s['passed']}/{s['total']} | {s['failed']} | {s['with_errors']} |")
    lines.append("")

    # Per-query table.
    lines.append("## Per-query breakdown\n")
    header = "| Query | Expected | " + " | ".join(configs) + " |"
    sep = "|---|---|" + "|".join(["---"] * len(configs)) + "|"
    lines.append(header)
    lines.append(sep)
    for q in matrix["queries"]:
        expected_sym = "✅" if q["should_trigger"] else "❌"
        # Truncate long queries for readability.
        qt = q["query"].replace("|", "\\|")
        if len(qt) > 80:
            qt = qt[:77] + "..."
        row_cells = [f"{qt}", expected_sym]
        for cfg in configs:
            r = q["results"][cfg]
            mark = "✅" if r["pass"] else "❌"
            row_cells.append(f"{mark} {r['triggers']}/{r['runs']}")
        lines.append("| " + " | ".join(row_cells) + " |")
    lines.append("")

    # Divergences list.
    divs = find_divergences(matrix, min_gap=divergence_threshold)
    lines.append(f"## Divergences (≥{divergence_threshold:.2f} trigger-rate gap)\n")
    if not divs:
        lines.append("_No divergences at this threshold._")
    else:
        for d in divs:
            expected_sym = "✅" if d["should_trigger"] else "❌"
            rates_str = ", ".join(f"{cfg}={d['rates'][cfg]:.2f}" for cfg in configs)
            lines.append(f"- {expected_sym} `{d['query'][:90]}` — gap {d['gap']:.2f} ({rates_str})")
    lines.append("")

    return "\n".join(lines)
```

### Step 5: Run tests to verify pass

```bash
./venv/bin/pytest tests/test_matrix.py -v 2>&1 | tail -15
```

Expected: 7 passed.

### Step 6: Full suite for regressions

```bash
./venv/bin/pytest tests/ -v 2>&1 | tail -5
```

Expected: 24 passed (17 prior + 7 new).

### Step 7: Commit

```bash
cd /Users/chip/src/subtext/.worktrees/skill-eval-harness
git add tools/skill-eval/lib/matrix.py tools/skill-eval/tests/test_matrix.py tools/skill-eval/tests/fixtures/matrix/
git commit -m "feat(skill-eval): matrix aggregation + markdown rendering

lib/matrix.py consumes per-config run_eval_sandbox outputs and emits:
- build_matrix() — consolidated JSON with queries × configs → per-cell
  trigger rate
- find_divergences() — queries where max-min trigger_rate gap ≥ threshold
  (primary skill-collision signal)
- render_matrix_markdown() — summary table + per-query table + divergences
  list, suitable for PR comments and docs

7 tests + 2 fixtures covering aggregation logic, threshold handling, and
query-set mismatch validation."
```

---

## Task 5: `bin/eval-sandboxed-matrix` wrapper

**Files:**
- Create: `tools/skill-eval/bin/eval-sandboxed-matrix`

The wrapper runs `bin/eval-sandboxed` once per config, loads the resulting JSONs, calls `lib.matrix` to build the consolidated output, and writes both the JSON matrix and a markdown rendering alongside.

- [ ] **Step 1: Write the wrapper**

Create `/Users/chip/src/subtext/.worktrees/skill-eval-harness/tools/skill-eval/bin/eval-sandboxed-matrix`:

```bash
#!/usr/bin/env bash
# Run a skill's eval-set under multiple sandbox configs and produce a
# consolidated matrix (JSON + markdown).
#
# Usage:
#   ./tools/skill-eval/bin/eval-sandboxed-matrix <skill> [--configs <a,b,c>] [extra args for eval-sandboxed]
#
# Default --configs: subtext-only,subtext-plus-superpowers
#
# For each config, dispatches bin/eval-sandboxed <skill> --config <config> <extra args>
# serially. Then calls lib.matrix to consolidate.
#
# Writes:
#   skills/<name>/evals/results/<name>-matrix-<ts>.json  (consolidated matrix)
#   skills/<name>/evals/results/<name>-matrix-<ts>.md    (markdown rendering)

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $(basename "$0") <skill-name> [--configs <csv>] [extra args...]" >&2
  exit 2
fi

SKILL_NAME="$1"; shift

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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HARNESS_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(cd "$HARNESS_DIR/../.." && pwd)"
RESULTS_DIR="$REPO_ROOT/skills/$SKILL_NAME/evals/results"

mkdir -p "$RESULTS_DIR"
TIMESTAMP="$(date +%Y%m%dT%H%M%S)"

echo "Matrix eval for '$SKILL_NAME' across configs: $CONFIGS"
echo

# Split CSV → array.
IFS=',' read -r -a CONFIG_ARRAY <<< "$CONFIGS"

# Run each config serially; collect the output file paths.
PER_CONFIG_RESULTS=()
for cfg in "${CONFIG_ARRAY[@]}"; do
  echo "=== Running config: $cfg ==="
  "$SCRIPT_DIR/eval-sandboxed" "$SKILL_NAME" --config "$cfg" "${FORWARDED_ARGS[@]}"
  # The most recent result file for this config.
  LATEST="$(ls -t "$RESULTS_DIR"/"$SKILL_NAME"-sandboxed-"$cfg"-*.json 2>/dev/null | head -1)"
  if [ -z "$LATEST" ]; then
    echo "Error: no result file found for config '$cfg'" >&2
    exit 1
  fi
  PER_CONFIG_RESULTS+=("$cfg=$LATEST")
  echo "  → $LATEST"
  echo
done

# Consolidate via lib.matrix.
MATRIX_JSON="$RESULTS_DIR/${SKILL_NAME}-matrix-${TIMESTAMP}.json"
MATRIX_MD="$RESULTS_DIR/${SKILL_NAME}-matrix-${TIMESTAMP}.md"

PYTHON_BIN="$HARNESS_DIR/venv/bin/python"
if [ ! -x "$PYTHON_BIN" ]; then PYTHON_BIN="python3"; fi

cd "$HARNESS_DIR"
# python - runs the heredoc as a script; cwd (HARNESS_DIR) is on sys.path
# by default, so `from lib.matrix import ...` resolves.
"$PYTHON_BIN" - "$MATRIX_JSON" "$MATRIX_MD" "${PER_CONFIG_RESULTS[@]}" <<'PY'
import json
import sys
from pathlib import Path

from lib.matrix import build_matrix, render_matrix_markdown

out_json_path = sys.argv[1]
out_md_path = sys.argv[2]
pairs = sys.argv[3:]

configs = {}
for pair in pairs:
    name, _, path = pair.partition("=")
    configs[name] = json.loads(Path(path).read_text())

matrix = build_matrix(configs)
Path(out_json_path).write_text(json.dumps(matrix, indent=2))
Path(out_md_path).write_text(render_matrix_markdown(matrix))
s = matrix["summary"]
print(f"Matrix written to: {out_json_path}")
print(f"Markdown rendering: {out_md_path}")
print()
for cfg, vals in s.items():
    print(f"  {cfg}: {vals['passed']}/{vals['total']} passed ({vals['failed']} failed, {vals['with_errors']} with errors)")
PY
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x tools/skill-eval/bin/eval-sandboxed-matrix
```

- [ ] **Step 3: Smoke-test help and arg parsing**

```bash
./tools/skill-eval/bin/eval-sandboxed-matrix 2>&1 | head -3
```

Expected: `Usage: eval-sandboxed-matrix <skill-name> ...`

- [ ] **Step 4: Commit**

```bash
git add tools/skill-eval/bin/eval-sandboxed-matrix
git commit -m "feat(skill-eval): matrix orchestration wrapper

bin/eval-sandboxed-matrix runs bin/eval-sandboxed across N configs (default:
subtext-only, subtext-plus-superpowers) serially, then calls lib.matrix
to consolidate per-config results into a single JSON + markdown rendering.

Outputs:
- skills/<name>/evals/results/<name>-matrix-<ts>.json
- skills/<name>/evals/results/<name>-matrix-<ts>.md

Extra args (--runs-per-query, --timeout, etc.) are forwarded to each
per-config eval-sandboxed invocation."
```

---

## Task 6: Framework-targets research doc

**Files:**
- Create: `docs/skill-eval-research/framework-targets.md`

Light inventory of additional plugin frameworks we might add to the matrix in future PRs. One paragraph per framework: what it is, marketplace URL, priority, 1-2 skills with MUST-tier or broadly-trigger-prone descriptions that could collide with proof.

- [ ] **Step 1: Create the doc**

```bash
cd /Users/chip/src/subtext/.worktrees/skill-eval-harness
mkdir -p docs/skill-eval-research
```

Create `docs/skill-eval-research/framework-targets.md`:

```markdown
# Framework targets for plugin-matrix expansion

Tracks popular Claude Code plugins / skill frameworks we may want to add to
the sandbox eval matrix in future phases. Each entry lists what the framework
does, its marketplace source, a priority judgment, and an initial collision-
vector hypothesis (which of its skills might win routing contests against
`subtext:proof` or other Subtext skills).

Adding a new framework to the matrix requires (a) a `Dockerfile.<framework>`
that extends the base sandbox image with `claude plugin install` steps, (b) a
new case in `tools/skill-eval/sandbox/build.sh` and `tools/skill-eval/bin/eval-sandboxed`,
and (c) optionally, additional queries in `eval-set-v3.json` that stress the
hypothesized collision vectors.

## Currently in matrix

### superpowers (Jesse Vincent) — `obra/superpowers-marketplace`

A full development-methodology framework: brainstorming → writing-plans →
subagent-driven-development → TDD → verification-before-completion. 20+
skills, at least two of which are MUST-tier (`brainstorming`,
`using-superpowers`).

**Priority:** added as the first collision target (Phase 2B matrix).

**Collision vectors vs proof:**
- `brainstorming` is MUST-triggered on "creative work" — may win on queries
  like "Let's brainstorm the dark-mode toggle" that could plausibly go to
  proof's "implement" phrasing too.
- `test-driven-development` triggers on "implementing any feature or bugfix,
  before writing implementation code" — direct overlap with proof's
  "implementing, fixing, or refactoring code" phrasing. The question is
  whether Claude routes to BOTH (via a sequential Skill chain) or picks one.
- `verification-before-completion` could compete on "verify my changes" type
  prompts.

## Candidates for follow-up matrices

### code-review (Anthropic) — `anthropics/claude-plugins-official`

Provides a `/code-review` slash command for reviewing PRs. Opens a structured
review flow. Relevance to Subtext: the `subtext:review` skill shares naming
overlap; users may invoke either expecting the other.

**Priority:** high. Review-adjacent territory directly overlaps with Subtext's
new `review` skill. Worth a dedicated matrix run.

**Collision vectors:**
- `code-review:code-review` slash command may be preferred over Subtext's
  `review` skill on queries like "Review this PR" or "Code review the recent
  changes".
- Unlike proof, this is a *slash command* not an auto-triggered skill — the
  collision is less about automatic routing and more about user mental model.

### frontend-design (Anthropic) — `anthropics/claude-plugins-official`

Specialized skill for building high-quality frontend UI (distinct aesthetic,
creative code generation). Description mentions "building web components,
pages, artifacts, posters, or applications".

**Priority:** high. Direct scope overlap with proof on UI implementation
tasks — proof and frontend-design both fire plausibly on "build me a landing
page".

**Collision vectors:**
- frontend-design's description mentions "web components, pages, artifacts"
  and styling/beautifying any UI — almost identical query surface to proof's
  UI positives.
- Whether both fire, or one wins, is the key question. If proof wins, we're
  fine; if frontend-design wins, users making UI changes with Subtext
  installed but frontend-design active may skip the evidence capture.

### mcp-builder (Anthropic) — `anthropics/claude-plugins-official`

Specialized flow for building MCP servers. Scope is narrow enough that it
likely doesn't collide with proof on typical UI / backend / refactor queries.

**Priority:** low. Add only if we see MCP-builder-related queries in the
eval-set.

**Collision vectors:** minimal. Would fire on "add an MCP tool" / "build a
new MCP server" — queries that are out of proof's eval set.

### playwright-cli — browser automation skill

Used for driving browser tests. Relevance to Subtext: overlaps with
`subtext:live` and `subtext:proof` on browser-involving tasks.

**Priority:** medium. Worth testing once we have more confidence in the
matrix infrastructure.

**Collision vectors:**
- `subtext:live` vs playwright-cli for "navigate to X and click Y" prompts.
- proof might also fire if the task involves UI changes that Playwright
  would validate.

### superpowers:code-reviewer, superpowers:writing-plans, etc.

These are sub-skills within the superpowers plugin and are already covered
by the `subtext-plus-superpowers` matrix config. No additional work needed.

## Open questions for future phases

1. **Subagent-dispatch matrix:** Phase 2C will add subagent-style query
   mode. Should subagent-style queries also be matrix-tested? Likely yes:
   the subagent's skill-loader is the most important collision surface for
   framework-driven workflows.

2. **Matrix scale:** at Phase 3 parallelism, is there a point where we
   stop adding configs and instead rotate through them? An N × M matrix
   with large N and M gets noisy. Maybe cap at ~5 active configs.

3. **Soft-ambiguous queries:** some eval-set-v3 queries are marked "soft"
   because reasonable interpretations differ. In a matrix, a divergence on
   a soft query is less interesting than one on a hard positive. The
   matrix rendering could highlight hard-only divergences.

4. **Cross-plugin chain interactions:** a query might trigger brainstorming
   (SP) → proof chain in some routing models. Measuring *what* triggered
   (not just whether proof fired) may be the next harness feature.
```

- [ ] **Step 2: Commit**

```bash
git add docs/skill-eval-research/framework-targets.md
git commit -m "docs(skill-eval): add framework-targets research inventory

Light inventory of Claude Code plugins/frameworks worth considering for
future matrix expansion. Documents:

- superpowers (in matrix now) + specific collision vectors vs proof
- code-review, frontend-design (high priority follow-ups)
- mcp-builder, playwright-cli (lower priority or narrower scope)
- Open questions for Phase 2C subagent-mode and Phase 3 scale.

Not a comprehensive framework survey — a notes doc that supports the
next prioritization decision when Phase 2B matrix results come in."
```

---

## Task 7: Run the first matrix live

**Files:** records output under `skills/proof/evals/results/`. Gitignored, not committed.

This task actually runs the matrix end-to-end on `eval-set-v3`. ~60 minutes at `runs_per_query=1` (2 × ~29 min).

- [ ] **Step 1: Source API key**

```bash
cd /Users/chip/src/subtext/.worktrees/skill-eval-harness
set -a; source /Users/chip/src/subtext/bench/.env.local; set +a
echo "key length: ${#ANTHROPIC_API_KEY}"
```

Expected: non-zero length.

- [ ] **Step 2: Verify both images exist**

```bash
docker images | grep subtext-sandbox-claude
```

Expected:
```
subtext-sandbox-claude                latest    ...
subtext-sandbox-claude-superpowers    latest    ...
```

If either is missing, build it:

```bash
./tools/skill-eval/sandbox/build.sh --config subtext-only
./tools/skill-eval/sandbox/build.sh --config subtext-plus-superpowers
```

- [ ] **Step 3: Launch the matrix run**

Because the run takes ~60 minutes, launch it in a detached background so the controlling session doesn't block:

```bash
cd /Users/chip/src/subtext/.worktrees/skill-eval-harness
time ./tools/skill-eval/bin/eval-sandboxed-matrix proof --runs-per-query 1 --timeout 300 > /tmp/matrix-run.log 2>&1 &
echo "PID: $!"
```

- [ ] **Step 4: Monitor progress**

Periodically (every ~10 min):

```bash
tail -10 /tmp/matrix-run.log
grep -c 'run 1/1' /tmp/matrix-run.log   # total queries dispatched across all configs so far
pgrep -f "eval-sandboxed-matrix" && echo "(still running)" || echo "(finished)"
```

Expect ~30 "run 1/1" entries per config = 60 total. Matrix is done when pgrep returns empty and `/tmp/matrix-run.log` ends with a `Matrix written to: ...` line.

- [ ] **Step 5: Inspect the matrix output**

```bash
MATRIX_JSON=$(ls -t skills/proof/evals/results/proof-matrix-*.json | head -1)
MATRIX_MD=$(ls -t skills/proof/evals/results/proof-matrix-*.md | head -1)
echo "JSON:     $MATRIX_JSON"
echo "Markdown: $MATRIX_MD"
echo
cat "$MATRIX_MD"
```

Expected output: summary table (2 configs), per-query table (30 queries × 2 configs), divergences list (queries with ≥0.5 trigger-rate gap between configs).

Record the matrix filename, the per-config pass counts, and any divergences for Task 8's writeup.

- [ ] **Step 6: No commit needed**

Matrix JSON + markdown land under `skills/proof/evals/results/` which is gitignored.

---

## Task 8: Update `sandbox/README.md` with Phase 2B matrix results

**Files:**
- Modify: `tools/skill-eval/sandbox/README.md`

Append a new Phase 2B matrix validation section alongside the Phase 2A results. Replace placeholders with actual numbers from Task 7.

- [ ] **Step 1: Read the current README structure**

```bash
grep -n '^##' tools/skill-eval/sandbox/README.md
```

Expected: sections Prerequisites, Running, Tradeoffs, Phase 2/3 roadmap, Validation (Phase 2A, 2026-04-24), plus `###` subsections under Validation.

- [ ] **Step 2: Insert the Phase 2B matrix section**

Use the Edit tool. Find the end of the Phase 2A Validation section (the last block is `### Prior baselines` followed by "Environment:"). Add the new section AFTER that Environment line and BEFORE end-of-file.

- `old_string`:
```
Environment: docker image `subtext-sandbox-claude:latest`, `Darwin arm64 (Apple Silicon)` host.
```

- `new_string`:
```
Environment: docker image `subtext-sandbox-claude:latest`, `Darwin arm64 (Apple Silicon)` host.

## Validation (Phase 2B matrix, <fill-in date>)

First plugin-matrix run: `eval-set-v3` across `[subtext-only, subtext-plus-superpowers]` at `runs_per_query=1`.

### Per-config summary

| Config | Passed | Failed | With errors | Per-query latency | Total runtime |
|---|---|---|---|---|---|
| subtext-only | <fill-in>/30 | <fill-in> | <fill-in> | ~<fill-in>s | ~<fill-in>min |
| subtext-plus-superpowers | <fill-in>/30 | <fill-in> | <fill-in> | ~<fill-in>s | ~<fill-in>min |

Matrix JSON: `skills/proof/evals/results/<fill-in filename>`  
Matrix markdown: `skills/proof/evals/results/<fill-in filename>`

### Divergences (≥0.5 trigger-rate gap)

<fill-in from matrix markdown — or "No divergences at this threshold." if empty.>

### Interpretation

- <fill-in 2-4 bullets based on what the matrix shows. Examples to adapt:>
  - "Proof MUST wins in both configs on all hard-positive subagent-dispatch queries."
  - "SP `brainstorming` skill wins routing on <query> in subtext-plus-superpowers — expected since brainstorming is MUST-tier and the query phrasing leans creative."
  - "All hard negatives held in both configs (no over-triggering regression from adding SP)."

### What this tells us about Phase 2C/3 priorities

<fill-in based on divergences found:>
- If ≥3 meaningful divergences: prioritize understanding WHICH skills are winning (Phase 2C subagent-mode + maybe a new harness feature to capture the winning skill name, not just the trigger bool).
- If <3 divergences: proof's MUST description is robust in this configuration; move on to other framework targets (`frontend-design`, `code-review`) per `docs/skill-eval-research/framework-targets.md`.
```

- [ ] **Step 3: Fill in placeholders from Task 7's output**

Edit the README section to replace every `<fill-in>` with real values from Task 7. Use the matrix markdown file from Task 7 as your source of truth.

- [ ] **Step 4: Verify no `<fill-in>` placeholders remain**

```bash
grep '<fill-in>' tools/skill-eval/sandbox/README.md || echo "OK: no placeholders"
```

Expected: `OK: no placeholders`.

- [ ] **Step 5: Commit**

```bash
git add tools/skill-eval/sandbox/README.md
git commit -m "docs(skill-eval): record Phase 2B plugin-matrix baseline

First matrix run across subtext-only vs subtext-plus-superpowers on
eval-set-v3. Documents per-config pass counts, divergences (queries
where trigger_rate differs ≥0.5 between configs), and interpretation
notes informing Phase 2C/3 prioritization."
```

---

## Final review

- [ ] **Run the full test suite**

```bash
cd tools/skill-eval
./venv/bin/pytest tests/ -v 2>&1 | tail -5
```

Expected: 24 passed (17 prior + 7 matrix).

- [ ] **Confirm both images exist and are tagged**

```bash
docker images | grep subtext-sandbox-claude
```

Expected: `subtext-sandbox-claude:latest` and `subtext-sandbox-claude-superpowers:latest` both present.

- [ ] **Confirm the wrappers accept --config**

```bash
./tools/skill-eval/bin/eval-sandboxed 2>&1 | head -3
./tools/skill-eval/bin/eval-sandboxed-matrix 2>&1 | head -3
./tools/skill-eval/sandbox/build.sh --config bogus 2>&1 | head -3  # error expected
```

- [ ] **Verify vendored scripts are still untouched**

```bash
cd /Users/chip/src/subtext/.worktrees/skill-eval-harness
git diff origin/main -- tools/skill-eval/vendor/ | wc -l
```

Expected: `0` (no modifications to vendored dir since the two Phase-1 `subtext-patch` commits).

---

## Phase 2C / Phase 3 roadmap (not planned in detail here)

- **Phase 2C — Subagent-style query mode.** Add a `--query-style subagent`
  flag to the harness that wraps each query in a subagent-dispatch-prompt
  template before feeding to `claude -p`. Rerun the matrix under subagent-
  style framing to measure implicit pickup in framework-dispatched flows.
  Especially important for MUST vs SP competition — SP's subagent-driven-
  development explicitly dispatches subagents that use TDD, so we need to
  verify proof gets picked up in that context too.

- **Phase 3 — Caching + parallelism.** Two-stage Dockerfile (`Dockerfile.base`
  cached per config-hash, `Dockerfile.query` thin layer for skill-staging).
  Worker pool inside `run_eval_sandbox.py`. Target: 30 queries × 3 runs ×
  5 configs < 10 minutes total. Essential for expanding the matrix past 2-3
  configs without runtime exploding.

Write these plans once Phase 2B's matrix results tell us which direction has
the most signal per unit of work.
