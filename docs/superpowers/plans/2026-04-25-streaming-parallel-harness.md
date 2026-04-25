# Streaming + Parallel Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Performance + correctness improvements to the sandbox eval harness so multi-config × n=3 matrix runs complete in tens of minutes instead of hours, then re-baseline Phase 2B and Phase 2C cleanly on Sonnet 4.6 with proper sample size. Adds `--models` matrix dimension as a free-rider.

**Architecture:** Switch the per-query path from `subprocess.run(capture_output=True)` to `Popen` with line-by-line stream reading + early-exit-on-trigger (the Phase 2C aborted-run finding made this unavoidable). Refactor `lib/detect_trigger.py` to a stateful `TriggerDetector` class that can return decisions incrementally. Wrap dispatching with `concurrent.futures.ThreadPoolExecutor` for parallel container runs. Drop `--no-cache` from the default build path so Docker's layer cache speeds up rebuilds. Add `--models` to the matrix wrapper so model becomes a third matrix dimension alongside config and query-style.

**Tech Stack:**
- Python 3.12 + pytest (streaming detector, parallel runner)
- `subprocess.Popen` with line-buffered stdout
- `concurrent.futures.ThreadPoolExecutor` (threads — bottleneck is docker subprocess, not Python compute)
- Docker layer caching (built-in)

---

## Scope boundaries

**In scope (Phase 3):**
- `TriggerDetector` class with `consume(line) -> bool | None` + `finalize() -> bool` (TDD)
- Streaming `sandbox_runner.py` rewrite with `Popen` + early-exit + container kill
- Drop `--no-cache` default in `sandbox/build.sh`; add explicit `--force-rebuild` flag
- Parallel worker pool in `run_eval_sandbox.py` via `--num-workers` flag (default 4)
- `--models` matrix dimension on `bin/eval-sandboxed-matrix`
- Live re-runs: Phase 2B (user-facing) and Phase 2C (subagent-style) on `[subtext-only, subtext-plus-superpowers]` × Sonnet 4.6 × n=3
- `sandbox/README.md` Phase 3 validation writeup with clean numbers + latency measurements

**Out of scope (deferred):**
- Multi-model matrix runs (Phase 4 — within-vendor model matrix is mostly a free-rider once `--models` flag exists, but the actual matrix run goes there)
- Cross-vendor (Cursor, Gemini CLI, Codex CLI) — Phase 5+, vendor-specific detectors
- "Warm container per worker" (long-lived container serving multiple queries) — possible Phase 3.5; Phase 3 stays per-query container
- Two-stage Dockerfile split (`Dockerfile.base` cached separately from `Dockerfile.query`) — Docker's natural layer cache + dropping `--no-cache` covers ~80% of the gain at much lower complexity

**Deliberately preserved:**
- `eval-set-v3.json` unchanged
- `lib/subagent_wrap.py` unchanged
- `bin/eval-sandboxed` and `bin/eval-sandboxed-matrix` UX unchanged (just gain `--models`, `--num-workers`, `--force-rebuild`)
- Result JSON schema unchanged (already includes model/errors fields from earlier work)

---

## File Structure

**Files modified:**
- `tools/skill-eval/lib/detect_trigger.py` — refactor to add `TriggerDetector` class; keep `detect_trigger_from_stream(lines, clean_name)` as thin wrapper
- `tools/skill-eval/tests/test_detect_trigger.py` — add tests for the streaming class API
- `tools/skill-eval/lib/sandbox_runner.py` — rewrite `run_query_in_sandbox` to use `Popen` + line streaming + `TriggerDetector` incremental + container kill on early-exit
- `tools/skill-eval/tests/test_sandbox_runner.py` — adjust mocks for the new Popen pattern; add early-exit tests
- `tools/skill-eval/lib/run_eval_sandbox.py` — add `--num-workers` flag and `ThreadPoolExecutor` wrapping
- `tools/skill-eval/tests/test_run_eval_sandbox.py` — add test for parallel dispatch
- `tools/skill-eval/sandbox/build.sh` — drop `--no-cache` default; add `--force-rebuild` flag
- `tools/skill-eval/bin/eval-sandboxed-matrix` — add `--models <csv>` flag, iterate over (config, model) pairs
- `tools/skill-eval/sandbox/README.md` — Phase 3 validation section

**No new files** — Phase 3 is consolidation, not new modules.

---

## Testing strategy

- **TDD-able:** `TriggerDetector` class (Task 1) — pure stateful function, testable with line-by-line fixtures.
- **TDD-able with mocks:** streaming `sandbox_runner` (Task 2) — mock `subprocess.Popen`, simulate streamed lines, verify early-exit behavior + cleanup.
- **TDD-able with mocks:** parallel `run_eval_sandbox` (Task 4) — mock `run_query_in_sandbox`, verify multiple queries dispatched concurrently.
- **Manual verification:** build cache (Task 3), `--models` matrix dimension (Task 5).
- **Live verification:** Tasks 6 and 7 are the actual re-baselines.
- **Full suite stays green:** 35 prior + new tests = ~42 passing pytest.

---

## Task 1: Refactor detector to stateful `TriggerDetector` class

**Files:**
- Modify: `tools/skill-eval/lib/detect_trigger.py`
- Modify: `tools/skill-eval/tests/test_detect_trigger.py`

The existing `detect_trigger_from_stream(lines, clean_name) -> bool` is a single-pass function that iterates the full stream. To support early-exit in the sandbox runner, we need an incremental interface where each line can produce a definitive answer mid-stream.

### Step 1: Read the current detector

```bash
cat /Users/chip/src/subtext/.worktrees/skill-eval-harness/tools/skill-eval/lib/detect_trigger.py
```

Note the state variables: `pending_tool_name`, `accumulated_json`, `triggered`. These become instance attributes on the new class.

### Step 2: Write the failing tests

Add the following tests at the end of `tools/skill-eval/tests/test_detect_trigger.py`:

```python
from lib.detect_trigger import TriggerDetector


def test_detector_consume_returns_none_for_pre_decision_lines():
    """Lines before any tool_use event don't yield a decision yet."""
    d = TriggerDetector(CLEAN_NAME)
    # A pre-trigger event from the fixture (e.g., system/init)
    sample_line = '{"type": "system", "subtype": "init", "model": "claude-sonnet-4-6"}'
    assert d.consume(sample_line) is None


def test_detector_returns_true_on_input_json_delta_match():
    """Match in input_json_delta should immediately return True."""
    d = TriggerDetector(CLEAN_NAME)
    # Simulate the sequence: content_block_start (Skill tool_use) → content_block_delta (json with name)
    start_line = (
        '{"type": "stream_event", "event": {"type": "content_block_start", '
        '"content_block": {"type": "tool_use", "name": "Skill"}}}'
    )
    delta_line = (
        '{"type": "stream_event", "event": {"type": "content_block_delta", '
        '"delta": {"type": "input_json_delta", "partial_json": "{\\"skill\\": \\"' + CLEAN_NAME + '\\""}}}'
    )
    assert d.consume(start_line) is None  # tool_use of Skill type, no decision yet
    assert d.consume(delta_line) is True  # match found, early-exit


def test_detector_returns_false_on_unrelated_tool_use():
    """A tool_use for a non-Skill/non-Read tool means definitive False."""
    d = TriggerDetector(CLEAN_NAME)
    bash_line = (
        '{"type": "stream_event", "event": {"type": "content_block_start", '
        '"content_block": {"type": "tool_use", "name": "Bash"}}}'
    )
    assert d.consume(bash_line) is False


def test_detector_finalize_returns_accumulated_state():
    """When stream ends without a decision, finalize() returns the accumulated state."""
    d = TriggerDetector(CLEAN_NAME)
    # Feed only pre-decision events
    d.consume('{"type": "system", "subtype": "init"}')
    d.consume('{"type": "user", "message": {}}')
    # No tool_use, no result event — stream ended early.
    assert d.finalize() is False  # no triggered events accumulated


def test_detector_handles_full_triggered_fixture_incrementally():
    """Streaming the full triggered fixture line-by-line produces True at the right point."""
    lines = (FIXTURES / "stream_triggered.jsonl").read_text().splitlines()
    d = TriggerDetector(CLEAN_NAME)
    decision = None
    for line in lines:
        decision = d.consume(line)
        if decision is not None:
            break
    assert decision is True


def test_detector_handles_full_not_triggered_fixture_incrementally():
    """Streaming the not-triggered fixture line-by-line produces False (or None until finalize)."""
    lines = (FIXTURES / "stream_not_triggered.jsonl").read_text().splitlines()
    d = TriggerDetector(CLEAN_NAME)
    decision = None
    for line in lines:
        decision = d.consume(line)
        if decision is not None:
            break
    if decision is None:
        decision = d.finalize()
    assert decision is False


def test_detect_trigger_from_stream_thin_wrapper_still_works():
    """The function-style API (used by other callers) must still work — implemented as a wrapper."""
    triggered_lines = (FIXTURES / "stream_triggered.jsonl").read_text().splitlines()
    not_triggered_lines = (FIXTURES / "stream_not_triggered.jsonl").read_text().splitlines()
    assert detect_trigger_from_stream(triggered_lines, CLEAN_NAME) is True
    assert detect_trigger_from_stream(not_triggered_lines, CLEAN_NAME) is False
```

