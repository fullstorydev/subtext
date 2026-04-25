# skill-eval

Trigger-evaluation harness for Subtext skills. Measures whether a skill's
frontmatter `description:` causes Claude Code to invoke the skill for the
queries it should and skip the queries it shouldn't.

## Which mode answers which question

The harness has three modes, and they answer **different** questions.
Picking the wrong mode for your question gives you a confidently wrong
answer. We learned this the hard way — see
`tests/acceptance/README.md` for the diagnostic story.

| Question you're trying to answer | Right mode | Bin |
|---|---|---|
| Does this description text semantically match these queries? (description quality) | **Host-isolated** | `bin/eval --isolated` |
| In a real Claude Code environment with the plugin loaded and a working filesystem, does this skill actually fire? (environment / composition) | **Sandbox** | `bin/eval-sandboxed`, `bin/eval-sandboxed-matrix` |
| Does Superpowers (or any other plugin set) shadow this skill's routing? | **Sandbox matrix** | `bin/eval-sandboxed-matrix --configs ...` |
| Can you reproduce a routing contest the user is actually seeing on their machine right now? | **Host-default** | `bin/eval` (no `--isolated`) — but see warning below |

Description-tuning work belongs in **host-isolated**. The model in
host-isolated has no filesystem and no other plugins — its only useful
action when a query plausibly matches the skill is `Skill(...)`. So the
description's semantic match drives the result, with no escape hatches.

The sandbox is a different instrument. With a real `/workspace` filesystem
loaded with a Vite + React app, the model can take direct `Edit`/`Bash`
paths instead of routing through `Skill`, regardless of description text.
That's a realistic measurement of "does the skill survive its
environment", not a measurement of description quality. Both are useful;
they're not interchangeable.

## ⚠️ Pitfall — host-default mode and your local plugin cache

`bin/eval <skill>` (no flags) uses your host's `~/.claude/` config,
including any `~/.claude/plugins/marketplaces/` cache. **If you have an
older or differently-versioned subtext install cached there, the harness
will silently route against it instead of the worktree.** The skill name
is the same; the actual SKILL.md content is not.

Use `--isolated` for any clean measurement. The flag points
`CLAUDE_CONFIG_DIR` at an empty directory and stages only the skill under
test, so the cache is excluded.

## Acceptance tests

Before trusting any harness change, run the acceptance suite:

```bash
RUN_ACCEPTANCE=1 ANTHROPIC_API_KEY=... \
    ./tools/skill-eval/venv/bin/python -m pytest tests/acceptance/ -v
```

Eight tests, ~52s total. Covers entrypoint staging, description
visibility to the model, and host-vs-sandbox triangulation. See
`tests/acceptance/README.md` for what each test pins down. Re-run after
any change to `subtext-sandbox/entrypoint.sh`, `lib/sandbox_runner.py`, or
`lib/run_eval_sandbox.py`.

## Layout

```
tools/skill-eval/
├── bin/
│   ├── setup                  # create venv, install deps (host-mode only)
│   ├── eval                   # host-mode trigger eval (default + --isolated)
│   ├── eval-sandboxed         # sandbox-mode trigger eval (one config)
│   ├── eval-sandboxed-matrix  # sandbox-mode matrix across configs/models
│   └── loop                   # vendor's auto-tuning loop (legacy; use --isolated)
├── lib/
│   ├── detect_trigger.py      # incremental trigger detector for stream-json
│   ├── matrix.py              # consolidate per-config results into a matrix
│   ├── run_eval_sandbox.py    # sandbox driver: dispatch + aggregate
│   ├── sandbox_runner.py      # one-shot Popen wrapper around docker run
│   └── subagent_wrap.py       # subagent-style query wrapping (Phase 2C)
├── sandbox/
│   ├── build.sh               # build the sandbox image (per --config)
│   └── README.md              # per-phase validation log
├── tests/                     # pytest suite for lib/ (44 tests, fast)
│   └── acceptance/            # end-to-end harness invariants (slow, gated)
├── apply_description.py       # frontmatter description rewriter (used by bin/loop)
├── requirements.txt           # anthropic (loop only)
├── vendor/skill-creator/      # vendored Apache-2.0 scripts + agents
├── iterations/                # per-iteration tuning artifacts (gitignored results, committed proposals/winners)
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

Creates `tools/skill-eval/venv/` and installs `anthropic` (needed only
for `bin/loop`; the other bins are stdlib-only). Sandbox mode
additionally requires Docker.

## Host mode

```bash
./tools/skill-eval/bin/eval proof
```

Invokes `claude -p` as a subprocess for each query in
`skills/proof/evals/eval-set-v3.json`, runs each query 3 times (default),
reports trigger rate. Output: `skills/proof/evals/results/proof-<ts>.json`.

Pass-through flags forward to `vendor/skill-creator/scripts/run_eval.py`:

```bash
./tools/skill-eval/bin/eval proof --runs-per-query 5 --num-workers 4
./tools/skill-eval/bin/eval proof --description "<override>"
```

Override the eval-set path with `EVAL_SET_OVERRIDE`:

```bash
EVAL_SET_OVERRIDE=skills/proof/evals/eval-set-v4.json \
    ./tools/skill-eval/bin/eval proof
