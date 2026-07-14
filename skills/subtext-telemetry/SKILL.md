---
name: subtext-telemetry
description: Workflow telemetry logging — record AI-reported workflow milestones (currently the onboarding flow) for funnel analysis. Use when executing an instrumented Subtext workflow and you need to log step-by-step progress events.
---

# Telemetry

> **PREREQUISITE:** Read `subtext-shared` for MCP conventions.

The telemetry tool records workflow milestones to Fullstory's analytics backend (BigQuery) for funnel analysis and success-rate dashboards. It writes analytics events only — it never modifies application data or org configuration.

## MCP Tools

| Tool | Description |
|------|-------------|
| `telemetry-event` | Log one workflow milestone: a `workflow` + `step`, an optional `outcome`, and optional step-specific `metadata`. |

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `workflow` | yes | Workflow name. Currently only `onboard` (the Subtext capture-snippet install flow) is supported. |
| `step` | yes | Milestone within the workflow. For `onboard`, in order: `start`, `precheck`, `explore`, `plan`, `install`, `identify`, `link_analytics`, `mask_pii`, `complete`. |
| `outcome` | no | `success`, `partial`, `fail`, or `skipped`. Omit for in-progress milestones. |
| `metadata` | no | A JSON **object** (not an array or scalar) of step-specific fields — see below. |

## Metadata fields by step

Every step's metadata may include `duration_ms` (int) and `tokens` (int). Additional fields vary by step:

| Step | Extra fields |
|------|--------------|
| `start` | `harness` (string), `model` (string) |
| `precheck` | `already_installed` (bool) |
| `explore` | `framework` (string), `csp_present` (bool) |
| `plan` | `approved` (bool) |
| `install` | `framework` (string), `csp_modified` (bool) |
| `identify` | `identity_added` (bool) |
| `link_analytics` | `analytics_providers` (string[]) — names of every analytics / session-replay / error-monitoring / feature-flag SDK found installed, e.g. `["posthog", "segment", "sentry"]` |
| `mask_pii` | `masked_count` (int), `privacy_check` (bool) |
| `complete` | `total_duration_ms` (int), `total_tokens` (int) |

Unknown metadata fields are tolerated (ignored, not errors), but stick to the documented fields — only they land in typed columns for analysis.

## Typical flow

Log an event at each milestone as you execute the workflow, not retroactively at the end:

```
telemetry-event workflow="onboard" step="start" metadata={"harness": "claude-code", "model": "claude-fable-5"}
...
telemetry-event workflow="onboard" step="install" outcome="success" metadata={"framework": "nextjs", "csp_modified": false, "duration_ms": 42000}
...
telemetry-event workflow="onboard" step="complete" outcome="success" metadata={"total_duration_ms": 310000, "total_tokens": 85000}
```

The response is `{"logged": true}` on success or `{"logged": false, "reason": "..."}` on a soft failure.

## Rules and constraints

- **Fire-and-forget.** A `{"logged": false, ...}` response is a soft failure — note it and move on. Never retry in a loop, and never block or abort the user's workflow because telemetry failed.
- Org and user identity are attached server-side from the authenticated MCP session — don't put emails, org IDs, or other identifying data in `metadata`.
- Don't put secrets, tokens, file contents, or free-form user data in `metadata` — only the documented derived fields.
- `outcome` is a classification of the step, not a log level: use `skipped` when a step didn't apply, `partial` when it half-worked, and omit it entirely for a step that's still in progress.
- Only log events for workflows you are actually executing. The tool exists to measure real funnels — don't emit synthetic or exploratory events against a production org.

## Gotchas

- Passing `metadata` as anything other than a JSON object — arrays, strings, and scalars are rejected with `{"logged": false}`.
- Inventing workflow or step names — only `onboard` and its nine documented steps are recognized. New workflows require backend support first.
- Logging every step at the end of the workflow with made-up durations — log each milestone as it happens so `duration_ms` and failure points are real.
- Treating a soft failure as an error worth surfacing to the user — telemetry is invisible plumbing; a failed event is at most a one-line note.

## See Also

- `subtext-shared` — MCP conventions
