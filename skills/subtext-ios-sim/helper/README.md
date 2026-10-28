# subtext-sim-helper

A long-lived Swift process that reads the iOS Simulator's accessibility tree and sends touch, keyboard and
button input. It is built on Meta's FBSimulatorControl, consumed as idb v1.7.7's prebuilt xcframeworks.
URLs and checksums are pinned in `Package.swift`.

## Requirements

- An Apple Silicon Mac on macOS 15 or later (idb's prebuilt frameworks are arm64 only).
- Full Xcode, not just the Command Line Tools, with an iOS Simulator runtime. Open Xcode once so that it
  installs CoreSimulator.
- Network access for the first build, to download the frameworks from GitHub.

No Homebrew, idb install or other dependency is needed.

## Build

```sh
helper/build.sh   # prints the binary path on its last stdout line
```

The binary goes to `${SUBTEXT_SIM_CACHE:-~/Library/Caches/subtext-sim}/<version>/subtext-sim-helper`.
When nothing in `Package.swift`, `Sources/` or `build.sh` has changed, the script skips the build and prints
the cached path. A warm build takes about 15 s. On a cold machine, add the time to download about 10 MB of
frameworks.

## Protocol

JSON lines over stdin/stdout, one request per line. The supported commands are `hello`, `describe`, `tap`,
`type`, `swipe`, `button` and `key`. See "Helper protocol" in `docs/ios-sim-loop/PLAN.md`. Diagnostics go
to stderr only. Set `SUBTEXT_SIM_HELPER_DEBUG=1` for verbose framework logging.

Additions to the plan's contract:

- Each `describe` node also carries `subrole` (for example `AXSwitch`) and `traits` (for example
  `["Button", "Toggle"]`).
- `value` is always a string or `null`. A switch reports `"1"` or `"0"`.
- Error codes:
  - `bad_request` and `unknown_cmd` for malformed requests.
  - `device_not_found` and `not_booted` for simulator state.
  - `ax_disabled` when app accessibility is off. The message includes the `defaults write` fix.
  - `ax_unavailable` and `ax_error` for accessibility failures.
  - `hid_error` for input failures.
  - `unsupported_text` when `type` receives characters outside printable ASCII.
  - `internal` for anything else.
- `button` takes `home`, `lock`, `siri`, `side`, `apple_pay`, `volume_up` or `volume_down`.
- `key` takes a name (`return`, `delete`, `tab`, `escape`, `space`, the arrow keys, `home`, `end`,
  `page_up`, `page_down`, `forward_delete`), a single character, or a numeric HID usage.

`testdata/describe-bench*.json` holds recorded `describe` results that can be used as fixtures.
