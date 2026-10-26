# Native iOS

**Unverified.** No field test has run against a Swift / UIKit / SwiftUI app yet. Follow the loop in `SKILL.md`, and record everything below that turns out different, or missing, under "Reference updates" in the report.

## Detect

- A `Podfile`, `Package.swift` or `Package.resolved` that pulls in the FullStory iOS SDK, and no `react-native` dependency (otherwise use [react-native.md](react-native.md)).

## Sessions

- **Log:** Xcode's console, or `xcrun simctl spawn booted log stream` for a simulator.
- **Build switch:** a native build can't change mid-session the way an over-the-air update can; a relaunch on a new build should start a new session. Confirm that when you first see it.

## Selectors

Not yet observed. Find a view whose identifier you know (an `accessibilityIdentifier`, say) in a `review-snapshot` tree, record which attribute carries it, and write the static pass from that.

## Carried over from React Native on iOS

These were seen through the same mobile SDK under React Native. Expect them here too, but confirm before relying on them:

- A frame over 4 MiB ends capture, and the log shows `terminating FullStory session`.
- A bare `_uialertcontrolleractionview` is a system alert or action sheet; leave it out of the bar.

## Fix table

None yet. Add rows from the first field test.
