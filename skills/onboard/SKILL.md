---
name: subtext:onboard
description: Guided onboarding for new Subtext users. Installs the plugin, adds the Subtext snippet, agent explores the site, reviews the session, bootstraps sightmap, configures privacy rules, then reproduces with metrics — all as an interactive conversation.
metadata:
  platform: claude-code
  requires:
    skills: ["subtext:shared", "subtext:agent-playback-link", "subtext:comments"]
---

# Subtext Onboarding

Welcome new users to Subtext through a guided, conversational setup experience.

## Execution Model

**Complete each step fully before moving to the next.** Do NOT pre-check, parallelize, or look ahead to subsequent steps. Each step has its own pre-check logic — trust the sub-skill to handle detection and skip if already done. Wait for the user's acknowledgment before proceeding.

**Steps 3 and 7 run as subagents** so the orchestrator can capture usage metrics (tokens, time, interactions) for the comparison in Step 8.

### Step announcements

Before each step, print a prominent banner so the user can see progress through the tool call noise. Use this exact format:

```
---

## Step N of 8: Title

Brief description of what this step does.

---
```

The horizontal rules and `##` heading create visual separation from tool output above and below.

## Start

Greet the user:

"Welcome to Subtext! I'm going to walk you through getting set up. By the end, you'll have:
- The Subtext plugin installed and connected
- The Subtext snippet capturing sessions in your app
- An agent-driven session exploring your site with comments you can review via agent playback link
- A sightmap giving your components semantic names
- Privacy rules auto-configured from PII detection
- A metrics comparison showing the value of sightmap enrichment

Let's get started."

## Step 1: Plugin Setup

Print:
```
---

## Step 1 of 8: Plugin Setup

Checking that the Subtext plugin and MCP servers are installed and connected.

---
```

**Check:** Is the Subtext plugin installed and MCP servers reachable?

If not complete → invoke `subtext:setup-plugin`
If complete → "Plugin's already set up. Moving on."

## Step 2: Snippet Installation

Print:
```
---

## Step 2 of 8: Subtext Snippet

Installing the Subtext capture snippet into your app.

---
```

Invoke `subtext:setup-snippet` immediately. Do NOT search the codebase yourself first — the skill has its own pre-check and will skip installation if the snippet is already present.

### Dev server gate

After the snippet is installed (or confirmed present), detect and start the dev server automatically:

1. Read `package.json` scripts to find the dev command (e.g., `dev`, `start`, `serve`)
2. Check if the server is already running — try `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000` (and common ports: 3000, 3001, 5173, 8080)
3. If not running, start it in the background using the detected command (e.g., `npm run dev`)
4. Wait for the server to be reachable before proceeding
5. If the user has a deployed URL instead, that works too — ask only if auto-detection fails

Do NOT ask the user if the server is running — figure it out.

## Step 3: First Session (Blind Exploration)

Print:
```
---

## Step 3 of 8: First Session

The agent will explore your site and capture a session — no sightmap yet.

---
```

Ask the user:

"I'm going to explore your site myself via a headless browser, leaving notes as I go. These notes will show up in the session replay.

**Describe a flow you'd like me to explore** (e.g., 'sign up for an account and browse the dashboard'), or say **'I'm feeling lucky'** and I'll figure it out from the site's content."

**Run as subagent.** Dispatch `subtext:first-session` with:
- The app URL from Step 2
- The user's flow description (or "feeling lucky")

**Capture from subagent result:** session URL, agent playback link, interaction count, tokens, duration_ms.

After the subagent completes, tell the user:

"Done! I explored your site in {interaction_count} interactions, leaving comments along the way. You can watch my exploration with my comments in the sidebar:

{agent_playback_link}

Now let me analyze what I found."

## Step 4: Session Review

Print:
```
---

## Step 4 of 8: Session Review

Analyzing the session from my exploration.

---
```

Invoke `subtext:session-analysis-workflow` with the captured session URL.

