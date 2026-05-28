---
name: review
description: Review a completed Subtext session and produce a structured summary. Use when you have a session URL and want to understand what happened — whether to verify another agent's proof work, walk through a dev / staging / preview flow, or summarize a captured session. Optionally emits reproduction steps on request (execution lives in `subtext:live`). Skip for tasks that modify code (use `subtext:proof`) or drive a running app (use `subtext:live`).
metadata:
  requires:
    skills: ["subtext:shared", "subtext:session", "subtext:comments"]
  mcp-server: subtext
---

# Review

> **PREREQUISITE:** Read `subtext:shared`, `subtext:session`, `subtext:comments` for tool conventions.

**Type:** Workflow — goal-oriented with decision logic.

Review a completed session. Produce a structured summary of what happened. Optionally emit reproduction steps when the user asks. Reproduction execution itself is `subtext:live`'s job — review is read-only analysis.

## When to use

**Use when:**
- User provides a session URL and wants to know what happened
- Another agent needs to verify work captured by `subtext:proof`
- An agent revisits its own session after completion to sanity-check the result
- The user asks for a walkthrough, summary, or diagnosis of a session
- Session source is any of: agent proof runs, local dev, staging, preview

**Skip when:**
- The task modifies code — use `subtext:proof` instead
- The task drives a running app live — use `subtext:live`
- The user wants the repro *executed*, not just described — hand off to `subtext:live`

## Relationship to `subtext:proof`

`proof` is the inner loop: the working agent captures BEFORE/AFTER screenshots, leaves comment chapter markers, and checks its own work in real time as it edits code.

`review` is the outer loop: after the session is complete, another agent (or the same agent later) opens the recorded session and produces an independent read. Complementary, not overlapping — proof proves, review verifies.

## The loop

### Step 1: Open the session

Call `review-open` with whichever identifier you have — see `subtext:session` for the five accepted forms (`trace_id`, `session_url`, `device_id` + `session_id`, `email_address`, `user_uid`). When handed off from `subtext:proof`, prefer the `trace_id` from the proof run — no URL construction needed.

### Step 2: Read the chapter markers

Call `comment-list`. Existing comments serve as chapter markers. A session produced by `subtext:proof` will have a predictable spine:

- `BEFORE:` — initial state
- `AFTER:` — post-change state
- `ISSUE:` — problems encountered mid-loop
- `VERIFIED:` — final confirmed state

Let the markers drive your reading order. If they're absent (non-proof sessions), you'll need to read more broadly.

### Step 3: Read the session content

Use `review-view` at key timestamps. Prioritize in this order:

1. **Chapter markers** — read the frames around each one
2. **Errors** — use `review-inspect` or console/network lookups for failure moments
3. **Navigation inflections** — page changes, route transitions, modals
4. **Before/after pairs** — `review-diff` between known anchor points is the most revealing read

Don't sweep the entire session frame-by-frame. That's expensive and usually unnecessary.

### Step 4: Assess

Form a judgment on:

- **What the session was trying to accomplish** — stated in chapter markers or inferable from behavior
- **Did it succeed** — any errors? Did the final state match the stated intent?
- **Notable moments** — anything surprising, confusing, or worth flagging to the user

### Step 5: Produce the structured summary

Output in this shape — the format matters because the primary downstream consumer is often another agent, and stable sections make hand-off predictable:

```markdown
## Session Summary

**Session:** <URL>
**Type:** <agent-proof | dev | staging | preview>
**Duration:** <if available>

### What happened
<One-paragraph narrative. If proof markers exist, follow the BEFORE → change → AFTER arc. Otherwise: what did the user/agent try to do.>

### Errors
<Timestamped list with context, or: "None observed.">

### Key moments
- `<timestamp>` — <marker or inflection point>
- `<timestamp>` — <...>

### Assessment
<One paragraph. Did the session achieve its apparent goal? Anything the next reader should know?>
```

### Step 6: Reproduction steps — only if asked

If the user explicitly asks to reproduce, append a structured step list. **Do not execute.** Hand off to `subtext:live` with the steps as a prompt for the agent that will run them.

```markdown
### Reproduction steps

1. Navigate to <URL>
2. <action> — e.g., "Click the 'Sign in' button"
3. <action> — e.g., "Fill email field with <value>"
4. <observation to confirm> — e.g., "Verify modal appears within 2s"
```

Write the steps as deterministic actions a `subtext:live`-driven agent can follow. Avoid subjective instructions ("look around"); use concrete selectors, URLs, and assertions.

## Decision logic

### Session with proof chapter markers vs. without

| Signal                              | Reading strategy                                  |
| ----------------------------------- | ------------------------------------------------- |
| BEFORE / AFTER / VERIFIED markers present | Use them as the spine. `review-diff` between pairs. |
| Only ISSUE markers                  | Agent was struggling — lead with what went wrong. |
| No markers (dev / staging / preview)      | Read navigation and errors first, form the narrative yourself. |

### Errors present

Always lead with errors. An agent-consumer downstream will grep for this section first.

### Repro steps requested

If the user says "reproduce", "repro", "walk me through step by step", or "how do I hit this" → produce the step list in Step 6.

If the user says "review", "summarize", "what happened" → stop at Step 5. Do not volunteer repro steps — they add length without being asked for.

## Composition

- **Invoked by:** user directly with a session URL, or as a downstream handoff from `subtext:proof`
- **Composes:** `subtext:session` (tool catalog for `review-*`), `subtext:comments` (chapter markers)
- **Hands off to:** `subtext:live` when the user wants steps executed, not just written
