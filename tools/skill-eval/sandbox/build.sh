#!/usr/bin/env bash
# Build the subtext-sandbox image tagged for skill-eval consumption.
#
# Usage:
#   ./tools/skill-eval/sandbox/build.sh                  # default: subtext-only
#   ./tools/skill-eval/sandbox/build.sh --config subtext-only
#   ./tools/skill-eval/sandbox/build.sh --config subtext-plus-superpowers
#
# Config → (dockerfile, image-tag) mapping is hardcoded here. Add a case
# below when introducing a new config. Keep this file short and explicit
# rather than growing a YAML abstraction before we have ≥3 configs.
set -euo pipefail

CONFIG="subtext-only"
FORCE_REBUILD=0
while [ $# -gt 0 ]; do
  case "$1" in
    --config)
      CONFIG="$2"
      shift 2
      ;;
    --config=*)
      CONFIG="${1#*=}"
      shift
      ;;
    --force-rebuild)
      FORCE_REBUILD=1
      shift
      ;;
    *)
      echo "Error: unknown argument '$1'" >&2
      echo "Usage: $(basename "$0") [--config <subtext-only|subtext-plus-superpowers>] [--force-rebuild]" >&2
      exit 2
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
SANDBOX_DIR="$REPO_ROOT/subtext-sandbox"

if [ ! -d "$SANDBOX_DIR" ]; then
  echo "Error: sandbox dir not found at $SANDBOX_DIR" >&2
  exit 1
fi

case "$CONFIG" in
  subtext-only)
    DOCKERFILE="$SANDBOX_DIR/Dockerfile"
    TAG="subtext-sandbox-claude:latest"
    ;;
  subtext-plus-superpowers)
    DOCKERFILE="$SANDBOX_DIR/Dockerfile.superpowers"
    TAG="subtext-sandbox-claude-superpowers:latest"
    ;;
  *)
    echo "Error: unknown config '$CONFIG'" >&2
    echo "Known configs: subtext-only, subtext-plus-superpowers" >&2
    exit 1
    ;;
esac

BUILD_FLAGS=()
if [ "$FORCE_REBUILD" = "1" ]; then
  BUILD_FLAGS+=(--no-cache)
  echo "Building config '$CONFIG' (tag: $TAG) from $DOCKERFILE — full rebuild forced..."
else
  echo "Building config '$CONFIG' (tag: $TAG) from $DOCKERFILE — using Docker layer cache (pass --force-rebuild to bypass)..."
fi
docker build "${BUILD_FLAGS[@]}" -t "$TAG" -f "$DOCKERFILE" "$SANDBOX_DIR"
echo "Built $TAG"
