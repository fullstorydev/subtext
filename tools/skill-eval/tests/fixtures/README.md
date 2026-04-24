# Test fixtures

Recorded `claude -p --output-format stream-json --verbose --include-partial-messages` outputs used by `test_detect_trigger.py`.

## Regenerating

See the steps in `docs/superpowers/plans/2026-04-24-sandbox-eval-loop.md` Task 2.

## Naming

- `stream_triggered.jsonl` — a recorded run where a staged skill named `fixture-skill-fix1` was invoked via Skill or Read.
- `stream_not_triggered.jsonl` — a run where the same skill was staged but Claude answered without invoking it.

The `clean_name` used in the fixtures is `fixture-skill-fix1` — the same constant is referenced in `test_detect_trigger.py`.

## Detection note

Both fixtures contain `fixture-skill-fix1` in the `system/init` event (`slash_commands` list), because the skill was registered when both runs were recorded. The trigger detection must look at `assistant`-type events only — specifically for a `Skill` tool_use where `input.skill == "fixture-skill-fix1"`. The non-triggered fixture has zero such `assistant` events; the triggered fixture has one on line 17.
