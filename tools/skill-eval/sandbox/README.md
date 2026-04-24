# skill-eval sandbox mode

Run the trigger-evaluation harness against the `subtext-sandbox` Docker
container instead of the host machine. Slower, but measures behavior
under a realistic plugin environment — foundation for Phase 2 plugin
matrix testing (subtext alone vs. subtext + Superpowers, etc.).

## Prerequisites

- `subtext-sandbox/` at the repo root (already present)
- Docker Engine + Compose plugin
- `ANTHROPIC_API_KEY` and `FULLSTORY_API_KEY` in env
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
