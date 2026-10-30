# iOS Simulator loop: plan

**Goal:** an agent drives a native iOS or React Native app in the local Simulator the way `sightmap browser` drives Chrome, and reads what the app's Fullstory SDK captured while it does. Everything runs on the developer's Mac: no Appium, no cloud, Simulator only.

**History:** the loop was prototyped as `subtext-sim`, a Node CLI plus a Swift helper shipped inside a Subtext skill (closed fullstorydev/subtext#39). Field tests on a real React Native app are in [FIELD-NOTES.md](FIELD-NOTES.md). The tool then moved upstream as `sightmap device` (sightmap/sightmap#522), and this repo keeps only the Fullstory layer.

## The split

```
agent ──► sightmap device ──► daemon ──► helper (FBSimulatorControl) ──► iOS Simulator
            │                   └──► run log, console, .sightmap/ matcher
            │
            └─ subtext-device skill: session URL from the console ──► Subtext MCP review-open / review-zoom
```

| Owner | Piece | What it covers |
|---|---|---|
| sightmap | `sightmap device` and the `sightmap-device` skill | Simulator lifecycle, the helper build, `doctor`, annotated snapshots, click/fill/scroll, console, screenshots, the run log, iOS and React Native selector guidance |
| Subtext | `skills/subtext-device/` | How SDK data reaches agents, capture requirements, finding the session URL, detecting session end, reading network and `FS.log` data with `review-*`, and the concurrent producer/consumer workflow |

`sightmap-device` reaches this repo the same way as `sightmap-authoring` and `sightmap-browser`: pin a released `@sightmap/sightmap` that includes it and run `npm run vendor-skills`. Nothing here hand-writes it.

## Prototype to `sightmap device`

| `subtext-sim` | `sightmap device` |
|---|---|
| `doctor`, `start`, `status`, `stop`, `launch`, `relaunch` | same names and flags |
| `snapshot`, `click`, `fill`, `scroll`, `swipe`, `tap-xy`, `type`, `key`, `button`, `openurl`, `screenshot` | same |
| `console list [--grep S] [-i]`, `console get` | same; `-i` is accepted, `--grep` is always case-insensitive |
| `run new`, `run current`, `run tail [--follow] [--since SEQ]` | same; the log lives in `.sightmap/.device-runs/` instead of `.sightmap/.sim-runs/` |
| `session-url` | none: `console list --grep fullstory.com/ui/ --limit 0`, newest match wins |
| `session` / `session-ended` run-log entries | none: agents read the console for session URLs and termination lines |
| `.sim-runs/<run>.consumer.md` | `.device-runs/<run>.consumer.md`, a convention of the skill, not a tool feature |

## Gaps upstream

Things the Fullstory layer works around today and would be simpler with support in `sightmap device`:

- **No session events in the run log.** The prototype watched the console and logged `session` and `session-ended` entries; now each agent polls the console itself. A generic "console line matched a pattern" run-log entry would cover it without sightmap knowing about Fullstory.
- **No console follow.** `console list` has no `--since` or `--follow`, so agents re-list with `--grep`.
- **Bounded console.** The daemon keeps the most recent 5,000 entries, so a long or noisy run can drop the session URL line; the skill says to write it down.

## Known limits

- Simulator only; Apple Silicon only.
- Network data isn't live: it depends on the app's Fullstory SDK, the upload interval, and the org's mobile network capture setting.
- Large React Native view trees can make the server reject a bundle (HTTP 206), which ends the session; relaunching doesn't help on the same screen.
