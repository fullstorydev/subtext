---
name: subtext-doctor
description: Check that Subtext is set up correctly for an app, on any platform (web, React Native, iOS, Android). Confirms the plugin is connected, gates on capture health, then measures how many recorded clicks or taps resolve to named sightmap components and fixes the gaps. Use after installing the Fullstory snippet or SDK, after authoring a .sightmap/ corpus, when asked whether Subtext is working, or when session reviews name a page, screen or list where you expected the control that was used.
---

# Subtext Doctor

> **PREREQUISITE:** Read `subtext-shared`, `subtext-session` and `subtext-sightmap` for tool conventions and corpus upload.

**Type:** Workflow — a loop you repeat until coverage clears the bar.

The doctor measures resolution on sessions recorded with real user input. Agent-driven sessions, such as Subtext Verify's on web, can check capture and view naming, but their clicks may not be recorded; the platform reference says. That makes setup quality the whole game: a session that was cut short or dropped its interactions looks exactly like a sightmap gap, and Subtext won't tell you which one you're looking at. So the doctor checks three layers in order, and stops at the first one that fails:

1. **Connection** — the plugin's MCP server answers.
2. **Capture health** — sessions arrive and contain what the tester did.
3. **Resolution** — the share of recorded clicks or taps that land on a named sightmap component.

## Platform references

Most of this loop is the same everywhere. What changes per platform — how to detect it, the static-pass script, the selector attribute, the logs to read, expected noise and the fix table — lives in a reference file. Detect the platform in Step 0 and read only the matching file.

| Platform | Reference | Status |
|---|---|---|
| React Native (iOS; Android partly) | [references/react-native.md](references/react-native.md) | Field-tested on iOS with Fabric, October 2026 |
| Native iOS (Swift / UIKit / SwiftUI) | [references/ios.md](references/ios.md) | Unverified |
| Native Android (Kotlin / Java / Compose) | [references/android.md](references/android.md) | Unverified |
| Web | [references/web.md](references/web.md) | Field-tested on Next.js + MUI, October 2026 |

For an unverified platform, follow the loop as written, treat the reference as a starting point, and record in the report everything you observe that the reference doesn't say. That's how the reference grows.

## When to use

**Use when:**
- The Fullstory snippet or SDK was just added to an app, or a `.sightmap/` corpus was just written.
- Someone asks whether Subtext is set up correctly or working.
- Reviews name a page, screen, list or container where you expected the control that was used.
- A session looks implausibly short or has no interactions.

**Skip when:**
- You need to install the plugin — use `subtext-setup-plugin` — or the capture snippet itself.
- You want to review what a user did in a healthy session — use `subtext-review`.

## Inputs

- The app's source root, with its `.sightmap/` corpus. A repo can hold several apps (say a web app and a React Native app) with a corpus directory each; audit them one at a time.
- A session: its URL, or the tester's email / user id so `review-list-sessions` can find it.
- What the tester did: which flows, roughly how many clicks or taps, and the wall-clock start and end time.
- The platform's log from that run, if available (the reference says where to find it).

If the tester points at an existing session instead of recording a planned one, ask what they remember: rough length, flows, anything distinctive they did. Record time-to-reviewable as not measured.

Testers often can't give an interaction count or a log. Then check that each flow you asked them to walk appears, and mark the log row unchecked, not passed.

## The loop

### Step 0: Detect the platform and check the connection

1. **Platform.** Use the detection signals in each reference. If the repo holds more than one app, ask which to audit, or audit each in turn. Read that platform's reference now.
2. **Connection.** Call a lightweight tool on the `subtext` MCP server, such as `privacy-list`. If it fails, stop and hand off to `subtext-setup-plugin`; nothing below works without it.

### Step 1: Static pass — no credits

Check the corpus against source before spending anything on a session. Run the reference's static-pass script, then:

1. **Fix dead and missing selectors.** A selector with nothing in source to match is dead; an identifier in source no selector covers is a gap. Selectors built from template strings show up as dead; check them before deleting. If the repo has its own checker, run it too and trust whichever reports fewer false positives.
2. **Check where identifiers land.** A selector can exist in source and still never match at runtime. The reference lists the platform's known cases. A parent selector that never matches also blocks every component nested under it in the corpus.
3. **Check selectors use only what production renders.** Some attributes and classes exist only in development builds, or change between builds; the reference lists them for the platform.
4. **Read corpus memory.** Corpora generated for one platform can claim another isn't covered. Rewrite wrong entries, because they steer every later review. Top-level memory prints in every review on every platform, so move platform-specific notes onto that platform's entries.
5. **Flag capture traps** from the reference for Step 5.

