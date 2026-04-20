# skill-eval

Trigger-evaluation harness for Subtext skills. Uses Anthropic's
[`skill-creator`](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/skill-creator)
scripts (vendored under `vendor/skill-creator/`, Apache-2.0) to measure whether
a skill's frontmatter `description:` causes Claude Code to invoke the skill for
the queries it should and skip the queries it shouldn't — then auto-tune the
description against a held-out set.

## Layout

```
tools/skill-eval/
├── bin/
│   ├── setup              # create venv, install deps
│   ├── eval               # run trigger eval against a skill
│   └── loop               # run auto-tuning loop, apply best description
├── apply_description.py   # frontmatter description rewriter
├── requirements.txt       # anthropic (loop only)
├── vendor/skill-creator/  # vendored Apache-2.0 scripts + agents + viewer
└── README.md

skills/<name>/
└── evals/
    ├── eval-set.json      # committed: 10–25 queries with should_trigger
    └── results/           # gitignored: timestamped run outputs
```

## One-time setup

```bash
./tools/skill-eval/bin/setup
```

Creates `tools/skill-eval/venv/` and installs `anthropic` (needed only for
`bin/loop`; `bin/eval` is stdlib-only).

## Measure a skill's trigger rate (baseline)

```bash
./tools/skill-eval/bin/eval proof
```

This invokes `claude -p` as a subprocess for each query in
`skills/proof/evals/eval-set.json`, runs each query 3 times (default), and
reports how often the proof skill was triggered. Output is printed to stdout
and saved to `skills/proof/evals/results/proof-<timestamp>.json`.

Pass-through flags go to `run_eval.py`:

```bash
./tools/skill-eval/bin/eval proof --runs-per-query 5 --num-workers 4
```

No API key required.

### Isolated mode

```bash
./tools/skill-eval/bin/eval proof --isolated
```

Runs each query against a disposable project root with `CLAUDE_CONFIG_DIR`
pointed at an empty directory. Only Claude's 8 built-in skills plus the staged
skill under test are available — no `superpowers:*`, no `Notion:*`, no other
plugins. Use when:

- You want reproducible results across machines / CI (results depend only on
  the model and the description, not on which plugins the tester happens to
  have installed).
- You want to distinguish "description isn't good enough" from "description
  is outranked by a competing skill" — an isolated score being low means
  the description itself needs work; an isolated score being high but a
  full-env score being low means the skill is losing routing contests.

Results file names get an `-isolated` suffix so runs don't collide with
non-isolated baselines in the same directory.

## Auto-tune the description

```bash
export ANTHROPIC_API_KEY=sk-ant-...
./tools/skill-eval/bin/loop proof
```

Splits the eval-set 60/40 train/test (stratified by `should_trigger`), runs the
current description against the train set, asks Claude to propose
improvements, iterates up to 5 times, and reports the best description on the
held-out test set. Then **auto-applies** the best description to
`skills/proof/SKILL.md` in place and prints the diff. Review the diff, commit
if you like it, or `git checkout -- skills/proof/SKILL.md` to revert.

Defaults:

| Flag              | Default             |
|-------------------|---------------------|
| `--max-iterations`| `5`                 |
| `--holdout`       | `0.4`               |
| `--model`         | `claude-opus-4-6`   |
| `--report`        | `none`              |

Override by passing them after the skill name:

```bash
./tools/skill-eval/bin/loop proof --max-iterations 8 --holdout 0.5
```

Pass `--isolated` to tune against a clean environment (same semantics as
`bin/eval --isolated`). Useful for producing a description that works across
different machines regardless of what plugins the user has installed:

```bash
./tools/skill-eval/bin/loop proof --isolated
```

## Writing an eval-set

`skills/<name>/evals/eval-set.json` is a JSON array. Each entry:

```json
{
  "query": "the user's message to claude",
  "should_trigger": true,
  "note": "why this query is a positive/negative — human doc"
}
```

The eval-set is your skill's contract. The hard negatives — queries that look
superficially like they should trigger but shouldn't — are what measure
description quality; easy negatives pass trivially and teach the auto-tuner
nothing. Aim for ~12 positives and ~10 negatives, with at least 3 hard
negatives among them.

## Vendor refresh

To pull a newer version of the upstream scripts:

```bash
SRC=~/.claude/plugins/marketplaces/claude-plugins-official/plugins/skill-creator/skills/skill-creator
DST=tools/skill-eval/vendor/skill-creator
rm -rf "$DST/scripts" "$DST/agents" "$DST/eval-viewer" "$DST/references"
cp -R "$SRC/scripts" "$SRC/agents" "$SRC/eval-viewer" "$SRC/references" "$DST/"
cp "$SRC/LICENSE.txt" "$DST/LICENSE.txt"
# update tools/skill-eval/vendor/skill-creator/VERSION with today's date
```
