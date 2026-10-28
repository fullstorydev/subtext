# iOS Simulator live local loop: build plan

**Goal:** an agent drives and inspects an iOS app in the local Simulator the same way `sightmap browser` does for web. It snapshots the UI tree, acts on components by id or component query, reads console output, and authors `.sightmap/` from what it sees. Everything runs on the developer's Mac: no Appium, no cloud, Simulator only.

**Status:** prototype on branch `chandler/ios-live-loop`. It ships as a first-party skill in the Subtext plugin, so it can be tested on any Mac by installing the plugin from this branch. The intent is to move the command surface upstream as `sightmap device …` once it's proven.

## Shape

```
agent ──► subtext-sim CLI ──► daemon ──► sim helper (FBSimulatorControl) ──► iOS Simulator
                               │  └──► simctl (lifecycle, screenshot, log stream)
                               └──► .sightmap/ matcher (sightmap CLI, offline)
network (v1): app's Fullstory SDK session ──► Subtext MCP review-open / review-zoom
```

| Piece | Path | What it is |
|---|---|---|
| Skill | `skills/subtext-ios-sim/SKILL.md` | Teaches agents the workflow and commands |
| CLI | `skills/subtext-ios-sim/bin/subtext-sim` + `lib/*.mjs` | Node ≥18, **no npm dependencies**. It mirrors `sightmap browser` commands. |
| Daemon | `lib/daemon.mjs` | Long-lived; owns the helper process and the device log stream. The CLI talks to it over a Unix socket recorded in `.sightmap/.sim-session`. |
| Helper | `skills/subtext-ios-sim/helper/` | Swift package built on FBSimulatorControl through idb's released binary xcframeworks (pinned). It builds on first use into `~/Library/Caches/subtext-sim/<version>/`. |
| Fixture app | `skills/subtext-ios-sim/fixtures/SampleApp/` | A small SwiftUI app with `accessibilityIdentifier`s, a long list, a form and network calls, plus `build.sh`. It's used for the demo and for testing. |

## Helper protocol (stable contract between CLI and helper)

The helper is a long-lived process speaking JSON lines over stdin/stdout, one request per line:

```json
{"id": 1, "cmd": "describe", "args": {"udid": "…"}}
{"id": 1, "ok": true, "result": {…}}
{"id": 2, "ok": false, "error": {"code": "not_booted", "message": "…"}}
```

| cmd | args | result |
|---|---|---|
| `hello` | — | `{version, xcode, fbsimctl}` |
| `describe` | `udid` | `{screen: {w, h}, root: Node}` where `Node = {role, type, label, identifier, value, frame: {x, y, w, h}, enabled, children: [Node]}`. `identifier` is `AXUniqueId`; points are top-left origin. |
| `tap` | `udid, x, y` | `{}` |
| `type` | `udid, text` | `{}` |
| `swipe` | `udid, x1, y1, x2, y2, duration?` | `{}` |
| `button` | `udid, name` (`home`, `lock`, `siri`) | `{}` |
| `key` | `udid, key` (`return`, `delete`, `tab`…) | `{}` |

Lifecycle (boot, install, launch, terminate, openurl), screenshots and logs go through `xcrun simctl` from Node, not the helper.

## CLI surface (v1)

| Command | Behavior |
|---|---|
| `subtext-sim doctor` | Checks Xcode (not just the CLT), simctl, iOS runtimes, the Swift toolchain, Node, the sightmap CLI and the helper build; prints exact fixes. Builds the helper if needed. |
| `subtext-sim start [--device NAME\|UDID] [--app PATH] [--bundle-id ID] [--detach]` | Boots the simulator, enables accessibility, installs and launches the app, starts the daemon, writes `.sightmap/.sim-session`. |
| `subtext-sim status` / `stop` | Reports session health / shuts everything down. |
| `subtext-sim snapshot [--out F] [--tree-out F] [--json]` | describe → normalized tree → sightmap matching → annotated tree with stable per-snapshot ids. |
| `subtext-sim click <id\|component-query>` | Resolves to an element, **refuses off-screen targets** (suggests scrolling), taps its center. |
| `subtext-sim fill <id\|query> <text>` | Taps, then types. |
| `subtext-sim scroll <up\|down> [--in id\|query]` / `swipe` / `tap-xy` / `button` / `key` | Lower-level input. |
| `subtext-sim openurl <url>` / `screenshot --out F` | Deep links / PNG. |
| `subtext-sim console list [--limit N] [--grep S]` / `console get <i>` | App process logs from the device log stream, live. |
| `subtext-sim session-url` | The Fullstory session URL from the SDK's log output, when the SDK is present. |

