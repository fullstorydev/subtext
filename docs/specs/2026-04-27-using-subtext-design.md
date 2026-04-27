# Design: `using-subtext` meta-skill

**Date:** 2026-04-27
**Status:** Approved (brainstorming)
**Implementation branch:** `chip/using-subtext-meta-skill` (to be cut from `main` after PR #23 merges)

## Background

Subtext currently has 12 skills (atomics, workflows, recipes, onboarding-shaped). They are individually discoverable via Claude Code's description-matching, but there is no meta-layer that:

1. Establishes when an agent MUST reach for subtext
2. Documents how the skills compose
3. Surfaces anti-patterns that lead to silent regressions ("tests passed, that's enough")

Inspired by superpowers' `using-superpowers` (auto-loaded SessionStart bootstrap that establishes skill-invocation discipline), `using-subtext` plays the same role for the subtext domain: visual UI work, observed sessions, and reviewer-facing evidence.

## Goals

1. **Discipline** — agents reach for the right subtext skill at the right moment, without the user having to nudge them.
2. **Comprehension** — agents understand how the skills compose (proof inner loop, review outer loop, atomics underneath).
3. **Cross-harness reach** — works in Claude Code, Cursor, and Codex via each platform's native bootstrap mechanism.

## Key design tension: subagent applicability

Superpowers includes a `<SUBAGENT-STOP>` block that short-circuits its meta-skill when the agent is dispatched as a subagent. This is correct for superpowers because its discipline operates at the orchestration level (brainstorming, planning, TDD) — you don't want a focused subagent re-running orchestration phases.

**Subtext is the inverse.** The `proof` skill is *expected* to run inside a subagent — the subagent is the one making the change, exercising the running app, and capturing screenshots. If a subagent skips subtext, the orchestrator and the final PR get back text claims with no artifacts. That is precisely the failure mode subtext exists to prevent.

**Resolution:** drop SUBAGENT-STOP. Replace with explicit "Where this skill applies" guidance that calls out the inversion: subagents doing UX/proof work MUST invoke; subagents doing pure backend work skip; orchestrators running directly invoke themselves.

## Architecture

### File layout

```
skills/using-subtext/
  SKILL.md
hooks/
  hooks.json              # Claude Code SessionStart config
  hooks-cursor.json       # Cursor sessionStart config
  run-hook.cmd            # polyglot bash/cmd wrapper (cross-platform)
  session-start           # bash script: detect harness, inject SKILL.md
.codex/
  INSTALL.md              # user-facing setup instructions
  subtext-bootstrap.md    # the EXTREMELY_IMPORTANT block + tool mapping
  subtext-codex           # Node CLI: bootstrap | find-skills | use-skill
lib/
  skills-core.js          # frontmatter parser, skill discovery (shared util)
```

### Why hooks at the repo root

All three plugin manifests (`.claude-plugin/marketplace.json`, `.codex-plugin/plugin.json`, `.cursor-plugin/plugin.json`) declare the source as `./`. The plugin root is the repo root for every harness, so `${CLAUDE_PLUGIN_ROOT}/hooks/hooks.json` resolves correctly. This matches superpowers 5.0.7's layout.

### Why no `references/` directory

Subtext's skills today are mostly atomic tool catalogs that describe MCP tools — those tools work identically across harnesses. The places harness differences matter (Task → spawn_agent, TodoWrite → update_plan, etc.) only become relevant when a skill explicitly uses subagent dispatch or cross-harness tool semantics. None of subtext's current skills require this, so we ship without `references/` and add it when a future skill genuinely needs it.

## SKILL.md content outline

````markdown
---
name: using-subtext
description: Use when starting any conversation that may involve rendered UI,
  observed sessions, or producing reviewer-facing evidence (screenshots, viewer
  links, code diffs, command output). Establishes how subtext skills compose
  and when to invoke them before any response or action.
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
  MUST invoke. Your orchestrator depends on you to surface evidence
  back up the chain.
- **Subagent doing purely backend / non-visual work:** trigger surface
  doesn't apply, skip.
- **Orchestrator running directly:** same rule, invoke the relevant
  skill yourself.

## Instruction Priority

User CLAUDE.md > using-subtext > default system prompt.

## How to Access Skills

- Claude Code & Cursor: `Skill` tool.
- Codex: `~/.codex/subtext/.codex/subtext-codex use-skill <name>`.

## When to Reach for Subtext

| Signal | Reach for |
|--------|-----------|
| Making UI/visual changes | proof |
| Have a session URL | review |
| Need to drive a hosted browser | live |
| Setting up a new project | onboard |
| Naming components / runtime model | sightmap |

## The Rule

Invoke the relevant subtext skill BEFORE any response or action that
touches the trigger surface. Even a 1% chance counts.

## Red Flags

| Thought | Reality |
|---------|---------|
| "I'll just check the diff" | Visual changes need visual proof. |
| "Tests passed, that's enough" | Tests verify code, not UX. |
| "I don't need a session for this small change" | Small UI changes regress silently. |
| "I'll describe what changed" | Screenshots > prose. |
| "Let me explore the app first" | proof tells you HOW to explore. |
| "I remember how proof works" | Skills evolve. Read current version. |

## Composition

- **Atomics** (`shared`, `session`, `live`, `sightmap`, `tunnel`, `comments`) — tool catalogs.
- **Workflows** (`proof`, `review`) — orchestration. proof = inner loop, review = outer loop.
- **Recipes** (`recipe-sightmap-setup`) — short step lists.
- **Onboarding** (`onboard`, `setup-plugin`, `first-session`) — first-time user setup.

```
proof ──▶ session recorded ──▶ review (optional handoff)
```

## Skill Types

- **Rigid** (`proof`): follow exactly.
- **Flexible** (atomics): adapt to context.
````

## Hook script behavior

`hooks/session-start` is a near-direct port of superpowers 5.0.7's script with paths and envelope text swapped. Logic:

1. Read `skills/using-subtext/SKILL.md`.
2. JSON-escape the content using bash parameter substitution (the fast version, not the per-character loop in 4.0.3).
3. Detect the harness via env vars and emit the platform-correct JSON envelope:
   - `CURSOR_PLUGIN_ROOT` set → `{"additional_context": "..."}` (snake_case)
   - `CLAUDE_PLUGIN_ROOT` set, no `COPILOT_CLI` → `{"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": "..."}}` (nested)
   - `COPILOT_CLI=1` or fallback → `{"additionalContext": "..."}` (SDK standard)
4. Wrap the SKILL content in:
   ```
   <EXTREMELY_IMPORTANT>
   You have subtext.

   **Below is the full content of your 'subtext:using-subtext' skill — your introduction to using subtext skills. For all other skills, use the 'Skill' tool:**

   {{SKILL_CONTENT}}
   </EXTREMELY_IMPORTANT>
   ```

`hooks/hooks.json` and `hooks/hooks-cursor.json` declare the SessionStart config for their respective harnesses; both invoke `run-hook.cmd session-start`.

## Codex bootstrap

Codex has no native SessionStart hook, so the user wires the bootstrap into `~/.codex/AGENTS.md`:

```markdown
## Subtext System

<EXTREMELY_IMPORTANT>
You have subtext. RIGHT NOW run:
`~/.codex/subtext/.codex/subtext-codex bootstrap`
and follow the instructions it returns.
</EXTREMELY_IMPORTANT>
```

`subtext-codex` is a Node CLI with three commands:

- `bootstrap` — prints `subtext-bootstrap.md` content + an enumerated skills list (using `lib/skills-core.js` to walk `skills/` and parse frontmatter).
- `find-skills` — lists available skills.
- `use-skill <name>` — prints a specific skill's content.

`lib/skills-core.js` provides shared frontmatter parsing and skill discovery utilities. Minimal port of superpowers' equivalent.

## Branching & ship plan

- **Branch:** `chip/using-subtext-meta-skill`, cut from `main` after PR #23 merges.
- **Version bump:** `0.1.52 → 0.1.53` across all three plugin manifests.
- **PR scope:**
  - New: `skills/using-subtext/SKILL.md`
  - New: `hooks/` (4 files)
  - New: `.codex/` (3 files including the Node CLI)
  - New: `lib/skills-core.js`
  - Modified: 3 plugin manifest version bumps

## Test plan

- **Claude Code:** install plugin locally, start a fresh session, confirm `<EXTREMELY_IMPORTANT>You have subtext...</EXTREMELY_IMPORTANT>` block appears in the system context. Confirm `using-subtext` is in the available-skills list. Verify the SessionStart matchers (`startup`, `clear`, `compact`) all fire.
- **Cursor:** install plugin, start session, confirm `additional_context` injection works (snake_case envelope).
- **Codex:** manual setup per `.codex/INSTALL.md`, run `subtext-codex bootstrap`, confirm output mirrors what the hook injects on Claude Code.
- **Cross-harness sanity:** confirm `proof` is reachable via the harness's skill mechanism after bootstrap.

## Out of scope

- **Tool-mapping references** (`skills/using-subtext/references/cursor-tools.md`, `codex-tools.md`). Defer until a subtext skill needs them.
- **Forward-looking proof-documents content.** Add to SKILL.md when proof documents lands in production.
- **Retroactive skill updates.** Existing subtext skills should still work standalone — no changes required.

## Open questions

None at design time. Implementation may surface platform-specific quirks (e.g., does Cursor's `sessionStart` fire on session resume?) — those get resolved during the test plan.
