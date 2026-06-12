# Mobile Harness Architecture

## Ownership Split

The flow has four separate pieces:

1. **Goal runner:** `run-lidar-live-ios.mjs` or `run-goal.mjs` drives any app through a goal manifest. Navigation steps, target screen, and scroll counts come from the goal JSON, not hardcoded values.
2. **Mobile driver:** Lidar owns generic device control through `live-*` tools: connect, snapshot, tap, fill, scroll, handle system alerts, and apply sightmap annotations.
3. **Session discovery:** the runner or a future Lidar/mobile bridge maps a device run to a FullStory session URL, trace ID, user ID, or session ID.
4. **Replay diagnosis:** Subtext `review-open`, `review-view`, and `review-diff` inspect the FullStory replay and compare it to the goal.

## Flow

```
Goal JSON  +  .env.local
       |           |
       v           v
  run-lidar-live-ios.mjs  (or run-goal.mjs for Appium)
       |
       |-- live-connect (platform: "ios")
       |-- live-view-snapshot
       |-- live-act-click / live-act-drag
       |-- live-disconnect
       |
       v
  Snapshots + report  -->  validate-goal-artifacts.mjs
       |
       v
  fetch-subtext-review-evidence.mjs
       |
       v
  capture-subtext-review-observations.mjs
       |
       v
  validate-replay-observations.mjs
```

## Scripts

| Script | Purpose |
| --- | --- |
| `run-lidar-live-ios.mjs` | Drive an app through Lidar MCP live tools using a goal manifest |
| `run-goal.mjs` | Drive an app through Appium/WebDriverIO using a goal manifest |
| `run-local-lidar-ios.mjs` | Build and start a local Lidar, start Appium, run the Lidar goal |
| `validate-goal-artifacts.mjs` | Validate device artifacts against goal expectations |
| `prepare-subtext-review.mjs` | Generate a replay review request from goal and session URL |
| `fetch-subtext-review-evidence.mjs` | Fetch replay evidence from Subtext MCP |
| `capture-subtext-review-observations.mjs` | Extract observations from Subtext review evidence |
| `capture-replay-observations-from-snapshot.mjs` | Extract observations from browser replay snapshots |
| `validate-replay-observations.mjs` | Validate replay observations against goal expectations |
| `appium-layer.mjs` | Appium/WebDriverIO connection, capabilities, and device primitives |
| `device-e2e-common.mjs` | Shared env loading, log capture, session URL extraction |

## Goal Manifest

All app-specific behavior comes from the goal JSON. The runner does not assume any screen names, labels, or navigation paths. See `goals/example.json` for the documented schema.

Key fields:

- `run.navigation[]`: steps to reach the target screen. Each step has an `action` (`tap`, `scrollToLabel`, `screenshot`, `source`, `dismissAlert`) and relevant parameters.
- `run.targetScreen`: the expected active screen after navigation.
- `run.scrollDownCount` / `run.scrollUpCount`: how many times to scroll.
- `replayChecks.observationHeuristics`: keyword lists used by the observation scripts to detect events, screen presence, image content, and scroll activity in replay evidence.
- `sensitiveRegions[]`: privacy expectations for UI regions.

## Lidar iOS Integration

The Lidar live tools provide a unified surface for iOS. `live-connect` with `platform: "ios"` creates an Appium session through the Lidar iOS backend. All subsequent `live-view-snapshot`, `live-act-click`, `live-act-drag`, and `live-disconnect` calls route to the iOS driver based on the connection type.

The local wrapper `run-local-lidar-ios.mjs` builds Lidar from source, starts it on free ports, starts Appium if needed, generates MCP caps, and delegates to `run-lidar-live-ios.mjs`.

## Replay Sampling

Replay validation inspects multiple timestamps after the target screen opens. The fetcher samples a short timeline, and callers can override it:

```bash
MOBILE_SUBTEXT_VIEW_TIMESTAMPS=12000,22000,37000 node scripts/mobile/fetch-subtext-review-evidence.mjs
```

## Current Limits

- The runner supports tap, scroll, and simple navigation. Login, deep links, text input, multi-screen flows, and manual checkpoints need a richer step format.
- Session discovery depends on SDK logs or a supplied session identifier.
- Build and install of the customer app is outside the runner. The customer must provide an installed app or clear install steps.
