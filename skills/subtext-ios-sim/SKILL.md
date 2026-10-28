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

1. **Start** once per session, always with `--detach` (without it, `start` holds the shell as a foreground daemon). `status` reports health; `start` again on a running session reinstalls (with `--app`) and relaunches the **same** app, and says which. It refuses a different app: `stop` first, then `start` the other one. The first `start` on a simulator that has never had app accessibility enabled reboots it once.
2. **Snapshot** before acting. Ids are per-snapshot, so act on the latest one. Prefer accessibility identifiers or component names over snapshot ids in anything you write down.
3. **Act** with `click` / `fill`. Both re-read the screen just before tapping, so a component query or identifier never goes stale. Lower level: `scroll`, `swipe`, `tap-xy x y`, `type`, `key return`, `button home`, `openurl <url>`. `tap-xy` and `swipe` take screen **points**, not pixels (a 390×844 pt screen is 1170×2532 px in a screenshot); points off the screen are refused.
4. **Check** with `snapshot` (state), `console list` / `console get <i>` (logs), `screenshot --out shot.png` (visual evidence).

**Targets** are a snapshot id (`12`), an exact accessibility identifier (`login-submit`), or a component query: `SignInButton`, `ProductRow[title^="Product 15"]`, `LoginForm SignInButton`, or a role with attributes for unmapped apps, `button[identifier="login-submit"]`. A query matching several elements errors and lists them; add a predicate or append `#N`.

**Off-screen elements:** `click` refuses targets whose center is off the screen or under the tab bar, toolbar or keyboard, and says what to do. Long SwiftUI/UIKit lists only expose the rows near the screen, so a row further down is "not found" until you scroll. `scroll down --until <target>` scrolls (slowly enough not to fling past it) until the target is tappable, then refreshes the snapshot ids.

**Waiting:** actions return as soon as the tap lands; navigation animates for a moment after. If a snapshot still shows the old screen, snapshot again.

## Commands

| Command | What it does |
|---|---|
| `doctor [--fix]` | Checks Xcode, simulators, Swift, Node, the sightmap CLI (the version that resolves: `SIGHTMAP_BIN`, then PATH, then the pinned npx package; warns outside the tested 0.32–0.36 range); builds the helper. |
| `start [--device NAME\|UDID] [--app PATH] [--bundle-id ID] [--label L] [--detach]` | Boots, enables app accessibility, installs, launches, starts the daemon and a new run log. On a running session: reinstalls and relaunches the same app; errors for a different one. |
| `status` / `stop [--shutdown]` | Session health / stop the daemon and the app (and the simulator). |
| `launch` / `relaunch` | Foreground the app / restart it (re-enables accessibility first). |
| `snapshot [--view V] [--include-offscreen] [--out F] [--tree-out F] [--json]` | Annotated tree. `--out` writes the text plus a `.tree.json` that `sightmap coverage` / `explain --snap` read. |
| `click <target>` | Re-resolves, checks it's on screen, uncovered and enabled, taps its center. |
| `fill <target> <text> [--clear]` | Taps, types (appends unless `--clear`), and errors if the field doesn't show the text. |
| `scroll <up\|down\|left\|right> [--in <target>] [--until <target>] [--max N]` | One page, or until a target is tappable. `--in` scrolls inside that element. |
| `swipe x1 y1 x2 y2 [--duration S]`, `tap-xy x y`, `type <text>`, `key <name>`, `button <name>`, `openurl <url>` | Raw input in screen points (not pixels; off-screen points are refused). Keys: `return delete tab escape space` and arrows. Buttons: `home lock siri side`. |
| `screenshot --out F.png` | PNG of the screen. |
| `console list [--limit N] [--grep S] [--level L] [--all]` / `console get <i>` | The app's own os_log/Logger output and its stdout/stderr (levels `stdout`, `stderr`). `--all` adds Apple framework errors and faults, which are hidden by default as noise. |
| `session-url` | The Fullstory session URL from the app's console: any `https://app…fullstory.com/ui/<org>/session/…` (or `client-session`) URL in any line, source or level; the newest wins. |
| `run new [--label L]` / `run current` | Start a new run log / print the current run's id and path. |
| `run tail [--follow] [--since SEQ] [--run ID]` | Print `.sightmap/.sim-runs/<run>.jsonl` entries; `--follow` keeps streaming. |

