# subtext

## 0.3.4

### Patch Changes

- fecd8f2: tunnel support for connecting to websockets

## 0.3.3

### Patch Changes

- f7f927b: update the skill generation process

## 0.3.2

### Patch Changes

- f2a41ae: pickup the latest tunnel version

## 0.3.0

### Minor Changes

- 75ab919: Ship an OpenCode plugin entry point so users can install Subtext with a single
  `plugin: ["subtext@git+https://github.com/fullstorydev/subtext.git"]` line.

  - `.opencode/plugins/subtext.js` — registers the repo's `skills/` directory in
    `config.skills.paths` so OpenCode's native `skill` tool discovers every
    Subtext skill, and injects the `using-subtext` SKILL.md into the first user
    message of each session (mirrors the existing Claude Code `SessionStart`
    hook).
  - `.opencode/INSTALL.md` — install guide for OpenCode users.
  - `package.json` — drops `private: true` and adds `main` so git-backed installs
    resolve the plugin entry point.
