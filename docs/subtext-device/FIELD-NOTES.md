# subtext-ios-sim field notes

> **Historical record.** These notes cover the `subtext-sim` prototype from the closed fullstorydev/subtext#39. The Simulator tool has since moved upstream as `sightmap device` (sightmap/sightmap#522), and Subtext keeps only the Fullstory layer in `skills/subtext-device/`. Commit hashes refer to the prototype branch, and command names are the prototype's. Rows about the tool itself are now tracked in sightmap; rows under "Fullstory data and the Subtext MCP" still apply. See [PLAN.md](PLAN.md).

A running record of what came up while building and testing the iOS Simulator loop: on the development Mac ("dev Mac") and in field tests on a second Mac against a real React Native app ("field Mac"). Newest entries at the top of each section. Add to it from either machine; keep it free of org IDs, credentials and internal-only details.

Status values: **fixed** (commit noted), **in progress**, **open**, **upstream** (outside this skill), **won't fix**.

## Network sources for native iOS, ranked (2026-10-29)

Spikes on the dev Mac (Xcode 26.6, iOS 26.2 simulator) against SwiftUI and React Native sample apps, ranked by how much each helps author `requests:` and `properties:`:

| Rank | Source | What it gives | Limits |
|---|---|---|---|
| 1 | Fullstory SDK session, via Subtext | Requests tied to the tap and screen that caused them, plus navigation and `FS.log`, all in one timeline; all of the app's networking; matches production review | ~20 s upload lag; bodies only per org rules; duplicate events; 206 cut-offs on very large view trees |
| 2 | CFNetwork HAR log, read from the simulator's log (what Instruments' HTTP Traffic uses underneath) | Full URL, status, timing, unredacted request and response headers, bodies up to 1 MiB; live within ~5 ms; no app changes | App must be signed with `get-task-allow` (normal Xcode Debug builds); undocumented switch that a future iOS could change; URLSession traffic only; captures secrets, so output must redact |
| 3 | React Native DevTools protocol via Metro | Live (~35 ms): method, URL, JS-set headers, request and response bodies, JS call stacks; coexists with the user's DevTools | React Native Debug only; JS traffic only (no images, native modules or native SDKs); mostly redundant with rank 2 |
| 4 | CFNetwork `Summary` log | Zero setup, live: host, status, timing, protocol | Paths, queries and header values are redacted by CFNetwork itself; can't name routes |
| — | `xctrace` / Instruments CLI | Works on the host Mac only; recordings against the simulator hung (0/7) | Not usable here |
| — | HTTPS proxy (mitmproxy) | Everything | Needs a network extension that managed Macs block; breaks certificate pinning |

Decision: `subtext-device` uses ranks 1 and 2 together (the Fullstory session for attribution, the HAR log for exact routes and bodies) and degrades down the list. `sightmap device` gets a vendor-neutral `network` command that tries 2, then 3, then 4, in a follow-up PR to sightmap/sightmap#522.

## Acceptance run: `sightmap device` (2026-10-29)

Run on the field Mac against a real Expo/React Native app (iPhone 16e, iOS 26.2, Xcode 27.1, Go 1.27.1), commit `f920a78` of sightmap/sightmap#522, scored against the MVP criteria.

| Criterion | Result |
|---|---|
| Install (Go build from the branch) | Pass; ~10 s. Skill doc bug: `.watchmanconfig` must contain `{}` |
| Doctor | Pass; 19.9 s cold, 2.7 s cached, no keychain prompt |
| Start | Pass |
| Snapshot | Plain output passes on every screen; `snapshot --json` panics under Go 1.27. Fix sent to #522 |
| Act | Fails in three cases: rows under a custom tab bar count as uncovered, the settle window is too short after a Debug back navigation, and the Expo gear (`gearshape.fill`) slips past the dev-menu guard. Fixes sent to #522 |
| Corpus | Pass with a leaf-selector device corpus: 100% on all 12 screens (the session-derived corpus nests under wrapper `testID`s and matched 14–83%). Placeholder routes validate; SEP-0024 `screen:` isn't implemented yet |
| Producer / consumer | Pass: concurrent, one continuous session, 6 of 8 `review-open` calls used. Parallel `review-zoom`/`review-close` caused one "session not found"; the skill now says to run them in sequence |
| Network | Pass: 641 events; requests named in a device corpus. Every request still captured twice (upstream) |
| Clean exit | Pass |

**Backlog after the MVP:** SEP-0024 `screen:` support; a warning when a corpus fails validation; `snapshot --until-changed`; a session-url helper and relaunch handshake in the run log (planned with the pin bump); a modal-aware not-found hint; `value=` in plain snapshots; the contradictory empty-tree line; the `start` warning during bundle load; escaped icon glyphs; whether `sightmap device` should get the prototype's wrapper-skip rule.

## Skill, CLI and helper

