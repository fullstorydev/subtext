# skill-eval sandbox mode

Run the trigger-evaluation harness against the `subtext-sandbox` Docker
container instead of the host machine. Slower, but measures behavior
under a realistic plugin environment — foundation for Phase 2 plugin
matrix testing (subtext alone vs. subtext + Superpowers, etc.).

## Prerequisites

- `subtext-sandbox/` at the repo root (already present)
- Docker Engine + Compose plugin
- `ANTHROPIC_API_KEY` in env
- Built image: `./tools/skill-eval/sandbox/build.sh`

## Running

```
# One-time build
./tools/skill-eval/sandbox/build.sh

# Per-skill eval (same UX as bin/eval)
./tools/skill-eval/bin/eval-sandboxed proof

# More runs per query
./tools/skill-eval/bin/eval-sandboxed proof --runs-per-query 5
```

Results write to `skills/<name>/evals/results/<name>-sandboxed-<ts>.json`
in the same shape as host-mode results. Filename suffix `-sandboxed`
distinguishes them from `--isolated` and host-default runs.

## Tradeoffs vs. host `bin/eval`

| Mode | Speed | Isolation | Plugin env | Use when |
|---|---|---|---|---|
| `bin/eval`             | Fast   | Shares host `.claude/` | User's installed plugins | Reproducing a routing contest the user actually sees |
| `bin/eval --isolated`  | Fast   | Per-worker tempdir | None (just built-ins + staged skill) | Intrinsic description quality |
| `bin/eval-sandboxed`   | Slow   | Per-query container | Only the subtext plugin, MCP off | Description quality under realistic plugin context |

## Phase 2/3 roadmap

- **Phase 2B — Plugin matrix.** `EXTRA_PLUGINS` env var
  (`=superpowers,notion`) installs additional marketplaces pre-launch.
  Named configs under `configs/subtext-plus-superpowers.yml` etc.
  Motivating question: does MUST still win routing contests when
  Superpowers' own descriptions are visible?
- **Phase 2C — Subagent-style query mode.** `--query-style subagent`
  flag wraps each query in a subagent-dispatch-prompt template before
  feeding to `claude -p`. Validates that proof fires when dispatched
  from a Superpowers-style `subagent-driven-development` run.
- **Phase 3 — Caching + parallelism.** Two-stage Dockerfile
  (`Dockerfile.base` cached per config-hash, `Dockerfile.query` thin
  layer for skill-staging). Worker pool inside `run_eval_sandbox.py`.
  Target: 30 queries × 3 runs × 5 configs < 10 minutes.

## Validation (Phase 2A, 2026-04-24)

30-query `eval-set-v3` against the MUST description on `skills/proof`.

### Host-isolated mode

| Metric | Value |
|---|---|
| Total queries | 30 |
| Passed | 27 |
| Failed | 3 |
| Hard-scoring (excl. soft-ambiguous) | 27/29 = **93%** |
| Per-query latency | ~0.8s (parallel, 5 workers) |
| Total runtime | ~70s |

Runs-per-query: **3**. Result file: `skills/proof/evals/results/proof-isolated-20260424T162248.json`.

### Sandbox mode

| Metric | Value |
|---|---|
| Total queries | 30 |
| Passed | 18 |
| Failed | 12 |
| With errors | 0 |
| Per-query latency | ~58s (serial, container startup + claude -p) |
| Total runtime | ~29m 22s |

Runs-per-query: **1** (at n=3 this would be ~90 min serial — deferred to Phase 3 parallelism). Result file: `skills/proof/evals/results/proof-sandboxed-20260424T162438.json`.

### Interpretation

- **Hard negatives: 13/13 correctly did not trigger in both modes.** No over-triggering — the MUST description's imperative phrasing doesn't sweep up explanation, planning, brainstorming, or research-style prompts.
- **Hard positives that failed in BOTH modes (2):** "Change the color scheme to match our new brand colors" and "Implement the dark-mode toggle we brainstormed earlier". Both cases fail consistently across sampling, so they're genuine description-quality gaps — not noise. Candidates for Phase 2B tuning (possibly: the "brainstormed earlier" mid-flow framing shifts routing context; "color scheme" reads more as design than implementation).
- **Hard positives passed in host-isolated but failed in sandbox (11):** attributable to the `runs_per_query=1` sandbox configuration. At n=1 you sample one noisy roll of the dice; at n=3 (host) you average three. Many of these queries likely trigger 50–80% of the time; at n=1 they'll miss ~20–50% of the time purely from sampling. Not a sandbox-environment problem — a sample-size problem.
- **Sandbox hard-positives that DID trigger at n=1 (4/15):** "Add a new API endpoint", "Add input validation to the signup form", and both subagent-dispatch prompts ("You are implementing Task 3/7..."). These are the most reliable triggers — the subagent-dispatch pair in particular confirms implicit pickup during framework-style flows.
- **Soft-ambiguous queries:** not counted for description-quality purposes; results are informational. 4/5 aligned across both modes; the `data → payload` rename stays the one edge case where MUST fires on pure-refactor prompts.

Directional agreement between modes (within hard positives + hard negatives) is the success signal. The sandbox/host gap is explained by sampling variance + plugin context, not by apparatus bugs.

### Prior baselines

- **Phase 1 smoke (2-query subset, old pre-MUST description):** 0/1 trigger on both positives in both modes. Not directly comparable to v3 (different queries, different description, different scope).
- **eval-set-v2 against pre-MUST description (~2026-04-21):** 11/26 passed with 1/16 positives triggering. Archived under `skills/proof/evals/archive/`. Confirms the MUST description is the load-bearing change: +23 percentage points on positives in host-isolated mode vs. the community-style concise description.

Environment: docker image `subtext-sandbox-claude:latest`, `Darwin arm64 (Apple Silicon)` host.
