---
name: subtext:session-analysis-workflow
description: Analyze a Fullstory session recording. Understands what happened, maps components to source code, and forms root cause hypotheses when bugs are present.
metadata:
  requires:
    skills: ["subtext:session", "subtext:shared", "subtext:comments", "subtext:agent-playback-link"]
---

# Session Analysis

> **PREREQUISITE:** Read `subtext:shared` and `subtext:session` for MCP conventions and session replay tools.

Analyze a session recording to understand what happened and why. Depth adapts to what the session reveals — a clean session gets a concise summary; a session with errors gets a full diagnosis.

## Goal

An analysis that answers: What did the user do? What happened? Which code is involved? If something went wrong — why?

**Done when:** You can tell the story of the session, map components to source files, and (when a bug is present) explain root cause or present ranked hypotheses.

**Acceptable outcomes:**
- **Clean session** — concise summary, components exercised, source files involved
- **Confident diagnosis** — single root cause with strong evidence
- **Narrowed investigation** — 2-3 ranked hypotheses with evidence for each
- **Partial diagnosis** — clear expected/actual and repro steps, but code exploration hit a wall

## Decision Points

**When opening the session:**
- `comment-list` first — existing annotations highlight areas of interest. Prioritize those in your analysis. As you find issues, `comment-add` with intent to leave a persistent, addressable trail of findings.
- Event summaries from `review-open` often tell the whole story. Read them first before using `review-view` or `review-diff`.
- If the user asked about a specific moment, focus there instead of walking the entire session.

**When reviewing events:**
- Clear error signals (console errors, network failures, rage clicks, dead clicks) → focus investigation there
- No obvious errors → walk the flow chronologically
- Very long session → focus on the time window the user mentioned, or on error events

**When inspecting a bug:**
- Use `review-view` at key moments: just before the bug, the moment it manifests, any recovery attempts
- Use `review-diff` between before/after — usually the most revealing tool
- Timing bugs → capture multiple closely-spaced timestamps

**When components appear in snapshots:**
- Use `[src: ...]` annotations in snapshot output to find source paths directly
- Read the source files. Trace from the visible component inward to the data/logic driving it.
- If code is too complex for this context → return file paths and observations as partial analysis

**When forming the analysis:**
- Clean session → summarize flow, map components to source
- Bug with clear root cause → state it with evidence: file, function, mechanism
- Root cause ambiguous → present 2-3 hypotheses ranked by likelihood with evidence for/against
- Can't determine root cause → return what you know: expected/actual, repro steps, file paths

## Heuristics

1. **Event summaries are cheap. `review-view` is expensive.** Start with summaries.
2. **Console errors and network failures first.** They reveal root causes directly.
3. **`review-diff` between before and after is the most revealing tool.**
4. **Network errors correlate with UI bugs.** A failed API call often explains error states.
5. **Always map component names to source via `[src: ...]` annotations in `review-view`/`review-diff` output.**
6. **Code exploration is always valuable** when source paths are available.
7. **Structure repro steps as action verbs** (Navigate, Click, Fill, Scroll, Wait) with full URLs.

## When Things Go Wrong

- **Session cannot be opened** → report error, suggest checking URL or MCP config
- **Session is empty** → report what you can see, suggest a different session
- **No source annotations in snapshots** → grep for test IDs, class names, or component names from the a11y tree
- **Code exploration hits a wall** → return file paths and observations as partial analysis
- **Multiple hypotheses, no way to distinguish** → state all with evidence. Don't guess.
- **Investigation exceeding context** → return raw findings immediately

## Composition

- **Invoked by**: `subtext:workflow` router (as subagent), `subtext:bug-fix-workflow` (as subagent), or user directly
- **Delegates to**: nothing — self-contained within its subagent
- **Provides output to**: `subtext:bug-fix-workflow` (drives root cause, failing test, and fix)

## Output Format

Adapt to what the session reveals. Include relevant sections:

```
## Session Analysis

### Summary
[What the user did and what happened]

### Pages Visited
[URLs with timestamps]

### Components Involved
| Component | Source | Role |
|-----------|--------|------|

### Anomalies
[Errors, friction, unexpected behavior — or "None observed"]

### Expected vs Actual (if bug)
**Expected:** When [trigger], the user should see [outcome].
**Actual:** Instead, [what happened].

### Reproduction Steps (if bug)
1. **Navigate** to `[URL]`
2. **Click** [element]
3. **Observe**: [bug manifestation]

### Root Cause (if bug)
**Hypothesis**: [file, function, mechanism]
**Evidence**: [specific code patterns, network responses, session states]
**Confidence**: [High / Medium / Low]

### Comments Left
[List of comments added during analysis, with intents and timestamps]

### Recommendation
[None / Suggest ux-review / Suggest bug-fix — with reason]
```