**Network (v1):** read through the Subtext MCP. The agent passes `session-url` to `review-open`, then calls `review-zoom` with `{"network": "standard"}` (or `"detail"` for headers and bodies). That data arrives on the SDK's upload interval, roughly 20 s, so the skill tells agents to batch: run the flow, then read once. Faster or live delivery depends on SDK work outside this branch.

**Producer / consumer roles:** the skill splits the loop into two subagent roles, so the upload delay never blocks anyone.
- **Producer:** drives the app with `subtext-sim` (start, snapshot, click/fill/scroll, openurl). It works through flows quickly and writes a run log to `.sightmap/.sim-runs/<run>.jsonl`. Each entry records a step: timestamp, action, target component or id, screen and view. The log also records the session URL.
- **Consumer:** follows the producer's run log. It reads that session's captured data through the Subtext MCP (`review-open`, then `review-zoom` on network, console and interaction), lining the data up against the producer's steps. With it, the consumer authors or cleans up `.sightmap/`:
  - names `requests:` and `properties:`;
  - adds `messages:`;
  - fixes components and views the producer found unnamed or ambiguous.

  It re-reads as new data lands, roughly every upload interval.

The orchestrating agent runs both, or the producer runs alone when only UI work is needed. Data the consumer reads depends on the org's mobile capture settings: network capture must be on for network data; resource uploading isn't needed.

**Element model:** `role ← type`, `identifier ← AXUniqueId`, `text ← label`, `value`, `bounds`. These map onto sightmap selectors as `<role>[identifier="…"]`, `[text="…"]`, `[value="…"]`, so `.sightmap/` YAML stays platform-neutral.

**Deviations found while building:**
- Enabling app accessibility only takes effect at boot, so the first `start` on a fresh simulator reboots it once.
- `stop` keeps the simulator running unless `--shutdown` is passed.
- Rows in long lists that haven't been rendered yet report "not found"; `scroll --until` handles it.

## Build phases

1. **In parallel:**
   - **A, helper:** the Swift helper and `build.sh`, tested against a booted simulator.
   - **B, sightmap bridge:** the normalizer and sightmap bridge (the offline tree format, matching, annotated output), developed against recorded `describe` fixtures.
   - **C, app, skill and install path:** the fixture app, the skill draft, `doctor`, and installing the plugin from a branch.
2. **D, CLI and daemon:** wire up the helper, simctl, the log stream and the bridge into the commands above.
3. **E, verification:**
   - local end to end on the fixture app;
   - a clean-machine dry run: fresh clone of the branch outside any dev checkout, isolated plugin config and cache, plugin installed from the clone, `doctor` → `start` → `snapshot` → `click` → `console`;
   - after the branch is pushed, a test on a second Mac from the branch.

## Testing on another Mac

1. Prerequisites: macOS 15+, Xcode 26+ with an iOS Simulator runtime, Node 18+.
2. Install the plugin from the branch (exact command is in the skill's README once verified), then ask the agent to run `subtext-sim doctor`.
3. Try the fixture app: `fixtures/SampleApp/build.sh`, then `subtext-sim start --app <built .app>`.

## Known limits (v1)

- Simulator only; Apple Silicon only (idb's prebuilt frameworks are arm64).
- No hover, file upload or arbitrary viewport sizes.
- Network data isn't live, and depends on the app's Fullstory SDK and org network-capture settings.
- The helper relies on Apple private frameworks through FBSimulatorControl, so new Xcode releases may need a helper update.
