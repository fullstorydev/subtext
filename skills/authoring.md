# Skill Authoring Guide

Read this before creating or modifying any skill. This is for humans and agents alike.

## Philosophy

A skill teaches an agent something it can't discover from tools alone. MCP tools are self-describing — they expose their own parameter schemas at call time. So skills never re-document parameters. They answer higher-order questions: *which* tools exist, *when* to reach for them, *how* to sequence them, and *what judgments* to make along the way.

## Rule of Thumb

Every skill is exactly one of three things:

- **Atomic** — tool catalog. "Here's what exists and when to use it." No procedures.
- **Recipe** — step list. "Do 1, 2, 3, 4." No branching.
- **Workflow** — goal with decision logic. "Get to done, but decide how based on what you find." Composes atomics.

If it describes what's available → atomic. If it's a straight-line sequence → recipe. If it defines a goal and the agent has to figure out *how* → workflow.

Dependencies point down: workflows compose atomics, recipes reference atomics, atomics stand alone.

## Atomics

A tool catalog. Fits on one screen. Lists what's available and when to reach for each tool.

**Goes in:** Tool table, one-line descriptions, usage tips, See Also links.
**Stays out:** Goals, decision logic, step-by-step procedures, parameter docs the tool already provides.
**Named:** Bare noun — `session`, `sightmap`, `tunnel`.

This is an atomic:
> "Here are four tools for session replay. `review-open` is cheap, `review-view` is expensive. `review-diff` between before/after is the most revealing."

This is not — it's drifting into a recipe:
> "First call `review-open`, then look at the events, then call `review-view` on the interesting timestamps..."

## Recipes

A numbered list of tool calls. What you'd paste into a runbook. 3-15 steps.

**Goes in:** Prerequisites, numbered steps with literal tool calls.
**Stays out:** Decision logic, goals, explanations of *why*.
**Named:** `recipe-<verb>-<noun>` — `recipe-sightmap-setup`.

This is a recipe:
> "1. Open session. 2. Extract steps from events. 3. Set up tunnel. 4. Navigate. 5. Interact. 6. Report."

This is not — it's drifting into a workflow:
> "1. Open session. 2. If there are errors, focus on those. If not, look at navigation patterns. 3. Decide whether to..."

If it grows `if/when/unless` clauses, extract the decision logic into a workflow.

## Workflows

Goal-oriented orchestration with decision logic. Defines what "done" looks like, then guides the agent through branching decisions, user checkpoints, and subagent delegation to get there.

**Goes in:** Goal + done-when criteria, decision points with exit conditions, delegation rules, heuristics, composition (who calls this, what it calls).
**Stays out:** Tool parameter docs (that's an atomic), flat step lists (that's a recipe).
**Named:** Stand-alone — pick a name that describes what the workflow accomplishes. `proof`, `review`. No suffix convention.

This is a workflow:
> "**Understanding** — session analysis exists? Accept it. Otherwise delegate to subagent. Bug description vague? Ask for context. **Exit:** can state expected vs actual behavior. **Checkpoint:** present to user."

This is not — it's a recipe wearing a workflow's clothes:
> "Step 1: Open session. Step 2: Call view. Step 3: Call diff. Step 4: Write summary."

A workflow earns its length through decision points. If every section is "call this tool" without branching, it's a recipe.

### Onboarding-shaped workflows

Skills like `onboard`, `verify-setup`, and `first-session` are workflow-shaped but user-facing — guided setup rather than agent-internal orchestration. They follow the same bare-name rule. Treat them as adjacent to the three buckets, not a fourth tier.

## Conventions

### Frontmatter

```yaml
---
name: skill-name
description: One line — specific enough for the skill loader to match intent.
metadata:
  requires:
    skills: ["shared", "session"]
---
```

The `description` is what the agent sees when deciding whether to load the skill. "Session replay MCP tools" is good. "Tools" is not.

### PREREQUISITE line

Skills that depend on others open with:

```markdown
> **PREREQUISITE — Read inline before any other action:** Read skills `session`, `shared`.
```

This achieves composition without skill invocation overhead — the agent reads dependencies inline.

### File layout

Each skill is a directory with a `SKILL.md`. Scripts go alongside it. No global prefix — the plugin is the namespace. Recipes use the `recipe-` prefix; atomics and workflows use bare descriptive names.

### Don't duplicate across buckets

If tips exist in an atomic, don't repeat them in a workflow that depends on it. The PREREQUISITE line loads the atomic — the agent already has it.

## When to Create vs Extend

**Create** a new skill when: new MCP server (atomic), new multi-step goal with 2-3+ decision points (workflow), or a repeatable sequence users keep asking for (recipe).

**Extend** an existing skill when: a new tip fits in an atomic, a new decision point fits in an existing workflow, or a new step fits in a recipe. A new section in an existing skill is better than a new skill.

## Acknowledgements

Our skill taxonomy is adapted from the [Google Workspace CLI](https://github.com/googleworkspace/cli) plugin architecture, which organizes skills into atomic API catalogs, helper commands, cross-service workflows, and recipes.
