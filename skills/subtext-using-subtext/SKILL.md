---
name: subtext-using-subtext
description: Overview of the Subtext plugin — when to reach for session review vs privacy tools. Read to orient before reviewing a Fullstory session or managing privacy rules.
---

# Using Subtext

This plugin gives you read-only access to Fullstory session recordings, plus privacy-rule management.

## When to reach for what

| Signal | Skill |
|--------|-------|
| You have a session URL / want to know what happened | `subtext-review` |
| You need the session-replay tool catalog (`review-*`) | `subtext-session` |
| Detect PII or manage element-block, URL, or network privacy rules | `subtext-privacy` |
| Log workflow milestones (e.g. onboarding progress) for analytics | `subtext-telemetry` |

## Notes

- Everything here is read-only analysis **except** `privacy-create` / `privacy-promote` / `privacy-delete` / `privacy-url-create` / `privacy-network-create`, which modify org privacy rules — confirm with the user first. (`telemetry-event` writes analytics events only, never org configuration — no confirmation needed.)
- This plugin does **not** drive a live browser or capture before/after proof of code changes. That lives in the separate **Subtext Verify** plugin.
