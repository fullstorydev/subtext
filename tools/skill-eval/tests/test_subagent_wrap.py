"""Unit tests for lib.subagent_wrap.

Verifies the subagent-dispatch-prompt template embeds the original query and
mirrors the shape used by Superpowers' subagent-driven-development workflow.
"""

from lib.subagent_wrap import wrap_subagent_query


def test_wrap_includes_task_framing():
    out = wrap_subagent_query("Add input validation to the signup form")
    assert out.startswith("You are implementing Task 1.")


def test_wrap_includes_original_query():
    query = "Refactor the auth middleware"
    out = wrap_subagent_query(query)
    assert query in out


def test_wrap_uses_conditional_tdd_phrasing():
    """The wrap mirrors SP's literal `(following TDD if task says to)` —
    TDD is conditional on the task, not anchored unconditionally on every
    dispatched query. Critical: anchoring would confound subagent-shape
    signal with the TDD-cue effect we already measured in Phase 2B.
    """
    out = wrap_subagent_query("Fix the modal close button")
    assert "following TDD if task says to" in out


def test_wrap_does_not_unconditionally_anchor_on_tdd():
    """Guard against accidentally re-introducing a `Follow TDD` directive
    that would skew routing across all 30 queries toward TDD.
    """
    out = wrap_subagent_query("Add a retry loop")
    # No top-level imperative "Follow TDD" directive (only the conditional one inside the numbered list)
    assert "Follow TDD" not in out


def test_wrap_includes_your_job_numbered_list():
    """Mirrors SP's structural elements — '## Your Job' header + numbered list."""
    out = wrap_subagent_query("Add input validation")
    assert "## Your Job" in out
    assert "1. Implement" in out
    assert "2. Write tests" in out


def test_wrap_default_task_num_is_one():
    out = wrap_subagent_query("Add a retry loop")
    assert "Task 1." in out
    assert "Task 2." not in out


def test_wrap_custom_task_num():
    out = wrap_subagent_query("Add a retry loop", task_num=7)
    assert "Task 7." in out


def test_wrap_handles_query_with_special_chars():
    """Queries can contain $, backticks, and newlines without breaking the wrap."""
    query = "Rename `data` to `payload`; cost: $5\nin tokens"
    out = wrap_subagent_query(query)
    assert query in out
    assert "Task 1." in out
