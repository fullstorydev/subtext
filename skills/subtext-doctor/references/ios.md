# Native iOS

**Partly verified.** One simulator run against a small SwiftUI sample app (October 2026) confirmed how sessions arrive and what network data looks like. Selectors and the fix table still need a field test on a real Swift / UIKit / SwiftUI app. Follow the loop in `SKILL.md`, and record everything below that turns out different, or missing, under "Reference updates" in the report.

## Detect

- A `Podfile`, `Package.swift` or `Package.resolved` that pulls in the FullStory iOS SDK, and no `react-native` dependency (otherwise use [react-native.md](react-native.md)).

## Sessions

- **Session link:** the SDK reports `https://app.fullstory.com/ui/<org>/client-session/<device-uuid>:<session-uuid>`, from `FS.currentSessionURL`, the `fullstoryDidStartSession` delegate, or the device log with `VerboseLogging`. `review-open` accepts that form directly once the session has arrived.
- **"invalid session_url" from `review-open`** on a link copied from the device usually means the session never reached Fullstory, not that the link is malformed. Check the log for upload errors (below) before anything else.
- **Upload lag:** the SDK uploads in batches about every 20 s, and also when the app goes to the background. A batch is readable within seconds of arriving. Poll first after about 30 s, and record what you see.
- **Log:** Xcode's console, or `xcrun simctl spawn booted log stream` for a simulator. Filter on the app's process; `VerboseLogging` in the `Fullstory` Info.plist dictionary adds upload detail.
- **Build switch:** a native build can't change mid-session the way an over-the-air update can; a relaunch on a new build should start a new session. Confirm that when you first see it.
- **Agent-driven sessions:** taps an agent sends on the simulator through the accessibility layer are recorded like real input; see [react-native.md](react-native.md#sessions).
- **Network capture:** off by default for mobile (Settings → Data Capture → Mobile). With it on, `review-zoom` shows each request's method, URL, status and timing, with response headers at `detail`.

## Selectors

Not yet observed for named components. In the sample run, `review-open`'s flow listed UIKit and SwiftUI class names (e.g. `SwiftUI.TabItem.RootView`, `UITrackingElementWindowController`), and tap text was masked by default privacy. Find a view whose identifier you know (an `accessibilityIdentifier`, say) in a `review-snapshot` tree, record which attribute carries it, and write the static pass from that.

## Carried over from React Native on iOS

These were seen through the same mobile SDK under React Native. Expect them here too, but confirm before relying on them:

- A bundle the server rejects as too large ends capture: the log shows `Received HTTP Status Code: 206` and `terminating FullStory session`.
- A bare `_uialertcontrolleractionview` is a system alert or action sheet; leave it out of the bar.
- Each network request may appear twice at the same millisecond; count unique requests.

## Fix table

Rows marked *open* weren't confirmed in a real-app field test.

| Symptom | Cause | Fix | Gap belongs to |
|---|---|---|---|
| Simulator session never arrives; `review-open` says "invalid session_url"; the device log shows `NSURLErrorDomain Code=-1` on every `…fullstory.com/rec/bundle` upload, after "background session setup will wait for reply" | The app wasn't built by Xcode (e.g. compiled with `swiftc` and assembled by hand), so it lacks the simulated entitlements Xcode embeds, and iOS's background upload service rejects the SDK's uploads | Build with `xcodebuild` or the Xcode app | App build |
| `review-zoom` shows no network requests at all | Mobile network capture is off for the org (the default) | Turn it on in Settings → Data Capture → Mobile | Org settings |
