---
name: proof
description: You MUST use this skill when implementing, fixing, or refactoring code. Captures evidence artifacts (screenshots, network traces, code diffs, trace session links) into a proof document as you work.
metadata:
  requires:
    skills: ["subtext:shared", "subtext:live", "subtext:comments", "subtext:docs"]
  mcp-server: subtext
---

# Proof

> **PREREQUISITE — Read inline before any other action:** Read skills `subtext:shared`, `subtext:live`, `subtext:comments`, `subtext:docs`.

**Type:** Rigid workflow — follow exactly. Skipping steps means unverified work ships.

Every code change that affects what a user sees must be visually proven. This skill creates a before/after evidence trail that proves the change works. No exceptions, no "it should look fine."

## Screenshot Capture

**Always use `live-view-screenshot` with `upload: true`.** This uploads the screenshot to cloud storage and returns a signed URL you can attach to comments and PRs.

```
live-view-screenshot({ connection_id, view_id, upload: true })
→ { screenshot_url: "https://..." }
```

**Do NOT use `artifact-upload` for screenshots.** It requires base64-encoding the entire PNG and frequently fails on large images. The `upload: true` flag on `live-view-screenshot` handles the upload server-side — smaller payload, no encoding issues.

**Pass `screenshot_url` through verbatim — query string included.** The full signed URL is the credential. Don't strip `?Expires=…&GoogleAccessId=…&Signature=…` when copying it into PR descriptions, comments, or summaries — without those params GCS returns 403 and the image won't render.

To attach a screenshot to a comment:

```
live-view-screenshot({ ..., upload: true }) → screenshot_url
comment-add({ ..., screenshot_url, intent: "looks-good", text: "AFTER: ..." })
```

## Proof Document

Every proof run creates a permanent record alongside the live session. This lets you — and any future reviewer — reconstruct exactly what changed, what it looked like before and after, and what evidence backed the decision to ship.

**Create once, attach continuously, close at the end.** Pass the `verification` seed template (see `subtext:docs`) unless you have a better fit:

```
doc-create(title: <task title>, content: <verification seed template from subtext:docs>)
→ doc_id, doc_url  ← save both
```

The `doc_id` travels through every step below. The `doc_url` is the permanent link you hand to the user at the end.

## The Loop

### Step 1: Connect to the running app

Open a browser connection per `subtext:live`'s connect flow — `live-connect` for remote URLs, tunnel-first (`live-tunnel` → `tunnel-connect` → `live-view-new`) for localhost. The hosted browser cannot reach localhost without the tunnel; see `subtext:live` for both flows in detail.

If the app isn't running, **try to start the dev server yourself first.** Look for `package.json` scripts (`dev`, `start`, `serve`), a `Makefile`, or a `docker-compose.yml`. Run the appropriate command in the background. Only ask the user if you can't figure out how to start it.

Read any existing comments with `comment-list` — prior feedback may inform your work.

Call `doc-create` with the `verification` seed template (or `bug-fix` / `changeset` if the context fits better). Save `doc_id` and `doc_url`.

### Step 2: Share the trace URL

**Immediately** print the `trace_url` from the connect step on its own line. (`live-connect` returns it for remote; `live-view-new` returns it for tunnel-first.) This lets the user watch the agent's browser in real time and gives downstream reviewers (including `subtext:review` follow-ups) a stable entry point to the recorded session.

```
Trace: {trace_url}
I'm connected to the app. Starting verification.
```

Do NOT bury the link in a wall of text. It goes first, on its own line.

### Step 3: Navigate to the affected area and capture BEFORE

Drive the browser to the exact page/component/state where the change will be visible.

1. Navigate to the right URL, click through to the right state
2. Call `live-view-screenshot` with `upload: true` — this is the BEFORE evidence. Save the returned `screenshot_url`.
3. Call `comment-add` with intent `ask`, passing the `screenshot_url`:
   - Text: "BEFORE: [describe current state]. About to make [describe planned change]."
   - This is a chapter marker — it anchors the timeline for anyone reviewing the session later.
4. Attach to the proof document:
   ```
   doc-attach(doc_id, section: "Before", render_as: "image", url: {screenshot_url}, label: "Before: {description}")
   ```

**Judgment call:** If the change affects multiple pages or states, capture BEFORE for each.

### Step 4: Make the code change

Edit files, update components, fix styles — whatever the task requires.

This is the only step where you leave the browser and work in the codebase.

After editing, attach the diff to the proof document:
```
doc-attach(doc_id, section: "Changes", render_as: "link",
           text: {git diff output}, content_type: "text/plain",
           label: {one-line description of what changed})
```

If a `live-act-*` tool returns `Control transferred to human viewer`, the reviewer has taken control. Enter standby — do not retry, and do not continue UI-facing work until control is returned. Backend changes that don't need visual verification can continue.

### Step 5: Verify the change with live tools

Return to the browser. Refresh, hot reload, or reconnect if the dev server restarted.

