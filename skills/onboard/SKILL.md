---
name: onboard
description: Guided onboarding for new Subtext users. Installs the plugin, agent explores the site, reviews the session, bootstraps sightmap, then reproduces with metrics — all as an interactive conversation.
metadata:
  platform: claude-code
  requires:
    skills: ["subtext:shared", "subtext:live", "subtext:comments"]
---

# Subtext Onboarding

Welcome new users to Subtext through a guided, conversational setup experience.

## Execution Model

**Complete each step fully before moving to the next.** Do NOT pre-check, parallelize, or look ahead to subsequent steps. Each step has its own pre-check logic — trust the sub-skill to handle detection and skip if already done. Wait for the user's acknowledgment before proceeding.

**Steps 2 and 5 run as subagents** so the orchestrator can capture usage metrics (tokens, time, interactions) for the comparison in Step 6.

### Step announcements

Before each step, print a prominent banner so the user can see progress through the tool call noise. Use this exact format:

```
---

## Step N of 6: Title

Brief description of what this step does.

---
```

The horizontal rules and `##` heading create visual separation from tool output above and below.

## Start

Greet the user:

"Welcome to Subtext! I'm going to walk you through getting set up. By the end, you'll have:
- The Subtext plugin installed and connected
- An agent-driven session exploring your site with comments you can review via viewer URL
- A sightmap giving your components semantic names
- A metrics comparison showing the value of sightmap enrichment

Let's get started."

## Step 1: Plugin Setup

Print:
```
---

## Step 1 of 6: Plugin Setup

Checking that the Subtext plugin and MCP servers are installed and connected.

---
```

**Check:** Is the Subtext plugin installed and MCP servers reachable?

If not complete → invoke `subtext:setup-plugin`
If complete → "Plugin's already set up. Moving on."

## Step 2: First Session (Blind Exploration)

### Dev server gate

Before exploring, detect and start the dev server automatically:

1. Read `package.json` scripts to find the dev command (e.g., `dev`, `start`, `serve`)
2. Check if the server is already running — try `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000` (and common ports: 3000, 3001, 5173, 8080)
3. If not running, start it in the background using the detected command (e.g., `npm run dev`)
4. Wait for the server to be reachable before proceeding
5. If the user has a deployed URL instead, that works too — ask only if auto-detection fails

Do NOT ask the user if the server is running — figure it out.

Print:
```
---

## Step 2 of 6: First Session

The agent will explore your site and capture a session — no sightmap yet.

---
```

Ask the user:

"I'm going to explore your site myself via a headless browser, leaving notes as I go. These notes will show up in the session replay.

**Describe a flow you'd like me to explore** (e.g., 'sign up for an account and browse the dashboard'), or say **'I'm feeling lucky'** and I'll figure it out from the site's content."

**Run as subagent.** Dispatch `subtext:first-session` with:
- The app URL from the dev server gate
- The user's flow description (or "feeling lucky")

**Capture from subagent result:** session URL, trace URL, interaction count, tokens, duration_ms.

After the subagent completes, tell the user:

"Done! I explored your site in {interaction_count} interactions, leaving comments along the way. You can watch my exploration with my comments in the sidebar:

{trace_url}

Now let me analyze what I found."

## Step 3: Session Review

Print:
```
---

## Step 3 of 6: Session Review

Analyzing the session from my exploration.

---
```

Invoke `subtext:review` with the captured session URL. Ask explicitly for a structured summary **plus reproduction steps** — those steps feed Step 5.

**Important:** Save the reproduction steps from the review output — they'll be used verbatim in Step 5.

After the review, explain: "That's what Subtext sees when it analyzes a session. It reads the chapter markers the agent left, surfaces errors and inflection points, and produces structured reproduction steps — all from a single session recording."

## Step 4: Sightmap Bootstrap

Print:
```
---

## Step 4 of 6: Sightmap

Building semantic component definitions and memories for your app.

---
```

**Check:** Does `.sightmap/` already exist with component definitions?

If not complete → invoke `subtext:recipe-sightmap-setup`
If complete → "Sightmap is already configured. Nice."

After setup, explain: "Your sightmap replaces generic element identifiers with meaningful component names like `NavBar` or `LoginForm`. Every future session analysis will use these names."

### Memories

After creating the initial sightmap, add `memory` entries to key components. Use the **high-difficulty notes from Step 2** as primary input — elements where the agent struggled become memory entries.

Memories are contextual notes that appear in a `[Guide]` section at the top of every session snapshot. They give agents instant understanding of how components work without reading source code.