A clean static pass doesn't mean the selectors match at runtime; Step 4 measures that.

### Step 2: Find the session

Have the tester run the key flows with a build that includes the snippet or SDK. Ask them to note the start time, the flows, roughly how many interactions, and when they stopped, and to keep the log.

Find the session with `review-list-sessions`, scoped by `email_address` / `user_uid` when the app identifies users, or org-wide for the most recent captures. Org-wide it returns only URLs and creation times; scoped to a user it adds the user card. Neither gives platform, duration or event count, and every call spends credits. The session can start before the flow, for example at sign-in. To tell candidates apart, run `review-summary` on each; the reference says what marks a session as this platform.

**Confirm the session ran the build under test.** A session can start on an older build and switch partway through (a reload, an over-the-air update, a deploy). The reference says how to spot the switch; judge only interactions after it.

**Interactions can join an existing session.** After an idle gap, a tester's second pass may land in the same session, so `review-list-sessions` shows nothing new. Uploads lag the last interaction by the platform's upload lag (in the reference). Poll with `review-summary` once that has passed, then no more often than every 2 minutes, since each poll costs credits, and record:
- when the first summary contains the tester's last interaction, and
- when `review-open` first succeeds (Step 4.1).

Both measure time-to-reviewable from the last interaction. Report both, and say if you waited on purpose.

### Step 3: Capture-health gate

Use `review-summary` first — it's the cheapest call, and capture health doesn't need the corpus. Compare what was captured with what the tester did:

| Check | How to read it | Red flag |
|---|---|---|
| Session end | The summary has no duration. Add the last event's timestamp to the session start, and compare that wall-clock time with when the tester stopped. Idle stretches inside the span aren't a red flag | Ends early, e.g. seconds into a minutes-long run |
| Interactions | Count `click` lines and add the merged `(xN …)` counts. The map's `interaction` count includes text changes and the app's custom events, so it isn't a click count | Zero or a handful while pages or screens clearly changed |
| Flows | Every flow, page and screen the tester visited appears | Flows missing after a certain point, or missing while a tool reported capture as active |
| Log | Search the platform log for the capture errors the reference lists | Any of them |

`review-close` reports how long the review ran, not the session length.

The summary may already show component names from a corpus stored by an earlier upload (`resolved_corpus_id` on `review-open`). Don't judge resolution until you've uploaded the current corpus in Step 4.

**If any check fails, stop.** Fix capture with the reference's fix table, ship a new build, and record a new session. Measuring resolution on a broken capture produces wrong answers.

### Step 4: Resolution pass

1. Before the single `review-open`, check with `review-summary` that its last event matches the tester's stop time. If it doesn't, wait about 2 minutes and check again. Then `review-open` the session **once** and keep the `client_id`. It costs far more than the other calls, so do every remaining step on this handle.
2. Upload the corpus right away (see `subtext-sightmap`); the token expires quickly. `sightmap export --url <sightmap_upload_url>` sends pretty-printed JSON, and a corpus of more than a few hundred KB fails with HTTP 413. For a large corpus, go straight to a minified upload. The token survives a failed POST, so you can also fall back to this after a 413:

   ```bash
   corpus_json=$(mktemp)
   sightmap export -o "$corpus_json" \
     && python3 -c 'import json,sys;json.dump(json.load(open(sys.argv[1])),sys.stdout,separators=(",",":"))' "$corpus_json" \
     | curl -sS -X POST -H 'Content-Type: application/json' --data-binary @- '<sightmap_upload_url>'
   rm -f "$corpus_json"
   ```

   A corpus that includes a native subdirectory is usually over the limit, so go straight to the minified upload. If `review-open` already reports a `resolved_corpus_id` equal to your export's hash, the corpus is stored and you can skip the upload.

   A 200 response reports `components` and `corpusId`. To confirm the corpus reached the review, check that the first `review-snapshot` shows its memory as a `[Guide]` block.
