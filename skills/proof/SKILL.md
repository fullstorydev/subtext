---
name: subtext:proof
description: Prove your UX changes work with before/after visual evidence using Subtext Live. Use when making any code change that affects what users see or interact with — component edits, CSS changes, layout fixes, new features, bug fixes, interaction flows, navigation changes, form behavior, or animation updates. Triggers on file changes to .tsx, .jsx, .vue, .svelte, .css, .scss, .html, or when user says "fix the UI", "update the flow", "change the layout", "style this", "improve the experience", "proof this", "verify my changes", or any task with visual or interaction acceptance criteria. Do NOT use for pure backend logic, API handlers, database queries, or test-only changes.
metadata:
  requires:
    skills:
      [
        "subtext:shared",
        "subtext:live",
        "subtext:comments",
        "subtext:agent-playback-link",
      ]
  mcp-server: subtext
---

# Proof

> **PREREQUISITE:** Read `subtext:shared` for MCP conventions and sightmap upload.

**Type:** Rigid workflow — follow exactly. Skipping steps means unverified work ships.

Every code change that affects what a user sees must be visually proven. This skill creates a before/after evidence trail that proves the change works. No exceptions, no "it should look fine."

## Screenshot Capture

**Always use `live-view-screenshot` with `upload: true`.** This uploads the screenshot to cloud storage and returns a signed URL you can attach to comments and PRs.

```
live-view-screenshot({ connection_id, view_id, upload: true })
→ { screenshot_url: "https://..." }
```

**Do NOT use `artifact-upload` for screenshots.** It requires base64-encoding the entire PNG and frequently fails on large images. The `upload: true` flag on `live-view-screenshot` handles the upload server-side — smaller payload, no encoding issues.

To attach a screenshot to a comment:

```
live-view-screenshot({ ..., upload: true }) → screenshot_url
comment-add({ ..., screenshot_url, intent: "looks-good", text: "AFTER: ..." })
```

## The Loop

### Step 1: Connect to the running app

Call `live-connect` with the URL where the change will be visible.

- If the URL is localhost, the tunnel sets up automatically.
- If the app isn't running, **try to start the dev server yourself first.** Look for `package.json` scripts (`dev`, `start`, `serve`), a `Makefile`, or a `docker-compose.yml`. Run the appropriate command in the background. Only ask the user if you can't figure out how to start it.
- Read any existing comments with `comment-list` — prior feedback may inform your work.

### Step 2: Share the agent playback link

**Immediately** construct and output the agent playback link from the `fs_session_url` returned by `live-connect`. Follow the `subtext:agent-playback-link` skill for the URL transformation. Include the `connection_id` for live mode so the user can watch in real time.

```
Agent playback (live): https://app.fullstory.com/subtext/{orgId}/session/{deviceId}:{sessionId}?connection_id={connectionId}
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

**Judgment call:** If the change affects multiple pages or states, capture BEFORE for each.

### Step 4: Make the code change

Edit files, update components, fix styles — whatever the task requires.

This is the only step where you leave the browser and work in the codebase.

### Step 5: Verify the change with live tools

Return to the browser. Refresh, hot reload, or reconnect if the dev server restarted.

1. Navigate back to the same page/state from Step 3
2. Call `live-view-screenshot` with `upload: true` — this is the AFTER evidence. Save the returned `screenshot_url`.
3. **Visually compare** BEFORE vs AFTER against the original prompt intent or acceptance criteria
4. Call `comment-add` with the AFTER `screenshot_url`:
   - Intent: `looks-good` if it matches intent, `bug` if something is wrong
   - Text: "AFTER: [describe what changed]. [Assessment against acceptance criteria]."

**Use live interaction tools to test the change:**

- Click buttons, fill forms, hover elements — confirm the change works functionally, not just visually
- Check edge cases: empty states, long text, missing data
- If the change touches styles: check dark mode, mobile viewport (use `live-emulate`)

### Step 6: Self-correct if needed

If the AFTER doesn't match intent:

1. Call `live-view-screenshot` with `upload: true`, then `comment-add` with intent `bug` and the `screenshot_url`: "ISSUE: [what's wrong]. Fixing now."
2. Go back to Step 4, make the fix
3. Return to Step 5, re-verify

**Max 5 iterations.** If you can't get it right in 5 tries, stop and share what you have with the user. Don't spin.

### Step 7: Package evidence and attach to PR

Once the change is verified:

1. Take a final `live-view-screenshot` with `upload: true` of the confirmed state
2. Call `comment-add` with intent `looks-good` and the `screenshot_url`: "VERIFIED: [summary of what was changed and confirmed]."
3. If a PR exists or will be created:
   - Include before/after screenshot URLs (from Step 3 and Step 5) in the PR description
   - Construct the agent playback link (per `subtext:agent-playback-link`) and include it for the full session replay

```markdown
## Visual Evidence

**Before:**
![before]({before_screenshot_url})

**After:**
![after]({after_screenshot_url})

**Agent session:** [Review the full session]({agent_playback_link})
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

1. **Live collaboration** — the user watching the viewer URL sees your annotations in real-time in the sidebar
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

- **Integrates with:** `subtext:bug-fix-workflow` (validation step = this entire skill)
- **Requires:** `subtext:live` (browser tools), `subtext:comments` (annotations), `subtext:agent-playback-link` (URL construction for shareable session links)
- **Triggers from:** Any file edit to UI code, or when the user asks for a visual change
