---
name: subtext:reproduce-workflow
description: Reproduce user flows locally using live browser tools. Takes repro steps or a session URL, drives the local app, captures evidence, writes back to sightmap.
metadata:
  requires:
    skills: ["subtext:session", "subtext:live", "subtext:sightmap", "subtext:shared", "subtext:tunnel"]
---

# Reproduce

> **PREREQUISITE:** Read `subtext:shared`, `subtext:session`, `subtext:live`, `subtext:sightmap`, and `subtext:tunnel` for MCP conventions and tools.
> **ENVIRONMENT:** If a `subtext-environment` skill is available in the host project, read it — it documents MCP prefix selection and host-specific gotchas (local-app login/auth, patterns for testing locally-built code through subtext tools, screenshot strategy, and similar).

Drive the local app through live browser MCP tools to reproduce a user flow. When you encounter sightmap gaps, write back so the next run is better.

## Goal

Execute the user flow locally, capture evidence at each step, improve sightmap along the way.

**Done when:** Outcome reported (reproduced/not-reproduced/partial/flow-completed) with component hierarchy, console errors, network issues. Sightmap gaps noted or fixed.

## Inputs

Accepts **either**:
- **Structured repro steps** from session-analysis, bug-fix, or the user
- **Session URL** — extracts steps via review tools first, then reproduces via live browser tools

Also needs: local dev URL and login instructions if auth required.

## Decision Points

**When given a session URL (no repro steps):**
- Use review tools to extract structured repro steps first, then proceed to reproduction

**When translating URLs:**
- Map session URLs to local equivalents using the local dev base URL
- Preserve the path after any org/environment prefix
- If pattern unclear → ask rather than guess

**When executing each step:**
- Always take a snapshot before interacting — you need element UIDs to click/fill
- Element not found → take screenshot, report what you see instead. Don't skip silently.
- Authentication required → follow login instructions if provided, otherwise ask
- Specific data needed that doesn't exist locally → note the gap and continue

**When choosing how to interact:**
- Component in sightmap → use semantic name
- a11y tree has role + accessible name → use that
- Element has `data-testid` → use that
- Last resort: positional/CSS identification → **flag as sightmap gap**

**When to check for errors:**
- After each interaction: snapshot for component hierarchy
- At bug/observation point: snapshot + screenshot for evidence (clip the screenshot to the offending element via `component_id` when applicable)
- Check console messages for errors at key moments
- Check network requests when issue might be data-related

**When to persist vs give up:**
- Bug depends on data not available locally → note gap as likely reason, report partial
- Timing-dependent, doesn't appear first try → try once more with different timing
- Page won't load / environment broken → report environment issue, stop retrying

**When you discover a sightmap gap:**
- Element has no semantic name → add to `.sightmap/`
- Component appears with generic a11y role → add definition
- View/route not defined → add view definition
- API call not mapped → add request definition

## Heuristics

- **Sequential snapshots are cheaper than random access** — work through steps in order.
- **Partial reproduction is still valuable.** Document what you observed.
- **If local data differs from production**, note what's missing rather than failing silently.
- **Prefer snapshots over screenshots.** Cheaper, show component names, provide UIDs.
- **Sightmap write-back is a first-class output.** Every run improves the app model.

## Composition

- **Invoked by**: `subtext:bug-fix-workflow` (as subagent), `subtext:workflow` router (as subagent), or user directly
- **Delegates to**: nothing — self-contained

## Output Format

```
## Reproduction Result

**Outcome**: Reproduced / Not reproduced / Partial / Flow completed

### Environment
- **URL**: [local URL used]
- **Steps executed**: X of Y

### Steps Executed
1. [step] — [result: OK / issue observed]
2. [step] — [result]

### Observation
[What was observed at the key point]

### Console Errors
[Any console errors, or "None"]

### Network Issues
[Any failed or slow requests, or "None"]

### Sightmap Updates
[Components, views, or requests added/updated — or "None"]

### Notes
[Timing dependencies, data gaps, environment differences]
```
