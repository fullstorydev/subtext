# subtext-ios-sim (prototype)

Drive and inspect an iOS app in the local iOS Simulator from a coding agent. The agent-facing instructions are in [`SKILL.md`](SKILL.md); this file is for people testing the prototype from the `chandler/ios-live-loop` branch.

## Requirements

- Apple Silicon Mac, macOS 15 or later
- Xcode 26 or later, opened once, with an iOS Simulator runtime (Xcode > Settings > Components)
- `xcode-select -p` pointing at Xcode, not the Command Line Tools
- Node 18 or later

## Install from the branch (Claude Code)

The plugin's marketplace (`subtext-marketplace`) is this repo, so add it pinned to the branch and install `subtext` from it:

```sh
claude plugin marketplace add 'fullstorydev/subtext#chandler/ios-live-loop'
claude plugin install subtext@subtext-marketplace
```

Or in one step:

```sh
claude plugin install subtext --marketplace 'fullstorydev/subtext#chandler/ios-live-loop'
```

`https://github.com/fullstorydev/subtext.git#chandler/ios-live-loop` works too. Restart Claude Code afterwards.

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
test/e2e.sh --device "<simulator name or UDID>" # drives the sample app on that simulator, then shuts it down
```

`e2e.sh` boots the simulator if needed, signs in, scrolls to Product 150, adds it to the cart, and checks the console, a screenshot and the run log. Set `E2E_KEEP_BOOTED=1` to leave the simulator running.

## Sample app

`fixtures/SampleApp/` is a small SwiftUI app, "Subtext Sim Sample" (`dev.subtext.SimSample`), with:

- a login form (any email containing `@` and a non-empty password signs in);
- a tab bar with Products, Network and Account tabs;
- a list of 200 products, each opening a detail screen with an Add to Cart button;
- a Send Request button that POSTs JSON to `https://httpbin.org/anything/…` and logs the result through `print` and `os_log`.

Every control has an `accessibilityIdentifier` (`login-email`, `login-submit`, `tab-network`, `product-row-42`, `product-detail-add`, `network-send`…).

`build.sh` needs only Xcode: it compiles with `swiftc` and assembles the bundle by hand, so there's no Xcode project. It writes to `~/Library/Caches/subtext-sim/SampleApp/` (set `OUT_DIR` to change that) and prints the `.app` path on stdout.

To capture sessions with Fullstory, build with your org ID:

```sh
FS_ORG_ID=<your-org-id> fixtures/SampleApp/build.sh
```

This downloads the public Fullstory iOS SDK (the binary from [`fullstorydev/fullstory-swift-package-ios`](https://github.com/fullstorydev/fullstory-swift-package-ios), checksum-verified; set `FS_SDK_VERSION` to pick a release), embeds it, adds a `Fullstory` dictionary with `OrgId` and `RecordOnStart` to `Info.plist`, and logs `FULLSTORY_SESSION_URL <url>` when a session starts. That line is what `subtext-sim session-url` reads.
