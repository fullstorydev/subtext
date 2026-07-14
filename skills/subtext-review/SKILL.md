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

Call `review-open` with whichever identifier you have — see `subtext-session` for the five accepted forms. Capture the `client_id` from the response, and read the **map** it returns — signal counts by kind/tag, page flow, and a density strip with error markers. Don't call `review-zoom` yet.

### Step 2: Form hypotheses from the map

The map is the orientation layer. Before zooming, ask: does anything in `kinds`/`tags` stand out (an `error:` count, an unusually dense phase)? Where does the density strip's `hot:` callout point? Form one or two hypotheses about what happened — that's what you zoom to confirm.

### Step 3: Zoom to confirm — as recipes, coarse to fine

Use `review-zoom` with a `resolution` map. Treat resolutions as recipes, not parameters to memorize:

- Errors anywhere → `resolution={ error: "standard" }`
- What happened overall → `resolution={ navigation: "standard", interaction: "standard" }`
- Devtool-level detail on a suspect window → `resolution={ network: "machine", console: "machine" }`, narrowed with `t0_ms`/`t1_ms`

Start coarse (`standard`, the default) and only reach for `machine`/`detail` on the specific kind or tag your hypothesis needs — each step down costs more tokens for more fidelity. Judge coverage against the map from `review-open` (its `kinds`/`tags` counts and density strip); `review-zoom` returns the signal slice.

When you need to see the screen itself — confirm a layout, grab a component tree — use `review-snapshot` at the timestamp in question. It's a separate data set from signals; don't expect it to carry network/console detail.

Don't sweep the entire session frame-by-frame — that's expensive and usually unnecessary. Lead with the map and the errors it surfaces.

### Step 4: Assess

Form a judgment on:

- **What the session was trying to accomplish** — inferable from behavior.
- **Did it succeed** — any errors? Did the final state match the apparent intent?
- **Notable moments** — anything surprising, confusing, or worth flagging to the user.

### Step 5: Produce the structured summary

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

### Step 6: Reproduction steps — only if asked

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

- "reproduce", "repro", "walk me through step by step", "how do I hit this" → produce the step list in Step 6.
- "review", "summarize", "what happened" → stop at Step 5. Don't volunteer repro steps; they add length without being asked for.
