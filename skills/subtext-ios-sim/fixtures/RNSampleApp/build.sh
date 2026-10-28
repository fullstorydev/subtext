#!/bin/bash
# Builds the Subtext RN Sample app (React Native) for the iOS Simulator and prints the .app path.
#
#   ./build.sh                          # Release: JS bundle embedded, runs without Metro
#   CONFIGURATION=Debug ./build.sh      # Debug: loads JS from Metro (start it as printed), dev menu + LogBox on
#   FS_ORG_ID=<org> ./build.sh          # also add the Fullstory React Native SDK and record on start
#
# Needs Node 22.11+, CocoaPods, Xcode and network access on the first run. Only the
# JS sources live here: the native project comes from the React Native template for
# the pinned version, generated into the work dir along with node_modules and Pods.
#
# Env: OUT_DIR (default ~/Library/Caches/subtext-sim/RNSampleApp),
#      FS_RN_VERSION (@fullstory/react-native, default 1.10.3), FS_SDK_VERSION (Fullstory iOS SDK, default 1.76.0).
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
work="${OUT_DIR:-$HOME/Library/Caches/subtext-sim/RNSampleApp}"
configuration="${CONFIGURATION:-Release}"
project="$work/project"
log() { echo "build.sh: $*" >&2; }
export LANG="${LANG:-en_US.UTF-8}" LC_ALL="${LC_ALL:-en_US.UTF-8}"

for tool in node npm pod xcodebuild; do
  command -v "$tool" >/dev/null || { log "$tool not found (needs Node 22.11+, CocoaPods and Xcode)"; exit 1; }
done

pkg() { node -p "require('$here/package.json').$1"; }
rn_version="$(pkg 'dependencies["react-native"]')"
cli_version="$(pkg 'devDependencies["@react-native-community/cli"]')"

if [[ "$(cat "$project/.rn-version" 2>/dev/null)" != "$rn_version" ]]; then
  log "generating the React Native $rn_version iOS project"
  rm -rf "$project" "$work/template"
  mkdir -p "$work/template"
  (cd "$work/template" && npx -y "@react-native-community/cli@$cli_version" init RNSampleApp \
    --version "$rn_version" --skip-git-init --skip-install --install-pods false >/dev/null)
  mkdir -p "$project"
  mv "$work/template/RNSampleApp/ios" "$project/ios"
  rm -rf "$work/template"
  # ibtool and actool need Xcode's iOS platform component, not just a Simulator
  # runtime; a plist launch screen and no app icon avoid both.
  sed -i '' -e '/LaunchScreen.storyboard in Resources/d' -e '/Images.xcassets in Resources/d' \
    "$project/ios/RNSampleApp.xcodeproj/project.pbxproj"
  /usr/libexec/PlistBuddy \
    -c "Delete :UILaunchStoryboardName" \
    -c "Add :UILaunchScreen dict" \
    -c "Set :CFBundleDisplayName Subtext RN Sample" \
    "$project/ios/RNSampleApp/Info.plist" >/dev/null
  echo "$rn_version" > "$project/.rn-version"
fi

cp "$here"/{App.js,fullstory.js,index.js,app.json,babel.config.js,metro.config.js} "$project/"
cp "$here/ios/SceneDelegate.swift" "$project/ios/RNSampleApp/SceneDelegate.swift"

package_json="$(cat "$here/package.json")"
babel_config="$(cat "$here/babel.config.js")"
if [[ -n "${FS_ORG_ID:-}" ]]; then
  package_json="$(node -e '
    const p = JSON.parse(require("fs").readFileSync(0, "utf8"));
    p.dependencies["@fullstory/react-native"] = process.env.FS_RN_VERSION || "1.10.3";
    console.log(JSON.stringify(p, null, 2));' <<<"$package_json")"
  cat > "$project/fullstory.js" <<'JS'
import FullStory from '@fullstory/react-native';

export function logSessionUrl() {
  FullStory.onReady().then(({ replayStartUrl }) => console.log(`FULLSTORY_SESSION_URL ${replayStartUrl}`));
}
JS
  babel_config="module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: ['@fullstory/react-native', ['@fullstory/annotate-react', { native: true }]],
};"
fi
[[ "$package_json" == "$(cat "$project/package.json" 2>/dev/null)" ]] || echo "$package_json" > "$project/package.json"
echo "$babel_config" > "$project/babel.config.js"

cd "$project"
if [[ "$(cat node_modules/.package.json 2>/dev/null)" != "$package_json" ]]; then
  log "npm install"
  npm install --no-audit --no-fund --loglevel=error >&2
  echo "$package_json" > node_modules/.package.json
fi

plist="ios/RNSampleApp/Info.plist"
/usr/libexec/PlistBuddy -c "Delete :FullStory" "$plist" >/dev/null 2>&1 || true
if [[ -n "${FS_ORG_ID:-}" ]]; then
  /usr/libexec/PlistBuddy \
    -c "Add :FullStory dict" \
    -c "Add :FullStory:OrgId string $FS_ORG_ID" \
    -c "Add :FullStory:RecordOnStart bool true" \
    "$plist" >/dev/null
  log "including the Fullstory React Native SDK"
fi

podfile="$(grep -v "pod 'FullStory'" ios/Podfile)"
if [[ -n "${FS_ORG_ID:-}" ]]; then
  fs_pod="  pod 'FullStory', :http => 'https://ios-releases.fullstory.com/fullstory-${FS_SDK_VERSION:-1.76.0}-xcframework.tar.gz'"
  podfile="$(awk -v pod="$fs_pod" '{ print } /use_native_modules!/ { print pod }' <<<"$podfile")"
fi
[[ "$podfile" == "$(cat ios/Podfile)" ]] || echo "$podfile" > ios/Podfile

if ! diff -q ios/Podfile.lock ios/Pods/Manifest.lock >/dev/null 2>&1 \
    || [[ package.json -nt ios/Pods/Manifest.lock || ios/Podfile -nt ios/Pods/Manifest.lock ]]; then
  log "pod install"
  (cd ios && RCT_NEW_ARCH_ENABLED=1 pod install >&2)
fi

log "xcodebuild $configuration (the first build takes several minutes)"
# Target builds instead of `-scheme`: scheme builds also refuse to start when the
# iOS platform component matching the SDK isn't installed, even for the Simulator.
products="$work/build"
build=(-configuration "$configuration" -sdk iphonesimulator ARCHS="$(uname -m)" ONLY_ACTIVE_ARCH=YES
       SYMROOT="$products" DISABLE_MANUAL_TARGET_ORDER_BUILD_WARNING=YES -quiet build)
xcodebuild -project ios/Pods/Pods.xcodeproj -alltargets "${build[@]}" >&2
xcodebuild -project ios/RNSampleApp.xcodeproj -target RNSampleApp \
  PRODUCT_BUNDLE_IDENTIFIER=dev.subtext.RNSample "${build[@]}" >&2

if [[ "$configuration" == Debug ]]; then
  log "Debug build: start Metro before launching the app:  (cd '$project' && npx react-native start)"
fi
echo "$products/$configuration-iphonesimulator/RNSampleApp.app"
