---
name: subtext-ios-sim
description: Drive and inspect an iOS app in the local iOS Simulator — boot a simulator, install and launch the app, snapshot the UI tree, tap and type by accessibility identifier or sightmap component, read the app's console, and read its network traffic through the Subtext MCP. Use when the user wants to run, try, test, or reproduce a flow in an iOS app on the Simulator, inspect an iOS screen, or author `.sightmap/` definitions for an iOS app.
---

# iOS Simulator loop

> **PREREQUISITE:** Read `subtext-shared` for MCP conventions. For `.sightmap/` schema, read `sightmap-authoring`.

**Type:** Workflow — observe, act, observe, on a local simulator.

`subtext-sim` drives an app in the iOS Simulator on this Mac the way `sightmap browser` drives Chrome: snapshot the accessibility tree (annotated with your `.sightmap/` components), act on elements by id or component query, read console output. Simulator only; nothing leaves the Mac except the app's own traffic.

## Prerequisites

Apple Silicon Mac, macOS 15+, Xcode 26+ selected with `xcode-select` (not just the Command Line Tools), an iOS Simulator runtime, Node 18+. Run `doctor` first; it prints the exact fix for anything missing and builds the simulator helper on first use (a minute or two, cached afterwards).

## Invoking the CLI

The CLI is `bin/subtext-sim` inside **this skill's base directory** (the path you were given when this skill loaded). Always run it with `node` and the absolute path:

```bash
node <skill-dir>/bin/subtext-sim doctor
```

Below, `subtext-sim` is shorthand for that. Run commands from the project root: the session file lives in `.sightmap/.sim-session`.

## The loop

```bash
subtext-sim start --app path/to/MyApp.app --detach   # or --bundle-id for an installed app; --device "iPhone 17 Pro" or a UDID
subtext-sim snapshot                           # annotated tree; each element gets an id for this snapshot
subtext-sim click login-submit                 # by accessibility identifier, snapshot id, or component query
subtext-sim fill login-email "a@example.com"
subtext-sim snapshot                           # re-snapshot after every action that changes the screen
subtext-sim console list --grep error          # app logs (print / os_log), live
subtext-sim stop                               # --shutdown also shuts the simulator down
```

1. **Start** once per session, always with `--detach` (without it, `start` holds the shell as a foreground daemon). `status` reports health; `start` again reinstalls (with `--app`) and relaunches the app. The first `start` on a simulator that has never had app accessibility enabled reboots it once.
2. **Snapshot** before acting. Ids are per-snapshot, so act on the latest one. Prefer accessibility identifiers or component names over snapshot ids in anything you write down.
3. **Act** with `click` / `fill`. Both re-read the screen just before tapping, so a component query or identifier never goes stale. Lower level: `scroll`, `swipe`, `tap-xy x y`, `type`, `key return`, `button home`, `openurl <url>`.
4. **Check** with `snapshot` (state), `console list` / `console get <i>` (logs), `screenshot --out shot.png` (visual evidence).

**Targets** are a snapshot id (`12`), an exact accessibility identifier (`login-submit`), or a component query: `SignInButton`, `ProductRow[title^="Product 15"]`, `LoginForm SignInButton`, or a role with attributes for unmapped apps, `button[identifier="login-submit"]`. A query matching several elements errors and lists them; add a predicate or append `#N`.

**Off-screen elements:** `click` refuses targets whose center is off the screen or under the tab bar, toolbar or keyboard, and says what to do. Long SwiftUI/UIKit lists only expose the rows near the screen, so a row further down is "not found" until you scroll. `scroll down --until <target>` scrolls (slowly enough not to fling past it) until the target is tappable, then refreshes the snapshot ids.

**Waiting:** actions return as soon as the tap lands; navigation animates for a moment after. If a snapshot still shows the old screen, snapshot again.

## Commands

| Command | What it does |
|---|---|
| `doctor [--fix]` | Checks Xcode, simulators, Swift, Node, the sightmap CLI; builds the helper. |
| `start [--device NAME\|UDID] [--app PATH] [--bundle-id ID] [--label L] [--detach]` | Boots, enables app accessibility, installs, launches, starts the daemon and a new run log. |
| `status` / `stop [--shutdown]` | Session health / stop the daemon and the app (and the simulator). |
| `launch` / `relaunch` | Foreground the app / restart it (re-enables accessibility first). |
| `snapshot [--view V] [--include-offscreen] [--out F] [--tree-out F] [--json]` | Annotated tree. `--out` writes the text plus a `.tree.json` that `sightmap coverage` / `explain --snap` read. |
| `click <target>` | Re-resolves, checks it's on screen, uncovered and enabled, taps its center. |
| `fill <target> <text> [--clear]` | Taps, types (appends unless `--clear`), and errors if the field doesn't show the text. |
| `scroll <up\|down\|left\|right> [--in <target>] [--until <target>] [--max N]` | One page, or until a target is tappable. `--in` scrolls inside that element. |
| `swipe x1 y1 x2 y2 [--duration S]`, `tap-xy x y`, `type <text>`, `key <name>`, `button <name>`, `openurl <url>` | Raw input in screen points. Keys: `return delete tab escape space` and arrows. Buttons: `home lock siri side`. |
| `screenshot --out F.png` | PNG of the screen. |
| `console list [--limit N] [--grep S] [--level L]` / `console get <i>` | The app's os_log/Logger output (Apple frameworks only at error/fault) and its stdout/stderr (levels `stdout`, `stderr`). |
| `session-url` | The Fullstory session URL from the app's logs. |
| `run new [--label L]` / `run current` | Start a new run log / print the current run's id and path. |
| `run tail [--follow] [--since SEQ] [--run ID]` | Print `.sightmap/.sim-runs/<run>.jsonl` entries; `--follow` keeps streaming. |