### Step 3: Run tests to verify they fail

```bash
cd /Users/chip/src/subtext/.worktrees/skill-eval-harness/tools/skill-eval
./venv/bin/pytest tests/test_detect_trigger.py -v 2>&1 | tail -20
```

Expected: 7 new tests fail with `ImportError: cannot import name 'TriggerDetector' from 'lib.detect_trigger'`. The 6 existing wrapper tests still pass.

### Step 4: Implement the `TriggerDetector` class

Refactor `tools/skill-eval/lib/detect_trigger.py`. Replace the entire file content with:

```python
"""Pure trigger-detection for claude -p stream-json output.

Two APIs:

- `TriggerDetector` class for streaming/incremental use. Phase 3 sandbox_runner
  uses this to early-exit `claude -p` once the trigger decision is reached,
  saving large amounts of wallclock on subagent-style queries that would
  otherwise run the full 300s timeout doing implementation work.

- `detect_trigger_from_stream(lines, clean_name) -> bool` — a thin wrapper
  for backward compatibility with existing callers that have the full stream
  as a list of lines.

Mirrors the detection logic in vendor/skill-creator/scripts/run_eval.py's
run_single_query loop. Vendored module remains pristine; this is the
in-house mirror so we can refactor freely.
"""

from __future__ import annotations

import json
from collections.abc import Iterable


class TriggerDetector:
    """Stateful incremental trigger detector.

    Feed lines one at a time via `consume(line)`. Returns:
      - True  → definitive trigger (caller can early-exit subprocess)
      - False → definitive non-trigger (caller can early-exit subprocess)
      - None  → no decision yet, keep streaming

    When the stream ends without a definitive decision, call `finalize()`
    to get the accumulated answer (typically False if no tool_use was seen).
    """

    def __init__(self, clean_name: str) -> None:
        self.clean_name = clean_name
        self._pending_tool_name: str | None = None
        self._accumulated_json: str = ""
        self._triggered: bool = False

    def consume(self, line: str) -> bool | None:
        """Process one stream-json line. Returns a definitive bool when ready,
        or None if more input is needed."""
        line = line.strip()
        if not line:
            return None
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            return None

        etype = event.get("type")

        if etype == "stream_event":
            se = event.get("event", {})
            se_type = se.get("type", "")

            if se_type == "content_block_start":
                cb = se.get("content_block", {})
                if cb.get("type") == "tool_use":
                    tool_name = cb.get("name", "")
                    if tool_name in ("Skill", "Read"):
                        self._pending_tool_name = tool_name
                        self._accumulated_json = ""
                    else:
                        # Non-Skill/Read tool_use → definitive False
                        return False

            elif se_type == "content_block_delta" and self._pending_tool_name:
                delta = se.get("delta", {})
                if delta.get("type") == "input_json_delta":
                    self._accumulated_json += delta.get("partial_json", "")
                    if self.clean_name in self._accumulated_json:
                        return True

            elif se_type in ("content_block_stop", "message_stop"):
                if self._pending_tool_name:
                    return self.clean_name in self._accumulated_json
                if se_type == "message_stop":
                    return False

        elif etype == "assistant":
            # Mirrors vendor run_eval.py: returns on first tool_use content item.
            # Do NOT move this return outside the loop — claude -p eval streams
            # emit one tool per assistant turn, and multi-tool drift would
            # diverge from the upstream detection contract.
            message = event.get("message", {})
            for content_item in message.get("content", []):
                if content_item.get("type") != "tool_use":
                    continue
                tool_name = content_item.get("name", "")
                tool_input = content_item.get("input", {})
                if tool_name == "Skill" and self.clean_name in tool_input.get("skill", ""):
                    self._triggered = True
                elif tool_name == "Read" and self.clean_name in tool_input.get("file_path", ""):
                    self._triggered = True
                return self._triggered

        elif etype == "result":
            return self._triggered

        return None

    def finalize(self) -> bool:
        """Called when stream ends without a definitive decision.

        Returns the accumulated `triggered` state — typically False if no
        tool_use ever appeared.
        """
        return self._triggered


def detect_trigger_from_stream(lines: Iterable[str], clean_name: str) -> bool:
    """Single-pass detector — thin wrapper over TriggerDetector for callers
    that have the full stream as a list of lines.

    Used by tests with recorded fixtures and by any non-streaming consumer.
    """
    detector = TriggerDetector(clean_name)
    for raw in lines:
        decision = detector.consume(raw)
        if decision is not None:
            return decision
    return detector.finalize()
```

### Step 5: Run tests to verify pass

```bash
./venv/bin/pytest tests/test_detect_trigger.py -v 2>&1 | tail -20
```

Expected: 13 passed (6 prior wrapper tests + 7 new streaming tests).

### Step 6: Run the full suite for regressions

```bash
./venv/bin/pytest tests/ -v 2>&1 | tail -3
```

Expected: 42 passed (35 prior + 7 new in this task).

### Step 7: Commit

```bash
cd /Users/chip/src/subtext/.worktrees/skill-eval-harness
git add tools/skill-eval/lib/detect_trigger.py tools/skill-eval/tests/test_detect_trigger.py
git commit -m "refactor(skill-eval): TriggerDetector class for incremental detection

Splits the existing detect_trigger_from_stream(lines, clean_name) into a
stateful TriggerDetector class with consume(line) -> bool|None and
finalize() -> bool. The standalone function is now a thin wrapper.

Why: the existing single-pass API forced sandbox_runner to wait for
subprocess.run() to finish before parsing the stream. With subagent-style
queries that approach was burning 300s timeouts on routing decisions
that were made in the first 5 seconds of the response.

The streaming API lets sandbox_runner (Phase 3 Task 2) feed lines into
the detector as they arrive and early-exit the docker subprocess once
the decision is reached.

7 new tests cover: pre-decision None returns, input_json_delta True,
non-Skill/non-Read False, finalize on stream-end, full-fixture
incremental walks (triggered + not-triggered), and backward-compat
of the function wrapper."
```

---

## Task 2: Streaming sandbox runner with early-exit