```

No API key required — uses your host's claude installation.

### Isolated mode (use this for description tuning)

```bash
./tools/skill-eval/bin/eval proof --isolated
```

Runs each query against a disposable project root with `CLAUDE_CONFIG_DIR`
pointed at an empty directory. Only Claude's built-in skills plus the
staged skill under test are available — no `superpowers:*`, no other
plugins, no host plugin cache. **This is the canonical
description-quality measurement and what Anthropic's skill-creator
framework recommends.** Result file names get an `-isolated` suffix.

The vendor's `--description "<text>"` flag overrides what gets staged,
letting you A/B-test variants without modifying SKILL.md on disk:

```bash
./tools/skill-eval/bin/eval proof --isolated \
    --description "Use this skill when the user reports a regression."
```

## Sandbox mode

Sandbox mode dispatches each query through a Docker container with a
known plugin set. **This is for environment/composition questions, not
description quality.** Use it to ask things like "does Superpowers shadow
proof?", "does subagent-style framework-flow routing pick proof up?", or
"does our MCP setup work end-to-end with the plugin loaded?".

If you're tuning a description, use `bin/eval --isolated` instead;
sandbox is dominated by the model taking direct file-edit paths in
`/workspace` and is at floor for description-quality differentials. See
`tests/acceptance/README.md` for the data behind that claim.

### Build the sandbox image(s)

```bash
./tools/skill-eval/sandbox/build.sh --config subtext-only
./tools/skill-eval/sandbox/build.sh --config subtext-plus-superpowers
```

Each config produces a separately-tagged image. Default uses Docker's
layer cache; pass `--force-rebuild` to bust it.

### Run a single config

```bash
./tools/skill-eval/bin/eval-sandboxed proof \
    --config subtext-only \
    --query-style user-facing \
    --model claude-sonnet-4-6 \
    --runs-per-query 3
```

| Flag | Default | What it does |
|---|---|---|
| `--config` | `subtext-only` | Which sandbox image to use |
| `--query-style` | `user-facing` | `user-facing` or `subagent` (wraps queries in a Task-N dispatch shape) |
| `--model` | `claude-sonnet-4-6` | Claude model to dispatch against |
| `--runs-per-query` | `3` | Number of times each query is run |
| `--num-workers` | `4` | Parallel Docker workers |
| `--description` | (read from SKILL.md) | Override the description tested without mutating disk |

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

Output: per-config-result label of `<config>__<model>` (or just `<config>`
when models are not swept), consolidated into
`<name>-matrix-<query-style>-<ts>.{json,md}` under the same results
directory. Divergences (queries where configs disagree by ≥0.5
trigger-rate) are surfaced in the markdown rendering.

`EVAL_SET_OVERRIDE` propagates from the matrix wrapper down to
`bin/eval-sandboxed`.

## Auto-tune the description (host-mode loop)

```bash
export ANTHROPIC_API_KEY=sk-ant-...
./tools/skill-eval/bin/loop proof
```

Splits the eval-set 60/40 train/test (stratified by `should_trigger`),
runs the current description against the train set, asks Claude to
propose improvements, iterates up to 5 times, and reports the best
description on the held-out test set. Then **auto-applies** the best
description to `skills/proof/SKILL.md` in place and prints the diff.

Defaults: `--max-iterations 5`, `--holdout 0.4`, `--model
claude-opus-4-6`, `--report none`. Wraps vendor's `run_loop.py`.

This is appropriate for description quality only — the underlying
measurement is host-isolated.

## Writing an eval-set

`skills/<name>/evals/eval-set-v<N>.json` is a JSON array. Each entry:

```json
{
  "query": "the user's message to claude",
  "should_trigger": true,
  "note": "why this query is a positive/negative — human doc"
}
```

The eval-set is your skill's contract. The hard negatives — queries that
look superficially like they should trigger but shouldn't — are what
measure description quality; easy negatives pass trivially and teach the
auto-tuner nothing. Aim for ~12 positives and ~10 negatives, with at
least 3 hard negatives among them.

When iterating on a description against a fixed eval-set, hold out a
fresh blind set (`eval-set-v<N+1>`) authored before tuning begins and
score the final winner on it once. Otherwise the score reflects
memorization, not routing quality.

## Research notes

- `docs/skill-eval-research/framework-targets.md` — inventory of skills considered for future eval coverage.
- `tools/skill-eval/sandbox/README.md` — per-phase validation log with the actual numbers.
- `tools/skill-eval/iterations/2026-04-25-proof/diagnostic-1/results.md` — diagnostic that uncovered the sandbox vs description-quality conflation.
- `tools/skill-eval/iterations/2026-04-25-proof/redux/winner.md` — Phase 4 redux outcome (no description change; baseline robust on training and held-out).
- `tools/skill-eval/tests/acceptance/README.md` — acceptance test suite + triangulation finding.

## Vendor refresh

The `vendor/skill-creator/` directory is a one-time copy of Anthropic's
skill-creator framework (Apache-2.0). To refresh:

```bash
SRC=~/.claude/plugins/marketplaces/claude-plugins-official/plugins/skill-creator/skills/skill-creator
DST=tools/skill-eval/vendor/skill-creator
rm -rf "$DST/scripts" "$DST/agents" "$DST/eval-viewer" "$DST/references"
cp -R "$SRC/scripts" "$SRC/agents" "$SRC/eval-viewer" "$SRC/references" "$DST/"
cp "$SRC/LICENSE.txt" "$DST/LICENSE.txt"
# update tools/skill-eval/vendor/skill-creator/VERSION with today's date
```

See `vendor/skill-creator/NOTICE.md` for the patches applied on top of
upstream.
