# React Native

Field-tested on iOS with Fabric (Expo, October 2026): two runs, 38 of 40 and then 74 of 75 taps resolved. Android is unverified; see [Android](#android).

## Detect

- `package.json` depends on `react-native` or `expo`, and on `@fullstory/react-native`.
- The native corpus usually sits in its own directory, often `.sightmap/mobile/`, beside any web corpus.

## Sessions

- **What marks a session as this platform:** `review-summary` shows `Visual Context Update` / `safeAreaInsets` custom events and the corpus's screen-style component names. If iOS and Android share one app id, this is also how you tell the platforms apart.
- **Build switch:** a session can start before an over-the-air update is published and switch to the new code when the tester checks for updates or relaunches. The switch is a `Visual Context Update` right after the update check or relaunch.
- **Upload lag:** about 1½ minutes from the last tap. In the field test, the first summary with the last tap came at about 1½ minutes and `review-open` at about 2½.
- **Log:** Xcode's console or `xcrun simctl spawn booted log stream` on iOS; `adb logcat` on Android. The capture error to search for is `terminating FullStory session`.

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

## Fix table

Rows marked *open* weren't confirmed fixed in the field tests.

| Symptom | Cause | Fix | Gap belongs to |
|---|---|---|---|
| Session ends early with few events; device log shows `terminating FullStory session` | A single frame over 4 MiB was rejected (HTTP 206) and the SDK stopped capturing | Find the heavy view (often a complex SVG background) and rasterize it with `fsClass="fs-rasterize"` | App; SDK should report it |
| No taps recorded while screens change | `fs-exclude` on a large container drops every tap inside its frame | Use `fs-rasterize` for decorative views; keep `fs-exclude` on the sensitive element itself. Both are set with `fsClass` | App; docs |
| Corpus selector exists in source but never matches; the snapshot shows the view as `somenativeview#id` with no `testid` | The `testID` was passed to a native library view (e.g. `LiquidGlassView`, `BlurView`), which the SDK exposes only as `#id` | Move the `testID` onto a React Native `View` wrapper with `collapsable={false}`, or select `#id`. Fix it once in the shared component | App; SDK should emit `testid` |
| Tap resolves to the parent list or container, not the row | Fabric flattened the `testID`'d wrapper `View` | Add `collapsable={false}` to the wrapper, or put the `testID` on the `Pressable` itself | App |
| Tap on text inside a card lands on `rctparagraphcomponentview`, unresolved | The text node is the hit target, and nothing named encloses it in the captured tree | *Open.* Put the `testID` on the enclosing `Pressable` with `collapsable={false}`, then check whether the text tap now resolves to it | App; possibly Subtext matching |
| Tap ends at a bare `_uialertcontrolleractionview` (iOS) | A system alert or action sheet | None in app or corpus. Leave it out of the bar, or log a custom event when the alert's buttons are pressed | Subtext could name system dialog actions |
| Native (non-React) component never named | Native views don't carry React Native props | Wrap it in a React Native `View` with a `testID` and `collapsable={false}`, and select `[testid="…"]`. `fsClass` sets capture behavior; it isn't a naming hook | App |

## Android

Unverified. React Native maps `testID` to `resource-id` on Android, but whether the SDK then emits `[testid]`, `#id` or `resource-id` hasn't been observed. Blur fallbacks such as `BlurView` are native views too, so expect the same `#id`-only behavior. Record what the snapshot shows under "Reference updates".
