#!/usr/bin/env bash
# Build the subtext-sandbox image tagged for skill-eval consumption.
# Phase 1: --no-cache to stay honest about what we ship. Phase 3 will
# introduce cached base + thin query layers.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
SANDBOX_DIR="$REPO_ROOT/subtext-sandbox"

if [ ! -d "$SANDBOX_DIR" ]; then
  echo "Error: sandbox dir not found at $SANDBOX_DIR" >&2
  exit 1
fi

echo "Building subtext-sandbox-claude image (--no-cache)..."
docker build --no-cache -t subtext-sandbox-claude "$SANDBOX_DIR"
echo "Built subtext-sandbox-claude:latest"
