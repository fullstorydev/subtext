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

  TODO: port the same flag to `run_loop.py` so description tuning can happen
  in isolation too.

  TODO: report both patches upstream at anthropics/claude-plugins-official.

If upstream changes are needed, re-copy from the installed plugin location,
re-apply the patch above, and bump `VERSION`.
