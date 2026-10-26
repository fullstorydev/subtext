# Native Android

**Unverified.** No field test has run against a Kotlin / Java / Compose app yet. Follow the loop in `SKILL.md`, and record everything below that turns out different, or missing, under "Reference updates" in the report.

## Detect

- A Gradle build that applies the FullStory Android plugin or depends on the FullStory SDK, and no `react-native` dependency (otherwise use [react-native.md](react-native.md)).

## Sessions

- **Log:** `adb logcat`.
- If iOS and Android share one app id, tell their sessions apart in `review-summary` before judging either.

## Selectors

Not yet observed. Views can be identified by `resource-id`, content description, or a Compose test tag; find one you know in a `review-snapshot` tree, record which attribute carries it, and write the static pass from that.

## Carried over from React Native

Seen through the mobile SDK under React Native on iOS; confirm before relying on them:

- A frame over 4 MiB ends capture, and the log shows `terminating FullStory session`.

## Fix table

None yet. Add rows from the first field test.