**Files:**
- Modify: `tools/skill-eval/lib/sandbox_runner.py`
- Modify: `tools/skill-eval/tests/test_sandbox_runner.py`

Rewrite `run_query_in_sandbox` to use `subprocess.Popen` with line-by-line stream reading, feeding each line into a `TriggerDetector`. Once the detector returns a definitive decision, terminate the docker subprocess (and the underlying container) so we don't burn API tokens on work we don't need.

### Step 1: Read the current sandbox_runner

```bash
cat /Users/chip/src/subtext/.worktrees/skill-eval-harness/tools/skill-eval/lib/sandbox_runner.py
```

Note the existing buffered-subprocess pattern (`subprocess.run(capture_output=True, timeout=timeout_s, check=False)`).

### Step 2: Write the failing tests

Replace the body of `tools/skill-eval/tests/test_sandbox_runner.py` (the existing tests need updating to mock `Popen` instead of `subprocess.run`). Use Edit for surgical changes — the test file already has fixtures + autouse env var setup; we only need to swap the `subprocess.run` mocks for `Popen` mocks and add a new test for early-exit.

Find the existing `test_triggered_query_reports_triggered`:

- `old_string`:
```
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
```

- `new_string`:
```
def _mock_popen_streaming(stdout_bytes: bytes, returncode: int = 0):
    """Build a mock Popen object that streams the given bytes line-by-line."""
    proc = MagicMock()
    # stdout.readline() yields one line at a time, then b'' for EOF
    lines = stdout_bytes.splitlines(keepends=True) + [b""]
    proc.stdout = MagicMock()
    proc.stdout.readline = MagicMock(side_effect=lines)
    proc.stdout.read = MagicMock(return_value=b"")  # in case caller drains
    proc.stderr = MagicMock()
    proc.stderr.read = MagicMock(return_value=b"")
    proc.poll = MagicMock(side_effect=[None] * len(lines) + [returncode])
    proc.wait = MagicMock(return_value=returncode)
    proc.returncode = returncode
    proc.terminate = MagicMock()
    proc.kill = MagicMock()
    return proc


def test_triggered_query_reports_triggered():
    stdout = (FIXTURES / "stream_triggered.jsonl").read_bytes()
    with patch("lib.sandbox_runner.subprocess.Popen") as popen:
        popen.return_value = _mock_popen_streaming(stdout, returncode=0)
        result = run_query_in_sandbox(
            query="Change the button color",
            clean_name="fixture-skill-fix1",
            description="button style changes",
            plugin_source_path="/host/subtext",
            timeout_s=60,
        )
    assert isinstance(result, SandboxResult)
    assert result.triggered is True
```

Apply equivalent updates to `test_non_triggered_query_reports_false` (mock Popen instead of run, use the not-triggered fixture).

For `test_nonzero_exit_raises`, swap to a Popen mock that finishes with returncode=1 and no stdout:

- `old_string`:
```
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
```

- `new_string`:
```
def test_nonzero_exit_raises():
    proc = _mock_popen_streaming(b"", returncode=1)
    proc.stderr.read = MagicMock(return_value=b"boom")
    with patch("lib.sandbox_runner.subprocess.Popen") as popen:
        popen.return_value = proc
        with pytest.raises(RuntimeError, match="docker run failed"):
            run_query_in_sandbox(
                query="q",
                clean_name="fixture-skill-fix1",
                description="desc",
                plugin_source_path="/host/subtext",
                timeout_s=60,
            )
```

For `test_docker_command_shape` (verifies the argv shape), update to use `Popen.call_args` instead of `subprocess.run.call_args`:

- `old_string`:
```
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
```

- `new_string`:
```
def test_docker_command_shape():
    """Verify the docker run argv so future changes can't silently drop flags."""
    stdout = (FIXTURES / "stream_not_triggered.jsonl").read_bytes()
    with patch("lib.sandbox_runner.subprocess.Popen") as popen:
        popen.return_value = _mock_popen_streaming(stdout, returncode=0)
        run_query_in_sandbox(
            query="hello",
            clean_name="cname",
            description="desc",
            plugin_source_path="/host/subtext",
            timeout_s=90,
        )
    call_args = popen.call_args.args[0]
```

For `test_model_field_parsed_from_stream`, similar swap (subprocess.run → Popen with the streaming mock).

Add a new test for early-exit:

```python
def test_early_exit_terminates_subprocess_on_trigger():
    """Once the detector reaches a trigger decision, sandbox_runner should
    terminate the subprocess rather than wait for the full stream to drain."""
    # Build a stream where the trigger decision appears mid-stream
    stream_bytes = (FIXTURES / "stream_triggered.jsonl").read_bytes()
    proc = _mock_popen_streaming(stream_bytes, returncode=0)
    with patch("lib.sandbox_runner.subprocess.Popen") as popen:
        popen.return_value = proc
        result = run_query_in_sandbox(
            query="Change the button color",
            clean_name="fixture-skill-fix1",
            description="button style changes",
            plugin_source_path="/host/subtext",
            timeout_s=60,
        )
    # On a triggered-decision, the runner should have called terminate() to
    # bail out of the subprocess early.
    assert proc.terminate.called or proc.kill.called
    assert result.triggered is True
```

### Step 3: Run tests to verify the existing ones fail with the new mock pattern

```bash
cd /Users/chip/src/subtext/.worktrees/skill-eval-harness/tools/skill-eval
./venv/bin/pytest tests/test_sandbox_runner.py -v 2>&1 | tail -20
```