3. List every click or tap with `review-zoom resolution={ click: "machine" }`. It returns only clicks; `interaction` would add every keystroke and custom event, and `detail` adds nothing for clicks.
4. Sort them by the **last bracket that names a component** on each line (the reference gives the platform's exceptions):
   - **Resolved:** the last bracket is the control that was used, e.g. `[NotificationsScreen] [NotificationSwitch id="notif-switch-badge"]`.
   - **Unresolved:** the last bracket is a page, screen, scroll container or list, e.g. `[ParticipantsScreen] "***^*"`.

   Before calling one unresolved, read the corpus entry for its last bracket. A name can sound like a container when its selector targets the control (`TopBar` selecting the logo button, say). Then it resolved; propose renaming the entry after the control. The reference lists elements that are expected to stay unresolved, such as system dialogs.

   Repeated root prefixes (`[AppRoot] [AppRoot] …`) are noise. Ignore the raw element names in `review-open`'s map; they appear for resolved interactions too, so they can't be used to count misses.
5. For each unresolved one only, call `review-snapshot` at its timestamp. Start with `lens: "interactive"` and the image; often that's enough to identify the element. Otherwise use `lens: "full"` and `include: ["tree"]`. The tree can be 60–100 KB, so save it and search it rather than reading it inline. Neither the click nor the tree marks the element that was hit. Under the nearest named ancestor, find the element whose text matches the click's masked text: `*` runs and `^` word breaks give the lengths. Expect the snapshot to show the state just after the click. If nothing matches, record "hit element unknown" instead of guessing.
6. **Views and requests.** If the corpus defines views, list each page or screen section with `review-zoom resolution={ navigation: "standard", network: "standard" }` and check it carries a `[ViewName]`; an unnamed route is a view gap. For each request the corpus names that the flow should hit, check it appears by name. Requests folded into aggregate `network · host · N requests` lines can't be checked this way, so record them as not observed rather than missing.
7. `review-close` when done.

Masked text showing as `"**"` is default privacy masking, not a gap.

### Step 5: Classify and fix

Match each unresolved interaction, and each failed health check, to a row in the reference's fix table or the [shared rows](#shared-fixes) below. Propose app-code and corpus fixes and apply them once the user approves; collect SDK or Subtext gaps for the report instead of working around them silently. If nothing matches, describe the symptom and the evidence in the report as a new row for the reference.

### Step 6: Repeat

Ship the fixes, record a new session over the same flows, and run Steps 3–5 again. Agree the bar with the user. A reasonable one is every interaction on a control resolving, with only known, reported gaps left. Then run Steps 3–4 on the first real production sessions, since real users reach places the tester didn't.

<a id="shared-fixes"></a>
## Shared fixes

These apply on every platform; the references hold the rest.

| Symptom | Cause | Fix | Gap belongs to |
|---|---|---|---|
| Corpus selector never matches | Identifier renamed or removed, or a typo | Fix the corpus or the source; Step 1 catches these | Corpus |
| Reviews say a platform isn't covered, or print another platform's notes | Corpus memory written for another platform, or platform notes at the top level | Rewrite the entries; move platform notes onto that platform's entries | Corpus; Subtext memory has no platform scope |
| `sightmap export --url` returns HTTP 413 | Pretty-printed export over the size limit, often because the native corpus rides along | Minified upload (Step 4.2) | sightmap CLI |
| Connection check fails | Plugin not installed or not authorized | `subtext-setup-plugin` | Setup |

Subtext doesn't yet report a cut-short session or blocked interactions in `review-open`, and click signals carry no target element id, selector or coordinates. That's why Step 3 compares the capture against what the tester did, and Step 4.5 matches masked text by hand.

## Report

```markdown
## Subtext Doctor

**App / build:** <name, version, platform>
**Reference used:** <file, and whether it's field-tested or unverified>
**Connection:** <pass / fail>
**Session:** <URL>
**Recorded with:** <person / real-input automation / Subtext Verify>
**Build:** <how you confirmed the session ran the build under test, and from which timestamp>
**Time to reviewable:** <last interaction → first summary containing it; last interaction → first successful review-open; note any deliberate wait. Or "not measured — pre-existing session">

### Capture health
<Pass, or which checks failed and the evidence. Mark rows you couldn't check as unchecked.>

### Resolution
<resolved> / <total> clicks or taps resolved to named components.
**Views:** <named> / <visited> routes or screens named.
**Requests:** <named in review> / <expected>; <n> not observed (folded into aggregate lines).

| Time | Target (last bracket) | Hit element | Nearest named ancestor | Cause | Fix |
|---|---|---|---|---|---|

### Proposed fixes (awaiting approval)
- <file or corpus entry> — <what would change, and how many corpus entries it unblocks>

### Fixes made
- <file or corpus entry> — <what changed>

### Reference updates
<What you observed on this platform that its reference doesn't say: selector attribute, log errors, expected noise, new fix rows.>

### Gaps to report
- **SDK / snippet:** <…>
- **Subtext:** <…>
- **sightmap CLI:** <…>
- **Docs:** <…>
```

## See also

- `subtext-setup-plugin` — installing and connecting the plugin.
- `subtext-sightmap` — uploading the corpus into a review.
- `sightmap-authoring` — corpus schema and authoring.
- `subtext-session` — the `review-*` catalog.
- `subtext-review` — reviewing a session once setup is healthy.
- `subtext-privacy` — masking and exclusion rules.
