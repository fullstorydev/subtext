# `using-subtext` Meta-Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a SessionStart-loaded meta-skill (`using-subtext`) that auto-injects subtext invocation discipline and composition guidance into Claude Code, Cursor, and Codex sessions.

**Architecture:** A single bash script (`hooks/session-start`) detects the host harness via env vars (`CURSOR_PLUGIN_ROOT`, `CLAUDE_PLUGIN_ROOT`, `COPILOT_CLI`) and emits the platform-correct JSON envelope wrapping `skills/using-subtext/SKILL.md` content. Hook configs at the plugin root (`hooks/hooks.json`, `hooks/hooks-cursor.json`) wire the script into each harness's native SessionStart mechanism. Codex has no hook system, so a Node CLI (`.codex/subtext-codex`) is wired into `~/.codex/AGENTS.md` and prints the same content on demand.

**Tech Stack:** Bash, Node.js (≥14, ESM), JSON, Markdown.

**Spec:** `docs/specs/2026-04-27-using-subtext-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `skills/using-subtext/SKILL.md` | The meta-skill content. Loaded by all three bootstrap mechanisms. |
| `hooks/session-start` | Bash. Reads SKILL.md, escapes for JSON, detects harness, emits envelope. |
| `hooks/run-hook.cmd` | Polyglot bash/cmd wrapper. Cross-platform invocation entry point. |
| `hooks/hooks.json` | Claude Code hook config. `SessionStart` matcher → `run-hook.cmd session-start`. |
| `hooks/hooks-cursor.json` | Cursor hook config. `sessionStart` (lowercase) → `./hooks/session-start`. |
| `.codex/subtext-codex` | Node CLI. Subcommands: `bootstrap`, `find-skills`, `use-skill <name>`. |
| `.codex/subtext-bootstrap.md` | The `<EXTREMELY_IMPORTANT>` block printed by `bootstrap`. |
| `.codex/INSTALL.md` | User-facing setup steps for Codex. |
| `lib/skills-core.js` | ESM module. `extractFrontmatter()`, `walkSkillsDir()`. |
| `.claude-plugin/marketplace.json` | Bump version. |
| `.codex-plugin/plugin.json` | Bump version. |
| `.cursor-plugin/plugin.json` | Bump version. |

Each file owns one responsibility. The bash script encapsulates harness detection so the hook configs stay declarative; the Node CLI mirrors that detection only on Codex (the path that has no native hook).

---

## Task 1: Scaffold directories

**Files:**
- Create: `skills/using-subtext/`
- Create: `hooks/`
- Create: `.codex/`
- Create: `lib/`

- [ ] **Step 1: Create directories**

```bash
mkdir -p skills/using-subtext hooks .codex lib
```

- [ ] **Step 2: Verify**

Run: `ls -d skills/using-subtext hooks .codex lib`
Expected: All four paths echo back with no errors.

(No commit yet — directories without files are not tracked by git. Commits happen at the end of each subsequent task.)

---

## Task 2: Port `lib/skills-core.js`

**Files:**
- Create: `lib/skills-core.js`
- Reference: `/Users/chip/.claude/plugins/cache/claude-plugins-official/superpowers/5.0.7/lib/skills-core.js`

- [ ] **Step 1: Write the module**

```javascript
import fs from 'fs';
import path from 'path';

/**
 * Extract YAML frontmatter from a skill file.
 * @param {string} filePath - Path to SKILL.md file
 * @returns {{name: string, description: string}}
 */
export function extractFrontmatter(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  let inFrontmatter = false;
  let name = '';
  let description = '';

  for (const line of lines) {
    if (line.trim() === '---') {
      if (inFrontmatter) break;
      inFrontmatter = true;
      continue;
    }
    if (!inFrontmatter) continue;

    const nameMatch = line.match(/^name:\s*(.+)$/);
    if (nameMatch) name = nameMatch[1].trim();

    const descMatch = line.match(/^description:\s*(.+)$/);
    if (descMatch) description = descMatch[1].trim();
  }

  return { name, description };
}

/**
 * Walk a skills directory, returning [{ dir, name, description }] for each SKILL.md.
 * @param {string} skillsDir - Absolute path to skills/ root
 * @returns {Array<{dir: string, name: string, description: string}>}
 */
