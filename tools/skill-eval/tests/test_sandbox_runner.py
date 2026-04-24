"""Tests for lib.sandbox_runner.

docker subprocess is mocked — we don't spin containers in unit tests.
"""

from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

from lib.sandbox_runner import run_query_in_sandbox, SandboxResult

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture(autouse=True)
def _fake_api_keys(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")


def test_missing_api_key_raises(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    with pytest.raises(RuntimeError, match="ANTHROPIC_API_KEY"):
        run_query_in_sandbox(
            query="q",
            clean_name="cname",
            description="desc",
            plugin_source_path="/host/subtext",
            timeout_s=60,
        )


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
    # FULLSTORY_API_KEY must NOT be forwarded in eval mode
    assert not any(e.startswith("FULLSTORY_API_KEY=") for e in env_flags)
