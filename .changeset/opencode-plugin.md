---
"subtext": minor
---

Ship an OpenCode plugin entry point so users can install Subtext with a single
`plugin: ["subtext@git+https://github.com/fullstorydev/subtext.git"]` line.

- `.opencode/plugins/subtext.js` — registers the repo's `skills/` directory in
  `config.skills.paths` so OpenCode's native `skill` tool discovers every
  Subtext skill, and injects the `using-subtext` SKILL.md into the first user
  message of each session (mirrors the existing Claude Code `SessionStart`
  hook).
- `.opencode/INSTALL.md` — install guide for OpenCode users.
- `package.json` — drops `private: true` and adds `main` so git-backed installs
  resolve the plugin entry point.
