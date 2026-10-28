# subtext-ios-sim (prototype)

Drive and inspect an iOS app in the local iOS Simulator from a coding agent. The agent-facing instructions are in [`SKILL.md`](SKILL.md); this file is for people testing the prototype from the `chandler/ios-live-loop` branch.

## Requirements

- Apple Silicon Mac, macOS 15 or later
- Xcode 26 or later, opened once, with an iOS Simulator runtime (Xcode > Settings > Components)
- `xcode-select -p` pointing at Xcode, not the Command Line Tools
- Node 18 or later
- The sightmap CLI: nothing to install, `subtext-sim` runs the pinned `@sightmap/sightmap@0.36.1` through `npx`. A `sightmap` on your PATH (or `SIGHTMAP_BIN`) wins over the pin; `doctor` reports which one resolves and warns outside the tested range (0.32–0.36; the sample apps' `.sightmap/` need 0.34+).

## Install from the branch (Claude Code)

The plugin's marketplace (`subtext-marketplace`) is this repo, so add it pinned to the branch and install `subtext` from it:

```sh
claude plugin marketplace add 'https://github.com/fullstorydev/subtext.git#chandler/ios-live-loop'
claude plugin install subtext@subtext-marketplace
```

Use the HTTPS URL as shown. The `fullstorydev/subtext#…` shorthand also works, but it may clone over SSH, which fails without GitHub SSH keys. Restart Claude Code afterwards.

**Already have Subtext installed from `main`?** The marketplace name is already taken by the `main` source, and `add` refuses a different source for it. Remove it first (this uninstalls the plugin), then run the commands above:

```sh
claude plugin marketplace remove subtext-marketplace
```

To go back to the released plugin later: remove the marketplace again, then `claude plugin marketplace add fullstorydev/subtext` and `claude plugin install subtext@subtext-marketplace`.

**Picking up new commits on the branch.** The plugin version doesn't change between branch commits, so `claude plugin update` reports "already at the latest version". Refresh the marketplace and reinstall instead:

```sh
claude plugin marketplace update subtext-marketplace
claude plugin uninstall subtext@subtext-marketplace
claude plugin install subtext@subtext-marketplace
```

**Where the files land:** `~/.claude/plugins/cache/subtext-marketplace/subtext/<version>/` (this skill is under `skills/subtext-ios-sim/` there); the marketplace clone is in `~/.claude/plugins/marketplaces/subtext-marketplace/`. `~/.claude/plugins/installed_plugins.json` records the installed commit (`gitCommitSha`).

## Other harnesses

These were not tested against the branch.

- **Gemini CLI:** `gemini extensions install https://github.com/fullstorydev/subtext --ref chandler/ios-live-loop`
- **Codex, Cursor:** the plugin manifests point at the repo's `skills/` directory. Clone the branch (`git clone -b chandler/ios-live-loop https://github.com/fullstorydev/subtext`) and install the plugin from that local checkout.

## Try it

Ask the agent:

1. "Run the subtext-sim doctor." Every failing check prints the exact fix. The first run builds the simulator helper, which takes a minute or two.
2. "Build the subtext-ios-sim sample app and start it in the simulator." The agent runs `fixtures/SampleApp/build.sh`, then `subtext-sim start --app <path it printed>`.
3. "Sign in with any email and password, open Product 150, and add it to the cart. Then show me the app's console output."

You can also run the pieces yourself from the installed skill directory:

```sh
cd ~/.claude/plugins/cache/subtext-marketplace/subtext/*/skills/subtext-ios-sim
node bin/subtext-sim doctor
app="$(fixtures/SampleApp/build.sh)"     # prints the .app path
cd fixtures/SampleApp                    # its .sightmap/ annotates the snapshots
node ../../bin/subtext-sim start --app "$app" --detach
node ../../bin/subtext-sim snapshot
node ../../bin/subtext-sim stop
```

## Tests

```sh
node --test test/*.test.mjs                    # unit tests; a fake helper stands in for the simulator
test/e2e.sh --device "<simulator name or UDID>" # drives the SwiftUI sample app on that simulator, then shuts it down
test/e2e.sh --device "<simulator name or UDID>" --fixture RNSampleApp   # the React Native sample app
```

`e2e.sh` boots the simulator if needed, signs in (dismissing iOS's "Save Password?" sheet if it appears), scrolls to Product 150, adds it to the cart, and checks the console, a screenshot and the run log. The React Native run also switches tabs and sends a request. Set `E2E_KEEP_BOOTED=1` to leave the simulator running. `e2e.sh` also runs `sightmap validate` on the fixture's `.sightmap/`. Set `SIGHTMAP_BIN` to a sightmap CLI to run the unit tests that need one (the parity tests with 0.32+, the `validate` tests with 0.34+).

## Sample apps

`fixtures/SampleApp/` is a small SwiftUI app, "Subtext Sim Sample" (`dev.subtext.SimSample`), with:

- a login form (any email containing `@` and a non-empty password signs in);
- a tab bar with Products, Network and Account tabs;
- a list of 200 products, each opening a detail screen with an Add to Cart button;
- a Send Request button that POSTs JSON to `https://httpbin.org/anything/…` and logs the result through `print` and `os_log`.

Every control has an `accessibilityIdentifier` (`login-email`, `login-submit`, `tab-network`, `product-row-42`, `product-detail-add`, `network-send`…).

`build.sh` needs only Xcode: it builds `SimSample.xcodeproj` with `xcodebuild` (a target build for the simulator SDK). It must be a real Xcode build: Xcode embeds simulated entitlements in simulator apps, and without them the Fullstory SDK's background uploads fail, so no session data reaches Fullstory. Apply the same rule to your own app. It writes to `$SUBTEXT_SIM_CACHE/SampleApp/`, default `~/Library/Caches/subtext-sim/SampleApp/` (set `OUT_DIR` to change just the app's location) and prints the `.app` path on stdout.

To capture sessions with Fullstory, build with your org ID:

```sh
FS_ORG_ID=<your-org-id> fixtures/SampleApp/build.sh   # also sets Fullstory VerboseLogging=2 (FS_VERBOSE_LOGGING to change)
```

This downloads the public Fullstory iOS SDK (the binary from [`fullstorydev/fullstory-swift-package-ios`](https://github.com/fullstorydev/fullstory-swift-package-ios), checksum-verified; set `FS_SDK_VERSION` to pick a release), embeds it, adds a `Fullstory` dictionary with `OrgId` and `RecordOnStart` to `Info.plist`, and logs `FULLSTORY_SESSION_URL <url>` when a session starts. That line is what `subtext-sim session-url` reads.

### React Native

`fixtures/RNSampleApp/` is the same app in React Native 0.88 ("Subtext RN Sample", `dev.subtext.RNSample`): React Navigation bottom tabs with a native stack inside the Products tab, a 200-row `FlatList`, and the same `testID`s, so its `.sightmap/` differs from the SwiftUI one only in role-free selectors. Product rows and Add to Cart are `Pressable`s without `accessibilityRole`, like most RN code, so they show up as `other`.

Requirements on top of Xcode: Node 22.11+, npm, CocoaPods, and network access the first time. `pod install` needs a UTF-8 locale; `build.sh` sets one, but for your own app run `export LANG=en_US.UTF-8` first. Only the JS sources are checked in. `build.sh` generates the native iOS project from the React Native template for the pinned version, then runs `npm install`, `pod install` and `xcodebuild` in `~/Library/Caches/subtext-sim/RNSampleApp/` (set `OUT_DIR` to change that). It prints the `.app` path on stdout. The first build takes several minutes; after a JS change, a rebuild takes about 15 s.

- `./build.sh` builds Release with the JS bundle embedded, so `subtext-sim start --app` works without Metro. `ios/SceneDelegate.swift` replaces the template's to keep `console.log` in Release builds (`RCTSetLogThreshold`).
- `CONFIGURATION=Debug ./build.sh` builds for Metro. Start Metro from the generated project (the build prints the command) before launching. Debug with Metro works for the whole loop and is the cheaper choice while iterating on JS; if edits don't show up, restart Metro with `--clear`.
- `FS_ORG_ID=<your-org-id> ./build.sh` adds `@fullstory/react-native` (its Babel plugins, the `FullStory` pod and a `FullStory` `Info.plist` dictionary) and logs `FULLSTORY_SESSION_URL <url>` from `FullStory.onReady()`. `FS_RN_VERSION` and `FS_SDK_VERSION` pick the plugin and iOS SDK versions.

`build.sh` uses target builds rather than `xcodebuild -scheme`, and drops the template's launch storyboard and asset catalog. Both need Xcode's iOS platform component for the SDK version, which a machine with only a Simulator runtime installed doesn't have.