export function walkSkillsDir(skillsDir) {
  const out = [];
  if (!fs.existsSync(skillsDir)) return out;

  for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillFile = path.join(skillsDir, entry.name, 'SKILL.md');
    if (!fs.existsSync(skillFile)) continue;
    const { name, description } = extractFrontmatter(skillFile);
    out.push({ dir: entry.name, name, description });
  }

  return out.sort((a, b) => a.dir.localeCompare(b.dir));
}
```

- [ ] **Step 2: Smoke test the parser**

Run:
```bash
node --input-type=module -e "
import { extractFrontmatter } from './lib/skills-core.js';
console.log(extractFrontmatter('skills/proof/SKILL.md'));
"
```

Expected: `{ name: 'proof', description: '...' }` with no errors.

- [ ] **Step 3: Smoke test the walker**

Run:
```bash
node --input-type=module -e "
import { walkSkillsDir } from './lib/skills-core.js';
console.log(walkSkillsDir('skills').map(s => s.name).join('\n'));
"
```

Expected: All 12 current skill names + `using-subtext` printed (one per line). If `using-subtext` isn't there yet (Task 7 hasn't run), expect 12 entries. After Task 7, expect 13.

- [ ] **Step 4: Commit**

```bash
git add lib/skills-core.js
git commit -m "feat(skills-core): add frontmatter parser and skills walker"
```

---

## Task 3: Polyglot hook wrapper

**Files:**
- Create: `hooks/run-hook.cmd`

- [ ] **Step 1: Write the wrapper**

Verbatim copy of superpowers 5.0.7's wrapper. The `: << 'CMDBLOCK'` heredoc is a no-op in bash but a comment-block start in cmd.bat — same file, two languages.

```bash
: << 'CMDBLOCK'
@echo off
REM Polyglot wrapper: runs .sh scripts cross-platform
REM Usage: run-hook.cmd <script-name> [args...]
REM The script should be in the same directory as this wrapper

if "%~1"=="" (
    echo run-hook.cmd: missing script name >&2
    exit /b 1
)
"C:\Program Files\Git\bin\bash.exe" -l "%~dp0%~1" %2 %3 %4 %5 %6 %7 %8 %9
exit /b
CMDBLOCK

# Unix shell runs from here
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT_NAME="$1"
shift
"${SCRIPT_DIR}/${SCRIPT_NAME}" "$@"
```

- [ ] **Step 2: Make executable**

```bash
chmod +x hooks/run-hook.cmd
```

- [ ] **Step 3: Smoke test**

Create a throwaway test script and verify the wrapper dispatches to it:
```bash
echo -e '#!/usr/bin/env bash\necho "wrapper-ok"' > hooks/_smoke.sh
chmod +x hooks/_smoke.sh
./hooks/run-hook.cmd _smoke.sh
rm hooks/_smoke.sh
```

Expected: `wrapper-ok` printed.

- [ ] **Step 4: Commit**

```bash
git add hooks/run-hook.cmd
git commit -m "feat(hooks): add cross-platform polyglot wrapper"
```

---

## Task 4: SessionStart bash script

**Files:**
- Create: `hooks/session-start`
- Reference: `/Users/chip/.claude/plugins/cache/claude-plugins-official/superpowers/5.0.7/hooks/session-start`

- [ ] **Step 1: Write the script**

```bash
#!/usr/bin/env bash
# SessionStart hook for the subtext plugin.
# Reads using-subtext SKILL.md and emits a platform-correct JSON envelope.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

skill_content=$(cat "${PLUGIN_ROOT}/skills/using-subtext/SKILL.md" 2>&1 || echo "Error reading using-subtext skill")

# Fast JSON-escape via parameter substitution (5 single-pass replacements).
escape_for_json() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\r'/\\r}"
  s="${s//$'\t'/\\t}"
  printf '%s' "$s"
}

skill_escaped=$(escape_for_json "$skill_content")
session_context="<EXTREMELY_IMPORTANT>\nYou have subtext.\n\n**Below is the full content of your 'subtext:using-subtext' skill — your introduction to using subtext skills. For all other skills, use the 'Skill' tool:**\n\n${skill_escaped}\n</EXTREMELY_IMPORTANT>"

# Emit the right JSON shape per harness.
# - Cursor: top-level snake_case `additional_context`
# - Claude Code: nested `hookSpecificOutput.additionalContext`
# - Copilot CLI / SDK fallback: top-level camelCase `additionalContext`
if [ -n "${CURSOR_PLUGIN_ROOT:-}" ]; then
  printf '{\n  "additional_context": "%s"\n}\n' "$session_context"
