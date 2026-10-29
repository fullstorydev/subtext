# React Native

Field-tested on iOS with Fabric (Expo, October 2026): two runs, 38 of 40 and then 74 of 75 taps resolved. Two later agent-driven simulator runs added the capture and network findings below. Android is unverified; see [Android](#android).

## Detect

- `package.json` depends on `react-native` or `expo`, and on `@fullstory/react-native`.
- The native corpus usually sits in its own directory, often `.sightmap/mobile/`, beside any web corpus.

## Sessions

- **What marks a session as this platform:** `review-summary` shows `Visual Context Update` / `safeAreaInsets` custom events and the corpus's screen-style component names, with no `# tab A · https://…` page headers or `page-load` lines. An app can send the same custom events from its web build too, so check for the page headers before trusting the events. If iOS and Android share one app id, tell their sessions apart in `review-summary` before judging either.
- **Build switch:** a session can start before an over-the-air update is published and switch to the new code when the tester checks for updates or relaunches. The switch is a `Visual Context Update` right after the update check or relaunch.
- **Upload lag:** about 1½ minutes from the last tap. In the field test, the first summary with the last tap came at about 1½ minutes and `review-open` at about 2½. A later simulator run saw network events 35 s to 2 minutes behind the app. The SDK uploads in batches about every 20 s, so nothing is readable sooner than that.
- **Log:** Xcode's console or `xcrun simctl spawn booted log stream` on iOS; `adb logcat` on Android. The capture error to search for is `terminating FullStory session`, usually with `Received HTTP Status Code: 206` and sometimes `Maximum number of views reached` just before it.
- **Agent-driven sessions:** on the iOS Simulator, taps an agent sends through the accessibility layer (a local simulator driver such as `sightmap device`) are recorded like real input and resolve the same way. In field tests they lined up with the agent's own action log to within about 30 ms. A local simulator run is therefore a fast way to repeat Steps 3–5 after a fix, before real users reach it.
- **Dev and simulator builds:** they record into whatever org the app's config names. Point debug builds at a separate dev org so test sessions don't land in production.
- **Network capture:** off by default for mobile (Settings → Data Capture → Mobile). With it off, `review-zoom` shows no requests at all, and the corpus's `requests:` can't be checked.

## Static pass

Point `corpus_dir` at the native corpus and `app_dir` at the React Native app, then run:

```bash
corpus_dir=.sightmap/mobile
app_dir=mobile
scratch=$(mktemp -d)
grep -rhoE '\[testid="[^"]+"\]' "$corpus_dir" | sed -E 's/\[testid="([^"]+)"\]/\1/' | grep -vxE '\.+|…' | sort -u > "$scratch/exact"
grep -rhoE '\[testid\^="[^"]+"\]' "$corpus_dir" | sed -E 's/\[testid\^="([^"]+)"\]/\1/' | grep -vxE '\.+|…' | sort -u > "$scratch/prefix"
git grep -hoE "testID(=\{?|: *)[\"'][^\"']+[\"']" -- "$app_dir/*.tsx" "$app_dir/*.jsx" ':!*.test.*' \
  | sed -E "s/testID(=\{?|: *)[\"']([^\"']+)[\"']/\2/" | sort -u > "$scratch/source"
git grep -hoE 'testID(=\{|: *)`[^`$]*' -- "$app_dir/*.tsx" "$app_dir/*.jsx" ':!*.test.*' \
  | sed -E 's/testID(=\{|: *)`//' | sort -u > "$scratch/template"
cat "$scratch/source" "$scratch/template" > "$scratch/all"
comm -13 "$scratch/exact" "$scratch/source" > "$scratch/unmatched"
echo "# exact selectors with no literal testID:"
comm -23 "$scratch/exact" "$scratch/source"
echo "# prefix selectors with no testID starting with them:"
awk 'FILENAME==ARGV[1]{s[$0];next}{for(k in s)if(index(k,$0)==1)next;print}' "$scratch/all" "$scratch/prefix"
echo "# literal testIDs no selector covers:"
awk 'FILENAME==ARGV[1]{p[$0];next}{for(k in p)if(index($0,k)==1)next;print}' "$scratch/prefix" "$scratch/unmatched"
```

An exact selector built from a template literal (`` testID={`row-${id}`} ``) shows up as dead here; check those against `$scratch/template` before deleting them. A repo may have its own checker, for example `scripts/sightmap/check-native-testids.py`.

## Where `testID` lands

The SDK emits `testid` only on React Native component views (`rct*componentview`), so `[testid="…"]` works there. A `testID` handed to a **native library view** — a glass or blur card, a map, a video player — shows up only as `#id`, and `[testid="…"]` never matches it. Either move the `testID` onto a React Native `View` wrapper with `collapsable={false}`, or select `#id`.

## Capture traps to flag

- `fs-exclude` on a large or full-screen container.
- Heavy decorative views, such as an SVG background with hundreds of paths.
- A `testID` on a plain wrapper `View` (Fabric may flatten it away).
- A `testID` passed into a shared component that forwards it to a native library view. Read the shared component and follow where `testID` lands; in the field test one shared card component caused 22 dead corpus entries and blocked 29 nested children.

## Expected noise

- A bare `_uialertcontrolleractionview` (iOS) is a system alert or action sheet, outside the React Native tree. Count it as expected and leave it out of the bar.
- Raw names like `rctviewcomponentview` and `uiview` in `review-open`'s map appear for resolved taps too.
- Every network request appearing twice at the same millisecond, while the app's server logged it once. Count unique requests. It's an SDK or ingest gap; report it.
- `review-zoom` at `detail` showing response headers only, with no request headers, bodies or query strings, even where the org's rules might capture more. Check the org's header allowlists and body rules before calling it a gap. Endpoint names show at `machine` grain; `standard` folds traffic into counts.

## Fix table

Rows marked *open* weren't confirmed fixed in the field tests.

| Symptom | Cause | Fix | Gap belongs to |
|---|---|---|---|
| Session ends early with few events; device log shows `terminating FullStory session` (HTTP 206) | The server rejected a bundle as too large and the SDK stopped capturing: a single frame over 4 MiB, or a very large view tree (`Maximum number of views reached` in the log). A field run saw sessions end 51 s to 5½ min in, with none of the run's later activity ingested | Find the heavy view (often a complex SVG background) and rasterize it with `fsClass="fs-rasterize"`; reduce always-mounted offscreen views | App; SDK should report it |
| `review-zoom` shows no network requests at all | Mobile network capture is off for the org (the default) | Turn it on in Settings → Data Capture → Mobile; add header allowlists and body rules for headers and bodies | Org settings |
| Simulator uploads all fail with `NSURLErrorDomain Code=-1` on the `FullStory-Background` session; sessions never arrive | The simulator build was made with `CODE_SIGNING_ALLOWED=NO`, so the executable has no simulated entitlements (`__TEXT,__entitlements`), and iOS's background upload service rejects the SDK's uploads. Check with `otool -s __TEXT __entitlements <App>.app/<App>`; `codesign -d --entitlements -` can't tell | Rebuild with signing allowed: `npx expo run:ios`, or the same `xcodebuild` without `CODE_SIGNING_ALLOWED=NO`. No team, certificate or Apple ID needed. Re-signing the built app with entitlements fails to launch (AMFI -424). Unverified for the Debug `*.debug.dylib` layout; expected to be the same | App build |
| Test or simulator sessions show up in the production org | Debug builds use the production org ID | Use a separate dev org ID for debug builds (e.g. per build configuration) | App |
| No taps recorded while screens change | `fs-exclude` on a large container drops every tap inside its frame | Use `fs-rasterize` for decorative views; keep `fs-exclude` on the sensitive element itself. Both are set with `fsClass` | App; docs |
| Corpus selector exists in source but never matches; the snapshot shows the view as `somenativeview#id` with no `testid` | The `testID` was passed to a native library view (e.g. `LiquidGlassView`, `BlurView`), which the SDK exposes only as `#id` | Move the `testID` onto a React Native `View` wrapper with `collapsable={false}`, or select `#id`. Fix it once in the shared component | App; SDK should emit `testid` |
| Tap resolves to the parent list or container, not the row | Fabric flattened the `testID`'d wrapper `View` | Add `collapsable={false}` to the wrapper, or put the `testID` on the `Pressable` itself | App |
| Tap on text inside a card lands on `rctparagraphcomponentview`, unresolved | The text node is the hit target, and nothing named encloses it in the captured tree | *Open.* Put the `testID` on the enclosing `Pressable` with `collapsable={false}`, then check whether the text tap now resolves to it | App; possibly Subtext matching |
| Tap ends at a bare `_uialertcontrolleractionview` (iOS) | A system alert or action sheet | None in app or corpus. Leave it out of the bar, or log a custom event when the alert's buttons are pressed | Subtext could name system dialog actions |
| Native (non-React) component never named | Native views don't carry React Native props | Wrap it in a React Native `View` with a `testID` and `collapsable={false}`, and select `[testid="…"]`. `fsClass` sets capture behavior; it isn't a naming hook | App |

## Android

Unverified. React Native maps `testID` to `resource-id` on Android, but whether the SDK then emits `[testid]`, `#id` or `resource-id` hasn't been observed. Blur fallbacks such as `BlurView` are native views too, so expect the same `#id`-only behavior. Record what the snapshot shows under "Reference updates".
