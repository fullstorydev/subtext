# Sandbox Eval Loop — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run `tools/skill-eval` trigger evaluation against the `subtext-sandbox` Docker container so we can measure skill triggering under a realistic plugin environment — the first step toward skill-collision testing across configurations (subtext alone vs. subtext + Superpowers, etc.).

**Architecture:** Extend the existing `subtext-sandbox` container (Vite demo app + Claude Code + plugin via `--plugin-dir` + API-key MCP auth) with a **non-interactive eval branch** driven by `EVAL_QUERY`. On the host side, add a parallel `bin/eval-sandboxed` entry point that dispatches one Docker run per query, parses the `claude -p --output-format stream-json` output the same way `vendor/skill-creator/scripts/run_eval.py` does today, and writes results in the same JSON shape. Deliberate scope: Phase 1 is serial (one query at a time, no parallelism, no build caching). Phases 2–3 (plugin matrix + caching + worker pool) are future plans.

**Tech Stack:**
- Docker + Compose (existing `subtext-sandbox/`)
- Bash (entrypoints, wrappers)
- Python 3.12 (orchestration, stream parsing, tests — existing venv under `tools/skill-eval/venv/`)
- pytest (introduced in this plan — not currently used by the harness)

---

## Scope boundaries

**In scope (Phase 1):**
- One-query-at-a-time Docker dispatch
- Same skill staging semantics as host `--isolated` mode (SKILL.md description written as a command file under `.claude/commands/`)
- Same trigger-detection contract as `run_eval.py` (Skill or Read tool_use referencing the staged name)
- Results written in the same JSON shape as `run_eval.py` so downstream consumers (`bin/loop`, future comparators) don't care about the source

**Out of scope (tracked for later plans):**
- Plugin matrix (`EXTRA_PLUGINS=superpowers,notion,...`) — Phase 2
- Build caching / two-stage Dockerfile — Phase 3
- Per-query parallelism (worker pool) — Phase 3
- Skipping the Vite dev server in eval mode is *in* scope (no reason to wait on it), but removing the demo-store entirely is out of scope

**Deliberately preserved from existing sandbox:**
- `FULLSTORY_API_KEY` / `ANTHROPIC_API_KEY` env var wiring
- `--no-cache` default rebuild (slow but correct — deferred caching to Phase 3)
- `docker-compose.yml` service shape

---

## File Structure

**Files created:**
- `tools/skill-eval/lib/__init__.py` — package marker for shared Python modules
- `tools/skill-eval/lib/detect_trigger.py` — pure function: stream-json lines → `bool` (skill triggered or not)
- `tools/skill-eval/lib/sandbox_runner.py` — per-query Docker orchestration (one `docker run` per call)
- `tools/skill-eval/lib/run_eval_sandbox.py` — top-level orchestration: load eval-set, dispatch each query, write results JSON
- `tools/skill-eval/bin/eval-sandboxed` — bash wrapper that preflights env vars and calls the Python entry point
- `tools/skill-eval/sandbox/README.md` — usage docs + tradeoffs
- `tools/skill-eval/tests/__init__.py` — package marker
- `tools/skill-eval/tests/test_detect_trigger.py` — unit tests for trigger detection
- `tools/skill-eval/tests/fixtures/stream_triggered.jsonl` — recorded stream where skill triggered
- `tools/skill-eval/tests/fixtures/stream_not_triggered.jsonl` — recorded stream where skill did NOT trigger

**Files modified:**
- `subtext-sandbox/entrypoint.sh` — add `EVAL_QUERY` branch (skip Vite, stage skill command, run `claude -p`, exit)
- `tools/skill-eval/requirements.txt` — add `pytest`

**Unchanged but noted:**
- `subtext-sandbox/Dockerfile` — used as-is for Phase 1
- `tools/skill-eval/vendor/` — vendored upstream scripts remain pristine

---

## Testing strategy

- **TDD-able (unit tests with fixtures):** `detect_trigger.py` — pure function over recorded stream lines.
- **TDD-able (with mocked `subprocess.run`):** `sandbox_runner.py`'s `docker run` invocation and output parsing.
- **Manual verification (integration):** actual Docker-driven smoke test at the end of Phase 1 against the real `proof` eval-set. Not in the pytest suite — documented as a one-off check with expected output.

One end-to-end smoke run is gated behind Task 9 and requires real API keys — keep it out of the default `pytest` path.

---

## Task 1: Scaffold directories and pytest

**Files:**
- Create: `tools/skill-eval/lib/__init__.py`
- Create: `tools/skill-eval/tests/__init__.py`
- Create: `tools/skill-eval/conftest.py` — makes `lib/` importable when pytest runs from any cwd
- Create: `tools/skill-eval/sandbox/` (directory)
- Create: `tools/skill-eval/tests/fixtures/` (directory)
- Modify: `tools/skill-eval/requirements.txt`

- [ ] **Step 1: Create package markers, conftest, and dirs**

```bash
cd /Users/chip/src/subtext/.worktrees/skill-eval-harness/tools/skill-eval
mkdir -p lib tests/fixtures sandbox
touch lib/__init__.py tests/__init__.py
```

Create `tools/skill-eval/conftest.py`:

```python
"""Pytest config: make lib/ importable regardless of invocation cwd.

Pytest auto-loads the nearest conftest.py and runs it before collection,
so tests can `from lib.detect_trigger import ...` without packaging.
"""

import sys
from pathlib import Path

HERE = Path(__file__).parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))
```

- [ ] **Step 2: Add pytest to requirements and install**

Edit `tools/skill-eval/requirements.txt`, append `pytest>=8.0`.

Current content (one line):
```
anthropic
```

New content:
```
anthropic
pytest>=8.0
```

Install:
```bash
./venv/bin/pip install -r requirements.txt
```

- [ ] **Step 3: Verify pytest discovers the empty test tree**

Run:
```bash
./venv/bin/pytest tests/
```

