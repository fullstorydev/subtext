---
name: subtext-mobile-audit
description: Audit a native mobile app's Fullstory capture and sightmap coverage right after setup. Gates on capture health first, then measures how many recorded taps resolve to named sightmap components and fixes the gaps. Use after installing the Fullstory mobile SDK (React Native, iOS, Android) or authoring a mobile .sightmap/ corpus, or when mobile session reviews name a screen or list where you expected the control that was tapped.
---

# Mobile Setup Audit

> **PREREQUISITE:** Read `subtext-shared`, `subtext-session` and `subtext-sightmap` for tool conventions and corpus upload.

**Type:** Workflow — a loop you repeat until coverage clears the bar.

Mobile sessions are reviewed from production capture, not by driving a device. That makes setup quality the whole game: a session that was cut short or dropped its taps looks exactly like a sightmap gap, and Subtext won't tell you which one you're looking at. So this audit checks **capture health first**, and only then measures **tap resolution** — the share of recorded taps that land on a named sightmap component.

## When to use

**Use when:**
- The Fullstory mobile SDK was just added to an app, or a mobile `.sightmap/` corpus was just written.
- Mobile reviews name a screen, list or container where you expected the control that was tapped.
- A mobile session looks implausibly short or has no taps.

**Skip when:**
- The app is web-only — use `subtext-review` and the sightmap skills directly.
- You want to drive a simulator or device. This plugin doesn't; the audit works on sessions a person already recorded.

## Inputs

- The app's source root, with its `.sightmap/` corpus. Find which directory holds the native corpus (often `.sightmap/mobile/`) and which holds the React Native app; a repo can also have a web corpus.
- A session: its URL, or the tester's email / user id so `review-list-sessions` can find it.
- What the tester did: which flows, roughly how many taps, and the wall-clock start and end time.
- The device log from that run, if available: Xcode's console or `xcrun simctl spawn booted log stream` for iOS, `adb logcat` for Android.

If the tester points at an existing session instead of recording a planned one, ask what they remember: rough length, flows, anything distinctive they did. Record time-to-reviewable as not measured.

Testers often can't give a tap count or a device log. Then check that each flow you asked them to walk appears, and mark the log row unchecked, not passed.

## The loop

### Step 1: Static pass — no credits

Check the corpus against source before spending anything on a session. This catches dead and missing selectors only; a selector can exist in source and still never match at runtime (see Steps 1.2 and 4).

1. **Selectors exist in source.** Point `corpus_dir` at the native corpus and `app_dir` at the React Native app, then run:

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

   An exact selector built from a template literal (`` testID={`row-${id}`} ``) shows up as dead here; check those against `$scratch/template` before deleting them. If the repo has its own checker (for example `scripts/sightmap/check-native-testids.py`), run it too and trust whichever reports fewer false positives.
2. **Where the `testID` lands.** The SDK emits `testid` only on React Native component views (`rct*componentview`), so `[testid="…"]` works there. A `testID` handed to a **native library view** — a glass or blur card, a map, a video player — shows up only as `#id`, and `[testid="…"]` never matches it. Either move the `testID` onto a React Native `View` wrapper with `collapsable={false}`, or select `#id`. A parent selector that never matches also blocks every component nested under it in the corpus.
3. **Corpus memory.** Read the corpus `memory` entries. Corpora generated with web-first tooling can claim mobile isn't covered or that sightmap is DOM-only; rewrite those entries, because they steer every later review.
4. **Known capture traps in source.** Flag for Step 5:
   - `fs-exclude` on a large or full-screen container.
   - Heavy decorative views, such as an SVG background with hundreds of paths.
   - A `testID` on a plain wrapper `View` (Fabric may flatten it away).
   - A `testID` passed into a shared component that forwards it to a native library view. Read the shared component and follow where `testID` lands.

### Step 2: Find the session

Have the tester run the key flows on a device or simulator with a build that includes the SDK. Ask them to note the start time, the flows, roughly how many taps, and when they stopped, and to keep the device log.

Find the session with `review-list-sessions`, scoped by `email_address` / `user_uid` when the build identifies users, or org-wide for the most recent captures. It returns only URLs and creation times — no platform, duration or event count — and every call spends credits. To tell candidates apart, run `review-summary` on each: mobile sessions show `Visual Context Update` / `safeAreaInsets` custom events and `Mobile*`-style component names. If iOS and Android share one app id, this is also how you tell the platforms apart.

**Confirm the session ran the build under test.** A session can start before an over-the-air update is published and switch to the new code partway through, when the tester checks for updates or relaunches. Find the reload (a `Visual Context Update` right after the update check or relaunch) and judge only the taps after it.

