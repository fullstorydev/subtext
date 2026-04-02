# Subtext Skills Overview

Four tiers: atomics describe tools, workflows compose them with decision logic, recipes are short step lists, and onboarding guides new users through setup.

## Atomic — "what tools exist"

- **subtext:shared** — MCP prefixes, sightmap injection, security rules
- **subtext:session** — Session replay: `review-open`, `review-view`, `review-diff`, `review-close`
- **subtext:live** — Live browser: connections, snapshots, interaction, networking
- **subtext:sightmap** — `.sightmap/` YAML schema for components, views, requests
- **subtext:tunnel** — Reverse tunnel for localhost browser tools
- **subtext:comments** — Comment tools: `comment-list`, `comment-add`, `comment-reply`, `comment-resolve`
- **subtext:privacy** — Privacy rule tools: `privacy-propose`, `privacy-create`, `privacy-list`, `privacy-delete`, `privacy-promote`

## Workflows — "how to accomplish a goal"

- **subtext:workflow** — Hub + intent router for session URLs
- **subtext:session-analysis-workflow** — Understand what happened in a session
- **subtext:bug-fix-workflow** — End-to-end: understand, test, fix, validate
- **subtext:ux-review-workflow** — Friction analysis with prioritized issues
- **subtext:reproduce-workflow** — Drive browser through a user flow locally

## Recipes — "do these steps"

- **subtext:recipe-reproduce** — Open session, extract steps, reproduce locally
- **subtext:recipe-sightmap-setup** — Create sightmap definitions from scratch
- **subtext:recipe-privacy-setup** — Set up privacy rules from scratch

## Onboarding — "getting started"

- **subtext:onboard** — Guided setup: plugin → snippet → session → review → sightmap
- **subtext:setup-plugin** — Install plugin, configure MCP, verify API key
- **subtext:setup-snippet** — Framework-aware FullStory snippet installation
- **subtext:first-session** — Capture first session via hosted browser

---

## Workflow Details

### 1. `subtext:workflow` (Router)
Entry point for session URLs. Scans the user's message for intent signals and routes to the right workflow. Only shows a menu when intent is genuinely ambiguous.

| Trigger Keywords | Workflow | Runs As |
|-----------------|----------|---------|
| "what happened", "diagnose", "investigate", "summary" | `subtext:session-analysis-workflow` | subagent |
| "fix", "bug", "broken", "not working" | `subtext:bug-fix-workflow` | main context |
| "ux", "usability", "friction", "confusing" | `subtext:ux-review-workflow` | subagent |
| "reproduce", "repro", "test", "walk through" | `subtext:reproduce-workflow` | subagent |

**Default when no signal:** `subtext:session-analysis-workflow` — adapts depth to what it finds, user can escalate.

**Why bug-fix runs in main context:** It needs code editing. Everything else runs as a subagent because review tool responses are large and would burn through the main context window.

**Environment detection:** The `subtext:shared` skill maps session URL hostnames to MCP tool prefixes (production, staging, EU1). The selected prefix is passed to subagents so they call the correct environment's tools. If the needed MCP server isn't configured, tells the user to run `/subtext-environment`.

### 2. `subtext:session-analysis-workflow`
Adaptive-depth session understanding. Opens session, reads event summaries, maps components to source via sightmap, explores code. Clean sessions get a concise summary; sessions with errors get full diagnosis with code exploration and ranked root cause hypotheses. Uses `view` at key moments and `diff` between before/after for the most revealing evidence. Always maps component names to source via sightmap and reads those source files.

**Acceptable outcomes:** confident single root cause, 2-3 ranked hypotheses with evidence, or partial diagnosis with repro steps and file paths.

### 3. `subtext:bug-fix-workflow`
End-to-end in main context. Core invariant: **understand before you fix, evidence before hypothesis, test before code.**

**Decision points (sequential):**
1. **Understanding** — accepts existing session-analysis or delegates to subagent. *Checkpoint: present to user.*
2. **Reproduction** (optional) — delegates browser reproduction to subagent if UI-visible and local dev available.
3. **Root Cause** — delegates deep code exploration to subagent. Name the file, function, mechanism. *Checkpoint: present hypothesis with evidence.*
4. **Failing Test** — write test asserting correct behavior, confirm it fails against buggy code.
5. **Fix** — minimal change, run test, run broader suite, no regressions.
6. **Validation** — delegate browser validation to subagent with original repro steps.

**When hypotheses are wrong:** ask the user (domain knowledge is faster than re-exploration), look at what wasn't checked, spin up fresh exploration subagent. After two failed revisions, present findings and ask for help.

### 4. `subtext:ux-review-workflow`
Evaluates session for usability friction, not just bugs. Watches for: rage clicks, dead clicks, long pauses (>5s), immediate undo, excessive scrolling, back-button loops, form abandonment, repeated same action. Maps friction to components/source via sightmap. Returns prioritized issues (High/Medium/Low) with timestamps, components, and recommendations. Also notes positive patterns. Runs as subagent.

### 5. `subtext:reproduce-workflow`
Drives the local app via live browser tools to exercise a user flow. Accepts structured repro steps or a session URL (extracts steps via review tools first). Maps session URLs to local equivalents. Takes snapshots before each interaction for element UIDs. Writes back to sightmap when it discovers gaps: unnamed components, undefined views, unmapped API calls. Every run improves the app model. Requires tunnel setup for localhost URLs. Runs as subagent.

### 6. `subtext:sightmap`
Definition skill for `.sightmap/` YAML files. Three definition types:
- **Components** — CSS selectors → semantic names + source paths (global or view-scoped, with children)
- **Views** — URL route patterns → screen names (adds `[View: Name]` header to snapshots, scopes components)
- **Requests** — API endpoints → semantic names with method filter, payload schemas, source paths

Snapshots automatically annotate matched elements with semantic names and `[src: path]`; network tools overlay request definitions. All files under `.sightmap/` are merged at load time.
