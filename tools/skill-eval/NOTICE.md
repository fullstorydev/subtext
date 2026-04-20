# Attribution

The contents of `vendor/skill-creator/` are vendored from Anthropic's
[`skill-creator`](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/skill-creator)
plugin, licensed under Apache License 2.0. See `vendor/skill-creator/LICENSE.txt`
and `vendor/skill-creator/VERSION` for details.

## Local modifications

All patches are tagged with a `subtext-patch:` comment.

- `vendor/skill-creator/scripts/run_eval.py` — normalize `:` → `-` in the
  staged skill's `clean_name`. Claude Code converts colons to hyphens when
  registering skill names from filenames, so the original upstream code
  generates filenames and detection strings that don't match the form Claude
  actually invokes. Without this patch, every Subtext skill (all of which use
  the `subtext:` prefix) reports ~0% trigger rate regardless of description
  quality.

- `vendor/skill-creator/scripts/run_eval.py` — new `--isolated` flag. Runs
  each query against a disposable project root with `CLAUDE_CONFIG_DIR` pointed
  at an empty directory, so no user plugins / skills / MCP servers load. Only
  Claude's 8 built-in skills plus the staged skill under test are available.
  Measures description quality without competition from the user's installed
  skill suite — useful for CI reproducibility and for isolating "is my
  description intrinsically good" from "is it outranked by `superpowers:*`".

- `vendor/skill-creator/scripts/run_loop.py` — mirror `--isolated` flag. Same
  tempdir + `CLAUDE_CONFIG_DIR` setup as `run_eval.py`; chdir into the
  disposable project root so `find_project_root()` inside the loop picks it
  up. Lets description tuning happen against an isolated baseline.

- `vendor/skill-creator/scripts/run_eval.py` — per-worker project roots in
  isolated mode. Without this, all `num_workers` concurrent `claude -p`
  subprocesses stage their near-identical skills into the same
  `.claude/commands/` and each Claude instance sees all ~N of them. Claude
  picks near-uniformly from the set, so per-worker trigger detection drops
  roughly by `num_workers×` even when the description is strong enough to
  consistently invoke a staged skill. Fix: each worker creates its own
  per-query subdir under a shared `isolated_base` and stages its file there.
  Without this, the default `--num-workers 10` reports ~10% of the true
  trigger rate.

  TODO: report all patches upstream at anthropics/claude-plugins-official.

If upstream changes are needed, re-copy from the installed plugin location,
re-apply the patch above, and bump `VERSION`.