| Found | Where | Issue | Status |
|---|---|---|---|
| 2026-10-28 | field Mac (retest, 7fa7aef) | The Fullstory session ended mid-run (SDK: `Received HTTP Status Code: 206, terminating FullStory session`), and nothing in subtext-sim noticed: `session-url` and `status` kept returning the dead URL. | fixed 701aa25: `session-ended` run-log entry; `session-url`/`status` report it; the skill has the producer relaunch. Matched on the SDK's log text, which hasn't been checked against a real 206 run yet |
| 2026-10-28 | field Mac (retest) | The selector skip rule merged three components onto the same `[testid*="-option-"]` match, and the wrong one won. | fixed 701aa25: skipping needs an exact leaf; full-chain matches win; leftover conflicts labelled `(ancestor skipped)`. Cost: `[testid="list"] [testid^="row-"]` no longer matches when the list isn't on screen |
| 2026-10-28 | field Mac (retest) | `click MobileTopBarAvatar` reported success but opened the Expo dev menu: the dev-menu window's touch area is larger than its accessibility frame. | fixed 701aa25: 24 pt cover zone around a dev-menu-like floating element (heuristic; the helper doesn't report windows; untested on a real Expo tree) |
| 2026-10-28 | field Mac (retest) | The empty-tree diagnosis was only fixed in `snapshot`; `click`, `fill` and `scroll` still give the "long lists" advice. | fixed 701aa25: one shared diagnosis |
| 2026-10-28 | field Mac (retest) | Coverage misses labelled, tappable `other` elements (e.g. cards) and counts keyboard keys while the keyboard is up. | fixed 701aa25 |
| 2026-10-28 | field Mac (retest) | `console list --grep -i 206` took `-i` as the pattern; `fill "" --clear` reported the placeholder as the value; clicks right after a sheet closes or a back navigation fail until retried. | fixed 701aa25: `-i` flag; placeholder vs value; click/fill retry for up to 1.5 s |
| 2026-10-28 | field Mac (retest) | `doctor` used sightmap 0.36.0 from PATH rather than the pinned 0.36.1. | fixed 701aa25: PATH still wins; doctor says so and names the pinned fallback |
| 2026-10-28 | field Mac (retest) | Metro in a nested git worktree ignores edits: Watchman roots at the parent checkout, and `--clear` doesn't help; restarting Metro does. | fixed 701aa25: skill note |
| 2026-10-28 | field Mac | Empty accessibility tree while app accessibility was already on. The cause was an always-mounted view with `accessibilityViewIsModal = YES` hiding its siblings, but the error said to enable accessibility. | fixed 61a37a8: errors list modal/hidden-root views first and skip the accessibility advice when it's on; a `doctor --app` probe is still open |
| 2026-10-28 | field Mac | `snapshot` crashes with `extract.startsWith is not a function`: sightmap 0.36 emits `extract` as an object, and the bridge only handled strings. | fixed 61a37a8: both forms accepted; npx pin is now sightmap 0.36.1; `doctor` reports the resolved version |
| 2026-10-28 | field Mac | `session-url` missed the URL when React Native logged it as a multi-argument line. | fixed 61a37a8: any Fullstory session URL in any console entry, newest wins |
| 2026-10-28 | field Mac | An existing corpus matched 0%: session corpora use `[testid=…]` while the simulator exposes `identifier`, and wrapper views aren't accessibility elements, so parent chains never match. A draft simulator corpus reached 56–100% per screen. | fixed 61a37a8: `testid` aliases `identifier`; descendant chains skip ancestors whose identifier nothing carries. sightmap's own `explain`/`coverage` don't apply that rule, so they can report fewer matches |
| 2026-10-28 | field Mac | Skill YAML examples fail `sightmap validate` on 0.36 (`extract: text` is deprecated; native views have no route). | fixed 61a37a8: examples and fixtures pass 0.36 `validate`, which now runs in tests and the e2e. Views need a `route`, so native views use placeholder routes like `/login` |
| 2026-10-28 | field Mac | `start --bundle-id` on a running session relaunched the previous app while printing "relaunched". | fixed 61a37a8: errors on a different app; reports what it installed and relaunched |
| 2026-10-28 | field Mac | `tap-xy` accepted points far off the screen; units (points vs pixels) weren't stated. | fixed 61a37a8: off-screen points refused; units are points |
| 2026-10-28 | field Mac | `--sightmap-dir` ties the corpus to the session, so a draft corpus can't be tried against a running session. | open: `--corpus DIR` idea |
| 2026-10-28 | field Mac | The dev-menu floating button is its own window, and it's the only visible element when the tree is empty. | fixed 61a37a8: snapshot adds a `[Mostly empty]` note (size heuristic, untested against a real dev-menu tree) |
| 2026-10-28 | field Mac | Producer and consumer ran one after the other: the test prompt told the consumer to wait for the producer, and the skill allowed either. | fixed e9fb6b3: the skill requires concurrent work and explains SDK delivery |
| 2026-10-28 | both | macOS keychain prompt on the first helper build: SwiftPM offered a saved `github.com` credential while downloading idb's public frameworks. | fixed 4410044: `--disable-keychain --disable-netrc` |
| 2026-10-28 | dev Mac | The SwiftUI fixture was assembled by hand with `swiftc`. It lacked the simulated entitlements Xcode embeds, so the Fullstory SDK's background uploads all failed and no session reached Fullstory. Looked like a server or org problem until device logs showed every `/rec/bundle` upload failing inside the simulator. | fixed c38b875: committed `SimSample.xcodeproj`, built with `xcodebuild` |
| 2026-10-28 | dev Mac | iOS shows a "Save Password?" sheet after sign-in once the app has a real identity (Xcode build). It briefly swallowed taps. | documented; a fresh `snapshot` clears it |
| 2026-10-28 | dev Mac | Mobile network capture is off by default and can't be set by API or the Subtext MCP; it's the main onboarding roadblock for network data. | fixed 0227741: `doctor` prints it as a manual check |
| 2026-10-28 | dev Mac (clean-machine run) | The `owner/repo#ref` marketplace shorthand cloned over SSH, which fails without GitHub SSH keys. | fixed 19e7fb5: README leads with the HTTPS URL |
| 2026-10-28 | dev Mac (clean-machine run) | The fixture build ignored `SUBTEXT_SIM_CACHE`; the helper build used the global SwiftPM cache. | fixed 19e7fb5 |
| 2026-10-28 | dev Mac (clean-machine run) | `console list` was swamped by Apple framework errors. | fixed 19e7fb5: hidden by default, `--all` shows them |
| 2026-10-28 | dev Mac | Enabling app accessibility only takes effect at boot, so the first `start` on a fresh simulator reboots it once. | documented |
| 2026-10-28 | dev Mac | iOS 26 SwiftUI tab bars appear as one "Tab Bar" element with no tabs; switching tabs needs `tap-xy`. | open |
| 2026-10-28 | dev Mac | Scrolling a long list to a far row takes ~3–4 s per screenful. | open |

