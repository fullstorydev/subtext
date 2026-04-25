"""Tests for lib.sandbox_runner.

docker subprocess is mocked — we don't spin containers in unit tests.
"""

from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

from lib.sandbox_runner import run_query_in_sandbox, SandboxResult, parse_model_from_stream

FIXTURES = Path(__file__).parent / "fixtures"


def _mock_popen_streaming(stdout_bytes: bytes, returncode: int = 0):
    """Build a mock Popen object that streams the given bytes line-by-line.

    iter(proc.stdout.readline, b'') iterates by calling readline() until
    it returns b'' (EOF). The mock's side_effect emits each line, then b''.
    """
    proc = MagicMock()
    lines = stdout_bytes.splitlines(keepends=True) + [b""]
    proc.stdout = MagicMock()
    proc.stdout.readline = MagicMock(side_effect=lines)
    proc.stderr = MagicMock()
    proc.stderr.read = MagicMock(return_value=b"")
    # poll: None while running, then returncode after wait()
    proc.poll = MagicMock(return_value=None)
    proc.wait = MagicMock(return_value=returncode)
    proc.returncode = returncode
    proc.terminate = MagicMock()
    proc.kill = MagicMock()
    return proc


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


def test_non_triggered_query_reports_false():
    stdout = (FIXTURES / "stream_not_triggered.jsonl").read_bytes()
    with patch("lib.sandbox_runner.subprocess.Popen") as popen:
        popen.return_value = _mock_popen_streaming(stdout, returncode=0)
        result = run_query_in_sandbox(
            query="What is 7 times 8?",
            clean_name="fixture-skill-fix1",
            description="button style changes",
            plugin_source_path="/host/subtext",
            timeout_s=60,
        )
    assert result.triggered is False


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


def test_model_field_parsed_from_stream():
    """The fixture stream contains a system/init event with a model field;
    SandboxResult.model should be populated from it."""
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
    assert result.model is not None
    # Don't pin to a specific model name — fixture might rotate over time.
    # Just verify it looks like a Claude model identifier.
    assert "claude" in result.model.lower()


def test_early_exit_terminates_subprocess_on_trigger():
    """Once the detector reaches a trigger decision, sandbox_runner should
    terminate the subprocess rather than wait for the full stream to drain."""
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
