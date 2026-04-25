"""Pure trigger-detection for claude -p stream-json output.

Two APIs:

- `TriggerDetector` class for streaming/incremental use. Phase 3 sandbox_runner
  uses this to early-exit `claude -p` once the trigger decision is reached,
  saving large amounts of wallclock on subagent-style queries that would
  otherwise run the full 300s timeout doing implementation work.

- `detect_trigger_from_stream(lines, clean_name) -> bool` — a thin wrapper
  for backward compatibility with existing callers that have the full stream
  as a list of lines.

Mirrors the detection logic in vendor/skill-creator/scripts/run_eval.py's
run_single_query loop. Vendored module remains pristine; this is the
in-house mirror so we can refactor freely.
"""

from __future__ import annotations

import json
from collections.abc import Iterable


class TriggerDetector:
    """Stateful incremental trigger detector.

    Feed lines one at a time via `consume(line)`. Returns:
      - True  → definitive trigger (caller can early-exit subprocess)
      - False → definitive non-trigger (caller can early-exit subprocess)
      - None  → no decision yet, keep streaming

    When the stream ends without a definitive decision, call `finalize()`
    to get the accumulated answer (typically False if no tool_use was seen).
    """

    def __init__(self, clean_name: str) -> None:
        self.clean_name = clean_name
        self._pending_tool_name: str | None = None
        self._accumulated_json: str = ""
        self._triggered: bool = False

    def consume(self, line: str) -> bool | None:
        """Process one stream-json line. Returns a definitive bool when ready,
        or None if more input is needed."""
        line = line.strip()
        if not line:
            return None
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            return None

        etype = event.get("type")

        if etype == "stream_event":
            se = event.get("event", {})
            se_type = se.get("type", "")

            if se_type == "content_block_start":
                cb = se.get("content_block", {})
                if cb.get("type") == "tool_use":
                    tool_name = cb.get("name", "")
                    if tool_name in ("Skill", "Read"):
                        self._pending_tool_name = tool_name
                        self._accumulated_json = ""
                    else:
                        # Non-Skill/Read tool_use → definitive False
                        return False

            elif se_type == "content_block_delta" and self._pending_tool_name:
                delta = se.get("delta", {})
                if delta.get("type") == "input_json_delta":
                    self._accumulated_json += delta.get("partial_json", "")
                    if self.clean_name in self._accumulated_json:
                        return True

            elif se_type in ("content_block_stop", "message_stop"):
                if self._pending_tool_name:
                    return self.clean_name in self._accumulated_json
                if se_type == "message_stop":
                    return False

        elif etype == "assistant":
            # Mirrors vendor run_eval.py: returns on first tool_use content item.
            # Do NOT move this return outside the loop — claude -p eval streams
            # emit one tool per assistant turn, and multi-tool drift would
            # diverge from the upstream detection contract.
            message = event.get("message", {})
            for content_item in message.get("content", []):
                if content_item.get("type") != "tool_use":
                    continue
                tool_name = content_item.get("name", "")
                tool_input = content_item.get("input", {})
                if tool_name == "Skill" and self.clean_name in tool_input.get("skill", ""):
                    self._triggered = True
                elif tool_name == "Read" and self.clean_name in tool_input.get("file_path", ""):
                    self._triggered = True
                return self._triggered

        elif etype == "result":
            return self._triggered

        return None

    def finalize(self) -> bool:
        """Called when stream ends without a definitive decision.

        Returns the accumulated `triggered` state — typically False if no
        tool_use ever appeared.
        """
        return self._triggered


def detect_trigger_from_stream(lines: Iterable[str], clean_name: str) -> bool:
    """Single-pass detector — thin wrapper over TriggerDetector for callers
    that have the full stream as a list of lines.

    Used by tests with recorded fixtures and by any non-streaming consumer.
    """
    detector = TriggerDetector(clean_name)
    for raw in lines:
        decision = detector.consume(raw)
        if decision is not None:
            return decision
    return detector.finalize()
