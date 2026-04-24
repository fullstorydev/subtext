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