1. Navigate back to the same page/state from Step 3
2. Call `live-view-screenshot` with `upload: true` — this is the AFTER evidence. Save the returned `screenshot_url`.
3. **Visually compare** BEFORE vs AFTER against the original prompt intent or acceptance criteria
4. Call `comment-add` with the AFTER `screenshot_url`:
   - Intent: `looks-good` if it matches intent, `bug` if something is wrong
   - Text: "AFTER: [describe what changed]. [Assessment against acceptance criteria]."
5. Attach to the proof document:
   ```
   doc-attach(doc_id, section: "After", render_as: "image", url: {screenshot_url}, label: "After: {description}")
   ```

**Use live interaction tools to test the change:**

- Click buttons, fill forms, hover elements — confirm the change works functionally, not just visually
- Check edge cases: empty states, long text, missing data
- If the change touches styles: check dark mode, mobile viewport (use `live-emulate`)

### Step 6: Self-correct if needed

If the AFTER doesn't match intent:

1. Call `live-view-screenshot` with `upload: true`, then `comment-add` with intent `bug` and the `screenshot_url`: "ISSUE: [what's wrong]. Fixing now."
2. Attach the issue screenshot to the proof document: `doc-attach(doc_id, section: "After", render_as: "image", url: {screenshot_url}, label: "Issue: {what's wrong}")`
3. Go back to Step 4, make the fix
4. Return to Step 5, re-verify

**Max 5 iterations.** If you can't get it right in 5 tries, stop and share what you have with the user. Don't spin.

### Step 7: Package evidence and close the proof document

Once the change is verified:

1. Take a final `live-view-screenshot` with `upload: true` of the confirmed state
2. Call `comment-add` with intent `looks-good` and the `screenshot_url`: "VERIFIED: [summary of what was changed and confirmed]."
3. Attach the trace to the proof document: `doc-attach(doc_id, section: "Evidence", render_as: "link", url: {trace_url}, label: "Session trace")`
4. Re-read the document (`doc-read(doc_id)`) and confirm a cold reviewer would understand what changed, what was tested, and why. Attach anything missing.
5. Close: `doc-close(doc_id, status: "complete", summary: {one sentence outcome})`
6. If a PR exists or will be created:
   - Include before/after screenshot URLs (from Step 3 and Step 5) in the PR description
   - Include the `trace_url` and `doc_url` so reviewers can watch the session and read the evidence record

```markdown
## Visual Evidence

**Before:**
![before]({before_screenshot_url})

**After:**
![after]({after_screenshot_url})

**Session replay:** [Review the full session]({trace_url})
**Proof document:** {doc_url}
```

The `screenshot_url` values are signed URLs from `live-view-screenshot` with `upload: true`. They render directly in GitHub PR descriptions as inline images.

## When to Use This Skill

**Always use when you modify:**

- Component files: `.tsx`, `.jsx`, `.vue`, `.svelte`
- Stylesheets: `.css`, `.scss`, `.less`, `.tailwind`
- Template/markup: `.html`, `.ejs`
- Any file that changes what renders on screen

**Skip when:**

- Change is purely backend (API handler, database query, utility function)
- Change is test-only (no production UI impact)
- Change is documentation-only

**Not sure?** Use the skill. The cost of an unnecessary screenshot is near zero. The cost of shipping an unverified visual change is a bug report.

## Comment Annotations as Chapter Markers

Comments you leave during verification serve two purposes:

1. **Live collaboration** — the user watching the trace URL sees your annotations in real-time in the sidebar
2. **Session replay chapters** — anyone reviewing the recorded session later can jump to your BEFORE/AFTER markers to understand what changed and why

Leave comments at every significant moment:

- BEFORE state captured
- Change made, verifying now
- ISSUE found (with screenshot)
- VERIFIED (with screenshot)

Think of these as commit messages for visual state.

## Decision Logic

### Functional vs. aesthetic changes

| Change type                                                 | Verification depth                                      | Share with user?                  |
| ----------------------------------------------------------- | ------------------------------------------------------- | --------------------------------- |
| Functional fix (broken button, wrong text, missing handler) | Self-verify: BEFORE/AFTER screenshots + functional test | Only if it fails after 2 attempts |
| Aesthetic change (new component, colors, spacing, layout)   | Full verify: BEFORE/AFTER + dark mode + mobile viewport | Always — aesthetic is subjective  |
| Style-touching (CSS variables, theme classes, responsive)   | Full verify + theme variants + viewport variants        | Always — high regression risk     |

### Multiple affected areas

If the change affects more than one page or state:

1. List all affected areas
2. BEFORE screenshot each one
3. Make the change
4. AFTER screenshot each one
5. Any failure = back to Step 4

## Composition

- **Requires:** `subtext:live` (browser tools, returns `trace_url`), `subtext:comments` (annotations), `subtext:docs` (proof document)
- **Hands off to:** `subtext:review` — when the session is complete, another agent (or the same agent later) can review the recorded session as a secondary verification pass
- **Triggers from:** any file edit to UI code, or when the user asks for a visual change
