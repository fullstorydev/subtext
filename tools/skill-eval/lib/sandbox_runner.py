"""Per-query Docker orchestrator for skill-eval sandbox mode.

One invocation = one docker run = one claude -p = one triggered/not judgment.
Serial by design in Phase 1. Phase 3 will add parallel worker pools.
"""

from __future__ import annotations

import json
import os
import subprocess
import threading
from collections.abc import Iterable
from dataclasses import dataclass

from lib.detect_trigger import TriggerDetector, detect_trigger_from_stream


def parse_model_from_stream(lines: Iterable[str]) -> str | None:
    """Extract the model identifier from a claude -p stream-json output.

    claude -p emits a `system/init` event near the start of every run with a
    `model` field (e.g., 'claude-sonnet-4-6', 'claude-opus-4-7'). Returns the
    first such model name found, or None if no init event is present.

    Used by sandbox_runner to surface which model was actually used in
    SandboxResult, closing a reproducibility gap in result JSONs.
    """
    for raw in lines:
        line = raw.strip()
        if not line:
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        if event.get("type") == "system" and event.get("subtype") == "init":
            model = event.get("model")
            if model:
                return model
    return None


@dataclass
class SandboxResult:
    triggered: bool
    exit_code: int
    stdout_bytes: int
    stderr_tail: str
    model: str | None = None


def run_query_in_sandbox(
    query: str,
    clean_name: str,
    description: str,
    plugin_source_path: str,
    timeout_s: int = 180,
    image: str = os.environ.get("SANDBOX_IMAGE", "subtext-sandbox-claude"),
    model: str | None = None,
) -> SandboxResult:
    """Run one eval query inside the subtext-sandbox container.

    Requires ANTHROPIC_API_KEY in the caller's environment, forwarded into
    the container.

    Returns a SandboxResult. Raises RuntimeError on docker exit != 0.
    """
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise RuntimeError("ANTHROPIC_API_KEY not set in environment")

    # Note: FULLSTORY_API_KEY is not required in eval mode — the container
    # entrypoint deletes /workspace/.mcp.json before running claude -p,
    # so MCP servers (the only consumer of that key) are never contacted.
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

    # Exit codes: SIGTERM (143 / -15) and SIGKILL (137 / -9) on intentional
    # early-exit are EXPECTED and not failures. Real docker errors produce
    # other non-zero exit codes alongside meaningful stderr content.
    exit_code = proc.returncode
    stderr_bytes = proc.stderr.read() if proc.stderr else b""
    stderr_tail = stderr_bytes.decode("utf-8", errors="replace")[-200:]

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