Every command takes `--json`. Errors are one line with a `Next:` step.

## Network, and the producer / consumer collaboration

### How the Fullstory SDK delivers data

Network and Fullstory-captured console data come from the app's own Fullstory SDK session, read back through the Subtext MCP. Nothing is read from the device directly, so know how the data moves:

- **Capture is in the app.** The SDK records interactions, navigation, network requests (method, URL, status, timing) and `FS.log` messages as they happen. Headers and bodies are captured only when the org's network header allowlists and body rules ask for them.
- **Upload is batched.** The SDK uploads a bundle about every **20 s**, and also when the app goes to the background or relaunches. Fullstory makes a bundle readable within seconds of receiving it, so any given request is visible roughly 5–30 s after it happens.
- **Reads are point-in-time.** Each `review-open` returns the session as uploaded so far and costs **10 credits**. `review-zoom` on the same client is free but never shows newer data. To see what arrived since, open the session again.
- **Requirements:**
  - the Fullstory SDK in the app, and an app **built by Xcode** (hand-assembled apps can't upload from the simulator);
  - **mobile network capture turned on** for the org (Settings → Data Capture → Mobile; `doctor` reminds you);
  - the Subtext MCP authenticated to the same org.
- **Console:** only `FS.log` reaches Fullstory. `print` / `os_log` output is local only; read it live with `subtext-sim console list`.
- **Session URL:** `subtext-sim session-url` returns it, and the run log records it as a `session` entry. It's found in any console line that contains one (a React Native `console.log('session', url)` works, as does a `FULLSTORY_SESSION_URL <url>` line). A relaunch can start a new session; when the run log gets a new `session` entry, follow the newest one.
- **Recording isn't reading.** Fullstory records views from inside the app; `subtext-sim` reads the accessibility tree from outside it. A healthy replay doesn't mean `snapshot` can see the screen, and an empty snapshot doesn't mean recording broke.

### Two agents, working at the same time

Because data lags the app by up to ~30 s, one agent that taps, then waits, then reads would spend most of its time waiting. Split the work into two subagents that **run concurrently** for the whole run: the producer keeps driving while the consumer keeps reading.

**Orchestrating agent:**
1. Start the **producer** as a background subagent.
2. Poll `subtext-sim session-url` every few seconds until it returns a URL, which is usually within seconds of `start`. Then start the **consumer** as a second background subagent, **without waiting for the producer to finish**.
3. Give both the run id and a credit budget for the consumer (default: at most 10 `review-open` calls, i.e. 100 credits, unless the user says otherwise).
4. When the producer reports it's done, tell the consumer, wait for its final pass, then reconcile and report.

**Producer** drives the app and never waits on network data:
- It works through flows with `snapshot` / `click` / `fill` / `scroll` / `openurl`. Every action lands in the run log `.sightmap/.sim-runs/<run>.jsonl` with its timestamp, target component and view.
- It owns `components:` and `views:` in `.sightmap/`: elements it can't target cleanly become new components.
- Between flows, it reads `.sightmap/.sim-runs/<run>.consumer.md` for the consumer's requests (e.g. "re-run checkout; a POST /orders fired with no step that explains it") and works them into its next flows.
- When finished, it reports to the orchestrator: the run id, the flows it covered, and any consumer requests it couldn't do. It leaves the app running, so the last bundle uploads and the consumer can still re-check a screen.

**Consumer** reads captured data while the producer is still working:
1. Follow the producer with `subtext-sim run tail --follow` (or poll with `--since SEQ`).
2. About every 30 s while new producer steps are appearing, read the newest data: `review-open` the session URL, then `review-zoom` with `t0_ms` set past what it has already processed, and `resolution={"network": "machine", "console": "standard"}`. Close each client with `review-close` before opening the next.
   - **Network grain:** endpoint names (method + URL) show at `machine`. `standard` collapses traffic into counts, and `detail` adds response headers only, unless the org's capture rules record more. Use `{"network": "machine"}` to name endpoints, and `detail` only on the specific requests whose headers matter.
3. Match each request and `FS.log` message to the producer step just before it (by timestamp), then author:
   - `requests:` (route glob + method) for endpoints that mean something;
   - `properties:` for outcomes hidden in bodies;
   - `messages:` for meaningful logs and errors.

   It owns those sections of `.sightmap/`. Component and view problems it notices go to the producer, not into the YAML.
4. When it needs more coverage (an endpoint it can't place, a flow that never fired a request, an error worth reproducing), it appends a short line to `.sightmap/.sim-runs/<run>.consumer.md`.
5. When the producer is done, wait ~30 s for the last bundle, do one final read to cover the tail of the session, then report what it authored and what remains unmapped.

**Budget and pacing:** never re-open faster than every ~30 s, since newer data can't arrive sooner. Stop at the credit budget and say so. If the producer goes idle, stop polling until new steps appear.

Run the producer alone when only UI or components work is needed. For quick local signals that need no SDK and no credits, use `console list` and `snapshot`.

## Authoring `.sightmap/` for iOS

Use the `sightmap-authoring` workflow; only the selectors and routes differ. Elements expose `role` (from the accessibility type), `identifier` (the `accessibilityIdentifier`; `testid` is an alias), `text` (the label) and `value`:

```yaml
version: 1
components:
  - name: TabBarItem
    selector: 'tab'
    properties:
      - name: title
        extract: { from: dom.text }
views:
  - name: Products
    route: /products          # required by sightmap; ignored by subtext-sim (see below)
    components:
      - name: ProductRow
        selector: '[identifier^="product-row-"]'
        properties:
          - name: title
            extract: { from: dom.text }
          - name: number
            extract: { from: dom.attr, path: identifier, pattern: 'product-row-(\d+)' }
```

Write `extract` as an object (`{ from: dom.text }`, `{ from: dom.attr, path: NAME }`, `{ from: component, path: Child.prop }`, `{ from: component.exists, path: Child }`, `{ from: dom.state, path: checked }`). The object form needs sightmap 0.34+; the older string forms (`extract: text`) still load but are deprecated. Run `sightmap validate` after editing.

**Views and routes.** sightmap requires a `route` on every view, and native screens have no URL, so give each view a short placeholder (`/login`, `/products`). `subtext-sim` ignores routes: the snapshot infers the view whose own components match the most elements (`[View: Login] (inferred)`), or pass `--view`. `<skill-dir>/fixtures/SampleApp/.sightmap/` is a small worked example.

**Reusing a web or React Native session corpus.** Two rules make selectors written against a recorded session match in the simulator:
- `[testid="x"]` matches the element whose accessibility identifier is `x`.
- In a descendant selector (`A B`), an ancestor step that names an exact identifier (`[testid="x"]`, `[identifier="x"]`, `#x`) is skipped when **no element in the tree** carries it, as long as the last step has an attribute of its own. A `testID` on a plain wrapper view never reaches the iOS tree, so `[testid="login-form"] [testid="login-submit"]` still matches the button. An identifier that is on screen is never skipped, `>` steps are never skipped, and `[testid="login-form"] button` doesn't match (it would match every button).

Prefer `[identifier=…]`; fall back to `[text=…]` only for copy that won't change or be localized. Snapshot after editing to confirm the components resolve.

**SwiftUI gotcha:** `.accessibilityIdentifier` on a container overwrites the identifiers of its children. Put identifiers on the leaf controls (buttons, fields, rows), not on the stack around them. If every child of a view shows the same identifier, that's why. Tab bar items take the identifier set on the `Label` inside `.tabItem`.

## React Native apps

The loop is the same; RN maps onto the iOS accessibility tree like this:

- **`testID` is the identifier.** Target it directly (`click login-submit`) and select on it (`[identifier="login-submit"]` or `[testid="login-submit"]`).
- **Put `testID`s on accessible elements.** Only accessible elements reach the tree: a `Pressable`, a `TextInput`, a `View` with `accessible`. A `testID` on a plain wrapper `View` is invisible to the simulator (selectors that use it as an ancestor still work, see above).
- **Role-less `Pressable`s show up as `other`**, not `button`; only `accessibilityRole="button"` makes a `button`. Write role-free selectors (`'[identifier^="product-row-"]'`), not `button[identifier=…]`. Accessible elements with a `testID` count as interactive.
- **`<Text testID>` doesn't reach the tree** on the New Architecture: the text shows up, its identifier doesn't. Put the `testID` on an `accessible` `View` around the `Text`, or select on `[text=…]`.
- **React Navigation tabs** become `tab "Products"` (the "tab, 1 of 3" suffix is stripped), so `tab` selectors and `TabBarItem[title="Network"]` work. Rows behind its JS tab bar are refused as covered, like a native one.
- **Labels join child texts with ", "**: a row with "Product 1" and "$6.37" reads `"Product 1, $6.37"`.

**Debug with Metro is fine.** A Debug build (or an Expo dev client) loading JS from Metro works for the whole loop and is cheaper than Release, since JS edits reload without a native rebuild; Release isn't required. Start Metro (`npx react-native start`, or `npx expo start --dev-client`) before `subtext-sim start`; without it the snapshot shows a red "No script URL provided" box. If edits don't show up, restart Metro with `--clear`: it can serve stale modules, especially from a git worktree. If port 8081 is taken, run Metro with `--port N` and point the app at it: `xcrun simctl spawn <udid> defaults write <bundle-id> RCT_jsLocation localhost:N`, then `relaunch`. A Release build embeds `main.jsbundle` and runs without Metro; it drops `console.log` below error unless the app calls `RCTSetLogThreshold(.info)` natively.

**Empty or nearly empty tree.** When `snapshot` says the app exposes no accessibility elements, or shows only a small floating element (e.g. the Expo dev-menu button, which lives in its own window), the likely causes in order are:
1. A view that stays mounted hides the rest: `accessibilityViewIsModal = YES`, or `accessibilityElementsHidden` / `importantForAccessibility="no-hide-descendants"` on a root view. In RN this is often a full-window overlay (a toast host, a modal backdrop) that is invisible but still mounted. Unmount it, or set those props only while it's shown.
2. App accessibility is off: `subtext-sim relaunch` turns it on. The error leaves this out when it's already on.
3. A system sheet is animating in: snapshot again in a moment.

**Overlays.**
- In Debug, a `console.error` or `console.warn` raises a LogBox toast over the bottom of the screen. The snapshot gets a `[LogBox]` section with the `tap-xy` that hits the toast's ✕ (the ✕ has no element of its own), and `click` refuses targets under it. Tapping the toast itself opens the full-screen LogBox inspector. To keep toasts away entirely, call `LogBox.ignoreAllLogs()` in the app.
- A system sheet from another process (e.g. iOS's "Save Password?" a moment after a login form goes away) replaces the snapshot with an `[Overlay]` section listing the sheet's buttons; `click 'button[text="Not Now"]'` dismisses it.

**`console.log`** reaches `console list` as `info` lines from subsystem `com.facebook.react.log` (`console list --grep <text>`).

## Sample apps

`<skill-dir>/fixtures/SampleApp/build.sh` builds a small SwiftUI app (login form, 200-row product list, tab bar, a JSON POST button) and prints the `.app` path. Set `FS_ORG_ID=<org>` to build it with the Fullstory SDK, which enables `session-url` and network.

**Apps you build yourself must be built by Xcode** (`xcodebuild` or the Xcode app), not assembled by hand. Without the simulated entitlements Xcode embeds, the Fullstory SDK's uploads fail in the simulator, and the consumer sees no session. After signing in, iOS may show a "Save Password?" sheet over the app for a moment; if a snapshot reports a system sheet, snapshot again.

`<skill-dir>/fixtures/RNSampleApp/build.sh` builds the same app in React Native (React Navigation tabs and stack, a `FlatList`, the same `testID`s) with its JS bundle embedded. It needs Node 22.11+ and CocoaPods (with a UTF-8 locale: `export LANG=en_US.UTF-8`, or `pod install` fails), and takes several minutes the first time. `FS_ORG_ID` adds the Fullstory React Native SDK; `CONFIGURATION=Debug` builds for Metro instead.

## Known limits

- Simulator only, Apple Silicon only. No physical devices.
- No hover, file upload, or arbitrary screen sizes: pick a different `--device`.
- Network isn't live, and needs the Fullstory SDK in the app plus network capture enabled for the org.
- The helper uses Apple private frameworks; a new Xcode release may need a plugin update. `doctor` says so when the helper fails to build.
- On iOS 26 a SwiftUI tab bar shows up as one `other "Tab Bar"` element without its tabs; switch tabs with `tap-xy` from a screenshot.
- Scrolling a long list to a far row takes about 3 s per screenful (4–5 s for a React Native `FlatList`, whose tree is larger).