Expected: tests fail because `sandbox_runner.py` still uses `subprocess.run`, not `subprocess.Popen`. Some tests may pass spuriously (the dataclass tests don't depend on subprocess).

### Step 4: Rewrite `sandbox_runner.py` to use streaming Popen

Replace the body of `run_query_in_sandbox` with the streaming pattern. Use Edit. The full new function:

- `old_string`:
```
def run_query_in_sandbox(
    query: str,
    clean_name: str,
    description: str,
    plugin_source_path: str,
    timeout_s: int = 180,
    image: str = os.environ.get("SANDBOX_IMAGE", "subtext-sandbox-claude"),
    model: str | None = None,
) -> SandboxResult:
```

- `new_string`:
```
def run_query_in_sandbox(
    query: str,
    clean_name: str,
    description: str,
    plugin_source_path: str,
    timeout_s: int = 180,
    image: str = os.environ.get("SANDBOX_IMAGE", "subtext-sandbox-claude"),
    model: str | None = None,
) -> SandboxResult:
    """Run one eval query inside a subtext-sandbox container, streaming the
    output line-by-line and early-exiting the subprocess as soon as the
    trigger decision is reached.

    Phase 3 rewrite: switched from subprocess.run (buffered) to subprocess.Popen
    + line-by-line streaming so subagent-style queries don't burn the full
    timeout doing implementation work after the routing decision is already
    made. Typical per-query latency drops from ~58s (Phase 2B) or ~300s timeout
    (Phase 2C) to ~10-15s (mostly container startup + first model token).

    Requires ANTHROPIC_API_KEY in caller's env. Forwarded to the container.

    Returns a SandboxResult. Raises RuntimeError on docker exit != 0 (after
    drain). Catches subprocess.TimeoutExpired and converts to RuntimeError.
    """
```

Now find the body that currently uses `subprocess.run` and replace it with the streaming version.

- `old_string`:
```
    for required in ("ANTHROPIC_API_KEY",):
        if not os.environ.get(required):
            raise RuntimeError(f"{required} not set in environment")

    cmd = [
        "docker", "run", "--rm",
        "-v", f"{plugin_source_path}:/opt/subtext:ro",
        "-e", "PLUGIN_SOURCE=local",
        "-e", f"ANTHROPIC_API_KEY={os.environ['ANTHROPIC_API_KEY']}",
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
    model_observed = parse_model_from_stream(lines)
    return SandboxResult(
        triggered=triggered,
        exit_code=completed.returncode,
        stdout_bytes=len(completed.stdout),
        stderr_tail=stderr[-200:] if stderr else "",
        model=model_observed,
    )
```

- `new_string`:
```
    for required in ("ANTHROPIC_API_KEY",):
        if not os.environ.get(required):
            raise RuntimeError(f"{required} not set in environment")

    cmd = [
        "docker", "run", "--rm",
        "-v", f"{plugin_source_path}:/opt/subtext:ro",
        "-e", "PLUGIN_SOURCE=local",
        "-e", f"ANTHROPIC_API_KEY={os.environ['ANTHROPIC_API_KEY']}",
        "-e", f"EVAL_QUERY={query}",
        "-e", f"EVAL_CLEAN_NAME={clean_name}",
        "-e", f"EVAL_DESCRIPTION={description}",
    ]
    if model:
        cmd.extend(["-e", f"EVAL_MODEL={model}"])
    cmd.append(image)

    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        bufsize=1,  # line-buffered
    )

    detector = TriggerDetector(clean_name)
    captured_lines: list[str] = []
    triggered: bool | None = None
    timed_out = [False]  # mutable so the timer thread can flag it

    # Hard timeout enforced via a watchdog thread. Important because
    # proc.stdout.readline() is blocking — a deadline check inside the
    # loop wouldn't fire while readline is waiting on output. The watchdog
    # calls terminate() after timeout_s; that closes stdout, which causes
    # readline to return b"" and the loop to exit cleanly.
    def _watchdog() -> None:
        if proc.poll() is None:
            timed_out[0] = True
            proc.terminate()

    watchdog = threading.Timer(timeout_s, _watchdog)
    watchdog.start()

    try:
        # iter(callable, sentinel) iterates by calling readline() until it
        # returns b"" (EOF). Works whether EOF comes from a normal exit or
        # from terminate() closing the pipe.
        for line_bytes in iter(proc.stdout.readline, b""):
            line = line_bytes.decode("utf-8", errors="replace")
            captured_lines.append(line)
            decision = detector.consume(line)
            if decision is not None:
                triggered = decision
                # Early-exit: the routing decision is in. Terminate the
                # docker subprocess so we don't burn budget on subagent-
                # style queries that would otherwise keep "implementing"
                # until the timeout.
                proc.terminate()
                break

        if triggered is None:
            # Stream ended without a definitive decision.
            triggered = detector.finalize()

        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=5)

    except Exception:
        # Defensive cleanup on any error path.
        if proc.poll() is None:
            proc.kill()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                pass
        raise
    finally:
        watchdog.cancel()

    if timed_out[0]:
        stderr_bytes = proc.stderr.read() if proc.stderr else b""
        raise RuntimeError(
            f"docker run timed out after {timeout_s}s "
            f"(stderr tail: {stderr_bytes.decode('utf-8', errors='replace')[-200:]})"
        )

    # exit code: SIGTERM (143) or SIGKILL (137) are EXPECTED on early-exit
    # and don't indicate failure. Real docker errors produce other non-zero
    # exit codes alongside actual stderr content.
    exit_code = proc.returncode
    stderr_bytes = proc.stderr.read() if proc.stderr else b""
    stderr_tail = stderr_bytes.decode("utf-8", errors="replace")[-200:]

    # Treat non-zero exits as failures ONLY if we didn't intentionally
    # terminate. SIGTERM (143) and SIGKILL (137) are us terminating after
    # an early-exit; those are healthy outcomes.
    if exit_code not in (0, 143, 137, -15, -9, None):
        raise RuntimeError(
            f"docker run failed (exit {exit_code}): {stderr_tail}"
        )

    model_observed = parse_model_from_stream(captured_lines)
    stdout_bytes = sum(len(line.encode("utf-8")) for line in captured_lines)

    return SandboxResult(
        triggered=triggered,
        exit_code=exit_code if exit_code is not None else 0,
        stdout_bytes=stdout_bytes,
        stderr_tail=stderr_tail,
        model=model_observed,
    )
```

This requires importing `time` and the `TriggerDetector` class. Update the imports at the top of the file:

- `old_string`:
```
import json
import os
import subprocess
from collections.abc import Iterable
from dataclasses import dataclass

from lib.detect_trigger import detect_trigger_from_stream
```

- `new_string`:
```
import json
import os
import subprocess
import threading
from collections.abc import Iterable
from dataclasses import dataclass

from lib.detect_trigger import TriggerDetector, detect_trigger_from_stream
```

### Step 5: Run tests to verify pass

```bash
./venv/bin/pytest tests/test_sandbox_runner.py -v 2>&1 | tail -15
```

Expected: 6 passed (the 5 prior tests adapted + 1 new early-exit test).

### Step 6: Full suite

```bash
./venv/bin/pytest tests/ -v 2>&1 | tail -3
```

Expected: 43 passed (35 prior + 7 from Task 1 + 1 new in Task 2; note Task 2 doesn't add net tests, it adapts existing 5 to Popen mocks and adds 1 new = +1 net).

Actual count to check: prior was 35, Task 1 adds 7 → 42, Task 2 adds 1 (early-exit test) → 43.

### Step 7: Commit

```bash
cd /Users/chip/src/subtext/.worktrees/skill-eval-harness
git add tools/skill-eval/lib/sandbox_runner.py tools/skill-eval/tests/test_sandbox_runner.py
git commit -m "feat(skill-eval): streaming sandbox runner with early-exit

Switch run_query_in_sandbox from subprocess.run (buffered) to
subprocess.Popen + line-by-line streaming. Each line goes into the
TriggerDetector class added in the prior commit. The instant the
detector returns a definitive decision (True/False), terminate the
docker subprocess so we don't burn API tokens on the rest of the
response.

Why: Phase 2C's aborted run revealed that subagent-shaped prompts
make claude-p attempt full implementation work — multiple tool
calls, file edits, etc. — until the 300s timeout kills the container.
The routing decision is made in the first ~5 seconds of the response;
the rest is wasted budget.

Expected per-query latency drop:
- Phase 2B user-facing: ~58s → ~10-15s (was already routing fast,
  small wins from skipping post-routing tool calls)
- Phase 2C subagent: ~300s timeout → ~10-15s (massive — the
  routing decision is on the same timescale; the wrap was just
  asking claude to keep going afterwards)

SIGTERM (143) and SIGKILL (137) exit codes from intentional early-exit
are treated as healthy. Real docker errors still surface as
RuntimeError with stderr tail.

Adapted 5 existing tests to mock Popen instead of subprocess.run via
a _mock_popen_streaming helper. Added 1 new test:
test_early_exit_terminates_subprocess_on_trigger verifies the runner
calls terminate() once a decision is reached."
```

---

## Task 3: Drop `--no-cache` from default build path

**Files:**
- Modify: `tools/skill-eval/sandbox/build.sh`

The current `build.sh` always builds with `--no-cache`. That was correct for the early "ensure freshness" stance but is now blocking us — sandbox image rebuilds take ~3-5 minutes when most of the layers are reproducible. Make `--no-cache` opt-in via a new `--force-rebuild` flag.

### Step 1: Read current build.sh

```bash
cat /Users/chip/src/subtext/.worktrees/skill-eval-harness/tools/skill-eval/sandbox/build.sh
```

### Step 2: Replace the build invocation

Use Edit. Find the existing `docker build` invocation:

- `old_string`:
```
echo "Building config '$CONFIG' (tag: $TAG) from $DOCKERFILE..."
docker build --no-cache -t "$TAG" -f "$DOCKERFILE" "$SANDBOX_DIR"
echo "Built $TAG"
```

- `new_string`:
```
BUILD_FLAGS=()
if [ "${FORCE_REBUILD:-0}" = "1" ]; then
  BUILD_FLAGS+=(--no-cache)
  echo "Building config '$CONFIG' (tag: $TAG) from $DOCKERFILE — full rebuild forced..."
else
  echo "Building config '$CONFIG' (tag: $TAG) from $DOCKERFILE — using Docker layer cache (pass --force-rebuild to bypass)..."
fi
docker build "${BUILD_FLAGS[@]}" -t "$TAG" -f "$DOCKERFILE" "$SANDBOX_DIR"
echo "Built $TAG"
```

Now add `--force-rebuild` to the arg parser. Find the arg-parsing loop:

- `old_string`:
```
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
```

- `new_string`:
```
CONFIG="subtext-only"
FORCE_REBUILD=0
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
    --force-rebuild)
      FORCE_REBUILD=1
      shift
      ;;
    *)
      echo "Error: unknown argument '$1'" >&2
      echo "Usage: $(basename "$0") [--config <subtext-only|subtext-plus-superpowers>] [--force-rebuild]" >&2
      exit 2
      ;;
  esac
done
```

### Step 3: Smoke-test

```bash
cd /Users/chip/src/subtext/.worktrees/skill-eval-harness
# Default (cached) build
time ./tools/skill-eval/sandbox/build.sh 2>&1 | tail -5
# Expected: completes quickly (a few seconds) since most layers cached;
# message "using Docker layer cache" in the banner

# Force rebuild
time ./tools/skill-eval/sandbox/build.sh --force-rebuild 2>&1 | tail -5
# Expected: takes longer (a few minutes); message "full rebuild forced"
```

### Step 4: Commit

```bash
git add tools/skill-eval/sandbox/build.sh
git commit -m "build(skill-eval): use Docker layer cache by default

Drop the --no-cache flag from the default build path. Docker's natural
layer caching keeps reproducibility (each Dockerfile RUN is a content-
addressed layer) and slashes incremental rebuild time from ~3-5 min
to a few seconds when nothing meaningful changed.

Add --force-rebuild flag to opt into the prior --no-cache behavior
when needed (Dockerfile changes, dependency upgrades, debugging
build issues).

Phase 3 prep: Phase 2B+2C re-runs will rebuild both subtext-only and
subtext-plus-superpowers images on the new harness; using the cache
makes that fast."
```

---

## Task 4: Parallel worker pool in `run_eval_sandbox.py`

**Files:**
- Modify: `tools/skill-eval/lib/run_eval_sandbox.py`
- Modify: `tools/skill-eval/tests/test_run_eval_sandbox.py`

Add a `--num-workers` flag (default 4) and wrap the per-query loop in `concurrent.futures.ThreadPoolExecutor`. Threads (not processes) are correct here because the bottleneck is the docker subprocess, not Python compute — the GIL is not a constraint.

### Step 1: Write the failing test

Add the following test at the end of `tools/skill-eval/tests/test_run_eval_sandbox.py`:

```python
def test_num_workers_dispatches_in_parallel():
    """When num_workers > 1, multiple queries should be dispatched concurrently.

    We verify by checking that all N mocked run_query_in_sandbox calls happen
    'before' all N return — i.e., we observe overlap. Use a barrier.
    """
    import threading

    eval_set = [
        {"query": f"Q{i}", "should_trigger": True} for i in range(4)
    ]
    barrier = threading.Barrier(4)
    call_count = 0
    lock = threading.Lock()

    def waits_for_barrier(**kwargs):
        nonlocal call_count
        with lock:
            call_count += 1
        # All 4 calls should reach this barrier together — proves they ran in parallel
        barrier.wait(timeout=5.0)
        return _res(True)

    with patch("lib.run_eval_sandbox.run_query_in_sandbox", side_effect=waits_for_barrier):
        output = run_eval_over_sandbox(
            eval_set=eval_set,
            skill_name="subtext:proof",
            description="desc",
            plugin_source_path="/host/subtext",
            runs_per_query=1,
            num_workers=4,
        )
    assert call_count == 4
    assert output["summary"]["passed"] == 4
```

### Step 2: Run to verify failure

```bash
cd tools/skill-eval
./venv/bin/pytest tests/test_run_eval_sandbox.py::test_num_workers_dispatches_in_parallel -v 2>&1 | tail -10
```

Expected: `TypeError: run_eval_over_sandbox() got an unexpected keyword argument 'num_workers'` (or barrier timeout if num_workers is silently ignored).

### Step 3: Add `num_workers` parameter and ThreadPoolExecutor

Update `tools/skill-eval/lib/run_eval_sandbox.py`. Multiple edits.

Add the import at the top:

- `old_string`:
```
from __future__ import annotations

import argparse
import json
import re
import sys
import uuid
from pathlib import Path
```

- `new_string`:
```
from __future__ import annotations

import argparse
import json
import re
import sys
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
```

Add `num_workers` parameter to the function signature:

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
    query_style: str = "user-facing",
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
    num_workers: int = 4,
) -> dict:
```

Now refactor the query loop to dispatch via ThreadPoolExecutor. The current loop iterates queries × runs serially. We want to flatten that into a list of (query_idx, run_idx) jobs and run them through a thread pool.

Find the existing per-query loop. The cleanest refactor is to extract the per-query-run work into a helper function and dispatch it via the executor.

This is a larger refactor. Replace the entire body from `results = []` to `passed = sum(...)`:

- `old_string`:
```
    results = []
    for item_index, item in enumerate(eval_set):
        triggers = 0
        # Use a fresh uuid per *query* so different queries don't collide on
        # staged command filenames inside the container. Runs within a
        # query can share it (we reset the container anyway each run).
        unique_id = uuid.uuid4().hex[:8]
        clean_name = f"{skill_name}-skill-{unique_id}".replace(":", "-")

        errors = 0
        observed_models: set[str] = set()
        for run_idx in range(runs_per_query):
            if verbose:
                print(
                    f"[{item['query'][:50]}] run {run_idx + 1}/{runs_per_query}",
                    file=sys.stderr,
                )
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
                if r.triggered:
                    triggers += 1
                if r.model:
                    observed_models.add(r.model)
            except Exception as e:  # noqa: BLE001 — log and carry on
                errors += 1
                print(f"  warn: query failed: {e}", file=sys.stderr)

        trigger_rate = triggers / runs_per_query
        should_trigger = item["should_trigger"]
        did_pass = (
            trigger_rate >= trigger_threshold
            if should_trigger
            else trigger_rate < trigger_threshold
        )
        # observed_models will usually be a single model across all runs of
        # one query; surface as comma-separated string if multiple (rare —
        # would only happen if model rotated mid-run).
        result_model = ",".join(sorted(observed_models)) if observed_models else None
        results.append({
            "query": item["query"],
            "should_trigger": should_trigger,
            "trigger_rate": trigger_rate,
            "triggers": triggers,
            "runs": runs_per_query,
            "pass": did_pass,
            "errors": errors,
            "model": result_model,
        })
```

- `new_string`:
```
    # Pre-compute per-query metadata (clean_name, effective_query) so the
    # parallel dispatch only needs to fan out the run-level work.
    per_query_meta: list[tuple[int, dict, str, str]] = []  # (item_index, item, clean_name, effective_query)
    for item_index, item in enumerate(eval_set):
        unique_id = uuid.uuid4().hex[:8]
        clean_name = f"{skill_name}-skill-{unique_id}".replace(":", "-")
        effective_query = (
            wrap_subagent_query(item["query"], task_num=item_index + 1)
            if query_style == "subagent"
            else item["query"]
        )
        per_query_meta.append((item_index, item, clean_name, effective_query))

    def _run_one(item_index: int, item: dict, clean_name: str, effective_query: str, run_idx: int) -> tuple[int, SandboxResult | Exception]:
        """Worker function — returns (item_index, result-or-exception)."""
        if verbose:
            print(
                f"[{item['query'][:50]}] run {run_idx + 1}/{runs_per_query}",
                file=sys.stderr,
            )
        try:
            r = run_query_in_sandbox(
                query=effective_query,
                clean_name=clean_name,
                description=description,
                plugin_source_path=plugin_source_path,
                timeout_s=timeout_s,
                model=model,
            )
            return (item_index, r)
        except Exception as e:  # noqa: BLE001 — log and carry on
            return (item_index, e)

    # Per-query state, indexed by item_index.
    triggers_by_query: dict[int, int] = {i: 0 for i in range(len(eval_set))}
    errors_by_query: dict[int, int] = {i: 0 for i in range(len(eval_set))}
    models_by_query: dict[int, set[str]] = {i: set() for i in range(len(eval_set))}

    # Build the full job list: one entry per (query, run).
    jobs = [
        (item_index, item, clean_name, effective_query, run_idx)
        for (item_index, item, clean_name, effective_query) in per_query_meta
        for run_idx in range(runs_per_query)
    ]

    with ThreadPoolExecutor(max_workers=num_workers) as executor:
        future_list = [executor.submit(_run_one, *job) for job in jobs]
        for future in as_completed(future_list):
            item_index, result_or_exc = future.result()
            if isinstance(result_or_exc, Exception):
                errors_by_query[item_index] += 1
                print(f"  warn: query failed: {result_or_exc}", file=sys.stderr)
            else:
                if result_or_exc.triggered:
                    triggers_by_query[item_index] += 1
                if result_or_exc.model:
                    models_by_query[item_index].add(result_or_exc.model)

    # Aggregate per-query results in the original eval-set order.
    results = []
    for item_index, item in enumerate(eval_set):
        triggers = triggers_by_query[item_index]
        errors = errors_by_query[item_index]
        observed_models = models_by_query[item_index]
        trigger_rate = triggers / runs_per_query
        should_trigger = item["should_trigger"]
        did_pass = (
            trigger_rate >= trigger_threshold
            if should_trigger
            else trigger_rate < trigger_threshold
        )
        result_model = ",".join(sorted(observed_models)) if observed_models else None
        results.append({
            "query": item["query"],
            "should_trigger": should_trigger,
            "trigger_rate": trigger_rate,
            "triggers": triggers,
            "runs": runs_per_query,
            "pass": did_pass,
            "errors": errors,
            "model": result_model,
        })
```

Now wire `--num-workers` into argparse and the call to `run_eval_over_sandbox` in `main()`:

- `old_string`:
```
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

- `new_string`:
```
    parser.add_argument(
        "--query-style",
        choices=["user-facing", "subagent"],
        default="user-facing",
        help="user-facing (default): pass queries to claude -p as-is. "
             "subagent: wrap each query in a subagent-dispatch-prompt template "
             "to measure framework-flow routing surface.",
    )
    parser.add_argument(
        "--num-workers",
        type=int,
        default=4,
        help="Number of parallel docker run workers (default 4). "
             "Each worker spins up its own container; tune based on host "
             "CPU/memory.",
    )
    args = parser.parse_args()
```

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
        query_style=args.query_style,
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
        num_workers=args.num_workers,
    )
