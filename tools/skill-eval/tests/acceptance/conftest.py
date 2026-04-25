"""Acceptance tests gating + shared fixtures.

These tests exercise the full harness end-to-end against real Docker and
the live Claude API. They are slow (seconds to minutes), require external
credentials, and are skipped by default.

Enable explicitly:
    RUN_ACCEPTANCE=1 ANTHROPIC_API_KEY=... pytest tests/acceptance/

Per-test gating is via marker:
    @pytest.mark.docker      — requires Docker daemon + sandbox image
    @pytest.mark.api_key     — requires ANTHROPIC_API_KEY in env

Tests collect canonical "what the harness does" numbers under
tests/acceptance/baselines/. Treat those numbers as the contract.
"""

from __future__ import annotations

import os
import subprocess

import pytest


def pytest_collection_modifyitems(config, items):
    """Skip the entire acceptance directory unless RUN_ACCEPTANCE=1."""
    if os.environ.get("RUN_ACCEPTANCE") == "1":
        return
    skip_marker = pytest.mark.skip(reason="acceptance tests gated; set RUN_ACCEPTANCE=1 to run")
    for item in items:
        if "tests/acceptance/" in str(item.fspath):
            item.add_marker(skip_marker)


@pytest.fixture(scope="session")
def require_docker():
    """Skip if Docker daemon isn't reachable."""
    try:
        result = subprocess.run(
            ["docker", "info"],
            capture_output=True,
            timeout=5,
        )
        if result.returncode != 0:
            pytest.skip("Docker daemon not reachable")
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pytest.skip("Docker not available")


@pytest.fixture(scope="session")
def require_api_key():
    """Skip if ANTHROPIC_API_KEY isn't in env."""
    if not os.environ.get("ANTHROPIC_API_KEY"):
        pytest.skip("ANTHROPIC_API_KEY not set in environment")


@pytest.fixture(scope="session")
def require_sandbox_image():
    """Skip if the subtext-only sandbox image isn't built."""
    result = subprocess.run(
        ["docker", "image", "inspect", "subtext-sandbox-claude:latest"],
        capture_output=True,
        timeout=10,
    )
    if result.returncode != 0:
        pytest.skip(
            "subtext-sandbox-claude:latest not built. Run: "
            "./tools/skill-eval/sandbox/build.sh --config subtext-only"
        )


@pytest.fixture(scope="session")
def repo_root():
    """Resolve repo root from this conftest's location.

    Layout: <repo>/tools/skill-eval/tests/acceptance/conftest.py
    parents[0]=acceptance, [1]=tests, [2]=skill-eval, [3]=tools, [4]=repo
    """
    from pathlib import Path
    return Path(__file__).resolve().parents[4]
