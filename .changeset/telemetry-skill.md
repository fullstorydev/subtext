---
"subtext": minor
---

Add the `subtext-telemetry` skill documenting the new `telemetry-event` MCP tool, which records AI-reported workflow milestones (currently the `onboard` capture-snippet install flow) for funnel analysis and success-rate dashboards.

The skill covers the nine onboarding steps (`start` through `complete`), per-step metadata fields, outcome classifications, and fire-and-forget semantics — a failed telemetry event is a soft failure that must never block or abort the user's workflow.

Cross-references in `subtext-shared`, `subtext-using-subtext`, `subtext-setup-plugin`, and the README were updated to match.