```

### Step 4: Run tests

```bash
./venv/bin/pytest tests/test_run_eval_sandbox.py -v 2>&1 | tail -10
```

Expected: 9 passed (8 prior + 1 new parallel test).

### Step 5: Full suite

```bash
./venv/bin/pytest tests/ -v 2>&1 | tail -3
```

Expected: 44 passed (43 prior + 1 new in this task).

### Step 6: Smoke-test CLI

```bash
./venv/bin/python -m lib.run_eval_sandbox --help 2>&1 | grep -A 2 "num-workers"
```

Expected: `--num-workers NUM_WORKERS` followed by the help text.

### Step 7: Commit

```bash
cd /Users/chip/src/subtext/.worktrees/skill-eval-harness
git add tools/skill-eval/lib/run_eval_sandbox.py tools/skill-eval/tests/test_run_eval_sandbox.py
git commit -m "feat(skill-eval): parallel worker pool

Adds --num-workers flag (default 4) to run_eval_sandbox. Wraps the
per-query × per-run dispatch in concurrent.futures.ThreadPoolExecutor
so multiple docker containers run concurrently.

Threads (not processes) — the bottleneck is the docker subprocess,
not Python compute. GIL doesn't apply here.

Default 4 workers is a reasonable target for a developer laptop:
each container peaks around ~600MB, so 4 workers ≈ 2.4GB. Tune up
on bigger hosts via --num-workers.

