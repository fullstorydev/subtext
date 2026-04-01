---
name: subtext:ux-review-workflow
description: Evaluate a session recording for usability issues. Identifies friction, confusion, and improvement opportunities.
metadata:
  requires:
    skills: ["subtext:session", "subtext:shared", "subtext:comments", "subtext:agent-playback-link"]
---

# UX Review

> **PREREQUISITE — Read inline before any other action:** Read skills `subtext:session`, `subtext:shared`. Do not use the Skill tool — read the files directly.

Analyze a session recording for usability issues. About the quality of the experience, not just whether things work.

## Goal

A prioritized list of UX improvement opportunities, each tied to session evidence and components.

**Done when:** Friction points identified with evidence, ranked by impact, connected to source code where possible.

**Acceptable outcomes:**
- Clear friction → prioritized issues with timestamps, components, recommendations
- No friction → report what works well (positive patterns are valuable)
- Mix → both issues and positive patterns

## Decision Points

**When reviewing the session:**
- `comment-list` first — existing annotations may highlight friction points the user already noticed. For each friction point, `comment-add` with appropriate intent (`bug`, `tweak`, `ask`, `looks-good`).
- User specified a flow → focus on that flow's timestamps
- No focus given → walk entire session chronologically

**Friction signals to watch for:**
- **Rage clicks** — repeated clicks on same element → UI not responding as expected
- **Dead clicks** — clicks on non-interactive elements → user expected something clickable
- **Long pauses** (>5s before action) → confusion, unclear next step, cognitive overload
- **Immediate undo** — action + back/ctrl+z within seconds → error recovery
- **Excessive scrolling** — repeated scroll up/down → can't find what they need
- **Browser back loops** — navigating back multiple times → nav doesn't match mental model
- **Form abandonment** — started filling, navigated away → form friction
- **Repeated same action** — trying same thing multiple times → no clear feedback

**When a UX issue is identified:**
- Component has `[src: ...]` annotation → read source to understand behavior and where fix would go
- Affects core flow (signup, purchase, main feature) → rank higher
- Cosmetic or edge-case → rank lower

**When forming recommendations:**
- Pattern repeats across interactions → flag as systemic
- Fix is straightforward → be specific about the change
- Fix requires design decisions → note options, don't prescribe

## Heuristics

- Dead clicks are the strongest usability signal.
- Time-between-interactions is a proxy for cognitive load.
- Users who complete a flow may still have had a bad experience.
- Always note what works WELL, not just problems.
- One user's session is an anecdote, not a trend. Frame accordingly.

## When Things Go Wrong

- **No UX issues** → report smooth flow. Note what works well.
- **Very short session** → focus on why it ended (task completed quickly vs abandoned).
- **Clear bug, not UX** → note bug, suggest escalating to `subtext:session-analysis-workflow`.
- **User intent unclear** → describe observations, present possible interpretations.

## Composition

- **Invoked by**: `subtext:workflow` router (as subagent), or user directly
- **Escalates to**: `subtext:session-analysis-workflow` (if bug found), `subtext:bug-fix-workflow` (if user wants to act)

## Output Format

```
## UX Review

### Flow Summary
[What the user was trying to do and how it went]

### Friction Points

#### [Issue title] — [High/Medium/Low]
- **Timestamp**: [when]
- **Signal**: [rage click / dead click / long pause / etc.]
- **Component**: [name] ([source path])
- **What happened**: [description]
- **Recommendation**: [suggestion or options]

### Positive Patterns
- [What worked well and why]

### Comments Left
[List of comments added during review, with intents and timestamps]

### Summary
[Overall assessment and top priority]
```