**Taps can join an existing session.** After an idle gap, a tester's second pass may land in the same session, so `review-list-sessions` shows nothing new. Uploads can also lag the last tap by about 1½ minutes. Poll with `review-summary` no more often than every 2–3 minutes, since each poll costs credits, and record:
- when the first summary contains the tester's last tap, and
- when `review-open` first succeeds (Step 4.1).

Both measure time-to-reviewable from the last tap. Report both, and say if you waited on purpose.

### Step 3: Capture-health gate

Use `review-summary` first — it's the cheapest call, and capture health doesn't need the corpus. Compare what was captured with what the tester did:

| Check | How to read it | Red flag |
|---|---|---|
| Session end | The summary has no duration. Add the last event's timestamp to the session start, and compare that wall-clock time with when the tester stopped. Idle stretches inside the span aren't a red flag | Ends early, e.g. 5–35 s into a minutes-long run |
| Taps | Count `click` lines and add the merged `(xN …)` counts. The map's `interaction` count includes text changes, so it isn't a tap count | Zero or a handful while screens clearly changed |
| Screens | Every flow the tester walked appears | Flows missing after a certain point |
| Device log | Search for capture errors | `terminating FullStory session` |

`review-close` reports how long the review ran, not the session length.

The summary may already show component names from a corpus stored by an earlier upload (`resolved_corpus_id` on `review-open`). Don't judge tap resolution until you've uploaded the current corpus in Step 4.

