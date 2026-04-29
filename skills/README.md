# Subtext Skills Overview

Four tiers: atomics describe tools, workflows orchestrate them with decision logic, recipes are short step lists, and onboarding guides new users through setup.

Before creating or modifying any skill, read [`authoring.md`](authoring.md).

## Atomics — "what tools exist"

- **subtext:shared** — Foundation skill: MCP prefixes, environment detection, sightmap upload, security rules
- **subtext:session** — Session replay: `review-open`, `review-view`, `review-diff`, `review-inspect`, `review-close`
- **subtext:live** — Live browser: connections, views, interactions, console, network
- **subtext:sightmap** — `.sightmap/` YAML schema for components, views, requests
- **subtext:tunnel** — Reverse tunnel for localhost browser tools
- **subtext:comments** — Comment tools: `comment-list`, `comment-add`, `comment-reply`, `comment-resolve`

## Workflows — "how to accomplish a goal"

- **subtext:proof** — **Inner loop.** Before/after visual evidence during UI work. Captures BEFORE/AFTER screenshots as the agent edits, leaves chapter markers in the session, self-corrects up to 5 iterations, and packages evidence for PRs.
- **subtext:review** — **Outer loop.** Post-completion secondary read of a recorded session. Produces a structured summary anchored on chapter markers. Optionally emits reproduction steps on request (execution itself happens in `subtext:live`).

**Complementary, not overlapping:** `proof` proves as the work happens; `review` verifies once the session is complete. A common chain is `proof` → session recorded → another agent (or same agent later) runs `review` over it.

## Recipes — "do these steps"

- **subtext:recipe-sightmap-setup** — Bootstrap `.sightmap/` definitions for a project from scratch.

## Onboarding — "getting started"

- **subtext:onboard** — Guided six-step setup for new users: plugin install → first session → review → sightmap → informed reproduction → metrics.
- **subtext:setup-plugin** — Install the Subtext plugin and configure MCP servers.
- **subtext:first-session** — Agent-driven exploration of the user's site via the hosted browser.

## How they compose

```
onboard
  ├─ setup-plugin        (install)
  ├─ first-session       (capture)
  ├─ review              (analyze)
  └─ recipe-sightmap-setup  (enrich)

proof        ──▶ captures a session ──▶ review  (optional handoff)

review       ──▶ produces repro steps ──▶ subtext:live  (execution)
```

Atomics (`shared`, `session`, `live`, `sightmap`, `tunnel`, `comments`) are required by whichever workflow or recipe needs their tool catalogs. Dependencies point down: workflows compose atomics, recipes reference atomics, atomics stand alone.