elif [ -n "${CLAUDE_PLUGIN_ROOT:-}" ] && [ -z "${COPILOT_CLI:-}" ]; then
  printf '{\n  "hookSpecificOutput": {\n    "hookEventName": "SessionStart",\n    "additionalContext": "%s"\n  }\n}\n' "$session_context"
else
  printf '{\n  "additionalContext": "%s"\n}\n' "$session_context"
fi

exit 0
```

- [ ] **Step 2: Make executable**

```bash
chmod +x hooks/session-start
```

- [ ] **Step 3: Verify Claude Code envelope**

The SKILL.md doesn't exist yet (Task 7), so create a placeholder so this test runs:
```bash
mkdir -p skills/using-subtext
echo "placeholder for testing" > skills/using-subtext/SKILL.md
```

Run:
```bash
CLAUDE_PLUGIN_ROOT="$PWD" ./hooks/session-start | jq -e '.hookSpecificOutput.additionalContext | contains("placeholder for testing")'
```

Expected: `true` printed; exit code 0. If `jq` errors, the JSON shape is wrong.

- [ ] **Step 4: Verify Cursor envelope**

Run:
```bash
CURSOR_PLUGIN_ROOT="$PWD" ./hooks/session-start | jq -e '.additional_context | contains("placeholder for testing")'
```

Expected: `true`; exit code 0.

- [ ] **Step 5: Verify SDK fallback envelope**

Run:
```bash
COPILOT_CLI=1 ./hooks/session-start | jq -e '.additionalContext | contains("placeholder for testing")'
```

Expected: `true`; exit code 0.

- [ ] **Step 6: Clean up placeholder**

```bash
rm skills/using-subtext/SKILL.md
```

(SKILL.md gets recreated for real in Task 7.)

- [ ] **Step 7: Commit**

```bash
git add hooks/session-start
git commit -m "feat(hooks): add SessionStart script with harness detection"
```

---

## Task 5: Hook config files

**Files:**
- Create: `hooks/hooks.json`
- Create: `hooks/hooks-cursor.json`

- [ ] **Step 1: Write Claude Code config**

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|clear|compact",
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd\" session-start",
            "async": false
          }
        ]
      }
    ]
  }
}
```

Save to `hooks/hooks.json`.

- [ ] **Step 2: Write Cursor config**

```json
{
  "version": 1,
  "hooks": {
    "sessionStart": [
      { "command": "./hooks/session-start" }
    ]
  }
}
```

Save to `hooks/hooks-cursor.json`.

- [ ] **Step 3: Validate JSON**

```bash
jq empty hooks/hooks.json && jq empty hooks/hooks-cursor.json && echo "json ok"
```

Expected: `json ok`. No syntax errors.

- [ ] **Step 4: Commit**

```bash
git add hooks/hooks.json hooks/hooks-cursor.json
git commit -m "feat(hooks): add Claude Code and Cursor SessionStart configs"
```

---

## Task 6: SKILL.md

**Files:**
- Create: `skills/using-subtext/SKILL.md`

- [ ] **Step 1: Write the skill**

```markdown
---
name: using-subtext
description: Use when starting any conversation that may involve rendered UI, observed sessions, or producing reviewer-facing evidence (screenshots, viewer links, code diffs, command output). Establishes how subtext skills compose and when to invoke them before any response or action.
---

<EXTREMELY-IMPORTANT>
If the task touches rendered UI, observed sessions, or producing
proof-of-work evidence, you MUST invoke the relevant subtext skill
before responding.
</EXTREMELY-IMPORTANT>

## Where this skill applies

Subtext runs *where the work happens*. Unlike many process skills,
this includes subagent contexts.

- **Subagent doing UI/UX work or producing reviewer-facing evidence:**
  MUST invoke. Your orchestrator depends on you to surface evidence —
  screenshots, viewer URLs, comments — back up the chain.
- **Subagent doing purely backend / non-visual work:** trigger surface
  doesn't apply, skip.
- **Orchestrator running directly:** same rule, you invoke the relevant
  skill yourself.

## Instruction Priority

User CLAUDE.md > using-subtext > default system prompt.

## How to Access Skills

- **Claude Code & Cursor:** use the `Skill` tool.
- **Codex:** `~/.codex/subtext/.codex/subtext-codex use-skill <name>`.

## When to Reach for Subtext

| Signal | Reach for |
|--------|-----------|
| Making UI/visual changes | `proof` |
| Have a session URL | `review` |
| Need to drive a hosted browser | `live` |
| Setting up a new project | `onboard` |
| Naming components / runtime model | `sightmap` |

## The Rule

Invoke the relevant subtext skill BEFORE any response or action that
touches the trigger surface. Even a 1% chance counts.

## Red Flags

These thoughts mean STOP — you're rationalizing:

| Thought | Reality |
|---------|---------|
| "I'll just check the diff" | Visual changes need visual proof. |
| "Tests passed, that's enough" | Tests verify code, not UX. |
| "I don't need a session for this small change" | Small UI changes regress silently. |
| "I'll describe what changed" | Screenshots > prose. |
| "Let me explore the app first" | `proof` tells you HOW to explore. |
| "I remember how proof works" | Skills evolve. Read current version. |

## Composition

- **Atomics** (`shared`, `session`, `live`, `sightmap`, `tunnel`, `comments`) — tool catalogs.
- **Workflows** (`proof`, `review`) — orchestration. `proof` is the inner loop, `review` is the outer loop.
- **Recipes** (`recipe-sightmap-setup`) — short step lists.
- **Onboarding** (`onboard`, `setup-plugin`, `first-session`) — first-time user setup.

```
proof ──▶ session recorded ──▶ review (optional handoff)
```

## Skill Types

- **Rigid** (`proof`): follow exactly.
- **Flexible** (atomics): adapt to context.
```