## Fullstory data and the Subtext MCP

| Found | Where | Issue | Status |
|---|---|---|---|
| 2026-10-28 | field Mac (retest) | Sessions ended with HTTP 206, which the ingest server returns for a bad request it won't accept, mainly a bundle that's too large; the SDK then terminates the session. The SDK also logged "Maximum number of views reached". Only the first 26 s of one session arrived, and none of the run's own requests were ingested. Sessions lived 51 s to 5.5 min. | upstream / app: bundle size on large React Native trees |
| 2026-10-28 | field Mac (retest) | Duplicate network events are unchanged (65 unique requests appeared as 130 events), and `detail` still shows response headers only. | upstream |
| 2026-10-28 | field Mac | Every network request appears twice at the same millisecond in the session; the server's own logs show one. | upstream: capture or ingest |
| 2026-10-28 | field Mac | `review-zoom` at `detail` returned response headers only: no request headers, bodies or query strings. Check against the org's header allowlists and body rules before calling it a bug. | upstream / open |
| 2026-10-28 | field Mac | `review-zoom` at `standard` collapses network traffic into counts; endpoint names only show at `machine`. | fixed 61a37a8: skill recommends `machine` for naming endpoints |
| 2026-10-28 | field Mac | Network data lagged 35 s to 2 min behind the app, longer than the ~20 s upload interval. | upstream / open |
| 2026-10-28 | dev Mac | `review-open` reports "invalid session_url" when a session's IDs don't exist server-side, which reads like a bad link rather than "this session never arrived". | upstream: clearer error; skill explains it (701aa25) |

## Setup friction

| Found | Where | Issue | Status |
|---|---|---|---|
| 2026-10-28 | field Mac | `pod install` crashed without a UTF-8 locale. | fixed 61a37a8: README prerequisite (`export LANG=en_US.UTF-8`) |
| 2026-10-28 | field Mac | `subtext-verify` installs disabled from the marketplace. | open |
| 2026-10-28 | field Mac | Stale Metro modules in git worktrees made edits appear not to apply; `--clear` fixed it. | fixed 61a37a8: skill note |
| 2026-10-28 | field Mac | Upgrading an existing install from the branch: `plugin update` says "already at latest", because the version doesn't change. | documented: `marketplace update`, then uninstall and install |

## What worked (field Mac, React Native)

- Every `testID` surfaced as `identifier`; `snapshot`, `click`, `fill` and `scroll --until` each took under a second.
- A dev client with Metro worked as well as Release for the live loop, and was cheaper.
- Recorded taps lined up with producer steps to within about 30 ms once the clock offset was known.
- Network capture had zero errors across about 900 events, and every `/api/*` route got a `requests:` name.

## What worked (field Mac retest, 7fa7aef)

- 8 of 9 re-checks pass: properties no longer crash, `session-url` works, the existing corpus matches every screen (it matched 0% before), `validate` passes, bundle-id switching, off-screen taps and `machine` grain all work. The empty-tree fix is partial.
- The producer and consumer ran concurrently. The consumer started 25 s after the producer and sent four coverage requests; the producer acted on two (45 s and 2m42s later). One wasn't acted on because the producer's brief limited relaunches.
- Timings: `doctor` 9.2 s, `start` 23.8 s, `snapshot` 0.26 s average, `click` 0.32 s average, `relaunch` to a new session URL 10 s.