Combined with Task 2's streaming + early-exit, expected matrix run
time for 30 queries × n=3 × 2 configs drops from ~90 minutes serial
to ~10 minutes (4× from parallelism × ~5× from early-exit on
subagent-style runs).

1 new test (test_num_workers_dispatches_in_parallel) verifies actual
concurrent dispatch via a thread barrier. Existing tests continue
passing because num_workers defaults to 4 with no functional impact
on single-query semantics."
```

---

## Task 5: `--models` matrix dimension

**Files:**
- Modify: `tools/skill-eval/bin/eval-sandboxed-matrix`

Add a `--models <csv>` flag to the matrix wrapper. For each model, run the eval across all configs. Output filename includes the model name. Default `--models` is empty → existing behavior (use eval-sandboxed's default = Sonnet 4.6).

### Step 1: Read current matrix wrapper

```bash
cat /Users/chip/src/subtext/.worktrees/skill-eval-harness/tools/skill-eval/bin/eval-sandboxed-matrix
```

### Step 2: Add `--models` to arg parsing

Use Edit. Find the existing arg-parsing block:

- `old_string`:
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

- `new_string`:
```
CONFIGS="subtext-only,subtext-plus-superpowers"
QUERY_STYLE="user-facing"
MODELS=""  # empty = use eval-sandboxed's default (claude-sonnet-4-6)
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
    --models)
      MODELS="$2"
      shift 2
      ;;
    --models=*)
      MODELS="${1#*=}"
      shift
      ;;
    *)
      FORWARDED_ARGS+=("$1")
      shift
      ;;
  esac
done
```

### Step 3: Iterate over models in the per-config loop

Find the existing per-config dispatch loop:

- `old_string`:
```
echo "Matrix eval for '$SKILL_NAME' across configs: $CONFIGS"
echo "Query style: $QUERY_STYLE"
echo

# Split CSV → array.
IFS=',' read -r -a CONFIG_ARRAY <<< "$CONFIGS"

# Run each config serially; collect the output file paths.
PER_CONFIG_RESULTS=()
for cfg in "${CONFIG_ARRAY[@]}"; do
  echo "=== Running config: $cfg (query-style: $QUERY_STYLE) ==="
  "$SCRIPT_DIR/eval-sandboxed" "$SKILL_NAME" --config "$cfg" --query-style "$QUERY_STYLE" "${FORWARDED_ARGS[@]}"
  # The most recent result file for this config + style.
  LATEST="$(ls -t "$RESULTS_DIR"/"$SKILL_NAME"-sandboxed-"$cfg"-"$QUERY_STYLE"-*.json 2>/dev/null | head -1)"
  if [ -z "$LATEST" ]; then
    echo "Error: no result file found for config '$cfg'" >&2
    exit 1
  fi
  PER_CONFIG_RESULTS+=("$cfg=$LATEST")
  echo "  → $LATEST"
  echo
