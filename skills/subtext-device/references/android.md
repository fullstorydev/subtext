# Android

The rest of this skill is written for the iOS Simulator. This file covers what differs on an Android emulator. Facts here come from a local run on macOS 26 with an Android 15 emulator (October 2026); native Kotlin / Compose apps have been seen less than React Native.

Needs a `sightmap` built from sightmap's `feat/device-android` branch (the npm release has no `device` command yet). Emulator setup from scratch, and the environment gotchas, are in `subtext-doctor`'s [android.md](../../subtext-doctor/references/android.md#set-up-an-emulator-from-scratch).

## What changes from the iOS flow

| iOS flow | On Android |
|---|---|
| `sightmap device network` for routes, headers, bodies | **Doesn't exist on Android.** The Fullstory session (`review-*`) is the only network source |
| Local-only copy via `Info.plist` and `codesign` | Not applicable, and no Android recipe has been verified. Still ask first. If the answer isn't an explicit yes, don't run a build that records; use one without the SDK, or tell the user you can't guarantee it |
| `Debug` build with `get-task-allow` for full capture | Not needed. `uiautomator` reads the tree with no instrumentation |
| Entitlements / `CODE_SIGNING_ALLOWED` upload failures | Not applicable |
| Wrapper `testID`s are dropped from the tree | Not checked on Android. A React Native `testID` appears as `identifier` / `testid`; an iOS corpus keyed on `[testid="…"]` matched 5 of 5 on a login screen |

So the degrade list in `SKILL.md` collapses to: the Fullstory session with network capture on (level 2), or nothing (no routes, no bodies). Author `requests:` routes and `properties:` paths from `review-zoom` at `machine` resolution, and decide that bodies aren't available unless the org's capture rules record them. Use `sightmap device console list` and `snapshot` for the free local signals.

## Session URL

The SDK prints it to the log right after start, and again after a relaunch. Under React Native it's logcat tag `ReactNativeJS`: `[FullStory] Initialized. Session URL: https://app.fullstory.com/ui/<org>/client-session/<id>`. A native Android sample app (Fullstory SDK) printed it to the console too.

```bash
sightmap device console list --grep fullstory.com/ui/ --limit 0
```

The newest match wins, as in "Finding the session URL" in `SKILL.md`. `review-open` takes it as is.

If the app doesn't reach its first screen, run `adb logcat -d -b crash` first. A release APK bakes environment variables in at JS bundle time: an Expo release build without its `EXPO_PUBLIC_*` variables crashed at launch.

## The eyes loop: improve an app's sightmap on the emulator

Use this when the goal is a better `.sightmap/` for the app, not a session read. No SDK or credits needed.

1. **Build the APK** (for example `./gradlew assembleDebug`, or the React Native / Expo equivalent).
2. **Start it from the repo root**, so `.sightmap/` loads (there is no upward search):

   ```bash
   sightmap device start --app app/build/outputs/apk/debug/app-debug.apk --detach
   ```

   This needs `aapt2` (from `build-tools`) on `PATH`. An AVD that isn't running is booted; add `--device <AVD>` if there are several.
3. **Snapshot** the screen: `sightmap device snapshot`.
4. **Read the `[Coverage]` line**, for example `3 interactive · 3 direct T1 (100%) · 0 scoped T2 (0%) · 0 orphaned T3 ✓`, and list the orphaned T3 elements: interactive elements no component names.
5. **Fix them:** edit the `.sightmap` YAML (a selector on `identifier` / `testid`, which is the resource-id without its package), or add `testID`s / resource ids / Compose test tags to the app and rebuild. In Compose, `Modifier.testTag` only shows if an ancestor sets `Modifier.semantics { testTagsAsResourceId = true }`.
6. **Re-snapshot** and repeat until orphaned T3 is 0 on each screen. Navigate with `click`, `fill` and `scroll`; `fill` types through `adb input`, so no soft keyboard is needed.

Notes:

- A click took about 2 s on the emulator, and a snapshot a second or more, because `uiautomator` waits for a quiet moment before it dumps.
- Frames and coordinates are dp, not pixels: divide screenshot pixels by dpi/160 (2.625 on the 420 dpi Pixel 8 AVD).
- If a snapshot fails with "could not get idle state", turn animations off: `adb shell settings put global animator_duration_scale 0` (also `transition_animation_scale` and `window_animation_scale`).
- **Known issue:** with a hardware keyboard present, Gboard shows a small floating toolbar, but its window frame is full-screen. `sightmap device` then reports a full-screen `keyboard` node and refuses clicks as "covered by the keyboard". A fix is in progress; until then run `sightmap device key back` (or dismiss the keyboard) before clicking.

## Producer and consumer

The split in [producer-consumer.md](producer-consumer.md) still applies, with the consumer reading only the Fullstory session (no local capture to follow). Wherever it says `network list` / `network get`, read `review-zoom` instead.
