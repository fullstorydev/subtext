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