**Important:** Extract and save the reproduction steps from this review — they'll be used in Step 7.

After the review, explain: "That's what Subtext sees when it analyzes a session. It maps interactions to your source code, identifies friction, and spots issues — all from a single session. The agent's own difficulty notes are part of the timeline."

## Step 5: Sightmap Bootstrap

Print:
```
---

## Step 5 of 8: Sightmap

Building semantic component definitions and memories for your app.

---
```

**Check:** Does `.sightmap/` already exist with component definitions?

If not complete → invoke `subtext:recipe-sightmap-setup`
If complete → "Sightmap is already configured. Nice."

After setup, explain: "Your sightmap replaces generic element identifiers with meaningful component names like `NavBar` or `LoginForm`. Every future session analysis will use these names."

### Memories

After creating the initial sightmap, add `memory` entries to key components. Use the **high-difficulty notes from Step 3** as primary input — elements where the agent struggled become memory entries.

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

## Step 6: Privacy Setup

Print:
```
---

## Step 6 of 8: Privacy

Auto-detecting PII and creating privacy rules from the seed session.

---
```

Use the session captured in Step 3 as the seed for PII detection. Follow `subtext:recipe-privacy-setup` — the full detect → create → validate → promote flow.

If no PII is detected, explain: "No PII was detected in the seed session. This is common for apps that use test data during development. Privacy rules can be added later as real user data flows through — the self-healing pipeline will automatically detect and propose new rules."

After privacy setup is complete (rules promoted), ask the user if they'd like to proceed to reproduction.

## Step 7: Informed Reproduction (Pass 2)

Print:
```
---

## Step 7 of 8: Reproduction

Reproducing the same flow — this time with sightmap enrichment.

---
```

**Run as subagent.** Dispatch `subtext:reproduce-workflow` with:
- The reproduction steps extracted from Step 4
- The sightmap is uploaded automatically after `session-open`/`session-close` (see `subtext:shared`)
- The same app URL

**Capture from subagent result:** interaction count, tokens, duration_ms.

**Capture from subagent result:** session URL, agent playback link, interaction count, tokens, duration_ms.

After the subagent completes: "Done! Reproduced the flow in {interaction_count} interactions. The session was captured with preview privacy rules applied. You can review the replay with agent comments here:

{agent_playback_link}

Now let's see how the two passes compare."

## Step 8: Results

Print:
```
---

## Step 8 of 8: Results

Here's the impact your sightmap had on agent performance.

---
```

### Metrics comparison

Present the delta between Pass 1 (Step 3) and Pass 2 (Step 7):

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

Present both agent playback links so the user can review each session with agent comments in the sidebar:

- **Pass 1 (Blind):** {pass1_agent_playback_link}
- **Pass 2 (Sightmap):** {pass2_agent_playback_link}

## Recap

"You're all set! Here's what we accomplished:
1. **Plugin** — Subtext skills, MCP servers, and hooks are installed
2. **Snippet** — Subtext is capturing sessions in your app
3. **Exploration** — Agent explored your site blind, leaving comments as it went
4. **Session Review** — Analyzed the session and extracted reproduction steps
5. **Sightmap** — Your components have semantic names and memories
6. **Privacy** — Auto-detected PII, validated masking, and promoted rules to production
7. **Reproduction** — Reproduced the same flow with sightmap enrichment and privacy preview
8. **Results** — Measured the concrete improvement in tokens, time, and interactions

You can review both sessions with agent comments via the agent playback links above.

## Next Steps

A few things you can explore from here:

- **`/subtext:workflow`** — Paste any session URL and Subtext will analyze it, fix bugs, review UX, or reproduce issues
- **`/subtext:privacy`** — Manage privacy rules: detect PII, create rules, promote to production
- **Channels** — Connect session URLs from support tickets, alerts, or dashboards to get automatic analysis
- **Fullstory** — Subtext works even better with Fullstory's opportunity detection and user segmentation"
