---
name: subtext:live-review
description: Open a Subtext live viewer session for real-time human-agent collaboration when making UI or frontend changes. Connects a hosted browser via the Subtext MCP server, shares a viewer URL so the human can watch the agent work, and polls for comments and signals throughout. Use when the user asks to build, fix, update, or modify any user-facing surface — components, pages, layouts, styles, copy, or routing. Also use when the user says "let me watch", "open a viewer", "start a live session", or requests live feedback on changes. Do NOT use for pure backend, API, or infrastructure changes with no visual impact.
metadata:
  requires:
    skills: ["subtext:shared", "subtext:live", "subtext:tunnel", "subtext:agent-playback-link", "subtext:comments"]
---

# Live Review

Real-time human-agent collaboration for UI development. The agent works in a hosted browser while the human watches via a Subtext viewer, leaving comments and annotations as feedback. The agent polls for signals between actions and adjusts its plan based on human input.

## When to Use

- User asks to build, fix, update, or modify a UI component, page, layout, style, or copy
- User says "let me watch", "open a viewer", "start a live session"
- User wants to give real-time feedback on visual changes
- Any task that will change what users see

## When NOT to Use

- Pure backend, API, or infrastructure changes
- Database migrations, feature flag config, gRPC endpoints
- Changes with no visual impact

## Setup Phase

Before starting implementation:

### 1. Determine the target URL

- If the user mentioned a specific page, infer the local dev URL
- If unclear, ask: "Which page should I open in the viewer?"
- Default to the app root (e.g. `http://localhost:3000`) if working on a global component

### 2. Connect the hosted browser

- Follow the `subtext:tunnel` flow to connect to the local dev server
- Follow the `subtext:live` connection pattern to open the page
- Authenticate if redirected to a login page

### 3. Share the viewer

- Follow the `subtext:agent-playback-link` pattern to construct and share the viewer URL
- Tell the user: "You can watch, leave comments, and annotate while I work. I'll check for your feedback between each action."

### 4. Start the signal heartbeat

- Follow the polling guidance in `subtext:live` (Pending Signals section)
- Check for signals between every subsequent action during implementation

### 5. Capture baseline state

- Screenshot the current page before making changes (upload with `upload=true`)
- Save the artifact URL — include it in the PR as "before" state alongside the viewer URL for downstream reviewers

## During Implementation

The agent proceeds with its normal implementation workflow (brainstorming, TDD, code edits, builds, etc.). This skill does NOT own the implementation — it provides the feedback loop around it.

**Between every action:**
- Call `live-poll` to check for pending signals
- If a `new_comment` signal arrives: read it, reply via `comment-reply`, adjust plan if the feedback redirects the work
- If a `control_change: human_driving` signal arrives: stop input actions, keep polling with read-only tools, wait for `control_change: agent_driving` before resuming

**After code changes that affect the UI:**
- Rebuild the frontend
- Refresh or re-navigate the live browser to pick up changes
- Screenshot the result for visual verification

## Teardown Phase

After implementation is complete:

### 1. Capture the final state

- Screenshot the result (upload with `upload=true`)
- Save as "after" artifact for the PR

### 2. Check for unresolved comments

- Call `comment-list` to review any comments from the human
- If unresolved comments remain, ask the user if they should be addressed before finishing

### 3. Disconnect

- Call `live-disconnect` to free the hosted browser
- Use the `subtext:agent-playback-link` pattern to construct a shareable playback link for the PR

### 4. Summarize for the PR

Include in the PR description:
- Before/after screenshots
- Agent playback link (so reviewers can replay the session)
- Any comment threads that informed the changes
