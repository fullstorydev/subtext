# Mobile Replay Harness

Drives any iOS app on a physical device, then checks whether the FullStory replay of that session looks right. Everything the runner needs to know about your app comes from two places: environment variables and a goal JSON file. Nothing is hardcoded for any particular app.

There are two ways to drive the app:

- **Lidar live tools** (`run-lidar-live-ios.mjs`) -- talks to a Lidar MCP server over HTTP. This is the primary path.
- **Appium direct** (`run-goal.mjs`) -- talks to a local Appium server through WebDriverIO. Useful when you don't have a Lidar server.

After driving, a separate set of scripts fetches the FullStory replay, pulls out observations, and compares them to what the goal says should have happened.

## Setup

1. Copy the env example and fill in your values:

```
cp scripts/mobile/mobile.env.example scripts/mobile/.env.local
```

2. Write a goal JSON file for your app. Copy `goals/example.json` and edit it. The goal says which screen to navigate to, what taps to perform, how many times to scroll, and what the replay should contain.

3. Make sure you have:
   - A physical iOS device connected (or a simulator).
   - The app already installed on the device.
   - The device UDID (run `xcrun devicectl list devices` to find it).
   - A FullStory API key for the org that instruments the app.

## Environment Variables

Put these in `scripts/mobile/.env.local`. That file is gitignored.

**Always required:**

| Variable | What it is |
| --- | --- |
| `FULLSTORY_API_KEY` | API key for MCP auth and replay fetches |
| `MOBILE_BUNDLE_ID` | Bundle ID of the app installed on the device |
| `MOBILE_UDID` | Device UDID |
| `MOBILE_DEVICE_NAME` | Device name (e.g. "My iPhone") |
| `MOBILE_GOAL_EXPECTATIONS` | Path to the goal JSON file |
| `MOBILE_OUT_DIR` | Where to write output artifacts |

**For Lidar runs:**

| Variable | What it is |
| --- | --- |
| `LIDAR_IOS_MCP_URL` | URL of the Lidar MCP endpoint |

**For local Lidar development** (when you want to build and run Lidar from source):

| Variable | What it is |
| --- | --- |
| `LOCAL_MCP_ORG_ID` | FullStory org ID for generating local MCP caps |
| `LOCAL_MCP_EMAIL` | Email for the fake signed session |

**For Appium runs:**

| Variable | What it is |
| --- | --- |
| `MOBILE_CAPABILITIES_PATH` | Path to a capabilities JSON file, if env vars aren't enough |
| `MOBILE_CONSOLE_LAUNCH_PATTERN` | Regex to detect app launch in console output |

## Goal Files

A goal file tells the runner what to do and what to check. Here's what goes in it:

- `name` -- human name for the goal.
- `run.targetScreen` -- the screen you're navigating to.
- `run.slug` -- short name used in filenames.
- `run.navigation` -- array of steps to get to the target screen. Each step has an `action` (`tap`, `scrollToLabel`) and a `label`. A tap can set `"ifVisible": true` to skip if the element isn't there.
- `run.scrollDownCount` / `run.scrollUpCount` -- how many times to scroll once you're on the target screen.
- `replayChecks` -- what the replay validation scripts look for.
- `replayChecks.observationHeuristics` -- keyword lists that the observation scripts use to detect events, screen presence, image content, and scroll activity in replay evidence.
- `sensitiveRegions` -- privacy expectations for specific parts of the UI.

If `navigation` is missing, the runner just connects, snapshots, scrolls, and disconnects. No assumptions about how your app's navigation works.

See `goals/example.json` for the full shape with comments.

## Running

### Against a remote Lidar server

Set `LIDAR_IOS_MCP_URL` to the server, set your goal and output dir, and run:

```
node scripts/mobile/run-lidar-live-ios.mjs
```

### Against a local Lidar (build from source)

This builds Lidar from your local Go checkout, starts Appium if it's not running, starts Lidar on free ports, generates MCP caps, and runs the goal. All you need in `.env.local` is device info, API key, org ID, and email.

```
node scripts/mobile/run-local-lidar-ios.mjs
```

Set `MOBILE_LIDAR_START=0` and `LIDAR_IOS_MCP_URL` to skip the build and reuse an existing Lidar.

### Through Appium directly (no Lidar)

Start Appium first:

```
pnpm exec appium --address 127.0.0.1 --port 4723 --base-path /
```

Then run:

```
node scripts/mobile/run-goal.mjs
```

## Replay Validation

After the device run finishes, there are separate scripts to check the replay. You run them in order:

1. **Validate device artifacts** -- checks that the expected files exist and contain what the goal says.
   ```
   node scripts/mobile/validate-goal-artifacts.mjs
   ```

2. **Fetch replay evidence** -- calls Subtext MCP to open the session and grab snapshots at several timestamps.
   ```
   node scripts/mobile/fetch-subtext-review-evidence.mjs
   ```

3. **Extract observations** -- reads the raw replay evidence and pulls out structured observations (which screen, which events, whether content was visible, etc).
   ```
   node scripts/mobile/capture-subtext-review-observations.mjs
   ```

4. **Validate observations** -- compares observations to the goal's expected checks and writes a pass/warn/fail report.
   ```
   node scripts/mobile/validate-replay-observations.mjs
   ```

You can also use `prepare-subtext-review.mjs` to generate a markdown review request instead of fetching evidence directly.

## Output

Everything goes in whatever you set `MOBILE_OUT_DIR` to. Typical files:

- `live-ios-*.json` / `live-ios-*.txt` -- snapshots from Lidar.
- `live-ios-*.png.base64` -- screenshot data.
- `*-source.xml` / `*.png` -- Appium source and screenshots.
- `fullstory-session-url.txt` -- the FullStory replay URL.
- `replay-observations.json` -- structured observations from replay.
- `*-validation-report.md` -- final report.

## What's Not Committed

The `.gitignore` keeps out anything app-specific:

- `.env.local` -- your personal config.
- `goals/*` except `example.json` -- your app-specific goals.
- `tmp/` -- all run output.
- `capabilities.local.json` -- your device capabilities.
- Any `run-images-*` or `images-goal.mjs` scripts from internal testing.

## Device Config

For Appium runs, you can provide full capabilities as a JSON file:

```
MOBILE_CAPABILITIES_PATH=./scripts/mobile/capabilities.local.json node scripts/mobile/run-goal.mjs
```

Or as inline JSON:

```
MOBILE_CAPABILITIES_JSON='{"platformName":"iOS","appium:automationName":"XCUITest","appium:udid":"device-udid"}' node scripts/mobile/run-goal.mjs
```

## Replay Validation Details

Replay checks are semantic, not pixel-perfect. The goal is to catch real problems:

- Wrong screen in replay.
- Missing events (taps, page properties).
- Blank or frozen content where there should be images or text.
- Privacy violations -- content visible when it should be masked, or masked when it should be visible.

Privacy states you can set in goal manifests:

- `unmasked` -- content should be visible.
- `masked` -- content should be obscured.
- `excluded` -- content should be blocked entirely.
- `omitted` -- the element should not appear at all.
- `config_dependent` -- depends on the org's privacy rules.
