#!/usr/bin/env bash
# Builds subtext-sim-helper (release) into ${SUBTEXT_SIM_CACHE:-~/Library/Caches/subtext-sim}/<version>/
# and prints the binary's path as the last line of stdout. Everything else goes to stderr.
# Skips the build when the cached binary was built from identical sources.
set -euo pipefail

HELPER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CACHE_ROOT="${SUBTEXT_SIM_CACHE:-$HOME/Library/Caches/subtext-sim}"

fail() {
  echo "build.sh: $*" >&2
  exit 1
}

[[ "$(uname -s)" == "Darwin" ]] || fail "macOS is required"
[[ "$(uname -m)" == "arm64" ]] || fail "Apple Silicon is required (idb's prebuilt frameworks are arm64 only)"

DEVELOPER_DIR_PATH="$(xcode-select -p 2>/dev/null || true)"
if [[ "$DEVELOPER_DIR_PATH" != *.app/Contents/Developer ]]; then
  fail "full Xcode is required, not just the Command Line Tools (xcode-select -p: '${DEVELOPER_DIR_PATH:-unset}'). Install Xcode, then run: sudo xcode-select -s /Applications/Xcode.app"
fi
[[ -d /Library/Developer/PrivateFrameworks/CoreSimulator.framework ]] \
  || fail "CoreSimulator is missing; open Xcode once so it installs its components (or run: xcodebuild -runFirstLaunch)"
xcrun --find swift >/dev/null 2>&1 || fail "the Swift toolchain was not found through xcrun"

VERSION="$(sed -n 's/^let helperVersion = "\(.*\)"$/\1/p' "$HELPER_DIR/Sources/SubtextSimHelper/Protocol.swift")"
[[ -n "$VERSION" ]] || fail "could not read helperVersion from Sources/SubtextSimHelper/Protocol.swift"

SOURCE_HASH="$(
  cd "$HELPER_DIR"
  { echo build.sh; echo Package.swift; find Sources -type f -name '*.swift'; } | LC_ALL=C sort \
    | while read -r file; do printf '%s\n' "$file"; shasum -a 256 "$file"; done \
    | shasum -a 256 | cut -d' ' -f1
)"

OUT_DIR="$CACHE_ROOT/$VERSION"
BINARY="$OUT_DIR/subtext-sim-helper"
STAMP="$OUT_DIR/source.sha256"

if [[ -x "$BINARY" && -f "$STAMP" && "$(cat "$STAMP")" == "$SOURCE_HASH" ]]; then
  echo "$BINARY"
  exit 0
fi

mkdir -p "$CACHE_ROOT"
LOCK="$CACHE_ROOT/.build.lock"
for _ in $(seq 1 600); do
  mkdir "$LOCK" 2>/dev/null && break
  sleep 1
done
[[ -d "$LOCK" ]] || fail "timed out waiting for another build to release $LOCK"
trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT

# Another process may have finished the same build while this one waited for the lock.
if [[ -x "$BINARY" && -f "$STAMP" && "$(cat "$STAMP")" == "$SOURCE_HASH" ]]; then
  echo "$BINARY"
  exit 0
fi

SCRATCH="$CACHE_ROOT/.build"
echo "build.sh: building subtext-sim-helper $VERSION (first build downloads idb v1.7.7 frameworks, ~10 MB)" >&2
started=$SECONDS
xcrun swift build -c release --package-path "$HELPER_DIR" --scratch-path "$SCRATCH" --cache-path "$CACHE_ROOT/.swiftpm" >&2 \
  || fail "swift build failed; see the output above"

BUILT="$(xcrun swift build -c release --package-path "$HELPER_DIR" --scratch-path "$SCRATCH" --cache-path "$CACHE_ROOT/.swiftpm" --show-bin-path)/subtext-sim-helper"
[[ -x "$BUILT" ]] || fail "build finished but $BUILT is missing"

mkdir -p "$OUT_DIR"
cp "$BUILT" "$BINARY.tmp"
mv -f "$BINARY.tmp" "$BINARY"
echo "$SOURCE_HASH" > "$STAMP"
echo "build.sh: built in $((SECONDS - started))s" >&2
echo "$BINARY"
