---
name: subtext-device
description: Read Fullstory data from a native iOS or React Native app while driving it in the local iOS Simulator with `sightmap device` — combine the app's Fullstory session (which tap and screen caused each request) with `sightmap device network` (exact routes, headers and bodies, live), find the session URL, notice when the SDK ends a session, and split the work into a producer that drives and a consumer that reads, running at the same time. Use when an agent drives an iOS app on the Simulator and needs its captured network or console data, or authors `.sightmap/` requests and messages from it.
---

# Subtext × sightmap device

> **PREREQUISITE:** Read `sightmap-device` for driving the Simulator, `subtext-session` for the `review-*` tools, and `subtext-sightmap` for corpus upload. Needs a `sightmap` CLI that has `device` and `device network` (`sightmap device network list --help` answers).

**Type:** Workflow — drive the app locally, read what its Fullstory SDK captured.

`sightmap device` drives the app, reads its accessibility tree and console, and captures its network traffic locally with no vendor SDK (`sightmap device network`). The app's Fullstory SDK session adds what local capture can't: which tap and screen caused each request, in the same timeline as navigation and `FS.log`. This skill combines the two, and covers getting from a simulator run to its session and reading it while the run is still going.

## How the SDK delivers data

- **Capture is in the app.** The SDK records interactions, navigation, network requests (method, URL, status, timing) and `FS.log` messages as they happen. Headers and bodies are captured only when the org's network header allowlists and body rules ask for them.
- **Upload is batched.** The SDK uploads a bundle about every **20 s**, and also when the app goes to the background or relaunches. A bundle is readable within seconds of arriving, so a request is visible roughly 5–30 s after it happens (field runs saw up to 2 min).
- **Reads are point-in-time.** Each `review-open` returns the session as uploaded so far and costs **10 credits**. `review-zoom` on that client is free but never shows newer data; open the session again for that.
- **Grains.** Endpoint names (method + URL) show at `machine`; `standard` collapses traffic into counts. `detail` adds response headers only, unless the org's capture rules record more. Use `resolution={"network": "machine", "console": "standard"}`, and `detail` only on the requests whose headers matter.
- **Console:** only `FS.log` reaches Fullstory. `print` / `os_log` / `console.log` output is local only; read it live with `sightmap device console list`.
- **Recording isn't reading.** Fullstory records views from inside the app; `sightmap device` reads the accessibility tree from outside. A healthy replay doesn't mean `snapshot` can see the screen, and an empty snapshot doesn't mean recording broke.
- **Wrapper `testID`s don't reach the simulator.** Fullstory captures a `testID` on a plain wrapper view, so a corpus built from sessions often nests components under those wrappers. iOS accessibility exposes only the leaf elements, so nested selectors match little in `sightmap device`. Write the device corpus with leaf selectors (the control's own `testID`); in a field test, that took every screen from 14–83% to 100% coverage.

## Two network sources, used together

| | Fullstory session (`review-*`) | `sightmap device network` |
|---|---|---|
| Best for | **Attribution:** the tap and screen behind each request, navigation, `FS.log` | **Detail:** full URL and query, headers, request and response bodies |
| Timing | ~20 s upload lag; each `review-open` costs 10 credits | Live, within milliseconds; free |
| Coverage | All of the app's networking; matches production review | URLSession traffic (React Native `fetch` included) |
| Needs | The SDK, network capture on, the MCP on the same org | A Debug build signed with `get-task-allow` (normal Xcode Debug builds) for full detail |

Use both on every run: start with `sightmap device start … --network auto` (the default), and check `sightmap device status --json` → `network.sources` to see which local source is active. Author `requests:` routes, methods and `properties:` field paths from `network list` / `network get`; decide each request's name and the view it belongs to from the Fullstory session. Join the two by **time, method and URL**: both use the Mac's clock, typically within a second.

**When a source is missing, degrade in this order:**
1. **Fullstory session + local `har` capture:** the full picture.
2. **Fullstory session only** (`network` reports only `summary`, e.g. a Release build without `get-task-allow`): names and attribution, with bodies only where the org's rules capture them.
3. **Local capture only** (no SDK, a session that ended with a 206, or the consumer is out of credits): `network list` for routes and bodies; attribute each request to the producer's run-log step just before it.
4. **`summary` source only:** hosts, status and timing; no routes. Note in the report that `requests:` couldn't be authored.

**Privacy:** local capture sees unmasked traffic. Output is redacted by default (auth headers, cookies, and any key matching token, password, secret or key); leave `--unredacted` off. Use bodies only to find **field paths** for `properties:`, and never copy captured values into `.sightmap/`, the run log or a report.

## Requirements

- For full local capture, a **Debug** build (signed with `get-task-allow`, as Xcode Debug builds are). A Release build falls back to the `summary` source.
- The Fullstory SDK in the app, and an app **built by Xcode** (`xcodebuild` or the Xcode app). A hand-assembled app lacks the simulated entitlements, and every SDK upload fails inside the simulator.
- **Mobile network capture turned on** for the org (Settings → Data Capture → Mobile). It's off by default, and nothing but the settings page can turn it on.
- The Subtext MCP authenticated to the **same org** the app records to.
- Debug builds record to a **separate dev org**, so simulator runs stay out of production data. Authenticate the MCP to that org for the run.

If sessions never arrive, are implausibly short, or lose their interactions, run `subtext-doctor` before reading anything into the data.

## Finding the session URL

The SDK logs its session URL to the app's console; native apps can also log `FS.currentSessionURL` themselves, and a React Native `console.log('session', url)` works. Search the console for it:

```bash
sightmap device console list --grep fullstory.com/ui/ --limit 0
```

Any `https://app.fullstory.com/ui/<org>/session/…` or `…/client-session/…` URL in any line, source or level counts, and the **newest wins**: a relaunch can start a new session. The list is oldest first, so that's the last match. The console keeps the most recent 5,000 entries, so write the URL down once you have it. `review-open` takes it as is.

## When the SDK ends a session

The SDK can end a session for good. Watch the console for its termination lines:

```bash
sightmap device console list --grep terminat --limit 0
```

- `Received HTTP Status Code: 206, terminating FullStory session`: the server rejected a bundle and told the SDK not to retry, mostly because it was too large (a very large view tree). A preceding `Maximum number of views reached` warning usually says why. It's an app / SDK issue to report: relaunching gets a new session, but the same screens will likely end it again.
- The `202` variant: recording is blocked for the app or org.
- `capture is terminated; not resuming session`.

Nothing after that point is recorded. `sightmap device relaunch` starts a new session with a new URL; find it as above.

**`review-open` says "invalid session_url"?** The link is usually fine: the session never reached Fullstory, because it ended before its first bundle arrived or never uploaded (see Requirements). Check the console for the lines above, then relaunch.

## Producer and consumer

Because data lags the app by up to ~30 s, one agent that taps, waits and reads spends most of its time waiting. Split the work into two subagents that **run concurrently** for the whole run: a producer that drives with `sightmap device`, and a consumer that follows local network capture live, reads the session for attribution, and lines both up against the producer's run log. See [references/producer-consumer.md](references/producer-consumer.md) for the roles, the ownership split in `.sightmap/`, the feedback file and the credit budget.

Run the producer alone when only UI or component work is needed. For quick local signals that need no SDK and no credits, use `network list`, `console list` and `snapshot`.

## See also

- `sightmap-device` — the Simulator commands, iOS selectors and React Native notes (bundled).
- `subtext-doctor` — check that capture is healthy before trusting the data.
- `subtext-sightmap` — upload the `.sightmap/` corpus into a review.
- `subtext-session` — the `review-*` tool catalog.
