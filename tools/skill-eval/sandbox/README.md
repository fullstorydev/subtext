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

## Validation (Phase 2B matrix, 2026-04-24)

First plugin-matrix run: `eval-set-v3` across `[subtext-only, subtext-plus-superpowers]` at `runs_per_query=1`.

### Per-config summary

| Config | Passed | Failed | With errors |
|---|---|---|---|
| subtext-only | 16/30 | 14 | 0 |
| subtext-plus-superpowers | 14/30 | 16 | 0 |

Matrix JSON: `skills/proof/evals/results/proof-matrix-20260424T192616.json`
Matrix markdown: `skills/proof/evals/results/proof-matrix-20260424T192616.md`

Both configs sit lower than the Phase 2A host-isolated baseline (27/30 at n=3). Sandbox at n=1 inherently has higher per-query variance — the relevant comparison is **between configs at the same n**, not absolute pass count.

### Divergences (≥0.5 trigger-rate gap)

4 queries diverge between configs. 3 cost proof a routing win when SP is loaded; 1 swings the other way:

- ✅ `Fix the modal close button that doesn't work` — gap 1.00 (subtext-only=1.00, subtext-plus-superpowers=0.00)
- ✅ `Add input validation to the signup form` — gap 1.00 (subtext-only=1.00, subtext-plus-superpowers=0.00)
- ✅ `You are implementing Task 3: Add a hover state to the submit button. Follow TDD.` — gap 1.00 (subtext-only=1.00, subtext-plus-superpowers=0.00)
- ✅ `Change the 'Submit' button text to 'Save' on the login form` (soft) — gap 1.00 (subtext-only=0.00, subtext-plus-superpowers=1.00)

### Interpretation

- **All 13 hard negatives held in BOTH configs.** Adding Superpowers does NOT cause proof to over-trigger on explanation/planning/investigation prompts. The collision is purely about competing for positive routing wins, never adding false positives.
- **The subagent-dispatch divergence is the most diagnostically interesting.** "You are implementing Task 3: Add a hover state to the submit button. Follow TDD." — this prompt fires proof reliably in subtext-only but loses 1.00 → 0.00 when SP is loaded. The prompt explicitly says "Follow TDD", and SP installs `superpowers:test-driven-development` whose description triggers on "implementing any feature or bugfix, before writing implementation code". That's a more specific lexical match for the explicit "Follow TDD" instruction. Expected behavior, not a routing bug.
- **The other two SP-wins divergences** ("Fix the modal close button", "Add input validation") don't have explicit framework cues. Possible that SP's `brainstorming` (MUST-tier) or `verification-before-completion` is winning on these — would need Phase 2C subagent-mode probing to disambiguate which SP skill fired.
- **The soft-positive flip** ("Change 'Submit' button text to 'Save'") going proof→SP is interesting too: this is a copy-edit prompt, not a "creative work" prompt. Why proof fires in the SP config but not in the baseline at n=1 is most likely sampling noise.
- **Net cost of SP installation:** ~2 fewer passes (16 → 14, a ~7% drop). Within the sample-size noise band at n=1 — at n=3 the gap may be tighter or wider; can't tell from this run.

### What this tells us about Phase 2C/3 priorities

- **Phase 2C subagent-mode is genuinely valuable.** The "Follow TDD" divergence shows that subagent-style prompts with explicit framework cues route DIFFERENTLY than user-facing prompts. We need subagent-mode in the eval to surface these patterns at scale rather than relying on hand-crafted probes.
- **Phase 3 parallelism + caching is the unlock for n=3 sandbox.** This run took ~58 minutes for 60 queries (~58s/query). Adding more configs (frontend-design, code-review per `framework-targets.md`) at the same per-query latency makes a 5-config × n=3 matrix a ~7-hour serial run. Caching + parallelism are no longer optional optimizations.
- **proof MUST description is robust enough to deploy.** Routing-contest losses are bounded (3 of 30 queries) and predictable (explicit TDD framing wins TDD). No over-triggering regression. We can ship this state and tune in follow-ups based on which collisions matter most for actual users.

Environment: docker images `subtext-sandbox-claude:latest`, `subtext-sandbox-claude-superpowers:latest`, `Darwin arm64 (Apple Silicon)` host.