**If any check fails, stop.** Fix capture with the first rows of the [fix table](#fix-table), ship a new build, and record a new session. Measuring tap resolution on a broken capture produces wrong answers.

### Step 4: Tap-resolution pass

1. Before the single `review-open`, check with `review-summary` that its last event matches the tester's stop time. If it doesn't, wait about 2 minutes and check again. Then `review-open` the session **once** and keep the `client_id`. It costs far more than the other calls, so do every remaining step on this handle.
2. Upload the corpus right away (see `subtext-sightmap`); the token expires quickly. `sightmap export --url <sightmap_upload_url>` sends pretty-printed JSON, and a corpus of more than a few hundred KB fails with HTTP 413. For a large corpus, go straight to a minified upload. The token survives a failed POST, so you can also fall back to this after a 413:

   ```bash
   corpus_json=$(mktemp)
   sightmap export -o "$corpus_json" \
     && python3 -c 'import json,sys;json.dump(json.load(open(sys.argv[1])),sys.stdout,separators=(",",":"))' "$corpus_json" \
     | curl -sS -X POST -H 'Content-Type: application/json' --data-binary @- '<sightmap_upload_url>'
   rm -f "$corpus_json"
   ```

   A 200 response reports `components` and `corpusId`. To confirm the corpus reached the review, check that the first `review-snapshot` shows its memory as a `[Guide]` block.
3. List every tap with `review-zoom resolution={ click: "machine" }`. It returns only clicks; `interaction` would add every keystroke and custom event, and `detail` adds nothing for clicks.
4. Sort taps by the **last bracket** on each line:
   - **Resolved:** the last bracket is the control that was tapped, e.g. `[MobileNotificationsScreen] [MobileNotificationSwitch id="notif-switch-leaderboard-badge"]`.
   - **Unresolved:** the last bracket is a screen, scroll container or list, e.g. `[MobileParticipantsScreen] "***^*"`.

   Before calling a tap unresolved, read the corpus entry for its last bracket. A name can sound like a container when its selector targets the tapped control (`MobileTopBar` selecting the club-logo button, say). Then the tap resolved; propose renaming the entry after the control. A bare system element such as `_uialertcontrolleractionview` is expected; see the [fix table](#fix-table).

   Repeated `[MobileAppRoot]`-style prefixes are noise. Ignore the raw element names in `review-open`'s map (`rctviewcomponentview`, `uiview`); they appear for resolved taps too, so they can't be used to count misses.
5. For each unresolved tap only, call `review-snapshot` at its timestamp with `lens: "full"` and `include: ["tree"]`. The tree can be 60–100 KB, so save it and search it rather than reading it inline. Neither the click nor the tree marks the element that was hit. Under the nearest named ancestor, find the element whose text matches the click's masked text: `*` runs and `^` word breaks give the lengths. Expect the snapshot to show the screen just after the tap. If nothing matches, record "hit element unknown" instead of guessing.
6. `review-close` when done.

Masked text showing as `"**"` is the SDK's default privacy masking, not a gap.

### Step 5: Classify and fix

Match each unresolved tap, and each failed health check, to a row in the [fix table](#fix-table). Propose app-code and corpus fixes and apply them once the user approves; collect SDK or Subtext gaps for the report instead of working around them silently.

### Step 6: Repeat

Ship the fixes, record a new session over the same flows, and run Steps 3–5 again. Agree the bar with the user. A reasonable one is every tap on an interactive control resolving, with only known, reported gaps left. Then run Steps 3–4 on the first real production sessions, since real users hit screens the tester didn't.

<a id="fix-table"></a>
## Fix table

Rows marked *open* weren't confirmed fixed in the field tests this table comes from (React Native with Fabric on iOS, October 2026). Treat them as best current advice and report what you find.

| Symptom | Cause | Fix | Gap belongs to |
|---|---|---|---|
| Session ends early with few events; device log shows `terminating FullStory session` | A single frame over 4 MiB was rejected (HTTP 206) and the SDK stopped capturing | Find the heavy view (often a complex SVG background) and rasterize it. In React Native, set `fsClass="fs-rasterize"` | App; SDK should report it |
| No taps recorded while screens change | `fs-exclude` on a large container drops every tap inside its frame | Use `fs-rasterize` for decorative views; keep `fs-exclude` on the sensitive element itself. In React Native, both are set with `fsClass` | App; docs |
| Corpus selector exists in source but never matches; the snapshot shows the view as `somenativeview#id` with no `testid` | The `testID` was passed to a native library view (e.g. `LiquidGlassView`, `BlurView`), which the SDK exposes only as `#id` | Move the `testID` onto a React Native `View` wrapper with `collapsable={false}`, or select `#id`. Fix it once in the shared component | App; SDK should emit `testid` |
| Tap resolves to the parent list or container, not the row | Fabric flattened the `testID`'d wrapper `View` | Add `collapsable={false}` to the wrapper, or put the `testID` on the `Pressable` itself | App |
| Tap on text inside a card lands on `rctparagraphcomponentview`, unresolved | The text node is the hit target, and nothing named encloses it in the captured tree | *Open.* Put the `testID` on the enclosing `Pressable` with `collapsable={false}`, then check whether the text tap now resolves to it | App; possibly Subtext matching |
| Tap ends at a bare `_uialertcontrolleractionview` (iOS) | A system alert or action sheet, outside the React Native tree | None in app or corpus. Count it as expected and leave it out of the bar, or log a custom event when the alert's buttons are pressed | Subtext could name system dialog actions |
| Native (non-React) component never named | Native views don't carry React Native props | Wrap it in a React Native `View` with a `testID` and `collapsable={false}`, and select `[testid="…"]`. `fsClass` sets capture behavior; it isn't a naming hook | App |
| Corpus selector never matches | `testID` renamed or removed, or a typo | Fix the corpus or the source; Step 1 catches these | Corpus |
| Reviews say mobile isn't covered | Corpus memory written by web-first tooling | Rewrite the memory entries | Corpus |

Subtext doesn't yet report a cut-short session or blocked taps in `review-open`, and click signals carry no target element id, selector or coordinates. That's why Step 3 compares the capture against what the tester did, and Step 4.5 matches masked text by hand.

Android is unverified. React Native maps `testID` to `resource-id` there, but whether the SDK then emits `[testid]`, `#id` or `resource-id` hasn't been observed. Blur fallbacks such as `BlurView` are native views too, so expect the same `#id`-only behavior. Note anything that differs on Android in the report.

## Report

```markdown
## Mobile Setup Audit

**App / build:** <name, version, platform>
**Session:** <URL>
**Build:** <how you confirmed the session ran the build under test, and from which timestamp>
**Time to reviewable:** <last tap → first summary containing it; last tap → first successful review-open; note any deliberate wait. Or "not measured — pre-existing session">

### Capture health
<Pass, or which checks failed and the evidence. Mark rows you couldn't check as unchecked.>

### Tap resolution
<resolved> / <total> taps resolved to named components.

| Time | Tap target (last bracket) | Hit element | Nearest named ancestor | Cause | Fix |
|---|---|---|---|---|---|

### Proposed fixes (awaiting approval)
- <file or corpus entry> — <what would change, and how many corpus entries it unblocks>

### Fixes made
- <file or corpus entry> — <what changed>

### Gaps to report
- **SDK:** <…>
- **Subtext:** <…>
- **sightmap CLI:** <…>
- **Docs:** <…>
```

## See also

- `subtext-sightmap` — uploading the corpus into a review.
- `sightmap-authoring` — corpus schema and authoring.
- `subtext-session` — the `review-*` catalog.
- `subtext-review` — reviewing a session once setup is healthy.
- `subtext-privacy` — masking and exclusion rules, including mobile platforms.
