---
name: subtext:onboard
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

## Workflow Telemetry

At each milestone listed below, call the `workflow-event` tool to log an analytics event. This data powers onboarding success dashboards. Always pass `workflow="onboard"`.

**All `workflow-event` calls are conditional on the user's consent (see Telemetry Consent below). If the user declined, skip every telemetry call silently.**

**Rules for metadata fields:**
- Use the exact field names shown at each step. Values must be short strings.
- Use enums for all classification fields. Valid enums are listed below.
- `outcome`: `success` | `skipped` | `partial` | `fail` (per-step; see each step for valid values)
- `flow_type`: `user_described` | `feeling_lucky`
- `sightmap_quality`: `high` (10+ components with memories) | `medium` (5-10 components or few memories) | `low` (fewer than 5 components)
- `use_case`: `e-commerce` | `saas-dashboard` | `marketing-site` | `docs-site` | `social-platform` | `developer-tool` | `internal-tool` | `other`. Infer from package.json, site content, or the user's description.
- Only include fields that are known at that step. Don't guess ahead.
- The `metadata` parameter must be a valid JSON string.

**Outcome classification for the `complete` step:**
- `success`: all steps completed, reproduction showed improvement
- `partial`: workflow finished but a step had degraded results (e.g., reproduction used more tokens than blind)
- `fail`: a step failed and the workflow couldn't finish

## Start

Greet the user:

"Welcome to Subtext! I'm going to walk you through getting set up. By the end, you'll have:
- The Subtext plugin installed and connected
- An agent-driven session exploring your site with comments you can review via viewer URL
- A sightmap giving your components semantic names
- A metrics comparison showing the value of sightmap enrichment

Let's get started."

### Telemetry Consent

Before logging any analytics, ask the user for consent using the `AskUserQuestion` tool:

```json
{
  "questions": [{
    "question": "Would you mind sharing anonymous usage data to help improve Subtext? This includes step outcomes, interaction counts, and timing — no code or personal information.",
    "header": "Usage data",
    "multiSelect": false,
    "options": [
      { "label": "Yes, share anonymously", "description": "Help improve Subtext with anonymous step outcomes, timing, and interaction counts." },
      { "label": "No thanks", "description": "Skip all analytics. Nothing will be sent." }
    ]
  }]
}
```

Store the result as `telemetry_enabled` (true/false). If the user selects **Yes, share anonymously**, set `telemetry_enabled = true`. If they select **No thanks** or **Other**, set `telemetry_enabled = false`.

**All `workflow-event` calls throughout this workflow are conditional on `telemetry_enabled = true`. If the user declined, skip every telemetry call silently.**

**Telemetry (if enabled):** Call `workflow-event` with step=`"start"` and metadata containing `harness` (e.g. `claude-code`, `cursor`, `codex`) and `model` (the active model ID, e.g. `claude-sonnet-4-6`).

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

**Telemetry (if enabled):** Call `workflow-event` with step=`"plugin_setup"` and metadata containing `outcome` (`success` | `skipped`).

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

**Capture from subagent result:** session URL, viewer URL, interaction count, tokens, duration_ms.

After the subagent completes, tell the user:

"Done! I explored your site in {interaction_count} interactions, leaving comments along the way. You can watch my exploration with my comments in the sidebar:

{viewer_url}

Now let me analyze what I found."

**Telemetry (if enabled):** Call `workflow-event` with step=`"first_session"` and metadata containing `outcome` (`success` | `fail`), `interaction_count`, `tokens`, `duration_ms`, and `flow_type` (`user_described` | `feeling_lucky`).

## Step 3: Session Review

Print:
```
---

## Step 3 of 6: Session Review

Analyzing the session from my exploration.

---
```

Invoke `subtext:session-analysis-workflow` with the captured session URL.

**Important:** Extract and save the reproduction steps from this review — they'll be used in Step 5.

After the review, explain: "That's what Subtext sees when it analyzes a session. It maps interactions to your source code, identifies friction, and spots issues — all from a single session. The agent's own difficulty notes are part of the timeline."

**Telemetry (if enabled):** Call `workflow-event` with step=`"session_review"` and metadata containing `outcome` (`success` | `fail`) and `issue_count`.

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

**Telemetry (if enabled):** Call `workflow-event` with step=`"sightmap_bootstrap"` and metadata containing `outcome` (`success` | `skipped`), `component_count`, and `memory_count`.

## Step 5: Informed Reproduction (Pass 2)

Print:
```
---

## Step 5 of 6: Reproduction

Reproducing the same flow — this time with sightmap enrichment.

---
```

**Run as subagent.** Dispatch `subtext:reproduce-workflow` with:
- The reproduction steps extracted from Step 3
- The sightmap is uploaded automatically after `review-open`/`live-connect` (see `subtext:shared`)
- The same app URL

**Capture from subagent result:** session URL, viewer URL, interaction count, tokens, duration_ms.

After the subagent completes: "Done! Reproduced the flow in {interaction_count} interactions. You can review the replay with agent comments here:

{viewer_url}

Now let's see how the two passes compare."

**Telemetry (if enabled):** Call `workflow-event` with step=`"reproduction"` and metadata containing `outcome` (`success` | `fail`), `interaction_count`, `tokens`, and `duration_ms`.

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

Present both viewer URLs so the user can review each session with agent comments in the sidebar:

- **Pass 1 (Blind):** {pass1_viewer_url}
- **Pass 2 (Sightmap):** {pass2_viewer_url}

**Telemetry (if enabled):** Call `workflow-event` with step=`"complete"` and metadata containing `outcome` (`success` | `partial` | `fail` — see classification rules in Workflow Telemetry section), `interaction_delta_pct`, `token_delta_pct`, `time_delta_pct`, `sightmap_quality` (`high` | `medium` | `low`), and `use_case` (inferred from the app).

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

- **`/subtext:workflow`** — Paste any session URL and Subtext will analyze it, fix bugs, review UX, or reproduce issues
- **`/subtext:privacy`** — Manage privacy rules: detect PII, create rules, promote to production
- **Channels** — Connect session URLs from support tickets, alerts, or dashboards to get automatic analysis
- **Fullstory** — Subtext works even better with Fullstory's opportunity detection and user segmentation"
