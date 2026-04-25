"""Unit tests for lib.detect_trigger.

Fixtures capture real claude -p stream output. The detector must return
True iff the staged skill name appears in a Skill or Read tool_use event.
"""

from pathlib import Path

from lib.detect_trigger import detect_trigger_from_stream

FIXTURES = Path(__file__).parent / "fixtures"
CLEAN_NAME = "fixture-skill-fix1"


def _read_lines(name: str) -> list[str]:
    return (FIXTURES / name).read_text().splitlines()


def test_triggered_stream_returns_true():
    lines = _read_lines("stream_triggered.jsonl")
    assert detect_trigger_from_stream(lines, CLEAN_NAME) is True


def test_non_triggered_stream_returns_false():
    lines = _read_lines("stream_not_triggered.jsonl")
    assert detect_trigger_from_stream(lines, CLEAN_NAME) is False


def test_other_skill_name_on_triggered_stream_returns_false():
    lines = _read_lines("stream_triggered.jsonl")
    assert detect_trigger_from_stream(lines, "different-skill-name") is False


def test_empty_stream_returns_false():
    assert detect_trigger_from_stream([], CLEAN_NAME) is False


def test_malformed_json_lines_are_skipped():
    lines = ['not json', '{"type": "stream_event", "event": {}}', 'also not json']
    assert detect_trigger_from_stream(lines, CLEAN_NAME) is False


def test_tool_use_other_than_skill_or_read_exits_early():
    lines = [
        '{"type": "stream_event", "event": {"type": "content_block_start", '
        '"content_block": {"type": "tool_use", "name": "Bash"}}}',
    ]
    assert detect_trigger_from_stream(lines, CLEAN_NAME) is False


from lib.detect_trigger import TriggerDetector


def test_detector_consume_returns_none_for_pre_decision_lines():
    """Lines before any tool_use event don't yield a decision yet."""
    d = TriggerDetector(CLEAN_NAME)
    # A pre-trigger event from the fixture (e.g., system/init)
    sample_line = '{"type": "system", "subtype": "init", "model": "claude-sonnet-4-6"}'
    assert d.consume(sample_line) is None


def test_detector_returns_true_on_input_json_delta_match():
    """Match in input_json_delta should immediately return True."""
    d = TriggerDetector(CLEAN_NAME)
    # Simulate the sequence: content_block_start (Skill tool_use) → content_block_delta (json with name)
    start_line = (
        '{"type": "stream_event", "event": {"type": "content_block_start", '
        '"content_block": {"type": "tool_use", "name": "Skill"}}}'
    )
    delta_line = (
        '{"type": "stream_event", "event": {"type": "content_block_delta", '
        '"delta": {"type": "input_json_delta", "partial_json": "{\\"skill\\": \\"' + CLEAN_NAME + '\\""}}}'
    )
    assert d.consume(start_line) is None  # tool_use of Skill type, no decision yet
    assert d.consume(delta_line) is True  # match found, early-exit


def test_detector_returns_false_on_unrelated_tool_use():
    """A tool_use for a non-Skill/non-Read tool means definitive False."""
    d = TriggerDetector(CLEAN_NAME)
    bash_line = (
        '{"type": "stream_event", "event": {"type": "content_block_start", '
        '"content_block": {"type": "tool_use", "name": "Bash"}}}'
    )
    assert d.consume(bash_line) is False


def test_detector_finalize_returns_accumulated_state():
    """When stream ends without a decision, finalize() returns the accumulated state."""
    d = TriggerDetector(CLEAN_NAME)
    # Feed only pre-decision events
    d.consume('{"type": "system", "subtype": "init"}')
    d.consume('{"type": "user", "message": {}}')
    # No tool_use, no result event — stream ended early.
    assert d.finalize() is False  # no triggered events accumulated


def test_detector_handles_full_triggered_fixture_incrementally():
    """Streaming the full triggered fixture line-by-line produces True at the right point."""
    lines = (FIXTURES / "stream_triggered.jsonl").read_text().splitlines()
    d = TriggerDetector(CLEAN_NAME)
    decision = None
    for line in lines:
        decision = d.consume(line)
        if decision is not None:
            break
    assert decision is True


def test_detector_handles_full_not_triggered_fixture_incrementally():
    """Streaming the not-triggered fixture line-by-line produces False (or None until finalize)."""
    lines = (FIXTURES / "stream_not_triggered.jsonl").read_text().splitlines()
    d = TriggerDetector(CLEAN_NAME)
    decision = None
    for line in lines:
        decision = d.consume(line)
        if decision is not None:
            break
    if decision is None:
        decision = d.finalize()
    assert decision is False


def test_detect_trigger_from_stream_thin_wrapper_still_works():
    """The function-style API (used by other callers) must still work — implemented as a wrapper."""
    triggered_lines = (FIXTURES / "stream_triggered.jsonl").read_text().splitlines()
    not_triggered_lines = (FIXTURES / "stream_not_triggered.jsonl").read_text().splitlines()
    assert detect_trigger_from_stream(triggered_lines, CLEAN_NAME) is True
    assert detect_trigger_from_stream(not_triggered_lines, CLEAN_NAME) is False
