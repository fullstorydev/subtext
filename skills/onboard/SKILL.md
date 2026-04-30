---
name: onboard
description: Interactive first-run onboarding for new Subtext users. Connects to the user's local dev server, proves a small change with before/after evidence in a watchable trace, then bootstraps a starter sightmap from what was learned.
metadata:
  platform: claude-code
  requires:
    skills: ["subtext:shared", "subtext:proof", "subtext:sightmap", "subtext:live", "subtext:tunnel"]
---

# Onboarding

> **PREREQUISITE — Read inline before any other action:** Read skills `subtext:proof`, `subtext:sightmap`, `subtext:live`, `subtext:tunnel`, `subtext:shared`.

**Type:** User-facing workflow. Conversational. Three visible steps.

The goal: walk a new user through one real, useful Subtext run end-to-end. They watch live in the trace as the agent makes a small visible change to their running app, see before/after screenshots they can point at, and end up with a starter `.sightmap/` file as a natural byproduct of the work. The trace itself stays valid after the run as a replayable recording.

## Implicit health check

Do **not** announce a "plugin setup" step. Trust that the plugin is installed — the user just ran a slash command from it. If the first MCP call below fails (server unreachable, auth missing), invoke `subtext:setup-plugin`, then retry the call. Otherwise stay silent about plumbing.

## Workflow Telemetry

At each milestone listed below, call the `workflow-event` tool to log an analytics event. This data powers onboarding success dashboards. Always pass `workflow="onboard"`.

**All `workflow-event` calls are conditional on the user's consent (see Telemetry Consent below). If the user declined, YOU MUST skip every telemetry call silently.**

**Tracking time and tokens:** Record a timestamp at the start of each step. At the end of each step, compute `duration_ms` (wall-clock milliseconds) and `tokens` (total input + output tokens consumed during the step). Include both in the step's `workflow-event` metadata.

**Rules for metadata fields:**
- Use the exact field names shown at each step. Values must be short strings.
- Use enums for all classification fields. Valid enums are listed below.
- `outcome` (top-level param, not inside metadata): `success` | `skipped` | `partial` | `fail` (per-step; see each step for valid values)
- `use_case`: `e-commerce` | `saas-dashboard` | `marketing-site` | `docs-site` | `social-platform` | `developer-tool` | `internal-tool` | `other`. Infer from package.json, site content, or the user's description.
- Only include fields that are known at that step. Don't guess ahead.
- The `metadata` parameter must be a valid JSON string.

**Outcome classification for the `complete` step:**
- `success`: all steps completed successfully
- `partial`: workflow finished but a step had degraded results
- `fail`: a step failed and the workflow couldn't finish

## Greeting

Open with two short paragraphs — no banner, no checklist:

> "Welcome to Subtext.
>
> Subtext helps me learn your product, validate changes against the actual running app, and leave proof of work — recorded sessions, before/after screenshots, comment markers, and a sightmap of your components — that you and downstream reviewers can replay.
>
> We're going to make one small visible change to your running app together. You'll watch it happen live in a trace you can replay later, see before/after screenshots, and end up with a starter sightmap your future agents can read. Should take about five minutes."

### Telemetry Consent

Before logging any analytics, ask the user for consent using the `AskUserQuestion` tool:

```json
{
  "questions": [{
    "question": "Would you mind sharing usage data to help improve Subtext? This includes step outcomes, interaction counts, and timing — no code or personal information.",
    "header": "Usage data",
    "multiSelect": false,
    "options": [
      { "label": "Yes, share", "description": "Help improve Subtext with step outcomes, timing, and interaction counts." },
      { "label": "No thanks", "description": "Skip all analytics. Nothing will be sent." }
    ]
  }]
}
```

Store the result as `telemetry_enabled` (true/false). If the user selects **Yes, share**, set `telemetry_enabled = true`. If they select **No thanks** or **Other**, set `telemetry_enabled = false`.

**Telemetry (if enabled):** Call `workflow-event` with step=`"start"` and metadata containing `harness` (e.g. `claude-code`, `cursor`, `codex`) and `model` (the active model ID, e.g. `claude-sonnet-4-6, GPT-5.5`).

## Step 1 — Connect to your local dev server

Print:

```
---

## Step 1 of 3: Connect

---
```

Ask the user for the URL of their local dev server. Be explicit about **local**:

> "What URL is your local dev server running at? Something like `http://localhost:3000`, `http://localhost:5173`, or whatever port you've got it on.
>
> It needs to be local — we'll be making a real code change in this session, and a hosted staging or production URL won't reflect a change you haven't shipped yet. If your server isn't running, fire it up now and come back."

Wait for the user's answer. Do **not** probe ports yourself. Do **not** read `package.json` and guess. Starting the dev server is the user's responsibility; you just need the URL.

If they paste a non-local URL, push back — explain the change won't be visible there — and ask again.

Once you have a `http://localhost:…` (or `http://127.0.0.1:…`) URL, follow the **tunnel-first** flow from `subtext:tunnel`:

