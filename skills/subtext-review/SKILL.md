---
name: subtext-review
description: Review a completed Subtext session and produce a structured summary. Use when you have a session URL and want to understand what happened — verify a flow, walk through a dev / staging / preview session, or summarize a captured session. Optionally emits reproduction steps on request.
---

# Review

> **PREREQUISITE:** Read `subtext-shared` and `subtext-session` for tool conventions.

**Type:** Workflow — goal-oriented with decision logic.

Review a completed session and produce a structured summary of what happened. Optionally emit reproduction steps when the user asks. Review is read-only analysis.

## When to use

**Use when:**
- The user provides a session URL and wants to know what happened.
- The user asks for a walkthrough, summary, or diagnosis of a session.
- Session source is any of: local dev, staging, preview, production.

**Skip when:**
- The user wants the repro *executed*, not just described — that needs a live browser (the separate Subtext Verify plugin).

## The loop

### Step 1: Open the session

Call `review-open` with whichever identifier you have — see `subtext-session` for the five accepted forms. Capture the `trace_id` from the response.

### Step 2: Read the session content

Use `review-view` at key timestamps. Prioritize in this order:

1. **Errors** — use `review-inspect` or console / network lookups for failure moments.
2. **Navigation inflections** — page changes, route transitions, modals.
3. **Before/after pairs** — `review-diff` between two anchor points is the most revealing read.

Don't sweep the entire session frame-by-frame — that's expensive and usually unnecessary. Lead with the event summaries from `review-open` and the errors within them.

### Step 3: Assess

Form a judgment on:

- **What the session was trying to accomplish** — inferable from behavior.
- **Did it succeed** — any errors? Did the final state match the apparent intent?
- **Notable moments** — anything surprising, confusing, or worth flagging to the user.

### Step 4: Produce the structured summary

Output in this shape — stable sections make the result easy to consume, especially for a downstream agent:

```markdown
## Session Summary

**Session:** <URL>
**Type:** <dev | staging | preview | production>
**Duration:** <if available>

### What happened
<One-paragraph narrative of what the user/agent tried to do.>

### Errors
<Timestamped list with context, or: "None observed.">

### Key moments
- `<timestamp>` — <inflection point>

### Assessment
<One paragraph. Did the session achieve its apparent goal? Anything the next reader should know?>
```

### Step 5: Reproduction steps — only if asked

If the user explicitly asks to reproduce, append a structured step list. **Do not execute** — this plugin is read-only. Executing a repro requires driving a live browser, which lives in the separate Subtext Verify plugin.

```markdown
### Reproduction steps

1. Navigate to <URL>
2. <action> — e.g., "Click the 'Sign in' button"
3. <observation to confirm> — e.g., "Verify modal appears within 2s"
```

Write the steps as deterministic actions: concrete selectors, URLs, and assertions. Avoid subjective instructions ("look around").

## Decision logic

### Errors present

Always lead with errors. A downstream reader — human or agent — will look for this section first.

### Repro steps requested

- "reproduce", "repro", "walk me through step by step", "how do I hit this" → produce the step list in Step 5.
- "review", "summarize", "what happened" → stop at Step 4. Don't volunteer repro steps; they add length without being asked for.
