#!/bin/bash
# Builds the Subtext Sim Sample app for the iOS Simulator with only Xcode installed
# (swiftc plus a hand-assembled bundle, no .xcodeproj) and prints the .app path.
#
#   ./build.sh                    # plain build
#   FS_ORG_ID=<org> ./build.sh    # embed the public Fullstory iOS SDK and record on start
#
# Env: OUT_DIR (default ~/Library/Caches/subtext-sim/SampleApp),
#      FS_SDK_VERSION (tag of fullstorydev/fullstory-swift-package-ios, default 1.76.0).
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
out_dir="${OUT_DIR:-$HOME/Library/Caches/subtext-sim/SampleApp}"
fs_version="${FS_SDK_VERSION:-1.76.0}"
app="$out_dir/SimSample.app"
log() { echo "build.sh: $*" >&2; }

arch="$(uname -m)"
target="${arch}-apple-ios17.0-simulator"
sdk="$(xcrun --sdk iphonesimulator --show-sdk-path)"

rm -rf "$app"
mkdir -p "$app"
cp "$here/Info.plist" "$app/Info.plist"

swift_flags=()
if [[ -n "${FS_ORG_ID:-}" ]]; then
  fs_cache="$HOME/Library/Caches/subtext-sim/fullstory-$fs_version"
  framework="$fs_cache/FullStory.xcframework/ios-arm64_x86_64-simulator/FullStory.framework"
  if [[ ! -d "$framework" ]]; then
    log "fetching Fullstory iOS SDK $fs_version"
    manifest="$(curl -fsSL "https://raw.githubusercontent.com/fullstorydev/fullstory-swift-package-ios/$fs_version/Package.swift")"
    zip_url="$(sed -nE 's/.*url: *"([^"]+)".*/\1/p' <<<"$manifest")"
    checksum="$(sed -nE 's/.*checksum: *"([^"]+)".*/\1/p' <<<"$manifest")"
    mkdir -p "$fs_cache"
    curl -fsSL -o "$fs_cache/sdk.zip" "$zip_url"
    actual="$(shasum -a 256 "$fs_cache/sdk.zip" | cut -d' ' -f1)"
    if [[ "$actual" != "$checksum" ]]; then
      log "checksum mismatch for $zip_url (expected $checksum, got $actual)"
      exit 1
    fi
    unzip -q -o "$fs_cache/sdk.zip" -d "$fs_cache"
    rm "$fs_cache/sdk.zip"
  fi
  swift_flags+=(-D SUBTEXT_FULLSTORY -F "$(dirname "$framework")" -framework FullStory
                -Xlinker -rpath -Xlinker @executable_path/Frameworks)
  mkdir -p "$app/Frameworks"
  cp -R "$framework" "$app/Frameworks/"
  plist="$app/Info.plist"
  /usr/libexec/PlistBuddy \
    -c "Add :Fullstory dict" \
    -c "Add :Fullstory:OrgId string $FS_ORG_ID" \
    -c "Add :Fullstory:RecordOnStart bool true" \
    "$plist" >/dev/null
  log "including Fullstory SDK $fs_version"
fi

log "compiling for $target"
xcrun --sdk iphonesimulator swiftc \
  -target "$target" -sdk "$sdk" -O -parse-as-library \
  "${swift_flags[@]+"${swift_flags[@]}"}" \
  -o "$app/SimSample" \
  "$here"/Sources/*.swift

if [[ -d "$app/Frameworks" ]]; then
  codesign --force --sign - "$app"/Frameworks/*.framework >/dev/null 2>&1
fi
codesign --force --sign - "$app" >/dev/null 2>&1

echo "$app"
