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
- **Codex:** Skills load natively from `~/.agents/skills/subtext/`. Read the relevant SKILL.md directly when its description matches your task.
- **Gemini CLI:** Skills activate via the `activate_skill` tool. Gemini loads skill metadata at session start and activates the full content on demand.

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