Expected output contains: `no tests ran` and exit code 5 (pytest's "no tests collected" code). That's fine — empty suite.

- [ ] **Step 4: Commit**

```bash
cd /Users/chip/src/subtext/.worktrees/skill-eval-harness
git add tools/skill-eval/lib tools/skill-eval/tests tools/skill-eval/conftest.py tools/skill-eval/sandbox tools/skill-eval/requirements.txt
git commit -m "chore(skill-eval): scaffold lib/ tests/ sandbox/ for phase-1 sandbox eval"
```

---

## Task 2: Record stream fixtures from a known-triggering host run

We need two recordings of `claude -p --output-format stream-json` output: one where a staged skill triggered, one where it didn't. These anchor every subsequent detection test.

**Files:**
- Create: `tools/skill-eval/tests/fixtures/stream_triggered.jsonl`
- Create: `tools/skill-eval/tests/fixtures/stream_not_triggered.jsonl`
- Create: `tools/skill-eval/tests/fixtures/README.md`

- [ ] **Step 1: Stage a minimal test skill locally**

```bash
cd /Users/chip/src/subtext/.worktrees/skill-eval-harness
mkdir -p .claude/commands
cat > .claude/commands/fixture-skill-fix1.md <<'EOF'
---
description: |
  Use this skill for any task that modifies UI button styles — hover, color, size, shape.
---

# fixture-skill

This skill handles: UI button style changes.
EOF
```

- [ ] **Step 2: Record a triggering stream**

Run a query that will cause Claude to invoke the staged skill:

```bash
CLAUDECODE= claude -p "Change the submit button hover color to blue" \
  --output-format stream-json \
  --verbose \
  --include-partial-messages \
  > tools/skill-eval/tests/fixtures/stream_triggered.jsonl 2>/dev/null
```

Verify the fixture contains `fixture-skill-fix1` in at least one `input_json_delta` line:

```bash
grep -c "fixture-skill-fix1" tools/skill-eval/tests/fixtures/stream_triggered.jsonl
```

Expected: `>= 1`. If `0`, the skill didn't trigger — rerun with a more on-point query or accept that you may need a different positive fixture.

- [ ] **Step 3: Record a non-triggering stream**

```bash
CLAUDECODE= claude -p "What is 7 times 8?" \
  --output-format stream-json \
  --verbose \
  --include-partial-messages \
  > tools/skill-eval/tests/fixtures/stream_not_triggered.jsonl 2>/dev/null
```

Verify the fixture does NOT contain `fixture-skill-fix1`:

```bash
grep -c "fixture-skill-fix1" tools/skill-eval/tests/fixtures/stream_not_triggered.jsonl
```

Expected: `0`.

- [ ] **Step 4: Clean up the staged skill**

```bash
rm .claude/commands/fixture-skill-fix1.md
rmdir .claude/commands 2>/dev/null || true
```

- [ ] **Step 5: Write a fixtures README so future maintainers know how to regenerate**

Create `tools/skill-eval/tests/fixtures/README.md`:

```markdown
# Test fixtures

Recorded `claude -p --output-format stream-json --verbose --include-partial-messages` outputs used by `test_detect_trigger.py`.

## Regenerating

See the steps in `docs/superpowers/plans/2026-04-24-sandbox-eval-loop.md` Task 2.

## Naming

- `stream_triggered.jsonl` — a recorded run where a staged skill named `fixture-skill-fix1` was invoked via Skill or Read.
- `stream_not_triggered.jsonl` — a run where the same skill was staged but Claude answered without invoking it.

The `clean_name` used in the fixtures is `fixture-skill-fix1` — the same constant is referenced in `test_detect_trigger.py`.
```

- [ ] **Step 6: Commit**

```bash
git add tools/skill-eval/tests/fixtures/
git commit -m "test(skill-eval): record stream-json fixtures for trigger detection"
```

---

## Task 3: Extract trigger detection as a pure function

Mirror the detection logic inside `vendor/skill-creator/scripts/run_eval.py` `run_single_query` (the stream-event parsing loop, lines 122–194 of the vendored copy) into a standalone testable function. Duplication is intentional — the vendored script stays pristine.

**Files:**
- Create: `tools/skill-eval/lib/detect_trigger.py`
- Create: `tools/skill-eval/tests/test_detect_trigger.py`

- [ ] **Step 1: Write the failing tests**

Create `tools/skill-eval/tests/test_detect_trigger.py`:

```python
"""Unit tests for lib.detect_trigger.

Fixtures capture real claude -p stream output. The detector must return
True iff the staged skill name appears in a Skill or Read tool_use event.
"""

from pathlib import Path

import pytest

from lib.detect_trigger import detect_trigger_from_stream

FIXTURES = Path(__file__).parent / "fixtures"
CLEAN_NAME = "fixture-skill-fix1"


def _read_lines(name: str) -> list[str]:
    return (FIXTURES / name).read_text().splitlines()


def test_triggered_stream_returns_true():
    lines = _read_lines("stream_triggered.jsonl")
    assert detect_trigger_from_stream(lines, CLEAN_NAME) is True


def test_non_triggered_stream_returns_false():
    lines = _read_lines("stream_not_triggered.jsonl")
    assert detect_trigger_from_stream(lines, CLEAN_NAME) is False


def test_other_skill_name_on_triggered_stream_returns_false():
    lines = _read_lines("stream_triggered.jsonl")
    assert detect_trigger_from_stream(lines, "different-skill-name") is False


def test_empty_stream_returns_false():
    assert detect_trigger_from_stream([], CLEAN_NAME) is False


def test_malformed_json_lines_are_skipped():
    lines = ['not json', '{"type": "stream_event", "event": {}}', 'also not json']
    assert detect_trigger_from_stream(lines, CLEAN_NAME) is False


def test_tool_use_other_than_skill_or_read_exits_early():
    lines = [
        '{"type": "stream_event", "event": {"type": "content_block_start", '
        '"content_block": {"type": "tool_use", "name": "Bash"}}}',
    ]
    assert detect_trigger_from_stream(lines, CLEAN_NAME) is False
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/chip/src/subtext/.worktrees/skill-eval-harness/tools/skill-eval
./venv/bin/pytest tests/test_detect_trigger.py -v
```

Expected: `ImportError: No module named 'lib.detect_trigger'` or ModuleNotFoundError (all tests error out before assertion). Not a normal FAIL — that's fine; the next step makes them collectible.

- [ ] **Step 3: Write the implementation**

Create `tools/skill-eval/lib/detect_trigger.py`:

```python
"""Pure trigger-detection function for claude -p stream-json output.

Mirrors the detection logic in vendor/skill-creator/scripts/run_eval.py's
run_single_query loop so we can reuse it from sandbox runs without
importing the vendored module (which encodes subprocess + filesystem
side effects).
"""

from __future__ import annotations

import json
from collections.abc import Iterable


def detect_trigger_from_stream(lines: Iterable[str], clean_name: str) -> bool:
    """Return True iff the stream shows a Skill or Read tool_use referencing clean_name.

    Accepts any iterable of stream-json lines (one JSON object per line).
    Malformed lines are skipped silently.

    Detection mirrors run_eval.py:
      - Early exit True on content_block_delta input_json_delta containing clean_name
      - Early exit False on tool_use for any tool other than Skill or Read
      - Fallback: full assistant message with Skill.skill or Read.file_path
        containing clean_name
      - Final result event ends the stream; return the accumulated state
    """
    pending_tool_name: str | None = None
    accumulated_json = ""
    triggered = False

    for raw in lines:
        line = raw.strip()
        if not line:
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue

        etype = event.get("type")

        if etype == "stream_event":
            se = event.get("event", {})
            se_type = se.get("type", "")

            if se_type == "content_block_start":
                cb = se.get("content_block", {})
                if cb.get("type") == "tool_use":
                    tool_name = cb.get("name", "")
                    if tool_name in ("Skill", "Read"):
                        pending_tool_name = tool_name
                        accumulated_json = ""
                    else:
                        return False

            elif se_type == "content_block_delta" and pending_tool_name:
                delta = se.get("delta", {})
                if delta.get("type") == "input_json_delta":
                    accumulated_json += delta.get("partial_json", "")
                    if clean_name in accumulated_json:
                        return True

            elif se_type in ("content_block_stop", "message_stop"):
                if pending_tool_name:
                    return clean_name in accumulated_json
                if se_type == "message_stop":
                    return False

        elif etype == "assistant":
            message = event.get("message", {})
            for content_item in message.get("content", []):
                if content_item.get("type") != "tool_use":
                    continue
                tool_name = content_item.get("name", "")
                tool_input = content_item.get("input", {})
                if tool_name == "Skill" and clean_name in tool_input.get("skill", ""):
                    triggered = True
                elif tool_name == "Read" and clean_name in tool_input.get("file_path", ""):
                    triggered = True
                return triggered

        elif etype == "result":
            return triggered

    return triggered
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
./venv/bin/pytest tests/test_detect_trigger.py -v
```

Expected output: all 6 tests pass. If `test_triggered_stream_returns_true` fails, re-check Task 2's fixture — the recorded stream may not actually contain a Skill/Read tool_use. If it fails because of path/import issues, ensure you run pytest from `tools/skill-eval/` and that `lib/__init__.py` and `tests/__init__.py` exist.

- [ ] **Step 5: Commit**

```bash
cd /Users/chip/src/subtext/.worktrees/skill-eval-harness
git add tools/skill-eval/lib/detect_trigger.py tools/skill-eval/tests/test_detect_trigger.py
git commit -m "feat(skill-eval): add detect_trigger pure function with fixture tests"
```

---

## Task 4: Add the eval branch to the sandbox entrypoint

Teach `subtext-sandbox/entrypoint.sh` to run non-interactively when `EVAL_QUERY` is set. In that path: skip `npm run dev`, stage the provided skill command, run `claude -p` with stream-json, print to stdout, exit.

**Files:**
- Modify: `subtext-sandbox/entrypoint.sh`

- [ ] **Step 1: Read the current entrypoint so the edit is surgical**

```bash
cat /Users/chip/src/subtext/subtext-sandbox/entrypoint.sh
```

Note the existing structure: plugin resolution → start Vite → wait → exec claude. The eval branch replaces the `Start Vite / wait / launch claude` tail.

- [ ] **Step 2: Rewrite entrypoint.sh**

Replace the full contents of `/Users/chip/src/subtext/subtext-sandbox/entrypoint.sh` with:

```bash
#!/bin/bash
set -e

# ── Resolve plugin source ────────────────────────────────────────────────
PLUGIN_DIR="/opt/subtext"

if [ "${PLUGIN_SOURCE:-prod}" = "prod" ]; then
  echo "Cloning subtext plugin from GitHub..."
  git clone --depth 1 https://github.com/fullstorydev/subtext.git "$PLUGIN_DIR"
else
  if [ ! -d "$PLUGIN_DIR" ]; then
    echo "Error: Local subtext plugin not mounted at $PLUGIN_DIR"
    exit 1
  fi
  echo "Using local subtext plugin at $PLUGIN_DIR"
fi

# ── Eval mode (non-interactive, single-query) ────────────────────────────
if [ -n "${EVAL_QUERY:-}" ]; then
  : "${EVAL_CLEAN_NAME:?EVAL_CLEAN_NAME must be set in eval mode}"
  : "${EVAL_DESCRIPTION:?EVAL_DESCRIPTION must be set in eval mode}"

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

  # Disable MCP connections (not needed for trigger detection, and they
  # delay startup waiting for network). Remove the .mcp.json baked in by
  # the Dockerfile. The plugin's own skills still load via --plugin-dir.
  rm -f /workspace/.mcp.json

  # CLAUDECODE env var guard is for interactive terminal conflicts —
  # programmatic claude -p usage is safe to unset.
  unset CLAUDECODE

  exec claude --plugin-dir "$PLUGIN_DIR" \
    -p "$EVAL_QUERY" \
    --output-format stream-json \
    --verbose \
    --include-partial-messages \
    ${EVAL_MODEL:+--model "$EVAL_MODEL"}
fi

# ── Interactive mode (default) ───────────────────────────────────────────
echo "Starting Vite dev server on port 5173..."
npm run dev -- --host 0.0.0.0 &
DEV_PID=$!

echo "Waiting for dev server to be ready..."
for i in $(seq 1 30); do
  if curl -s -o /dev/null -w '%{http_code}' http://localhost:5173 | grep -q '200\|302\|301'; then
    echo "Dev server is ready at http://localhost:5173"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "Warning: Dev server may not be fully ready, proceeding anyway..."
  fi
  sleep 1
done

exec claude --plugin-dir "$PLUGIN_DIR" "$@"
```

- [ ] **Step 3: Verify the eval branch with a manual docker run (no host harness yet)**

```bash
cd /Users/chip/src/subtext/subtext-sandbox
docker compose build --no-cache
# Use the --rm flag to auto-clean the container after exit.
docker compose run --rm \
  -v "$HOME/src/subtext:/opt/subtext:ro" \
  -e PLUGIN_SOURCE=local \
  -e EVAL_QUERY="Change the submit button hover color to blue" \
  -e EVAL_CLEAN_NAME="fixture-skill-sbx1" \
  -e EVAL_DESCRIPTION="Use this skill for any task that modifies UI button styles — hover, color, size, shape." \
  claude 2>/dev/null | head -20
```

Expected output: JSON lines (stream events), starting with a `session_start` event and including `stream_event` entries. If you see the shell prompt or a stack trace, something failed — check `docker compose logs` and confirm ANTHROPIC_API_KEY is exported.

Note: the query is a string match against the description you just staged. If it doesn't trigger, you'll see the stream but no `fixture-skill-sbx1` substring — that's still proof the plumbing works; the detector will correctly return False.

- [ ] **Step 4: Verify stream output is parseable as JSON**

```bash
docker compose run --rm \
  -v "$HOME/src/subtext:/opt/subtext:ro" \
  -e PLUGIN_SOURCE=local \
  -e EVAL_QUERY="Change the submit button hover color to blue" \
  -e EVAL_CLEAN_NAME="fixture-skill-sbx1" \
  -e EVAL_DESCRIPTION="Use this skill for any task that modifies UI button styles." \
  claude 2>/dev/null \
  | python3 -c "
import json, sys
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        json.loads(line)
    except json.JSONDecodeError as e:
        print('BAD LINE:', line[:80], file=sys.stderr)
        sys.exit(1)
print('OK: all lines parse as JSON')
"
```

Expected: `OK: all lines parse as JSON`. If any line fails, the Dockerfile baseline has output mixed with stream-json — fix before moving on.

- [ ] **Step 5: Commit**

```bash
cd /Users/chip/src/subtext
git add subtext-sandbox/entrypoint.sh
git commit -m "feat(sandbox): add EVAL_QUERY branch for non-interactive skill eval"
```

Note: `subtext-sandbox/` may be a separate repo or a subtree of the main subtext repo — if `git status` shows it as untracked from the worktree, commit it from the subtext-sandbox directory instead, or skip this commit and commit both directories together in Task 9.

---

## Task 5: Docker-run orchestrator (sandbox_runner.py)

One function: given a query + skill SKILL.md path, runs one docker container, returns `triggered: bool` plus a small metadata bundle (exit code, stderr tail, ms). Uses `detect_trigger_from_stream` from Task 3.

**Files:**
- Create: `tools/skill-eval/lib/sandbox_runner.py`
- Create: `tools/skill-eval/tests/test_sandbox_runner.py`

- [ ] **Step 1: Write the failing tests (subprocess mocked)**

Create `tools/skill-eval/tests/test_sandbox_runner.py`:

```python
"""Tests for lib.sandbox_runner.

docker subprocess is mocked — we don't spin containers in unit tests.
"""

from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

from lib.sandbox_runner import run_query_in_sandbox, SandboxResult

FIXTURES = Path(__file__).parent / "fixtures"


def _fake_popen(stdout_bytes: bytes, returncode: int = 0):
    proc = MagicMock()
    proc.stdout = MagicMock()
    proc.stdout.read.return_value = stdout_bytes
    proc.returncode = returncode
    proc.wait.return_value = returncode
    proc.communicate.return_value = (stdout_bytes, b"")
    return proc


def test_triggered_query_reports_triggered():
    stdout = (FIXTURES / "stream_triggered.jsonl").read_bytes()
    with patch("lib.sandbox_runner.subprocess.run") as run:
        run.return_value = MagicMock(stdout=stdout, stderr=b"", returncode=0)
        result = run_query_in_sandbox(
            query="Change the button color",
            clean_name="fixture-skill-fix1",
            description="button style changes",
            plugin_source_path="/host/subtext",
            timeout_s=60,
        )
    assert isinstance(result, SandboxResult)
    assert result.triggered is True
    assert result.exit_code == 0


def test_non_triggered_query_reports_false():
    stdout = (FIXTURES / "stream_not_triggered.jsonl").read_bytes()
    with patch("lib.sandbox_runner.subprocess.run") as run:
        run.return_value = MagicMock(stdout=stdout, stderr=b"", returncode=0)
        result = run_query_in_sandbox(
            query="What is 7 times 8?",
            clean_name="fixture-skill-fix1",
            description="button style changes",
            plugin_source_path="/host/subtext",
            timeout_s=60,
        )
    assert result.triggered is False


def test_nonzero_exit_raises():
    with patch("lib.sandbox_runner.subprocess.run") as run:
        run.return_value = MagicMock(stdout=b"", stderr=b"boom", returncode=1)
        with pytest.raises(RuntimeError, match="docker run failed"):
            run_query_in_sandbox(
                query="q",
                clean_name="fixture-skill-fix1",
                description="desc",
                plugin_source_path="/host/subtext",
                timeout_s=60,
            )


def test_docker_command_shape():
    """Verify the docker run argv so future changes can't silently drop flags."""
    stdout = (FIXTURES / "stream_not_triggered.jsonl").read_bytes()
    with patch("lib.sandbox_runner.subprocess.run") as run:
        run.return_value = MagicMock(stdout=stdout, stderr=b"", returncode=0)
        run_query_in_sandbox(
            query="hello",
            clean_name="cname",
            description="desc",
            plugin_source_path="/host/subtext",
            timeout_s=90,
        )
    call_args = run.call_args.args[0]
    assert call_args[0] == "docker"
    assert "run" in call_args
    assert "--rm" in call_args
    # plugin source mount
    assert any("/host/subtext:/opt/subtext:ro" in a for a in call_args)
    # env vars
    env_flags = [a for i, a in enumerate(call_args) if call_args[i - 1] == "-e"]
    assert any(e.startswith("EVAL_QUERY=") for e in env_flags)
    assert any(e.startswith("EVAL_CLEAN_NAME=cname") for e in env_flags)
    assert any(e.startswith("EVAL_DESCRIPTION=") for e in env_flags)
```

- [ ] **Step 2: Run to verify the tests fail**

```bash
./venv/bin/pytest tests/test_sandbox_runner.py -v
```

Expected: all tests error on `ModuleNotFoundError: No module named 'lib.sandbox_runner'`.

- [ ] **Step 3: Write the implementation**

Create `tools/skill-eval/lib/sandbox_runner.py`:

```python
"""Per-query Docker orchestrator for skill-eval sandbox mode.

One invocation = one docker run = one claude -p = one triggered/not judgment.
Serial by design in Phase 1. Phase 3 will add parallel worker pools.
"""

from __future__ import annotations

import os
import subprocess
from dataclasses import dataclass
from pathlib import Path

from lib.detect_trigger import detect_trigger_from_stream


@dataclass
class SandboxResult:
    triggered: bool
    exit_code: int
    stdout_bytes: int
    stderr_tail: str


def run_query_in_sandbox(
    query: str,
    clean_name: str,
    description: str,
    plugin_source_path: str,
    timeout_s: int = 180,
    image: str = "subtext-sandbox-claude",
    model: str | None = None,
) -> SandboxResult:
    """Run one eval query inside the subtext-sandbox container.

    Requires ANTHROPIC_API_KEY and FULLSTORY_API_KEY in the caller's
    environment. Both are forwarded into the container.

    Returns a SandboxResult. Raises RuntimeError on docker exit != 0.
    """
    for required in ("ANTHROPIC_API_KEY", "FULLSTORY_API_KEY"):
        if not os.environ.get(required):
            raise RuntimeError(f"{required} not set in environment")

    cmd = [
        "docker", "run", "--rm",
        "-v", f"{plugin_source_path}:/opt/subtext:ro",
        "-e", "PLUGIN_SOURCE=local",
        "-e", f"ANTHROPIC_API_KEY={os.environ['ANTHROPIC_API_KEY']}",
        "-e", f"FULLSTORY_API_KEY={os.environ['FULLSTORY_API_KEY']}",
        "-e", f"EVAL_QUERY={query}",
        "-e", f"EVAL_CLEAN_NAME={clean_name}",
        "-e", f"EVAL_DESCRIPTION={description}",
    ]
    if model:
        cmd.extend(["-e", f"EVAL_MODEL={model}"])
    cmd.append(image)

    completed = subprocess.run(
        cmd,
        capture_output=True,
        timeout=timeout_s,
        check=False,
    )

    if completed.returncode != 0:
        raise RuntimeError(
            f"docker run failed (exit {completed.returncode}): "
            f"{completed.stderr.decode('utf-8', errors='replace')[-400:]}"
        )

    stdout = completed.stdout.decode("utf-8", errors="replace")
    stderr = completed.stderr.decode("utf-8", errors="replace")
    lines = stdout.splitlines()

    triggered = detect_trigger_from_stream(lines, clean_name)
    return SandboxResult(
        triggered=triggered,
        exit_code=completed.returncode,
        stdout_bytes=len(completed.stdout),
        stderr_tail=stderr[-200:] if stderr else "",
    )
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
./venv/bin/pytest tests/test_sandbox_runner.py -v
```

Expected: 4 passed. If `test_docker_command_shape` fails because of argv ordering, adjust the assertion — the contract is "all these flags appear," not a positional one.

- [ ] **Step 5: Commit**

```bash
git add tools/skill-eval/lib/sandbox_runner.py tools/skill-eval/tests/test_sandbox_runner.py
git commit -m "feat(skill-eval): add sandbox_runner for per-query docker dispatch"
```

---

## Task 6: Build the sandbox image as a stable tag

Phase 1 needs a named image (`subtext-sandbox-claude`) so `sandbox_runner` can `docker run <image>` without rebuilding per-query. Still `--no-cache` for safety in Phase 1 — we're not caching yet, but we're not forcing the orchestrator to rebuild either.

**Files:**
- Create: `tools/skill-eval/sandbox/build.sh`

- [ ] **Step 1: Write the build script**

Create `tools/skill-eval/sandbox/build.sh`:

```bash
#!/usr/bin/env bash
# Build the subtext-sandbox image tagged for skill-eval consumption.
# Phase 1: --no-cache to stay honest about what we ship. Phase 3 will
# introduce cached base + thin query layers.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
SANDBOX_DIR="$REPO_ROOT/subtext-sandbox"

if [ ! -d "$SANDBOX_DIR" ]; then
  echo "Error: sandbox dir not found at $SANDBOX_DIR" >&2
  exit 1
fi

echo "Building subtext-sandbox-claude image (--no-cache)..."
docker build --no-cache -t subtext-sandbox-claude "$SANDBOX_DIR"
echo "Built subtext-sandbox-claude:latest"
```

- [ ] **Step 2: Make it executable and run it**

```bash
chmod +x tools/skill-eval/sandbox/build.sh
./tools/skill-eval/sandbox/build.sh
```

Expected: image builds successfully. `docker images | grep subtext-sandbox-claude` should show the new image.

**Expected build time:** a few minutes (npm install + claude-code install). This is the Phase 3 caching target.

- [ ] **Step 3: Commit**

```bash
git add tools/skill-eval/sandbox/build.sh
git commit -m "build(skill-eval): add sandbox image build script"
```

---

## Task 7: Top-level sandbox eval orchestrator (run_eval_sandbox.py)

Iterate through an eval-set, dispatch each query through `sandbox_runner`, tally pass/fail by the same threshold math as `run_eval.py`, write results JSON in the same shape.

**Files:**
- Create: `tools/skill-eval/lib/run_eval_sandbox.py`
- Create: `tools/skill-eval/tests/test_run_eval_sandbox.py`

- [ ] **Step 1: Write the failing tests (sandbox_runner mocked)**

Create `tools/skill-eval/tests/test_run_eval_sandbox.py`:

```python
"""Integration-shape tests for run_eval_sandbox orchestration.

sandbox_runner.run_query_in_sandbox is mocked; we're testing the outer
loop: eval-set iteration, pass/fail threshold math, output shape.
"""

from unittest.mock import patch

from lib.run_eval_sandbox import run_eval_over_sandbox
from lib.sandbox_runner import SandboxResult


def _res(triggered: bool) -> SandboxResult:
    return SandboxResult(
        triggered=triggered, exit_code=0, stdout_bytes=100, stderr_tail=""
    )


def test_all_positive_all_triggered_is_all_pass():
    eval_set = [
        {"query": "Q1", "should_trigger": True},
        {"query": "Q2", "should_trigger": True},
    ]
    with patch("lib.run_eval_sandbox.run_query_in_sandbox") as rq:
        rq.side_effect = [_res(True), _res(True)]
        output = run_eval_over_sandbox(
            eval_set=eval_set,
            skill_name="subtext:proof",
            description="desc",
            plugin_source_path="/host/subtext",
            runs_per_query=1,
        )
    assert output["summary"]["passed"] == 2
    assert output["summary"]["failed"] == 0


def test_negative_not_triggered_is_pass():
    eval_set = [{"query": "Q1", "should_trigger": False}]
    with patch("lib.run_eval_sandbox.run_query_in_sandbox") as rq:
        rq.side_effect = [_res(False)]
        output = run_eval_over_sandbox(
            eval_set=eval_set,
            skill_name="subtext:proof",
            description="desc",
            plugin_source_path="/host/subtext",
            runs_per_query=1,
        )
    assert output["summary"]["passed"] == 1


def test_runs_per_query_three_majority_wins():
    """trigger_threshold default 0.5: 2/3 triggered should PASS a positive."""
    eval_set = [{"query": "Q1", "should_trigger": True}]
    with patch("lib.run_eval_sandbox.run_query_in_sandbox") as rq:
        rq.side_effect = [_res(True), _res(False), _res(True)]
        output = run_eval_over_sandbox(
            eval_set=eval_set,
            skill_name="subtext:proof",
            description="desc",
            plugin_source_path="/host/subtext",
            runs_per_query=3,
        )
    assert output["results"][0]["triggers"] == 2
    assert output["results"][0]["runs"] == 3
    assert output["results"][0]["pass"] is True


def test_output_shape_matches_run_eval():
    """Output JSON must have the same keys as run_eval.py output."""
    eval_set = [{"query": "Q1", "should_trigger": True}]
    with patch("lib.run_eval_sandbox.run_query_in_sandbox") as rq:
        rq.side_effect = [_res(True)]
        output = run_eval_over_sandbox(
            eval_set=eval_set,
            skill_name="subtext:proof",
            description="desc",
            plugin_source_path="/host/subtext",
            runs_per_query=1,
        )
    assert set(output.keys()) == {"skill_name", "description", "results", "summary"}
    assert set(output["summary"].keys()) == {"total", "passed", "failed"}
    result = output["results"][0]
    assert set(result.keys()) == {
        "query", "should_trigger", "trigger_rate", "triggers", "runs", "pass"
    }
```

- [ ] **Step 2: Run to verify failing**

```bash
./venv/bin/pytest tests/test_run_eval_sandbox.py -v
```

Expected: ModuleNotFoundError on import.

- [ ] **Step 3: Write the implementation**

Create `tools/skill-eval/lib/run_eval_sandbox.py`:

```python
"""Top-level sandbox eval orchestration.

Serial loop over the eval-set. Produces the same JSON shape as
vendor/skill-creator/scripts/run_eval.py so downstream tools
(bin/loop, diff viewers) don't care about the source.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import uuid
from pathlib import Path

# Make this runnable as `python -m lib.run_eval_sandbox` from tools/skill-eval/
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from lib.sandbox_runner import run_query_in_sandbox, SandboxResult


def _parse_skill_md(skill_path: Path) -> tuple[str, str]:
    """Minimal frontmatter read: returns (name, description).

    We duplicate a tiny slice of vendor/skill-creator/scripts/utils.py's
    parse_skill_md here rather than importing the vendored copy, to keep
    lib/ self-contained. If behavior needs to change, match vendor's.
    """
    content = (skill_path / "SKILL.md").read_text()
    m = re.match(r"^---\n(.*?)\n---", content, flags=re.DOTALL)
    if not m:
        raise ValueError(f"No frontmatter in {skill_path}/SKILL.md")
    fm = m.group(1)
    name_m = re.search(r"^name:\s*(.+)$", fm, flags=re.MULTILINE)
    if not name_m:
        raise ValueError("No 'name:' in frontmatter")
    desc_m = re.search(r"^description:\s*(.+?)(?=\n\w+:|\Z)", fm, flags=re.MULTILINE | re.DOTALL)
    if not desc_m:
        raise ValueError("No 'description:' in frontmatter")
    return name_m.group(1).strip(), desc_m.group(1).strip()


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
    """Iterate the eval-set, dispatch each query through the sandbox, tally results."""
    results = []
    for item in eval_set:
        triggers = 0
        # Use a fresh uuid per *query* so different queries don't collide on
        # staged command filenames inside the container. Runs within a
        # query can share it (we reset the container anyway each run).
        unique_id = uuid.uuid4().hex[:8]
        clean_name = f"{skill_name}-skill-{unique_id}".replace(":", "-")

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

        trigger_rate = triggers / runs_per_query
        should_trigger = item["should_trigger"]
        did_pass = (
            trigger_rate >= trigger_threshold
            if should_trigger
            else trigger_rate < trigger_threshold
        )
        results.append({
            "query": item["query"],
            "should_trigger": should_trigger,
            "trigger_rate": trigger_rate,
            "triggers": triggers,
            "runs": runs_per_query,
            "pass": did_pass,
        })

    passed = sum(1 for r in results if r["pass"])
    total = len(results)
    return {
        "skill_name": skill_name,
        "description": description,
        "results": results,
        "summary": {"total": total, "passed": passed, "failed": total - passed},
    }


def main():
    parser = argparse.ArgumentParser(description="Sandbox-mode trigger eval for a subtext skill")
    parser.add_argument("--skill-path", required=True, help="Path to skill directory (containing SKILL.md)")
    parser.add_argument("--eval-set", required=True, help="Path to eval-set JSON")
    parser.add_argument("--plugin-source", required=True, help="Host path to the subtext plugin source")
    parser.add_argument("--runs-per-query", type=int, default=3)
    parser.add_argument("--trigger-threshold", type=float, default=0.5)
    parser.add_argument("--timeout", type=int, default=180)
    parser.add_argument("--model", default=None)
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()

    skill_path = Path(args.skill_path)
    eval_set = json.loads(Path(args.eval_set).read_text())
    skill_name, description = _parse_skill_md(skill_path)

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

    if args.verbose:
        s = output["summary"]
        print(f"Results: {s['passed']}/{s['total']} passed", file=sys.stderr)

    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests**

```bash
./venv/bin/pytest tests/test_run_eval_sandbox.py -v
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add tools/skill-eval/lib/run_eval_sandbox.py tools/skill-eval/tests/test_run_eval_sandbox.py
git commit -m "feat(skill-eval): add run_eval_sandbox top-level orchestrator"
```

---

## Task 8: User-facing bash wrapper (bin/eval-sandboxed)

Mirror `bin/eval`'s UX: `./bin/eval-sandboxed <skill> [extra args...]`. Preflight checks env vars, resolves paths, invokes the Python module.

**Files:**
- Create: `tools/skill-eval/bin/eval-sandboxed`
- Create: `tools/skill-eval/sandbox/README.md`

- [ ] **Step 1: Write the bash wrapper**

Create `tools/skill-eval/bin/eval-sandboxed`:

```bash
#!/usr/bin/env bash
# Run trigger eval for a subtext skill inside the subtext-sandbox container.
#
# Usage:
#   ./tools/skill-eval/bin/eval-sandboxed <skill-name> [extra args...]
#
# Environment:
#   ANTHROPIC_API_KEY  (required) — forwarded to the container
#   FULLSTORY_API_KEY  (required) — forwarded to the container for MCP auth
#                                   (MCP servers are not contacted in eval
#                                   mode; key is still validated as an
#                                   intentional check that sandbox setup
#                                   would work interactively too)
#
# Extra args forwarded to run_eval_sandbox.py. Notable:
#   --runs-per-query N  (default 3)
#   --model NAME
#   --verbose
#   --timeout S          (default 180)
#
# Results written to skills/<name>/evals/results/<name>-sandboxed-<ts>.json

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $(basename "$0") <skill-name> [extra args...]" >&2
  exit 2
fi

SKILL_NAME="$1"; shift

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HARNESS_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(cd "$HARNESS_DIR/../.." && pwd)"

SKILL_PATH="$REPO_ROOT/skills/$SKILL_NAME"
EVAL_SET="$SKILL_PATH/evals/eval-set.json"
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

for v in ANTHROPIC_API_KEY FULLSTORY_API_KEY; do
  if [ -z "${!v:-}" ]; then
    echo "Error: $v not set" >&2
    exit 1
  fi
done

if ! docker image inspect subtext-sandbox-claude >/dev/null 2>&1; then
  echo "Error: subtext-sandbox-claude image not built. Run:" >&2
  echo "  ./tools/skill-eval/sandbox/build.sh" >&2
  exit 1
fi

mkdir -p "$RESULTS_DIR"
TIMESTAMP="$(date +%Y%m%dT%H%M%S)"
OUT="$RESULTS_DIR/${SKILL_NAME}-sandboxed-${TIMESTAMP}.json"

PYTHON_BIN="$HARNESS_DIR/venv/bin/python"
if [ ! -x "$PYTHON_BIN" ]; then PYTHON_BIN="python3"; fi

echo "Running sandbox eval for '$SKILL_NAME'"
echo "  skill:        $SKILL_PATH"
echo "  eval-set:     $EVAL_SET"
echo "  plugin src:   $PLUGIN_SOURCE"
echo "  output:       $OUT"
echo

cd "$HARNESS_DIR"
"$PYTHON_BIN" -m lib.run_eval_sandbox \
  --skill-path "$SKILL_PATH" \
  --eval-set "$EVAL_SET" \
  --plugin-source "$PLUGIN_SOURCE" \
  --verbose \
  "$@" \
  | tee "$OUT"

echo
echo "Results written to $OUT"
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x tools/skill-eval/bin/eval-sandboxed
```

- [ ] **Step 3: Write the sandbox README**

Create `tools/skill-eval/sandbox/README.md`:

```markdown
# skill-eval sandbox mode

Run the trigger-evaluation harness against the `subtext-sandbox` Docker
container instead of the host machine. Slower, but measures behavior
under a realistic plugin environment — foundation for Phase 2 plugin
matrix testing (subtext alone vs. subtext + Superpowers, etc.).

## Prerequisites

- `subtext-sandbox/` at the repo root (already present)
- Docker Engine + Compose plugin
- `ANTHROPIC_API_KEY` and `FULLSTORY_API_KEY` in env
- Built image: `./tools/skill-eval/sandbox/build.sh`

## Running

```
# One-time build
./tools/skill-eval/sandbox/build.sh

# Per-skill eval (same UX as bin/eval)
./tools/skill-eval/bin/eval-sandboxed proof

# More runs per query
./tools/skill-eval/bin/eval-sandboxed proof --runs-per-query 5
```

Results write to `skills/<name>/evals/results/<name>-sandboxed-<ts>.json`
in the same shape as host-mode results. Filename suffix `-sandboxed`
distinguishes them from `--isolated` and host-default runs.

## Tradeoffs vs. host `bin/eval`

| Mode | Speed | Isolation | Plugin env | Use when |
|---|---|---|---|---|
| `bin/eval`             | Fast   | Shares host `.claude/` | User's installed plugins | Reproducing a routing contest the user actually sees |
| `bin/eval --isolated`  | Fast   | Per-worker tempdir | None (just built-ins + staged skill) | Intrinsic description quality |
| `bin/eval-sandboxed`   | Slow   | Per-query container | Only the subtext plugin, MCP off | Description quality under realistic plugin context |

## Phase 2/3 roadmap

- Phase 2: `EXTRA_PLUGINS` env var (`=superpowers,notion`) installs
  additional marketplaces pre-launch. Named configs under
  `configs/subtext-plus-superpowers.yml` etc.
- Phase 3: Two-stage Dockerfile for caching + parallel worker pool.
```

- [ ] **Step 4: Smoke test the wrapper without running it end-to-end**

```bash
./tools/skill-eval/bin/eval-sandboxed 2>&1 | head -5
```

Expected: `Usage: eval-sandboxed <skill-name> ...`

```bash
./tools/skill-eval/bin/eval-sandboxed nonexistent-skill 2>&1 | head -5
```

Expected: `Error: skill not found at ...`

- [ ] **Step 5: Commit**

```bash
git add tools/skill-eval/bin/eval-sandboxed tools/skill-eval/sandbox/README.md
git commit -m "feat(skill-eval): add bin/eval-sandboxed wrapper and sandbox README"
```

---

## Task 9: End-to-end smoke test

Run the full `bin/eval-sandboxed proof` against a tiny slice of the eval-set and confirm the numbers look plausible.

**Files:** none modified — this task is verification.

- [ ] **Step 1: Build the image if not already built**

```bash
./tools/skill-eval/sandbox/build.sh
```

- [ ] **Step 2: Create a 2-query subset eval-set for the smoke test**

```bash
cat > /tmp/proof-smoke.json <<'EOF'
[
  {
    "query": "Update the button hover state to be slightly darker",
    "should_trigger": true,
    "note": "canonical visual change"
  },
  {
    "query": "Add a new API endpoint for user preferences",
    "should_trigger": false,
    "note": "backend-only"
  }
]
EOF
```

- [ ] **Step 3: Run the smoke test with runs-per-query=1 for speed**

```bash
export ANTHROPIC_API_KEY=...        # must be set
export FULLSTORY_API_KEY=...        # must be set

cd /Users/chip/src/subtext/.worktrees/skill-eval-harness
./tools/skill-eval/venv/bin/python -m lib.run_eval_sandbox \
  --skill-path skills/proof \
  --eval-set /tmp/proof-smoke.json \
  --plugin-source . \
  --runs-per-query 1 \
  --verbose
```

(We call the Python module directly to aim at the custom eval-set, since `bin/eval-sandboxed` hardcodes the per-skill default path.)

**Expected:** A JSON object printed to stdout with `summary.total == 2`, both queries attempted. Each query takes ~30–60 seconds (container start + claude -p latency). Expected total runtime: 1–3 minutes. Individual `pass` values may be true or false — that's signal about the description, not a correctness check. If the run completes with valid JSON output, Phase 1 is wired up.

- [ ] **Step 4: Sanity-compare against host `--isolated` on the same subset**

```bash
# Host-mode isolated run over the same 2 queries
CLAUDECODE= ./tools/skill-eval/venv/bin/python \
  -c "import sys; sys.path.insert(0, 'tools/skill-eval/vendor/skill-creator'); from scripts.run_eval import main; main()" \
  --skill-path skills/proof \
  --eval-set /tmp/proof-smoke.json \
  --isolated \
  --runs-per-query 1 \
  --verbose
```

Expected: results produced. Compare the `trigger_rate` values against Step 3's sandbox run. Directional agreement (both positives fire, both negatives don't — or the same queries fail in both) is the success signal. A single-query divergence at `runs-per-query=1` is not alarming because the model is non-deterministic; a total inversion would be.

- [ ] **Step 5: Document the smoke result**

Append to `tools/skill-eval/sandbox/README.md` under a new `## Validation` heading:

```markdown
## Validation (Phase 1)

Initial smoke test: 2-query subset of `skills/proof/evals/eval-set.json`.

| Mode | Q1 triggered | Q2 triggered |
|---|---|---|
| sandbox   | <fill in>   | <fill in>   |
| host --isolated | <fill in> | <fill in>   |

Docker-run latency per query: <measured>s. Full 22-query run at
runs-per-query=3 projects to ~<estimated>min with Phase 1 serial
dispatch. Phase 3 caching + parallelism should cut this by >10×.
```

Fill in the values from the smoke test. This anchors Phase 1 done-ness.

- [ ] **Step 6: Commit**

```bash
git add tools/skill-eval/sandbox/README.md
git commit -m "docs(skill-eval): record phase-1 sandbox smoke-test baseline"
```

---

## Final review

- [ ] **Run the full test suite**

```bash
cd tools/skill-eval
./venv/bin/pytest tests/ -v
```

Expected: all tests pass. Unit tests only — no container spin-up.

- [ ] **Confirm the new help text is discoverable**

```bash
./bin/eval-sandboxed 2>&1 | head -10
```

Expected: usage banner printed.

- [ ] **Verify no vendored scripts were modified**

```bash
git diff origin/main -- tools/skill-eval/vendor/ | head -5
```

Expected: empty (vendored dir must stay pristine).

---

## Phase 2 + Phase 3 roadmap (not planned in detail here)

Once Phase 1 is proven on real eval runs, two follow-up plans:

**Phase 2 — plugin matrix.** Add `EXTRA_PLUGINS=<csv>` env var to the eval-mode entrypoint branch. Pre-launch loop `claude plugin add <marketplace>` for each listed plugin. Add named YAML configs under `tools/skill-eval/sandbox/configs/` — `subtext-only.yml`, `subtext-plus-superpowers.yml`, etc. Harness iterates configs and produces a matrix CSV (queries × configs → trigger rate).

**Phase 3 — caching + parallelism.** Two-stage Dockerfile: `Dockerfile.base` (Node + Claude + demo-store deps + each plugin config's marketplace adds) cached per config hash; `Dockerfile.query` thin layer for skill stage + prompt injection. Worker pool inside `run_eval_sandbox.py` dispatching N containers concurrently from a query queue. Target: 22 queries × 3 runs × 5 configs < 10 minutes total.

Write those plans once Phase 1's validation numbers tell us which axis (plugin collision vs. runtime cost) matters most in practice.
