# Acceptance tests

End-to-end tests that exercise the harness against real Docker and the live
Claude API. They are the **only** way to know if the harness measures what
we think it measures. Unit tests in `tests/` cover wrapper logic, not
end-to-end behavior.

These tests are slow (seconds to minutes) and require external credentials,
so they're skipped by default and gated behind `RUN_ACCEPTANCE=1`.

## Running

```bash
. /path/to/.env.local && export ANTHROPIC_API_KEY  # if not already exported

# All acceptance tests:
RUN_ACCEPTANCE=1 ./tools/skill-eval/venv/bin/python -m pytest tests/acceptance/ -v -s

# A specific test:
RUN_ACCEPTANCE=1 ./tools/skill-eval/venv/bin/python -m pytest \
    tests/acceptance/test_entrypoint_staging.py -v
```

The `-s` flag is useful for `test_triangulation.py` so the per-query
trigger rates print to stdout.

## What each test checks

| Test | What it asserts | Cost | Gated on |
|---|---|---|---|
| `test_entrypoint_staging.py::test_basic_description_stages_verbatim` | Entrypoint writes EVAL_DESCRIPTION verbatim into the runtime SKILL.md frontmatter | ~2s | Docker, sandbox image |
| `…::test_description_with_special_yaml_chars_stages_verbatim` | `$`, backticks, quotes, `&`, `;`, `:` survive the awk + ENVIRON path | ~2s | Docker, sandbox image |
| `…::test_frontmatter_structure_preserved` | The rewrite leaves `name:`, `metadata:`, and other fields intact | ~2s | Docker, sandbox image |
| `…::test_missing_description_field_is_an_error` | A SKILL.md with no `description:` line produces a non-zero exit | ~2s | Docker, sandbox image |
| `test_description_visibility.py::test_unique_marker_round_trips_through_description` | A unique marker placed in EVAL_DESCRIPTION appears in the model's reply when asked to introspect — i.e. the description reaches routing context | ~30s | Docker, sandbox image, API key |
| `test_triangulation.py::test_T3_host_mode_isolated_positive_control` | Records host-mode `bin/eval --isolated` trigger rates on 3 known-positive UI queries × 3 runs | ~5s* | API key |
| `…::test_T4_sandbox_positive_control` | Records `bin/eval-sandboxed` trigger rates on the same 3 queries × 3 runs | ~20s | Docker, sandbox image, API key |
| `…::test_T5_sandbox_negative_control` | Records `bin/eval-sandboxed` trigger rates with a backend-exclusion description override (same queries × 3 runs) | ~20s | Docker, sandbox image, API key |

*Cost on T3 reflects host-mode parallel workers being faster than sandbox docker spin-up.

## The triangulation finding

Triangulation runs (T3, T4, T5) overwrite the baselines under `baselines/`
on each run. They're snapshots of "what the harness did last time," not
strict regression thresholds — model variance makes any single 9-dispatch
sample noisy. The qualitative ratio is what matters.

Two runs back-to-back on `chip/skill-eval-harness` (commit at the time
these tests landed) produced these numbers:

| Mode | Description | Run 1 | Run 2 |
|---|---|---|---|
| Host-isolated | original `subtext:proof` | **6/9 (67%)** | 6/9 (67%) |
| Sandbox subtext-only | original `subtext:proof` | 0/9 (0%) | 2/9 (22%) |
| Sandbox subtext-only | backend-exclusion override | 0/9 (0%) | 0/9 (0%) |

Host-isolated is stable at 67%. Sandbox is dramatically lower — somewhere
between 0% and ~20% on the same queries. The exact sandbox number jitters
around floor; the qualitative finding (sandbox >> host-isolated
suppression) is robust.

The host-isolated number (67%) is in the pre-harness baseline ballpark and
matches what description-tuning is supposed to measure: does the
description-text-alone cause triggering for queries that should trigger.

The sandbox numbers (0/9) are both at floor and indistinguishable. Two
related explanations both hold:

1. **Sandbox `/workspace` has a real filesystem (the Vite demo app).** When
   the model receives "Update the button hover state to be slightly darker",
   it can immediately `Glob` / `Grep` / `Read` / `Edit` the relevant files.
   That path is faster than invoking `Skill(subtext:proof)` and reading a
   workflow document. So the model picks the direct path.
2. **Host-isolated mode has no filesystem.** The model has a staged skill
   and not much else; if a query plausibly matches the skill description,
   `Skill(...)` is the natural call.

The description IS visible to the routing layer in sandbox — `T2` confirms
the model can quote a unique marker placed in EVAL_DESCRIPTION. The
description just isn't load-bearing relative to the file-edit alternative
when the model is in a fully-equipped Claude Code environment.

### Implication for Phase 4 description tuning

Phase 4 intended to measure description quality and used the sandbox
harness to do so. With sandbox at floor, Phase 4's variant deltas were
noise — they couldn't have shown signal because there was no signal to
show.

**Description-tuning work should use host-isolated mode (`bin/eval
--isolated`).** That's where description text drives outcomes. Sandbox
remains valuable for a different question — "in a real Claude Code
environment with all plugins loaded, does proof get invoked?" — but
that's an environment/composition test, not a description-quality test.

## When to re-run

- **After any change to `subtext-sandbox/entrypoint.sh`** — T1, T2, T4, T5.
- **After any change to `lib/sandbox_runner.py` or `lib/run_eval_sandbox.py`** — full triangulation.
- **After Claude Code updates that affect skill routing** — full triangulation.
- **Before merging a description tuning PR** — T3 specifically (the description-quality measurement).

## Layout

```
tests/acceptance/
├── README.md                          # this file
├── conftest.py                        # gating + fixtures (require_docker, require_api_key, etc.)
├── test_entrypoint_staging.py         # T1: file-content assertions
├── test_description_visibility.py     # T2: marker round-trip via model
├── test_triangulation.py              # T3/T4/T5: harness mode comparison
├── fixtures/
│   └── triangulation-eval-set.json    # 3 known-positive UI queries
└── baselines/
    ├── host-mode-positive.json        # T3 result
    ├── sandbox-positive.json          # T4 result
    └── sandbox-negative.json          # T5 result
```