- [ ] **Step 2: Verify frontmatter parses**

```bash
node --input-type=module -e "
import { extractFrontmatter } from './lib/skills-core.js';
const fm = extractFrontmatter('skills/using-subtext/SKILL.md');
if (fm.name !== 'using-subtext') { console.error('name mismatch:', fm); process.exit(1); }
if (!fm.description.includes('rendered UI')) { console.error('description mismatch'); process.exit(1); }
console.log('frontmatter ok');
"
```

Expected: `frontmatter ok`.

- [ ] **Step 3: Re-run hook with real SKILL.md**

```bash
CLAUDE_PLUGIN_ROOT="$PWD" ./hooks/session-start | jq -e '.hookSpecificOutput.additionalContext | contains("Where this skill applies")'
```

Expected: `true`. The hook now injects the real content.

- [ ] **Step 4: Commit**

```bash
git add skills/using-subtext/SKILL.md
git commit -m "feat(skills): add using-subtext meta-skill"
```

---

## Task 7: Codex bootstrap content

**Files:**
- Create: `.codex/subtext-bootstrap.md`
- Create: `.codex/INSTALL.md`

- [ ] **Step 1: Write `subtext-bootstrap.md`**

```markdown
# Subtext Bootstrap for Codex

<EXTREMELY_IMPORTANT>
You have subtext.

**Tool for running skills:**
- `~/.codex/subtext/.codex/subtext-codex use-skill <skill-name>`

**Tool Mapping for Codex:**
When skills reference tools you don't have, substitute your equivalent:
- `Skill` tool → `~/.codex/subtext/.codex/subtext-codex use-skill <name>`
- `Read`, `Write`, `Edit`, `Bash` → use your native tools

**Critical Rules:**
- Before responding to any task that touches rendered UI, observed sessions, or producing reviewer-facing evidence, you MUST load the relevant subtext skill via `subtext-codex use-skill`.
- Announce: "I've read the [Skill Name] skill and I'm using it to [purpose]."
- Subagent dispatching UX/proof work: load `subtext:proof` and follow it. Skipping means the orchestrator loses the evidence.

IF A SUBTEXT SKILL APPLIES TO YOUR TASK, YOU DO NOT HAVE A CHOICE. YOU MUST USE IT.
</EXTREMELY_IMPORTANT>
```

Save to `.codex/subtext-bootstrap.md`.

- [ ] **Step 2: Write `INSTALL.md`**

```markdown
# Installing Subtext for Codex

## Installation

1. **Clone subtext repository:**
   ```bash
   mkdir -p ~/.codex/subtext
   cd ~/.codex/subtext
   git clone https://github.com/fullstorydev/subtext.git .
   ```

2. **Update `~/.codex/AGENTS.md` to include this section:**
   ```markdown
   ## Subtext System

   <EXTREMELY_IMPORTANT>
   You have subtext. RIGHT NOW run:
   `~/.codex/subtext/.codex/subtext-codex bootstrap`
   and follow the instructions it returns.
   </EXTREMELY_IMPORTANT>
   ```

## Verification

```bash
~/.codex/subtext/.codex/subtext-codex bootstrap
```

You should see the bootstrap content followed by a list of available skills. The system is ready.
```

