# skill-eval

Trigger-evaluation harness for Subtext skills. Measures whether a skill's frontmatter `description:` causes Claude Code to invoke the skill for the queries it should and skip the queries it shouldn't.

Two modes:

| Mode | When to use | Bin |
|---|---|---|
| **Host mode** | Quick local checks, auto-tuning loop on your own machine | `bin/eval`, `bin/loop` |
| **Sandbox mode** | Reproducible measurements across plugin combos, models, query styles | `bin/eval-sandboxed`, `bin/eval-sandboxed-matrix` |

Sandbox mode runs `claude -p` inside a Docker container with a clean environment and a controlled plugin set, streams its stream-json output back to the host, and exits as soon as the routing decision is in. See `sandbox/README.md` for the per-phase validation log.

## Layout

```
tools/skill-eval/
├── bin/
│   ├── setup                  # create venv, install deps (host-mode only)
│   ├── eval                   # host-mode trigger eval
│   ├── eval-sandboxed         # sandbox-mode trigger eval (one config)
│   ├── eval-sandboxed-matrix  # sandbox-mode matrix across configs/models
│   └── loop                   # host-mode auto-tuning loop (legacy)
├── lib/
│   ├── detect_trigger.py      # incremental trigger detector for stream-json
│   ├── matrix.py              # consolidate per-config results into a matrix
│   ├── run_eval_sandbox.py    # sandbox driver: dispatch + aggregate
│   ├── sandbox_runner.py      # one-shot Popen wrapper around docker run
│   └── subagent_wrap.py       # subagent-style query wrapping (Phase 2C)
├── sandbox/
│   ├── build.sh               # build the sandbox image (per --config)
│   └── README.md              # per-phase validation log
├── tests/                     # pytest suite for lib/
├── apply_description.py       # frontmatter description rewriter (used by bin/loop)
├── requirements.txt           # anthropic (loop only)
├── vendor/skill-creator/      # vendored Apache-2.0 scripts + agents (loop only)
└── README.md

skills/<name>/
└── evals/
    ├── eval-set-v3.json       # current default eval-set
    ├── archive/eval-set-v{1,2}.json
    └── results/               # gitignored: timestamped run outputs
```

## One-time setup

```bash
./tools/skill-eval/bin/setup
```

Creates `tools/skill-eval/venv/` and installs `anthropic` (needed only for `bin/loop`; the other bins are stdlib-only). Sandbox mode additionally requires Docker.

## Host mode: measure trigger rate

```bash
./tools/skill-eval/bin/eval proof
```

Invokes `claude -p` as a subprocess for each query in `skills/proof/evals/eval-set-v3.json`, runs each query 3 times (default), and reports trigger rate. Output is saved to `skills/proof/evals/results/proof-<timestamp>.json`.

Pass-through flags go to `run_eval.py`:

```bash
./tools/skill-eval/bin/eval proof --runs-per-query 5 --num-workers 4
```

Override the eval-set path with `EVAL_SET_OVERRIDE`:

```bash
EVAL_SET_OVERRIDE=skills/proof/evals/eval-set-v4.json \
  ./tools/skill-eval/bin/eval proof
```

No API key required.

### Isolated mode

```bash
./tools/skill-eval/bin/eval proof --isolated
```

Runs each query against a disposable project root with `CLAUDE_CONFIG_DIR` pointed at an empty directory. Only Claude's built-in skills plus the staged skill under test are available — no `superpowers:*`, no other plugins. Useful for distinguishing "description isn't good enough" from "description is outranked by a competing skill". Result file names get an `-isolated` suffix.

## Sandbox mode: measure under controlled plugin combos

Sandbox mode dispatches each query through a Docker container with a known plugin set. Same eval-set, same skill, but the routing happens against an apparatus you can hold steady across runs and across machines.

### Build the sandbox image(s)

```bash
./tools/skill-eval/sandbox/build.sh --config subtext-only
./tools/skill-eval/sandbox/build.sh --config subtext-plus-superpowers
```

Each config produces a separately-tagged image. By default `build.sh` uses Docker's layer cache; pass `--force-rebuild` to bust it.

### Run a single config

```bash
./tools/skill-eval/bin/eval-sandboxed proof \
  --config subtext-only \
  --query-style user-facing \
  --model claude-sonnet-4-6 \
  --runs-per-query 3
```

