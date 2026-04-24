#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# ── Preflight ──────────────────────────────────────────────────────────────
if [ -z "${ANTHROPIC_API_KEY:-}" ] || [ -z "${FULLSTORY_API_KEY:-}" ]; then
  if [ -f .env ]; then
    # shellcheck disable=SC2046
    export $(grep -v '^#' .env | xargs)
  fi
fi

if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  echo "Error: ANTHROPIC_API_KEY is not set."
  echo "Either export it or create a .env file (see .env.example)."
  exit 1
fi

if [ -z "${FULLSTORY_API_KEY:-}" ]; then
  echo "Error: FULLSTORY_API_KEY is not set."
  echo "Either export it or create a .env file (see .env.example)."
  exit 1
fi

# ── Plugin source ─────────────────────────────────────────────────────────
SOURCE="${1:-}"
if [ -z "$SOURCE" ]; then
  echo "Usage: $0 <local|prod>"
  echo ""
  echo "  local  – use the subtext plugin from ~/src/subtext"
  echo "  prod   – clone the subtext plugin from github.com/fullstorydev/subtext"
  exit 1
fi

case "$SOURCE" in
  local)
    SUBTEXT_SRC="$HOME/src/subtext"
    if [ ! -d "$SUBTEXT_SRC" ]; then
      echo "Error: Subtext source not found at $SUBTEXT_SRC"
      exit 1
    fi
    export PLUGIN_SOURCE=local
    ;;
  prod)
    export PLUGIN_SOURCE=prod
    ;;
  *)
    echo "Usage: $0 <local|prod>"
    exit 1
    ;;
esac

# ── Build fresh container (no cache) ─────────────────────────────────────
echo "Building fresh Docker image (no cache) ..."
docker compose build --no-cache

# ── Run ───────────────────────────────────────────────────────────────────
echo ""
echo "Starting interactive Claude session (plugin source: $SOURCE)..."
echo "Once inside, run:"
echo "  /mcp list"
echo "  /subtext:onboard"
echo ""

if [ "$SOURCE" = "local" ]; then
  docker compose run --rm -v "$HOME/src/subtext:/opt/subtext:ro" claude
else
  docker compose run --rm claude
fi
