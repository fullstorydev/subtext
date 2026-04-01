---
name: subtext:first-session
description: Agent explores the user's site via hosted DevTools, leaving comments as it goes. Accepts a user-described flow or explores organically. Capped at ~10 interactions across 2-3 pages. Returns session URL, agent playback link, and metrics.
metadata:
  requires:
    skills: ["subtext:shared", "subtext:tunnel", "subtext:comments", "subtext:agent-playback-link"]
  platform: claude-code
---

# First Session

Explore the user's site via hosted browser tools, leaving comments as a breadcrumb trail of agent reasoning.

## Pre-check

If the user already has a session URL (they mention one or it was passed in), skip exploration and return it directly.

## Prerequisites

Before starting, confirm:
1. **Dev server is running** — the user must have their app running locally (or provide a deployed URL)
2. **Subtext snippet is installed** — the snippet must be loaded on the target site for session capture to work
3. **Tunnel if localhost** — use `live-tunnel` + `tunnel-connect` (tunnel-first flow, no `connectionId`) to set up a reverse tunnel; grab the `connectionId` from the `tunnel-connect` response and pass it as `connection_id` to `live-connect`

## Input

The orchestrator provides:
- **App URL** (e.g., `http://localhost:3000`)
- **Flow description** — either a user-provided goal (e.g., "sign up and explore the dashboard") or `"feeling lucky"` for organic exploration

## Exploration Loop

```
1. live-connect → navigate to app URL
2. live-view-snapshot to see the page
3. Optionally comment-add with an observation about the page or what just happened, if noteworthy
4. Choose an interaction:
   - If flow described: work toward that goal
   - If "feeling lucky": infer from the site's purpose what a real user would do
     (e.g., e-commerce → browse and add to cart; SaaS → sign up and explore)
5. Perform the interaction (live-act-click, live-act-fill, live-view-navigate)
6. Repeat from step 2 until ~10 interactions
7. live-disconnect → capture session URL
```

### Choosing interactions ("feeling lucky")

Read the page, understand the site's purpose from its content and navigation, and act like a curious first-time user would. No rigid strategy — be organic:
- Follow primary CTAs and navigation
- Try forms if they look interesting
- Explore different sections of the site
- If something looks interactive, try it

### Interaction cap

Stop after **~10 interactions** (clicks, fills, navigations) across **2-3 pages**. This produces a session that's substantial enough to review without dragging on. If at any point you get stuck trying to get past a localhost issue (e.g. login wall, build issue, etc) - don't waste time figuring it out, just pop out and ask the user for help to continue.

## Comments

Use `comment-add` (from `subtext:comments`) to leave observations throughout exploration. Comments attach to the session and appear in the agent playback link sidebar.

### Comment guidelines

- **Comment when noteworthy** — something unexpected happened, UI was confusing, a form behaved oddly, or a page stood out. Don't comment on routine clicks or straightforward navigation.
- **Be specific about confusion** — when something is hard to figure out, describe what made it difficult. These observations become sightmap memory candidates later.
- Use the `bug` intent for issues found, `ask` for ambiguous UI, `looks-good` for smooth flows

## Agent Playback Link

After closing the connection, transform the `fs_session_url` into an agent playback link using the pattern in `subtext:agent-playback-link`.

## Output

Return to the orchestrator:
- **Session URL** from the hosted browser handshake
- **Agent playback link** (transformed from session URL per `subtext:agent-playback-link`)
- **Total interaction count**
- Subagent usage stats (tokens, duration) are captured automatically by the orchestrator