1. `live-tunnel()` → `connectionId`, `relayUrl`
2. `tunnel-connect({ relayUrl, target: <base of the localhost URL> })` → confirm `state: "ready"`
3. `live-view-new({ connection_id, url: <full localhost URL> })` → returns `trace_url` (and the initial snapshot)

If any of these calls fails because the MCP server is unreachable, invoke `subtext:setup-plugin`, then retry.

**Print the `trace_url` immediately, on its own line, before saying anything else:**

```
Watch along here:
{trace_url}
```

Tell the user briefly:

> "I'm connected. Open that link in another window — you'll watch live as I work. The same link stays valid as a replayable recording after we finish, so you can come back to it."

**Telemetry (if enabled):** Call `workflow-event` with step=`"connect"`, outcome=`"success"` or `"fail"`, and metadata containing `duration_ms` and `tokens`.

## Step 2 — Make a small change

Print:

```
---

## Step 2 of 3: Prove a Change

---
```

Ask for a small visible change. Give concrete examples so the user doesn't have to guess what counts:

> "What's a small visible change you'd like to make? Things that work well:
> - **Text** — change a heading or label (e.g., 'Sign Up' → 'Get Started')
> - **Style** — color, spacing, sizing (e.g., make the primary button green; tighten padding around the hero)
> - **Visibility** — hide or remove an element (e.g., remove the footer copyright line)
>
> Keep it small — anything you can eyeball."

Once the user describes the change, follow the **`subtext:proof`** workflow you already read inline. Important:

- The connection from Step 1 is reusable. Skip proof's Step 1 (connect) and Step 2 (share trace URL — already done). Start at proof's Step 3 (BEFORE capture).
- Use the existing `connection_id` and `view_id` from Step 1 in `live-view-screenshot` and `comment-add` calls.

When proof's loop completes, recap to the user in a single message:

> "Done.
>
> - **Before:** {before_screenshot_url}
> - **After:** {after_screenshot_url}
> - **Trace:** {trace_url}
>
> Does the result look right?"

If the user says no, ask whether to revert, retry, or stop. If yes, continue to Step 3.

**Telemetry (if enabled):** Call `workflow-event` with step=`"proof"`, outcome=`"success"` or `"fail"`, and metadata containing `interaction_count` (number of `live-interact` calls made during the proof loop), `duration_ms`, and `tokens`.

## Step 3 — Bootstrap a sightmap from what we just learned

Print:

```
---

## Step 3 of 3: Sightmap

---
```

**Frame the why before writing anything.** Say something like:

> "Now I'll capture what I just learned about your app in a small `.sightmap/` file. This is the artifact that makes the *next* run faster — the next coding agent (Claude, Cursor, Codex, anything that reads repo files) reads this YAML and already knows what these components are without exploring. They get committed to your repo so the head start travels with the code."

Then create or extend `.sightmap/components.yaml` using the `subtext:sightmap` schema. Include:

- **Component definitions** for elements you actually touched during the proof run. Use stable selectors — prefer `data-*` attributes when present.
- **Memory entries** about runtime behavior you observed — state changes, validation, gating, anything not obvious from the rendered DOM. Skip code-structure tips, file paths, JSX/CSS patterns, and external doc references; those don't belong in the sightmap. See `subtext:sightmap` for the full rule.

Stay honest about scope: only describe what you actually touched. Don't pad the file with components you didn't interact with — those are best added when an agent works with them later, not speculatively now.

After writing, show the user the file and a brief commit pointer:

> "Wrote `.sightmap/components.yaml`. Commit it alongside your code change — it travels with the repo, and every future agent that reads it gets a head start."

**Telemetry (if enabled):** Call `workflow-event` with step=`"sightmap_bootstrap"`, outcome=`"success"` or `"skipped"`, and metadata containing `component_count`, `memory_count`, `duration_ms`, and `tokens`.

## Wrap-up

Recap and point to next steps:

> "You're set up. Recap:
>
> 1. **Trace** — the recorded session of the change you just made: {trace_url}
> 2. **Before / After** — {before_screenshot_url} → {after_screenshot_url}
> 3. **Sightmap** — `.sightmap/components.yaml` ready to commit
>
> From here:
> - **`/proof`** — use this any time you make a UI change. Same before/after evidence loop, no onboarding wrapper.
> - **`/review`** — paste any session URL to get a structured summary, with optional reproduction steps on request.
> - **Learn more about sightmap** — read `skills/sightmap/SKILL.md` to teach agents about more of your app's surface (views, requests, scoped components, memory entries)."

**Telemetry (if enabled):** Call `workflow-event` with step=`"complete"`, outcome=`"success"`, `"partial"`, or `"fail"` (see classification rules in Workflow Telemetry section), and metadata containing `total_duration_ms` (wall-clock time for the entire onboarding), `total_tokens` (sum across all steps), `sightmap_quality` (`high` | `medium` | `low`), and `use_case` (inferred from the app).
