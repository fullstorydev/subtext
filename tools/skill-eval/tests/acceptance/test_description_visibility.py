"""T2: The staged description is visible to the model at routing time.

Runs one full eval-mode invocation with a unique marker in the description
and asks the model to quote its own description back. Asserts the marker
appears in the model's reply.

This is the strongest signal that EVAL_DESCRIPTION reaches the routing
context — the model literally introspected on its skill description.

Cost: ~30s + ~1k Anthropic tokens per run.
"""

from __future__ import annotations

import json
import os
import subprocess

import pytest


SANDBOX_IMAGE = "subtext-sandbox-claude:latest"


def _run_introspection(repo_root, *, description: str, marker: str, model: str = "claude-sonnet-4-6") -> tuple[int, str, str]:
    """Run a docker invocation that asks the model to quote its description.

    Returns (returncode, stdout, stderr). stdout is line-delimited stream-json.
    """
    query = (
        f"Look up the frontmatter description of the subtext:proof skill in "
        f"your context and reply with the substring `{marker}` if and only if "
        f"that substring appears in the description text. If it does not appear, "
        f"reply with `MARKER_NOT_FOUND`. One short sentence either way."
    )
    proc = subprocess.run(
        [
            "docker", "run", "--rm",
            "-v", f"{repo_root}:/opt/subtext:ro",
            "-e", "PLUGIN_SOURCE=local",
            "-e", f"ANTHROPIC_API_KEY={os.environ['ANTHROPIC_API_KEY']}",
            "-e", f"EVAL_QUERY={query}",
            "-e", "EVAL_CLEAN_NAME=proof",
            "-e", f"EVAL_DESCRIPTION={description}",
            "-e", f"EVAL_MODEL={model}",
            SANDBOX_IMAGE,
        ],
        capture_output=True,
        timeout=180,
    )
    return proc.returncode, proc.stdout.decode("utf-8"), proc.stderr.decode("utf-8")


def _final_reply(stdout: str) -> str | None:
    """Extract the model's final reply text from a stream-json stdout buffer."""
    for line in stdout.splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        if event.get("type") == "result":
            return event.get("result")
    return None


def test_unique_marker_round_trips_through_description(require_docker, require_sandbox_image, require_api_key, repo_root):
    marker = "UNIQUE_MARKER_VISIBILITY_T2_QXJ7K2"
    desc = (
        f"{marker} — this skill captures evidence and proves changes work "
        f"end-to-end via screenshots, traces, and logs. Use when implementing UI."
    )
    rc, stdout, stderr = _run_introspection(repo_root, description=desc, marker=marker)
    assert rc == 0, f"docker run exited {rc}\nstderr:\n{stderr[-600:]}"
    reply = _final_reply(stdout)
    assert reply is not None, f"no result event in stream-json output\nstderr:\n{stderr[-600:]}"
    assert marker in reply, (
        f"marker '{marker}' not in model's reply.\n"
        f"reply: {reply}\n"
        f"This means EVAL_DESCRIPTION did NOT reach the model's routing context."
    )
