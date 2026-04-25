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
    assert set(output["summary"].keys()) == {"total", "passed", "failed", "with_errors"}
    result = output["results"][0]
    assert set(result.keys()) == {
        "query", "should_trigger", "trigger_rate", "triggers", "runs", "pass", "errors"
    }


def test_errors_field_counts_raised_runs():
    """When run_query_in_sandbox raises, the result should track the error count."""
    eval_set = [{"query": "Q1", "should_trigger": True}]
    with patch("lib.run_eval_sandbox.run_query_in_sandbox") as rq:
        rq.side_effect = [_res(True), RuntimeError("docker died"), _res(True)]
        output = run_eval_over_sandbox(
            eval_set=eval_set,
            skill_name="subtext:proof",
            description="desc",
            plugin_source_path="/host/subtext",
            runs_per_query=3,
        )
    result = output["results"][0]
    assert result["errors"] == 1
    assert result["triggers"] == 2
    assert result["runs"] == 3


def test_summary_with_errors_counts_results_with_errors():
    """Summary should track how many queries had at least one errored run."""
    eval_set = [
        {"query": "Q1", "should_trigger": True},
        {"query": "Q2", "should_trigger": False},
    ]
    with patch("lib.run_eval_sandbox.run_query_in_sandbox") as rq:
        # Q1: all three runs raise; Q2: all three succeed without triggering
        rq.side_effect = [
            RuntimeError("x"), RuntimeError("x"), RuntimeError("x"),
            _res(False), _res(False), _res(False),
        ]
        output = run_eval_over_sandbox(
            eval_set=eval_set,
            skill_name="subtext:proof",
            description="desc",
            plugin_source_path="/host/subtext",
            runs_per_query=3,
        )
    assert output["summary"]["with_errors"] == 1
    # Q1 is a positive with 0 triggers → FAIL. Q2 is a negative with 0 triggers → PASS.
    assert output["summary"]["passed"] == 1
    assert output["summary"]["failed"] == 1


def test_subagent_query_style_wraps_query_before_dispatch():
    """When query_style='subagent', run_query_in_sandbox should receive a
    wrapped prompt (not the raw query). The wrap is verified by checking the
    'You are implementing Task' framing in the dispatched query."""
    eval_set = [{"query": "Add input validation", "should_trigger": True}]
    captured_queries = []

    def capture_query(**kwargs):
        captured_queries.append(kwargs["query"])
        return _res(True)

    with patch("lib.run_eval_sandbox.run_query_in_sandbox", side_effect=capture_query):
        run_eval_over_sandbox(
            eval_set=eval_set,
            skill_name="subtext:proof",
            description="desc",
            plugin_source_path="/host/subtext",
            runs_per_query=1,
            query_style="subagent",
        )
    assert len(captured_queries) == 1
    assert captured_queries[0].startswith("You are implementing Task")
    assert "Add input validation" in captured_queries[0]


def test_user_facing_query_style_passes_query_unchanged():
    """When query_style='user-facing' (default), run_query_in_sandbox should
    receive the raw query unchanged."""
    eval_set = [{"query": "Add input validation", "should_trigger": True}]
    captured_queries = []

    def capture_query(**kwargs):
        captured_queries.append(kwargs["query"])
        return _res(True)

    with patch("lib.run_eval_sandbox.run_query_in_sandbox", side_effect=capture_query):
        run_eval_over_sandbox(
            eval_set=eval_set,
            skill_name="subtext:proof",
            description="desc",
            plugin_source_path="/host/subtext",
            runs_per_query=1,
            # query_style defaults to user-facing
        )
    assert captured_queries == ["Add input validation"]