Every command takes `--json`. Errors are one line with a `Next:` step.

## Network, and the producer / consumer split

Network and Fullstory-captured console data come from the app's Fullstory SDK session, read through the Subtext MCP. It needs an app built with the Fullstory iOS SDK and network capture enabled for the org. That data arrives on the SDK's upload interval, about **20 s** behind the app. So don't make one agent tap and then wait; split the work into two subagents.

**Producer:** drives the app and never waits on network data.
- `start` (opens a run), then work through flows with `snapshot` / `click` / `fill` / `scroll` / `openurl`.
- Every action is appended to the run log `.sightmap/.sim-runs/<run>.jsonl` with its timestamp, target component and view. The session URL is logged as a `session` entry once the SDK reports it.
- It also fixes UI-side gaps as it goes: elements it can't target cleanly are candidates for new `components:`.
- When done, it reports the run id.

**Consumer:** turns captured traffic into sightmap.
1. `run tail --follow` (or `--since SEQ`) to follow the producer's steps and pick up the `session` URL.
2. `review-open` with that URL, then `review-zoom` with `resolution={"network": "standard", "console": "standard"}`. Use `"detail"` on specific requests for headers and bodies.
3. Line up each request and log with the producer step just before it (by timestamp), then author or clean up:
   - `requests:` (route glob + method) for endpoints that mean something;
   - `properties:` for outcomes hidden in bodies;
   - `messages:` for meaningful logs and errors;
   - corrections to components and views the producer flagged.
4. Re-read about every 20 s, or once after the producer finishes. Each `review-open` costs credits, so don't poll faster than data can arrive.

The orchestrating agent starts the producer, then the consumer once the run has a `session` entry. Run the producer alone when only UI or components work is needed.

Local, live alternatives that need no SDK: `console list` (the app's os_log / print output) and `snapshot`.

## Authoring `.sightmap/` for iOS

Use the `sightmap-authoring` workflow; only the selectors differ. Elements expose `role` (from the accessibility type), `identifier` (the `accessibilityIdentifier`), `text` (the label) and `value`:

```yaml
components:
  - name: SignInButton
    selector: 'button[identifier="login-submit"]'
  - name: ProductRow
    selector: 'button[identifier^="product-row-"]'
    properties:
      - name: title
        extract: text
```

Views have no URL to route on: the snapshot infers the view whose own components match the most elements (`[View: Login] (inferred)`), or pass `--view`. `<skill-dir>/fixtures/SampleApp/.sightmap/` is a small worked example.

Prefer `[identifier=…]`; fall back to `[text=…]` only for copy that won't change or be localized. Snapshot after editing to confirm the components resolve.

**SwiftUI gotcha:** `.accessibilityIdentifier` on a container overwrites the identifiers of its children. Put identifiers on the leaf controls (buttons, fields, rows), not on the stack around them. If every child of a view shows the same identifier, that's why. Tab bar items take the identifier set on the `Label` inside `.tabItem`.

## Sample app

`<skill-dir>/fixtures/SampleApp/build.sh` builds a small SwiftUI app (login form, 200-row product list, tab bar, a JSON POST button) and prints the `.app` path. Set `FS_ORG_ID=<org>` to build it with the Fullstory SDK, which enables `session-url` and network.

## Known limits

- Simulator only, Apple Silicon only. No physical devices.
- No hover, file upload, or arbitrary screen sizes: pick a different `--device`.
- Network isn't live, and needs the Fullstory SDK in the app plus network capture enabled for the org.
- The helper uses Apple private frameworks; a new Xcode release may need a plugin update. `doctor` says so when the helper fails to build.
- On iOS 26 a SwiftUI tab bar shows up as one `other "Tab Bar"` element without its tabs; switch tabs with `tap-xy` from a screenshot.
- Scrolling a long list to a far row takes about 3 s per screenful.
