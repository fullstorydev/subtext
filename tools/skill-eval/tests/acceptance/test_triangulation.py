"""T3/T4/T5: Triangulation across host-mode and sandbox-mode positive/negative controls.

Each test runs the appropriate harness invocation against a small fixture
eval-set (3 known-positive UI queries × 3 runs), parses the resulting JSON,
and writes a baseline file under tests/acceptance/baselines/.

The baseline files are the contract — committed to git. Re-run these tests
when the harness changes; if the numbers shift materially, that's a signal
to investigate before merging.

Tests don't assert strict trigger-rate thresholds (those would be flaky
against model variance). Instead they assert that the harness completes,
writes a parseable result, and records the per-query trigger rate in a
baseline file the reader can inspect.

Layout of each baseline file:
    {
      "harness_mode": "host-isolated" | "sandbox" | ...,
      "description": "<text the harness measured against>",
      "model": "claude-sonnet-4-6",
      "runs_per_query": 3,
      "results": [
        {"query": "...", "triggers": N, "runs": 3, "trigger_rate": 0.xx},
        ...
      ]
    }
"""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

import pytest


FIXTURE_EVAL_SET = (
    Path(__file__).parent / "fixtures" / "triangulation-eval-set.json"
).resolve()
BASELINES_DIR = (Path(__file__).parent / "baselines").resolve()

ORIGINAL_DESCRIPTION = (
    "You MUST use this skill when implementing, fixing, or refactoring code. "
    "Captures evidence artifacts (screenshots, network traces, code diffs, "
    "trace session links) into a proof document as you work."
)
BACKEND_EXCLUSION_DESCRIPTION = (
    "Use this skill ONLY for backend Python services and database migrations. "
    "Do NOT use for frontend, UI, React, TypeScript, CSS, or any visual work whatsoever."
)


def _strip_banner_to_json(buf: str) -> dict:
    """Strip leading non-JSON banner from harness stdout, parse the rest."""
    lines = buf.splitlines()
    json_start = next((i for i, line in enumerate(lines) if line.startswith("{")), None)
    if json_start is None:
        raise AssertionError(f"no JSON object in harness output:\n{buf[:500]}")
    # Find the matching closing brace by tracking depth — output may have
    # trailing log lines after the JSON.
    depth = 0
    end_idx = None
    for i in range(json_start, len(lines)):
        for ch in lines[i]:
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    end_idx = i
                    break
        if end_idx is not None:
            break
    if end_idx is None:
        raise AssertionError(f"unterminated JSON in harness output:\n{buf[:500]}")
    return json.loads("\n".join(lines[json_start:end_idx + 1]))


def _record_baseline(name: str, payload: dict) -> Path:
    """Write a baseline file under tests/acceptance/baselines/."""
    BASELINES_DIR.mkdir(parents=True, exist_ok=True)
    path = BASELINES_DIR / f"{name}.json"
    path.write_text(json.dumps(payload, indent=2) + "\n")
    return path


def _build_payload(mode: str, description: str, harness_output: dict) -> dict:
    """Reduce a harness result dict to the fields we want in the baseline."""
    summary = harness_output.get("summary", {})
    models = summary.get("models", []) if isinstance(summary, dict) else []
    return {
        "harness_mode": mode,
        "description": description,
        "models": models,
        "runs_per_query": harness_output["results"][0]["runs"] if harness_output.get("results") else None,
        "results": [
            {
                "query": r["query"],
                "triggers": r["triggers"],
                "runs": r["runs"],
                "trigger_rate": r["trigger_rate"],
            }
            for r in harness_output.get("results", [])
        ],
    }