Flags:

| Flag | Default | What it does |
|---|---|---|
| `--config` | `subtext-only` | Which sandbox image to use |
| `--query-style` | `user-facing` | `user-facing` or `subagent` (wraps queries in a Task-N dispatch shape) |
| `--model` | `claude-sonnet-4-6` | Claude model to dispatch against |
| `--runs-per-query` | `3` | Number of times each query is run |
| `--num-workers` | `4` | Parallel Docker workers |

Output: `skills/<name>/evals/results/<name>-sandboxed-<config>-<query-style>-<ts>.json`.

### Run a matrix across configs / models

```bash
./tools/skill-eval/bin/eval-sandboxed-matrix proof \
  --configs subtext-only,subtext-plus-superpowers \
  --query-style subagent \
  --model claude-sonnet-4-6 \
  --runs-per-query 3
```

Or sweep multiple models:

```bash
./tools/skill-eval/bin/eval-sandboxed-matrix proof \
  --configs subtext-only,subtext-plus-superpowers \
  --models claude-sonnet-4-6,claude-opus-4-7 \
  --query-style subagent \
  --runs-per-query 3
```

Output: a per-config-result label of `<config>__<model>` (or just `<config>` when models are not swept), consolidated into `<name>-matrix-<query-style>-<ts>.{json,md}` under the same results directory. Divergences (queries where configs disagree by ≥0.5 trigger-rate) are surfaced in the markdown rendering.

`EVAL_SET_OVERRIDE` propagates from the matrix wrapper down to `bin/eval-sandboxed`, so the same env-var trick works at either level.

## Auto-tune the description (host mode, legacy)

```bash
export ANTHROPIC_API_KEY=sk-ant-...
./tools/skill-eval/bin/loop proof
```

Splits the eval-set 60/40 train/test (stratified by `should_trigger`), runs the current description against the train set, asks Claude to propose improvements, iterates up to 5 times, and reports the best description on the held-out test set. Then **auto-applies** the best description to `skills/proof/SKILL.md` in place and prints the diff.

Defaults: `--max-iterations 5`, `--holdout 0.4`, `--model claude-opus-4-6`, `--report none`.

This is the original tuning loop and works on your local machine only. For cross-config tuning (e.g., optimizing the description against `subtext-plus-superpowers` specifically), use the sandbox-mode matrix harness with a manual proposer-critic loop. See `docs/superpowers/plans/2026-04-25-proof-description-tuning.md`.

## Writing an eval-set

`skills/<name>/evals/eval-set-v<N>.json` is a JSON array. Each entry:

```json
{
  "query": "the user's message to claude",
  "should_trigger": true,
  "note": "why this query is a positive/negative — human doc"
}
```

The eval-set is your skill's contract. The hard negatives — queries that look superficially like they should trigger but shouldn't — are what measure description quality; easy negatives pass trivially and teach the auto-tuner nothing. Aim for ~12 positives and ~10 negatives, with at least 3 hard negatives among them.

When iterating on a description against a fixed eval-set, hold out a fresh blind set (`eval-set-v<N+1>`) authored before tuning begins and score the final winner on it once. Otherwise the score reflects memorization, not routing quality.

## Research notes

- `docs/skill-eval-research/framework-targets.md` — inventory of skills considered for future eval coverage.
- `tools/skill-eval/sandbox/README.md` — per-phase validation log with the actual numbers.

## Vendor refresh

The `vendor/skill-creator/` directory is a one-time copy of Anthropic's skill-creator framework (Apache-2.0). To refresh:

```bash
SRC=~/.claude/plugins/marketplaces/claude-plugins-official/plugins/skill-creator/skills/skill-creator
DST=tools/skill-eval/vendor/skill-creator
rm -rf "$DST/scripts" "$DST/agents" "$DST/eval-viewer" "$DST/references"
cp -R "$SRC/scripts" "$SRC/agents" "$SRC/eval-viewer" "$SRC/references" "$DST/"
cp "$SRC/LICENSE.txt" "$DST/LICENSE.txt"
# update tools/skill-eval/vendor/skill-creator/VERSION with today's date
```

See `vendor/skill-creator/NOTICE.md` for the patches applied on top of upstream.