done
```

- `new_string`:
```
echo "Matrix eval for '$SKILL_NAME' across configs: $CONFIGS"
echo "Query style: $QUERY_STYLE"
if [ -n "$MODELS" ]; then
  echo "Models: $MODELS"
else
  echo "Models: (eval-sandboxed default = claude-sonnet-4-6)"
fi
echo

# Split CSV → arrays.
IFS=',' read -r -a CONFIG_ARRAY <<< "$CONFIGS"
if [ -n "$MODELS" ]; then
  IFS=',' read -r -a MODEL_ARRAY <<< "$MODELS"
else
  MODEL_ARRAY=("")  # empty string = let eval-sandboxed pick its default
fi

# Run each (config, model) pair; collect the output file paths.
# Per-config-result label format: "<cfg>__<model>" so the matrix
# consolidator treats each pair as a distinct column.
PER_CONFIG_RESULTS=()
for model in "${MODEL_ARRAY[@]}"; do
  for cfg in "${CONFIG_ARRAY[@]}"; do
    if [ -n "$model" ]; then
      echo "=== Running config: $cfg / model: $model (query-style: $QUERY_STYLE) ==="
      "$SCRIPT_DIR/eval-sandboxed" "$SKILL_NAME" --config "$cfg" --query-style "$QUERY_STYLE" --model "$model" "${FORWARDED_ARGS[@]}"
      LABEL="${cfg}__${model}"
    else
      echo "=== Running config: $cfg (query-style: $QUERY_STYLE, model: default) ==="
      "$SCRIPT_DIR/eval-sandboxed" "$SKILL_NAME" --config "$cfg" --query-style "$QUERY_STYLE" "${FORWARDED_ARGS[@]}"
      LABEL="$cfg"
    fi
    # The most recent result file for this config + style.
    LATEST="$(ls -t "$RESULTS_DIR"/"$SKILL_NAME"-sandboxed-"$cfg"-"$QUERY_STYLE"-*.json 2>/dev/null | head -1)"
    if [ -z "$LATEST" ]; then
      echo "Error: no result file found for config '$cfg' (model '$model')" >&2
      exit 1
    fi
    PER_CONFIG_RESULTS+=("${LABEL}=$LATEST")
    echo "  → $LATEST"
    echo
  done
done
```

### Step 4: Smoke-test

```bash
cd /Users/chip/src/subtext/.worktrees/skill-eval-harness
# Default — banner mentions Sonnet 4.6 as default
./tools/skill-eval/bin/eval-sandboxed-matrix proof 2>&1 | head -10 &
sleep 3 && kill $! 2>/dev/null
wait 2>/dev/null
# Expected: "Models: (eval-sandboxed default = claude-sonnet-4-6)"

# Explicit single model
./tools/skill-eval/bin/eval-sandboxed-matrix proof --models claude-sonnet-4-6 2>&1 | head -10 &
sleep 3 && kill $! 2>/dev/null
wait 2>/dev/null
# Expected: "Models: claude-sonnet-4-6"
```

### Step 5: Commit

```bash
git add tools/skill-eval/bin/eval-sandboxed-matrix
git commit -m "feat(skill-eval): --models matrix dimension

Adds --models <csv> flag to bin/eval-sandboxed-matrix. For each model
(or just one if not specified), runs the eval across all configs.

When --models is empty (default), behavior matches Phase 2B/2C —
each per-config dispatch uses bin/eval-sandboxed's default
(claude-sonnet-4-6). Set --models claude-sonnet-4-6,claude-opus-4-7
to iterate.

Per-config-result labels in the matrix carry the model: '<cfg>__<model>'.
This unblocks Phase 4 (within-vendor model matrix) — when caching +
parallelism (this Phase 3) make multi-model runs tractable, just pass
--models to enable the dimension.

Phase 3 itself uses --models implicitly (default = Sonnet 4.6) so the
Phase 2B and 2C re-runs (Tasks 6 and 7) are model-pinned and
reproducible without explicit invocation."
```

---

## Task 6: Live re-run — Phase 2B clean (user-facing)

**Files:** records output under `skills/proof/evals/results/`. Gitignored.

### Step 1: Source API key + verify state

```bash
cd /Users/chip/src/subtext/.worktrees/skill-eval-harness
set -a; source /Users/chip/src/subtext/bench/.env.local; set +a
echo "ANTHROPIC_API_KEY length: ${#ANTHROPIC_API_KEY}"
```

Expected: non-zero length.

### Step 2: Rebuild images via the new cached default

```bash
time ./tools/skill-eval/sandbox/build.sh --config subtext-only 2>&1 | tail -5
time ./tools/skill-eval/sandbox/build.sh --config subtext-plus-superpowers 2>&1 | tail -5
```

Expected: both finish in seconds (Docker layer cache hits).

### Step 3: Launch Phase 2B re-run with parallel + streaming + Sonnet 4.6 + n=3

```bash
time ./tools/skill-eval/bin/eval-sandboxed-matrix proof \
  --query-style user-facing \
  --runs-per-query 3 \
  --num-workers 4 \
  --timeout 60 \
  > /tmp/phase3-2b-rerun.log 2>&1
```

Expected runtime: ~10 minutes total (2 configs × 30 queries × 3 runs / 4 workers / ~10s per query average with early-exit).

The `--timeout 60` is much shorter than Phase 2B's 300s — early-exit handles the routing decision quickly; if a query takes >60s without a decision, that's a real anomaly.

### Step 4: Inspect results

```bash
MATRIX_JSON=$(ls -t skills/proof/evals/results/proof-matrix-user-facing-*.json | head -1)
MATRIX_MD=$(ls -t skills/proof/evals/results/proof-matrix-user-facing-*.md | head -1)
echo "JSON: $MATRIX_JSON"
echo "MD:   $MATRIX_MD"
echo
cat "$MATRIX_MD"
```

Record the per-config pass counts, divergences, and the `summary.models` field for Task 8's writeup.

### Step 5: No commit — gitignored

---

## Task 7: Live re-run — Phase 2C clean (subagent-style)

Same configs, same n=3, same Sonnet 4.6, but now with `--query-style subagent` and the streaming early-exit harness.

### Step 1: Source API key (if shell rotated since Task 6)

```bash
cd /Users/chip/src/subtext/.worktrees/skill-eval-harness
set -a; source /Users/chip/src/subtext/bench/.env.local; set +a
```

### Step 2: Launch Phase 2C re-run

```bash
time ./tools/skill-eval/bin/eval-sandboxed-matrix proof \
  --query-style subagent \
  --runs-per-query 3 \
  --num-workers 4 \
  --timeout 60 \
  > /tmp/phase3-2c-rerun.log 2>&1
```

Expected runtime: ~10 minutes (subagent-style queries don't take longer with early-exit — the routing decision happens at the same time regardless of how the agent would have continued).

### Step 3: Inspect results

```bash
MATRIX_JSON=$(ls -t skills/proof/evals/results/proof-matrix-subagent-*.json | head -1)
MATRIX_MD=$(ls -t skills/proof/evals/results/proof-matrix-subagent-*.md | head -1)
cat "$MATRIX_MD"
```

Record the per-config pass counts and divergences for Task 8's writeup.

### Step 4: No commit — gitignored

---

## Task 8: Phase 3 validation writeup

**Files:**
- Modify: `tools/skill-eval/sandbox/README.md`

Replace the Phase 2B (n=1, model-uncalibrated) and aborted Phase 2C sections with the clean Phase 3 numbers. Document harness performance improvements alongside.

### Step 1: Read current Validation section structure

```bash
grep -n '^## Validation' tools/skill-eval/sandbox/README.md
```

### Step 2: Append new Phase 3 section

Use Edit. Find the end of the Phase 2B Validation section (or wherever the most recent Phase 2 numbers live). Add a new section:

- `old_string`:
```
Environment: docker images `subtext-sandbox-claude:latest`, `subtext-sandbox-claude-superpowers:latest`, `Darwin arm64 (Apple Silicon)` host.
```

- `new_string`:
```
Environment: docker images `subtext-sandbox-claude:latest`, `subtext-sandbox-claude-superpowers:latest`, `Darwin arm64 (Apple Silicon)` host.