def test_T3_host_mode_isolated_positive_control(require_api_key, repo_root):
    """T3: pre-docker baseline. Runs bin/eval --isolated against 3 UI positives."""
    env = os.environ.copy()
    env["EVAL_SET_OVERRIDE"] = str(FIXTURE_EVAL_SET)
    proc = subprocess.run(
        [
            str(repo_root / "tools/skill-eval/bin/eval"),
            "proof",
            "--isolated",
            "--runs-per-query", "3",
        ],
        capture_output=True,
        timeout=600,
        env=env,
    )
    assert proc.returncode == 0, (
        f"bin/eval --isolated exited {proc.returncode}\n"
        f"stderr tail:\n{proc.stderr.decode('utf-8')[-800:]}"
    )
    output = _strip_banner_to_json(proc.stdout.decode("utf-8"))
    assert "results" in output, f"no results in output:\n{output}"
    payload = _build_payload("host-isolated", ORIGINAL_DESCRIPTION, output)
    path = _record_baseline("host-mode-positive", payload)
    print(f"\nT3 baseline written to {path}")
    print(f"  per-query trigger rates: {[(r['query'][:40], r['trigger_rate']) for r in payload['results']]}")


def test_T4_sandbox_positive_control(require_docker, require_sandbox_image, require_api_key, repo_root):
    """T4: sandbox harness with original description on the same 3 queries.

    Compare the result against T3 (host-isolated). If T4 << T3, the docker
    layer is suppressing trigger signal vs. host-mode. That's the regression
    the user flagged.
    """
    env = os.environ.copy()
    env["EVAL_SET_OVERRIDE"] = str(FIXTURE_EVAL_SET)
    proc = subprocess.run(
        [
            str(repo_root / "tools/skill-eval/bin/eval-sandboxed"),
            "proof",
            "--config", "subtext-only",
            "--query-style", "user-facing",
            "--runs-per-query", "3",
            "--num-workers", "3",
        ],
        capture_output=True,
        timeout=900,
        env=env,
    )
    assert proc.returncode == 0, (
        f"bin/eval-sandboxed exited {proc.returncode}\n"
        f"stderr tail:\n{proc.stderr.decode('utf-8')[-800:]}"
    )
    output = _strip_banner_to_json(proc.stdout.decode("utf-8"))
    payload = _build_payload("sandbox-subtext-only", ORIGINAL_DESCRIPTION, output)
    path = _record_baseline("sandbox-positive", payload)
    print(f"\nT4 baseline written to {path}")
    print(f"  per-query trigger rates: {[(r['query'][:40], r['trigger_rate']) for r in payload['results']]}")


def test_T5_sandbox_negative_control(require_docker, require_sandbox_image, require_api_key, repo_root):
    """T5: sandbox harness with an exclusionary description on the same 3 UI queries.

    If T5 ≈ T4, EVAL_DESCRIPTION isn't reaching routing.
    If T5 << T4, EVAL_DESCRIPTION measurably steers behavior.
    """
    env = os.environ.copy()
    env["EVAL_SET_OVERRIDE"] = str(FIXTURE_EVAL_SET)
    proc = subprocess.run(
        [
            str(repo_root / "tools/skill-eval/bin/eval-sandboxed"),
            "proof",
            "--config", "subtext-only",
            "--query-style", "user-facing",
            "--runs-per-query", "3",
            "--num-workers", "3",
            "--description", BACKEND_EXCLUSION_DESCRIPTION,
        ],
        capture_output=True,
        timeout=900,
        env=env,
    )
    assert proc.returncode == 0, (
        f"bin/eval-sandboxed exited {proc.returncode}\n"
        f"stderr tail:\n{proc.stderr.decode('utf-8')[-800:]}"
    )
    output = _strip_banner_to_json(proc.stdout.decode("utf-8"))
    # The harness must report this as the description it tested.
    assert output.get("description") == BACKEND_EXCLUSION_DESCRIPTION, (
        "harness reported a different description than the override.\n"
        f"got: {output.get('description')[:200]}"
    )
    payload = _build_payload("sandbox-subtext-only", BACKEND_EXCLUSION_DESCRIPTION, output)
    path = _record_baseline("sandbox-negative", payload)
    print(f"\nT5 baseline written to {path}")
    print(f"  per-query trigger rates: {[(r['query'][:40], r['trigger_rate']) for r in payload['results']]}")
