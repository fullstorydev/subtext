#!/usr/bin/env bash
# End-to-end run of subtext-sim against the sample app on a real simulator.
#
#   test/e2e.sh --device <UDID|name>     # required; the device is shut down at the end
#
# Env: E2E_KEEP_BOOTED=1 leaves the simulator running; OUT (default: a temp dir) collects artifacts.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
skill="$(cd "$here/.." && pwd)"
sim=(node "$skill/bin/subtext-sim")
device=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --device) device="$2"; shift 2 ;;
    *) echo "usage: $0 --device <UDID|name>" >&2; exit 2 ;;
  esac
done
[[ -n "$device" ]] || { echo "usage: $0 --device <UDID|name>" >&2; exit 2; }
out="${OUT:-$(mktemp -d "${TMPDIR:-/tmp}/subtext-sim-e2e.XXXXXX")}"
mkdir -p "$out"

now() { node -e 'process.stdout.write(String(Date.now()))'; }
step_start=0
step() { step_start=$(now); printf '\n== %s\n' "$*"; }
took() { printf '   (%s ms)\n' "$(( $(now) - step_start ))"; }
fail() { echo "E2E FAILED: $*" >&2; exit 1; }
expect() { grep -qF -- "$1" <<<"$2" || fail "expected output to contain: $1"; }

cleanup() {
  local code=$?
  if [[ "${E2E_KEEP_BOOTED:-}" == 1 ]]; then "${sim[@]}" stop >/dev/null 2>&1 || true
  else "${sim[@]}" stop --shutdown >/dev/null 2>&1 || true; fi
  exit $code
}

step "build helper"
bash "$skill/helper/build.sh" >/dev/null
took

step "build sample app"
app="$(bash "$skill/fixtures/SampleApp/build.sh" 2>/dev/null | tail -1)"
echo "   $app"
took

# The sample app's .sightmap/ lives next to it, so run from there.
cd "$skill/fixtures/SampleApp"
trap cleanup EXIT

step "start --detach"
"${sim[@]}" start --device "$device" --app "$app" --detach --label e2e
took

step "snapshot (login)"
snap="$("${sim[@]}" snapshot)"
took
echo "$snap"
expect '[View: Login]' "$snap"
expect '[SignInButton "Sign In"]' "$snap"

step "click SignInButton by component name (empty form → validation error)"
"${sim[@]}" click SignInButton
took
sleep 0.5
expect '[LoginError' "$("${sim[@]}" snapshot)"

step "fill email and password by identifier"
"${sim[@]}" fill login-email "agent@example.com"
"${sim[@]}" fill login-password "hunter2"
took

step "click login-submit by identifier"
"${sim[@]}" click login-submit
took
sleep 1

step "snapshot (products)"
snap="$("${sim[@]}" snapshot)"
took
echo "$snap" | head -12
expect '[View: Products]' "$snap"

step "click an off-screen product is refused"
if "${sim[@]}" click product-row-150 2>"$out/refused.txt"; then fail "off-screen click was not refused"; fi
cat "$out/refused.txt"
expect 'scroll' "$(cat "$out/refused.txt")"

step "scroll down until Product 150 is on screen"
"${sim[@]}" scroll down --until 'ProductRow[title^="Product 150,"]'
took

step "click product-row-150"
"${sim[@]}" click product-row-150
took
sleep 1
snap="$("${sim[@]}" snapshot)"
expect '[ProductName "Product 150"]' "$snap"

step "click AddToCartButton"
"${sim[@]}" click AddToCartButton
took
sleep 1

step "console list"
logs="$("${sim[@]}" console list --grep 'Product 150')"
echo "$logs"
expect 'added Product 150 to cart' "$logs"
expect 'signed in as agent@example.com' "$("${sim[@]}" console list --grep 'signed in')"

step "screenshot"
"${sim[@]}" screenshot --out "$out/product-150.png"
file "$out/product-150.png" | grep -q 'PNG image' || fail "screenshot is not a PNG"
took

step "run log"
runlog="$("${sim[@]}" run tail)"
echo "$runlog"
expect 'click → ' "$runlog"
grep -q '"text":"<redacted>"' "$(ls -t .sightmap/.sim-runs/*.jsonl | head -1)" || fail "password was not redacted in the run log"

step "status"
"${sim[@]}" status

step "stop"
trap - EXIT
if [[ "${E2E_KEEP_BOOTED:-}" == 1 ]]; then "${sim[@]}" stop; else "${sim[@]}" stop --shutdown; fi
took
echo
echo "E2E PASSED (artifacts in $out)"