## Validation (Phase 3 clean re-baselines, <fill-in date>)

Phase 3 added streaming + early-exit + parallel workers + `--models` dimension. This section presents Phase 2B and Phase 2C re-runs under the new harness with proper sample size and pinned model.

### Phase 2B re-run (user-facing, Sonnet 4.6, n=3)

| Config | Passed | Failed | With errors | Avg latency / query |
|---|---|---|---|---|
| subtext-only | <fill-in>/30 | <fill-in> | <fill-in> | ~<fill-in>s |
| subtext-plus-superpowers | <fill-in>/30 | <fill-in> | <fill-in> | ~<fill-in>s |

Total runtime: ~<fill-in>min (was ~60min serial in Phase 2B).
Speedup: <fill-in>×.

Matrix output: `skills/proof/evals/results/<fill-in matrix-md filename>`

### Phase 2C re-run (subagent-style, Sonnet 4.6, n=3)

| Config | Passed | Failed | With errors | Avg latency / query |
|---|---|---|---|---|
| subtext-only | <fill-in>/30 | <fill-in> | <fill-in> | ~<fill-in>s |
| subtext-plus-superpowers | <fill-in>/30 | <fill-in> | <fill-in> | ~<fill-in>s |

Phase 2C aborted in Phase 2 (subagent-style prompts hit 300s timeouts because claude-p didn't auto-stop after routing). With Phase 3's streaming early-exit, ~<fill-in>s avg per query — comparable to Phase 2B user-facing.

Matrix output: `skills/proof/evals/results/<fill-in matrix-md filename>`

### Cross-mode divergences (user-facing vs subagent at same n=3, Sonnet 4.6)

<fill-in: list queries where trigger_rate differs ≥0.5 between user-facing and subagent at the same config>

### Cross-config divergences (subtext-only vs subtext-plus-superpowers at same query-style)

<fill-in: list queries where trigger_rate differs ≥0.5 between configs at the same query-style>

### Interpretation

<fill-in 3-5 bullets based on what the data actually shows. Examples to adapt:>

- "User-facing matrix on Sonnet 4.6 at n=3 confirms Phase 2A's 27/30 baseline (within ±N queries; sample-size noise vs the n=3 host-isolated comparison is the residual)."
- "Subagent-style matrix at n=3 shows <X/30 vs Y/30> for subtext-only vs subtext-plus-superpowers — comparable spread to user-facing, suggesting the subagent shape itself doesn't significantly shift routing once explicit framework cues are absent."
- "The Phase 2B 'Follow TDD' divergence (subagent-style query 12 with explicit cue) is reproduced — proof loses to SP's TDD on that query in subtext-plus-superpowers, both modes."
- "Hard-negative behavior is unchanged: 0 over-triggers in any of the 4 cells (2 configs × 2 query styles)."

### Harness performance gains (Phase 2B baseline → Phase 3)

| Metric | Phase 2B baseline | Phase 3 | Improvement |
|---|---|---|---|
| Per-query latency (user-facing) | ~58s | ~<fill-in>s | <fill-in>× |
| Per-query latency (subagent-style) | 300s timeout (~30% rate) | ~<fill-in>s | clean — no timeouts |
| Wallclock for 2-config × 30-query × n=1 | ~60min | ~<fill-in>min | <fill-in>× |
| Wallclock for 2-config × 30-query × n=3 | ~180min projected serial | ~<fill-in>min | <fill-in>× |
| Build time (--no-cache) | ~3-5min always | ~3-5min only when --force-rebuild | cached default = seconds |

Improvements come from three independent levers:

1. **Streaming + early-exit** in `lib/sandbox_runner.py` (cuts each query from 30-300s to ~10-15s)
2. **Parallel worker pool** in `lib/run_eval_sandbox.py` (4× speedup at default)
3. **Docker layer cache** in `sandbox/build.sh` (full builds only on --force-rebuild)

Phase 4 (within-vendor model matrix) is unblocked by these gains.

Environment: docker images `subtext-sandbox-claude:latest`, `subtext-sandbox-claude-superpowers:latest`, `Darwin arm64 (Apple Silicon)` host. Models: `claude-sonnet-4-6` (canonical baseline).
```

### Step 3: Fill in placeholders from Tasks 6 and 7's outputs

Replace every `<fill-in>` with real measurements. The matrix markdown files from Tasks 6 and 7 are the source of truth for per-config numbers.

### Step 4: Verify no placeholders remain

```bash
grep '<fill-in>' tools/skill-eval/sandbox/README.md && echo "STILL HAS PLACEHOLDERS" || echo "OK: no placeholders"
```

Expected: `OK: no placeholders`.

### Step 5: Commit

```bash
git add tools/skill-eval/sandbox/README.md
git commit -m "docs(skill-eval): record Phase 3 clean re-baseline

Streaming + parallel + cached harness reruns of Phase 2B (user-facing)
and Phase 2C (subagent-style) on Sonnet 4.6 at n=3. Replaces the
n=1 model-uncalibrated baselines from Phase 2B and the aborted
Phase 2C run.

Includes harness performance gains table (latency, wallclock,
build time). Cross-mode and cross-config divergences documented.
Phase 4 (within-vendor model matrix) is unblocked."
```

---

## Final review

- [ ] **Run the full test suite**

```bash
cd tools/skill-eval
./venv/bin/pytest tests/ -v 2>&1 | tail -3
```

Expected: 44 passed.

- [ ] **Verify wrappers accept new flags**

```bash
./tools/skill-eval/sandbox/build.sh --force-rebuild --config subtext-only 2>&1 | head -2
./tools/skill-eval/venv/bin/python -m lib.run_eval_sandbox --help 2>&1 | grep "num-workers"
./tools/skill-eval/bin/eval-sandboxed-matrix proof --models claude-sonnet-4-6 2>&1 | head -5 ; sleep 1; pkill -f "eval-sandboxed-matrix" 2>/dev/null
```

- [ ] **Vendored scripts unchanged**

```bash
cd /Users/chip/src/subtext/.worktrees/skill-eval-harness
git diff origin/main -- tools/skill-eval/vendor/ | wc -l
```

Expected: `0`.

- [ ] **Phase 2 sections of `sandbox/README.md` no longer claim n=1 numbers as canonical**

The original n=1 numbers stay in the README for historical comparison but the Phase 3 section makes the new clean numbers the authoritative baseline.

---

## Phase 4 + Phase 5 roadmap (separate plans)

- **Phase 4 — Within-vendor model matrix.** Use the `--models` flag added in this Phase 3 to run `{Opus 4.7, Opus 4.6, Sonnet 4.6, Haiku 4.5}` × 2 configs × 2 query-styles. ~10-20 minute matrix per model with current harness. Output: a `models × configs × query-style` 3D matrix surface that says which Claude model variant routes proof most reliably under various ecosystem conditions.

- **Phase 5 — Cross-vendor.** Adapt the harness to run against `cursor agent`, `gemini`, `codex exec`, etc. Each vendor needs its own:
  - Invocation glue (different CLI args, different env vars)
  - Stream parser (different output formats — Cursor's may not be JSON at all)
  - Skill-loading semantics (some vendors don't have a skill loader concept; the eval target shifts to "did the prompt route to our intended subagent / tool" instead)

  Phase 5 is genuinely a different scope — documented in `docs/skill-eval-research/framework-targets.md` as future scope.
