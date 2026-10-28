#!/bin/bash
# Builds the Subtext Sim Sample app for the iOS Simulator with xcodebuild (SimSample.xcodeproj)
# and prints the .app path. Only Xcode is required.
#
#   ./build.sh                    # plain build
#   FS_ORG_ID=<org> ./build.sh    # embed the public Fullstory iOS SDK and record on start
#
# Env: SUBTEXT_SIM_CACHE (default ~/Library/Caches/subtext-sim), OUT_DIR (default $SUBTEXT_SIM_CACHE/SampleApp),
#      FS_SDK_VERSION (tag of fullstorydev/fullstory-swift-package-ios, default 1.76.0),
#      FS_VERBOSE_LOGGING (Fullstory VerboseLogging level with FS_ORG_ID, default 2).
#
# It must be an xcodebuild build: Xcode embeds simulated entitlements (application-identifier) in
# simulator builds, and without them the SDK's background uploads fail, so no session data arrives.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
cache_root="${SUBTEXT_SIM_CACHE:-$HOME/Library/Caches/subtext-sim}"
out_dir="${OUT_DIR:-$cache_root/SampleApp}"
build_dir="$cache_root/SampleApp-build"
fs_version="${FS_SDK_VERSION:-1.76.0}"
app="$out_dir/SimSample.app"
log() { echo "build.sh: $*" >&2; }

mkdir -p "$build_dir" "$out_dir"
plist="$build_dir/Info.plist"
cp "$here/Info.plist" "$plist"

settings=(INFOPLIST_FILE="$plist" ARCHS="$(uname -m)")
framework=""
if [[ -n "${FS_ORG_ID:-}" ]]; then
  fs_cache="$cache_root/fullstory-$fs_version"
  slice="$fs_cache/FullStory.xcframework/ios-arm64_x86_64-simulator"
  framework="$slice/FullStory.framework"
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
  /usr/libexec/PlistBuddy \
    -c "Add :Fullstory dict" \
    -c "Add :Fullstory:OrgId string $FS_ORG_ID" \
    -c "Add :Fullstory:RecordOnStart bool true" \
    -c "Add :Fullstory:VerboseLogging integer ${FS_VERBOSE_LOGGING:-2}" \
    "$plist" >/dev/null
  settings+=(SWIFT_ACTIVE_COMPILATION_CONDITIONS="DEBUG SUBTEXT_FULLSTORY"
             FRAMEWORK_SEARCH_PATHS="$slice" OTHER_LDFLAGS="-framework FullStory")
  log "including Fullstory SDK $fs_version"
fi

log "xcodebuild for the iOS Simulator"
xcodebuild -project "$here/SimSample.xcodeproj" -target SimSample -configuration Debug -sdk iphonesimulator \
  SYMROOT="$build_dir/products" OBJROOT="$build_dir/intermediates" "${settings[@]}" build >"$build_dir/xcodebuild.log" 2>&1 \
  || { tail -20 "$build_dir/xcodebuild.log" >&2; log "xcodebuild failed; full log: $build_dir/xcodebuild.log"; exit 1; }

rm -rf "$app"
cp -R "$build_dir/products/Debug-iphonesimulator/SimSample.app" "$app"

if [[ -n "$framework" ]]; then
  mkdir -p "$app/Frameworks"
  cp -R "$framework" "$app/Frameworks/"
  codesign --force --sign - "$app/Frameworks/FullStory.framework" >/dev/null 2>&1
  codesign --force --sign - --preserve-metadata=entitlements "$app" >/dev/null 2>&1
fi

echo "$app"