Good memory candidates:
- **Auth gates**: password, login credentials, or test accounts needed to access the app
- **Stateful components**: how toggles, tabs, or modes change the UI (e.g., "audience toggle switches all copy between builder/agent perspectives")
- **Forms**: required fields, validation rules, expected input formats
- **Complex interactions**: multi-step flows, drag-and-drop, keyboard shortcuts
- **Known quirks**: components that behave unexpectedly or have edge cases

Example:
```yaml
- name: PasswordGate
  selector: "[data-component='PasswordGate']"
  source: src/components/PasswordGate.tsx
  memory:
    - "Password is 'argus'. Gates the entire site during pre-launch."
    - "Submit the password form to access any page."

- name: Hero
  selector: "[data-component='Hero']"
  source: src/components/Hero.tsx
  memory:
    - "Audience toggle switches ALL copy between 'For Builders' and 'For Agents' perspectives"
```

## Step 5: Informed Reproduction (Pass 2)

Print:
```
---

## Step 5 of 6: Reproduction

Reproducing the same flow — this time with sightmap enrichment.

---
```

**Run as subagent.** The subagent's job is to drive the app through the same flow captured in Step 3 using live browser tools, now with sightmap context. Dispatch with:

- **Task:** "Reproduce the following user flow using `subtext:live` tools. For each step: use `live-act-*` to drive the browser, confirm the expected state before moving on, and call `comment-add` at key moments as chapter markers. Do not analyze or diagnose — just execute. Read `subtext:live` and `subtext:comments` for tool catalogs. The sightmap uploads automatically after `live-connect`."
- **Steps:** the reproduction steps extracted from Step 3
- **App URL:** the same URL used in Step 2 (tunnel is automatic for localhost)

**Capture from subagent result:** session URL, trace URL, interaction count, tokens, duration_ms.

After the subagent completes: "Done! Reproduced the flow in {interaction_count} interactions. You can review the replay with agent comments here:

{trace_url}

Now let's see how the two passes compare."

## Step 6: Results

Print:
```
---

## Step 6 of 6: Results

Here's the impact your sightmap had on agent performance.

---
```

### Metrics comparison

Present the delta between Pass 1 (Step 2) and Pass 2 (Step 5):

```
| Metric            | Pass 1 (Blind) | Pass 2 (Sightmap) | Delta    |
|-------------------|----------------|-------------------|----------|
| Interactions      | {p1_count}     | {p2_count}        | {delta}% |
| Tokens            | {p1_tokens}    | {p2_tokens}       | {delta}% |
| Time              | {p1_time}      | {p2_time}         | {delta}% |
```

Explain: "With sightmap enrichment, the agent had semantic component names, source file paths, and contextual memories from the start — so it navigated directly instead of guessing."

### Before/After snapshot comparison

Take a snapshot from the same page in both sessions and show them side-by-side (or sequentially) so the user can see the concrete difference. Call out:

1. **`[Guide]` section** — Pass 2 has a block of memories at the top giving agents instant context about the page (auth, interactions, quirks). Pass 1 has nothing.
2. **Semantic component names** — Pass 2 shows `NavBar`, `Hero`, `CheckoutForm` where Pass 1 showed generic roles like `navigation`, `region`, `generic`.
3. **`[src: ...]` annotations** — Pass 2 annotates components with source file paths so the agent can jump directly to code. Pass 1 has no source mapping.

### Agent playback links

Present both trace URLs so the user can review each session with agent comments in the sidebar:

- **Pass 1 (Blind):** {pass1_trace_url}
- **Pass 2 (Sightmap):** {pass2_trace_url}

## Recap

"You're all set! Here's what we accomplished:
1. **Plugin** — Subtext skills, MCP servers, and hooks are installed
2. **Exploration** — Agent explored your site blind, leaving comments as it went
3. **Session Review** — Analyzed the session and extracted reproduction steps
4. **Sightmap** — Your components have semantic names and memories
5. **Reproduction** — Reproduced the same flow with sightmap enrichment
6. **Results** — Measured the concrete improvement in tokens, time, and interactions

You can review both sessions with agent comments via the viewer URLs above.

## Next Steps

A few things you can explore from here:

- **`/subtext:review`** — Paste any session URL to get a structured summary, with optional reproduction steps on request
- **`/subtext:proof`** — When you're making UI changes, get automatic before/after visual evidence and a replay link you can hand to reviewers
- **Channels** — Connect session URLs from support tickets, alerts, or dashboards to get automatic analysis"