Save to `.codex/INSTALL.md`.

- [ ] **Step 3: Validate markdown is well-formed**

```bash
test -s .codex/subtext-bootstrap.md && test -s .codex/INSTALL.md && echo "files ok"
```

Expected: `files ok`.

- [ ] **Step 4: Commit**

```bash
git add .codex/subtext-bootstrap.md .codex/INSTALL.md
git commit -m "feat(codex): add bootstrap content and install guide"
```

---

## Task 8: `subtext-codex` Node CLI

**Files:**
- Create: `.codex/subtext-codex`

- [ ] **Step 1: Write the CLI**

```javascript
#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { extractFrontmatter, walkSkillsDir } from '../lib/skills-core.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PLUGIN_ROOT = path.resolve(__dirname, '..');
const SKILLS_DIR = path.join(PLUGIN_ROOT, 'skills');
const BOOTSTRAP_FILE = path.join(__dirname, 'subtext-bootstrap.md');

function cmdBootstrap() {
  // Print bootstrap content
  if (fs.existsSync(BOOTSTRAP_FILE)) {
    process.stdout.write(fs.readFileSync(BOOTSTRAP_FILE, 'utf8'));
    process.stdout.write('\n\n');
  }

  // Print available skills
  process.stdout.write('## Available skills\n\n');
  for (const skill of walkSkillsDir(SKILLS_DIR)) {
    process.stdout.write(`- **subtext:${skill.dir}** — ${skill.description}\n`);
  }
}

function cmdFindSkills() {
  for (const skill of walkSkillsDir(SKILLS_DIR)) {
    process.stdout.write(`subtext:${skill.dir}\n  ${skill.description}\n\n`);
  }
}

function cmdUseSkill(name) {
  if (!name) {
    process.stderr.write('Error: skill name required\nUsage: subtext-codex use-skill <name>\n');
    process.exit(1);
  }
  // Strip optional namespace prefix
  const bare = name.replace(/^subtext:/, '');
  const skillFile = path.join(SKILLS_DIR, bare, 'SKILL.md');
  if (!fs.existsSync(skillFile)) {
    process.stderr.write(`Error: skill not found: ${bare}\n`);
    process.exit(1);
  }
  process.stdout.write(fs.readFileSync(skillFile, 'utf8'));
}

const [, , subcommand, ...rest] = process.argv;
switch (subcommand) {
  case 'bootstrap':
    cmdBootstrap();
    break;
  case 'find-skills':
    cmdFindSkills();
    break;
  case 'use-skill':
    cmdUseSkill(rest[0]);
    break;
  default:
    process.stderr.write('Usage: subtext-codex {bootstrap|find-skills|use-skill <name>}\n');
    process.exit(1);
}
```

Save to `.codex/subtext-codex` (no extension).

- [ ] **Step 2: Make executable**

```bash
chmod +x .codex/subtext-codex
```

- [ ] **Step 3: Smoke test `bootstrap`**

```bash
./.codex/subtext-codex bootstrap | grep -q "You have subtext" && \
  ./.codex/subtext-codex bootstrap | grep -q "subtext:proof" && \
  echo "bootstrap ok"
```

Expected: `bootstrap ok`.

- [ ] **Step 4: Smoke test `find-skills`**

```bash
./.codex/subtext-codex find-skills | grep -q "subtext:using-subtext" && echo "find-skills ok"
```

Expected: `find-skills ok`.

- [ ] **Step 5: Smoke test `use-skill`**

```bash
./.codex/subtext-codex use-skill proof | head -3
./.codex/subtext-codex use-skill subtext:review | head -3
```

Expected: First line of each shows `---` (frontmatter), then `name: proof` / `name: review` on the next lines. Both bare and namespaced inputs should work.

- [ ] **Step 6: Smoke test error path**

```bash
./.codex/subtext-codex use-skill nonexistent; echo "exit=$?"
```

Expected: `Error: skill not found: nonexistent` on stderr; `exit=1`.

- [ ] **Step 7: Commit**

```bash
git add .codex/subtext-codex
git commit -m "feat(codex): add subtext-codex CLI for bootstrap/find/use-skill"
```

---

## Task 9: Plugin manifest version bumps

**Files:**
- Modify: `.claude-plugin/marketplace.json`
- Modify: `.codex-plugin/plugin.json`
- Modify: `.cursor-plugin/plugin.json`

