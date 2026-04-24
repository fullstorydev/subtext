"""Pure trigger-detection function for claude -p stream-json output.

Mirrors the detection logic in vendor/skill-creator/scripts/run_eval.py's
run_single_query loop so we can reuse it from sandbox runs without
importing the vendored module (which encodes subprocess + filesystem
side effects).
"""

from __future__ import annotations

import json
from collections.abc import Iterable


def detect_trigger_from_stream(lines: Iterable[str], clean_name: str) -> bool:
    """Return True iff the stream shows a Skill or Read tool_use referencing clean_name.

    Accepts any iterable of stream-json lines (one JSON object per line).
    Malformed lines are skipped silently.

    Detection mirrors run_eval.py:
      - Early exit True on content_block_delta input_json_delta containing clean_name
      - Early exit False on tool_use for any tool other than Skill or Read
      - Fallback: full assistant message with Skill.skill or Read.file_path
        containing clean_name
      - Final result event ends the stream; return the accumulated state
    """
    pending_tool_name: str | None = None
    accumulated_json = ""
    triggered = False

    for raw in lines:
        line = raw.strip()
        if not line:
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue

        etype = event.get("type")

        if etype == "stream_event":
            se = event.get("event", {})
            se_type = se.get("type", "")

            if se_type == "content_block_start":
                cb = se.get("content_block", {})
                if cb.get("type") == "tool_use":
                    tool_name = cb.get("name", "")
                    if tool_name in ("Skill", "Read"):
                        pending_tool_name = tool_name
                        accumulated_json = ""
                    else:
                        return False

            elif se_type == "content_block_delta" and pending_tool_name:
                delta = se.get("delta", {})
                if delta.get("type") == "input_json_delta":
                    accumulated_json += delta.get("partial_json", "")
                    if clean_name in accumulated_json:
                        return True

            elif se_type in ("content_block_stop", "message_stop"):
                if pending_tool_name:
                    return clean_name in accumulated_json
                if se_type == "message_stop":
                    return False

        elif etype == "assistant":
            message = event.get("message", {})
            for content_item in message.get("content", []):
                if content_item.get("type") != "tool_use":
                    continue
                tool_name = content_item.get("name", "")
                tool_input = content_item.get("input", {})
                if tool_name == "Skill" and clean_name in tool_input.get("skill", ""):
                    triggered = True
                elif tool_name == "Read" and clean_name in tool_input.get("file_path", ""):
                    triggered = True
                return triggered

        elif etype == "result":
            return triggered

    return triggered
