# Android

**Partly verified.** Setup, the session URL and the selector attribute were checked in October 2026 on macOS 26 (Apple Silicon) with an Android 15 emulator, mostly through a React Native app. A native Kotlin / Java / Compose app has not been through the full loop, and the fix table is still empty. Record anything below that turns out different, or missing, under "Reference updates" in the report.

## Detect

- A Gradle build that applies the FullStory Android plugin or depends on the FullStory SDK, and no `react-native` dependency (otherwise use [react-native.md](react-native.md), and read this file for the emulator and logcat parts).

## Set up an emulator from scratch

Nothing needs to be preinstalled. On macOS:

```bash
brew install go openjdk@17
brew install --cask android-commandlinetools
export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home   # /usr/bin/java is a stub with no runtime
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/build-tools/35.0.0:$PATH
sdkmanager --sdk_root=$ANDROID_HOME --licenses
sdkmanager --sdk_root=$ANDROID_HOME --install "cmdline-tools;latest" "platform-tools" "emulator" \
  "platforms;android-35" "build-tools;35.0.0" "system-images;android-35;google_apis;arm64-v8a"
avdmanager create avd -n sightmap_pixel -k "system-images;android-35;google_apis;arm64-v8a" -d pixel_8
```

The install took about 45 s on a fast connection. The AVD is Android 15, 1080×2400, 420 dpi. `build-tools` matters because `aapt2` lives there, and `sightmap device start --app X.apk` uses it to read the package name.

The `sightmap device` command needs a build from sightmap's `feat/device-android` branch; the npm release has no `device` command yet:

```bash
cd go && GOWORK=off go build -o ~/go/bin/sightmap ./cmd/sightmap
```

## Check the prerequisites

```bash
sightmap device doctor --platform android
```

It passes when `adb` is found and the AVD is listed. Then boot the emulator:

```bash
sightmap device start --device sightmap_pixel
```

- A cold boot took about 78 s. Booting again from the saved snapshot with `-gpu host` took about 16 s.
- If you start the emulator yourself, launch it detached (a new session). Agent harnesses often kill background processes when the shell command ends. `sightmap device start --device <AVD>` detaches it for you.
- If the environment sets `QT_QPA_PLATFORM=wayland` (seen in a desktop agent harness on macOS), the emulator dies at once with "no Qt platform plugin could be initialized". Unset it; macOS only has `cocoa`.

## Sessions

- **Session URL:** the SDK prints `https://app.fullstory.com/ui/<org>/client-session/<id>` to the log right after start. Under React Native it comes from logcat tag `ReactNativeJS`: `[FullStory] Initialized. Session URL: …`. A native sample app with the Fullstory SDK printed it to the console right after start, and again after a relaunch. Find it with:

  ```bash
  sightmap device console list --grep fullstory.com/ui/ --limit 0
  ```

  or `adb logcat -d | grep fullstory.com/ui/`. `review-open` takes that URL once the session has arrived.
- **Upload lag:** not measured on Android. Poll first after about 1½ minutes, as on React Native, and record what you see.
- **Log:** `adb logcat`. The capture error to search for is `terminating FullStory session`.
- If iOS and Android share one app id, tell their sessions apart in `review-summary` before judging either.

## Capture health

On top of Step 2's checks in `SKILL.md`:

1. The app reached its first screen. If not, run `adb logcat -d -b crash` first. A release APK bakes environment into the JS bundle at build time: an Expo release build made without its `EXPO_PUBLIC_*` variables crashed at launch. Gradle doesn't rerun the JS bundle when only the environment changed; force it with `./gradlew app:createBundleReleaseJsAndAssets --rerun`.
2. The session URL appears in the log (above). No URL usually means the SDK never started; check the plugin and the app's org id.
3. The session arrives and holds the taps you made, as in `SKILL.md`.

## Selectors

- **React Native:** a `testID` shows up as `identifier` (alias `testid`) in `sightmap device snapshot` on Android. An existing iOS-oriented `.sightmap/mobile` corpus keyed on `[testid="…"]` matched 5 of 5 interactive elements, all T1, on the Android login screen with no changes.
- **Corpus reuse:** on a second React Native app (Pick'em Club), the same iOS-oriented corpus matched 100% T1 on most Android screens unchanged. The gaps were Pressables with no `testID` (a linked avatar, a pick toggle). A react-native-paper `Tooltip` forwards props to its child, not to its own Pressable, so that press target can't take a `testID`; it stays a scoped (T2) element.
- **Icon fonts:** `sightmap device` drops icon-font glyphs (Unicode private-use characters) from element names, so a tab reads `Rank`, not `\U000f0538, Rank` (sightmap#526).
- **Controls missing from `snapshot`:** if a control is in the screenshot but absent from `sightmap device snapshot`, look for an absolutely positioned wrapper with zero height. Android accessibility hides its children, so taps work but nothing gets named. A full-screen wrapper with `pointerEvents="box-none"` fixes it.
- **Disabled non-controls** (table cells, glyph-only buttons with no `onPress`) are left out of coverage (sightmap#526); don't add `testID`s for them.
- **Native views:** `identifier` is the view's resource-id without its package (`com.example:id/login_submit` becomes `login_submit`).
- **Compose:** `Modifier.testTag` values appear only when an ancestor sets `Modifier.semantics { testTagsAsResourceId = true }`.
- What the *Fullstory session's* snapshot calls these attributes hasn't been checked for native apps. Find a view whose identifier you know in a `review-snapshot` tree, record which attribute carries it, and write the static pass from that.

## Local driving

`sightmap device` on the emulator is a fast way to repeat Steps 3–5 after a fix. Notes from the run:

- A click took about 2 s. `fill` types through `adb input`, so the soft keyboard isn't needed.
- **Known issue (fixed in sightmap#526):** on Android 15 the IME window's frame spans the screen, so `sightmap device` builds before #526 report a full-screen `keyboard` node and refuse clicks as "covered by the keyboard". Run `sightmap device button back` to hide the keyboard before clicking.
- Run it from the project root so `.sightmap/` loads. The subtext-device skill has the full workflow.

## Carried over from React Native

Seen through the mobile SDK under React Native on iOS; confirm before relying on them:

- A frame over 4 MiB ends capture, and the log shows `terminating FullStory session`.

## Fix table

None yet. Add rows from the first field test on a real app.