> Note: the target version depends on what PR #23 ships at. As of this plan: 0.1.52. Increment to 0.1.53. If main has moved further by the time you cut this branch, bump from main's current version.

- [ ] **Step 1: Read current versions**

```bash
grep '"version":' .claude-plugin/marketplace.json .codex-plugin/plugin.json .cursor-plugin/plugin.json
```

Expected: All three at the same version (e.g., `0.1.52`).

- [ ] **Step 2: Bump all three**

Edit each file, replacing `"version": "0.1.52"` with `"version": "0.1.53"` (or current+1). The line in `.claude-plugin/marketplace.json` is inside the `plugins` array entry.

- [ ] **Step 3: Verify lockstep**

```bash
grep '"version":' .claude-plugin/marketplace.json .codex-plugin/plugin.json .cursor-plugin/plugin.json
```

Expected: All three at the same new version.

- [ ] **Step 4: Commit**

```bash
git add .claude-plugin/marketplace.json .codex-plugin/plugin.json .cursor-plugin/plugin.json
git commit -m "chore: bump plugin version to 0.1.53"
```

---

## Task 10: Cross-harness manual verification

These steps require real harness installs and can't be automated in this plan. Execute, capture results, attach to the PR description.

- [ ] **Step 1: Claude Code — install and bootstrap**

Install the plugin from this branch in a fresh Claude Code session. Run:

```
/plugin marketplace add chip/skill-enhancements branch
```

Then start a new conversation and confirm the system reminder shows:
> `<EXTREMELY_IMPORTANT>You have subtext. ... Below is the full content of your 'subtext:using-subtext' skill ...`

- [ ] **Step 2: Claude Code — verify skill discovery**

In the same conversation, type `/skill` (or check the available-skills list) and confirm `subtext:using-subtext` appears.

- [ ] **Step 3: Cursor — install and bootstrap**

Install the plugin in Cursor. Start a new chat. Confirm `additional_context` injection works (should see the same `<EXTREMELY_IMPORTANT>` block in early context).

- [ ] **Step 4: Codex — manual setup**

Follow `.codex/INSTALL.md`:
```bash
mkdir -p ~/.codex/subtext
cd ~/.codex/subtext
git clone <this-branch> .
~/.codex/subtext/.codex/subtext-codex bootstrap
```

Confirm output starts with `# Subtext Bootstrap for Codex` and ends with the available-skills list.

- [ ] **Step 5: Update `~/.codex/AGENTS.md`**

Add the AGENTS.md section per `.codex/INSTALL.md`. Start a new Codex session. Confirm the agent runs `subtext-codex bootstrap` on its first turn and acknowledges subtext.

- [ ] **Step 6: Open PR**

Push branch, open PR against `main`. Title: `feat: add using-subtext meta-skill (auto-loaded SessionStart bootstrap)`.

PR description should include:
- Reference to spec: `docs/specs/2026-04-27-using-subtext-design.md`
- Test plan checkboxes from steps 1-5 above with results
- Out-of-scope reminder (references/, proof-documents content)

---

## Self-review checklist

Run these after the plan is fully written but before handing off to executing-plans / subagent-driven-development.

**Spec coverage:**
- [x] `using-subtext/SKILL.md` content — Task 6
- [x] Hook script behavior (env detection, JSON envelope) — Task 4
- [x] Hook configs (Claude Code + Cursor) — Task 5
- [x] Codex bootstrap (CLI + content + install) — Tasks 7, 8
- [x] `lib/skills-core.js` — Task 2
- [x] Plugin version bumps — Task 9
- [x] Test plan — Task 10
- [x] Out-of-scope items confirmed *not* in any task — references/, proof-documents content, retroactive skill updates: none of the tasks touch these

**Placeholder scan:** No "TBD"/"TODO"/"add appropriate X" — all steps have concrete code or commands.

**Type/name consistency:**
- `extractFrontmatter` and `walkSkillsDir` exported in Task 2 → consumed in Tasks 6, 8 with matching signatures.
- `subtext-codex` subcommands `bootstrap` / `find-skills` / `use-skill` defined in Task 8 → referenced consistently in `.codex/INSTALL.md` (Task 7) and Task 10 verification steps.
- Hook script env-var names (`CURSOR_PLUGIN_ROOT`, `CLAUDE_PLUGIN_ROOT`, `COPILOT_CLI`) are used identically in Tasks 4 and 10 verification.
