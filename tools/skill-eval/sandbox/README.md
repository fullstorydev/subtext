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

- Phase 2: `EXTRA_PLUGINS` env var (`=superpowers,notion`) installs
  additional marketplaces pre-launch. Named configs under
  `configs/subtext-plus-superpowers.yml` etc.
- Phase 3: Two-stage Dockerfile for caching + parallel worker pool.

## Validation (Phase 1)

Initial smoke test: 2-query subset of `skills/proof/evals/eval-set.json`.

| Query | Expected | Sandbox triggered | Host --isolated triggered |
|---|---|---|---|
| "Update the button hover state to be slightly darker"    | ✅ trigger    | ❌ 0/1   | ❌ 0/1   |
| "Add a new API endpoint for user preferences"            | ❌ no trigger | ❌ 0/1   | ❌ 0/1   |

Both modes agree: the no-trigger query correctly returns 0/1; the trigger query
also returned 0/1 (a false-negative at n=1 — consistent across both modes,
indicating a description-quality issue to address in Phase 2, not a harness bug).

- Per-query sandbox latency: ~51s (container startup + npm install + claude -p)
- Per-query host-isolated latency: ~1.5s
- Full 22-query run at `--runs-per-query 3` projects to ~57min with Phase 1 serial dispatch. Phase 3 caching + parallelism should cut this by >10×.

Environment: docker image `subtext-sandbox-claude:latest`, `Darwin arm64 (Apple Silicon)` host.
