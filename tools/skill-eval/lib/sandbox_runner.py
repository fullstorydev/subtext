"""Per-query Docker orchestrator for skill-eval sandbox mode.

One invocation = one docker run = one claude -p = one triggered/not judgment.
Serial by design in Phase 1. Phase 3 will add parallel worker pools.
"""

from __future__ import annotations

import os
import subprocess
from dataclasses import dataclass

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
