#!/bin/bash
set -e

# ── Resolve plugin source ────────────────────────────────────────────────
PLUGIN_DIR="/opt/subtext"

if [ "${PLUGIN_SOURCE:-prod}" = "prod" ]; then
  echo "Cloning subtext plugin from GitHub..."
  git clone --depth 1 https://github.com/fullstorydev/subtext.git "$PLUGIN_DIR"
else
  if [ ! -d "$PLUGIN_DIR" ]; then
    echo "Error: Local subtext plugin not mounted at $PLUGIN_DIR"
    exit 1
  fi
  echo "Using local subtext plugin at $PLUGIN_DIR"
fi

# ── Eval mode (non-interactive, single-query) ────────────────────────────
if [ -n "${EVAL_QUERY:-}" ]; then
  : "${EVAL_CLEAN_NAME:?EVAL_CLEAN_NAME must be set in eval mode}"
  : "${EVAL_DESCRIPTION:?EVAL_DESCRIPTION must be set in eval mode}"

  # Stage the skill as a command file so Claude advertises it.
  # printf '%s' takes variable values as literal strings, so descriptions
  # containing $ or backticks don't get shell-interpreted. This was a real
  # bug under heredoc staging (flagged in Phase 1 final review).
  mkdir -p /workspace/.claude/commands
  INDENTED_DESC="$(printf '%s' "$EVAL_DESCRIPTION" | sed 's/^/  /')"
  printf -- '---\ndescription: |\n%s\n---\n\n# %s\n\nThis skill handles: %s\n' \
    "$INDENTED_DESC" \
    "$EVAL_CLEAN_NAME" \
    "$EVAL_DESCRIPTION" \
    > "/workspace/.claude/commands/${EVAL_CLEAN_NAME}.md"

  # Disable MCP connections (not needed for trigger detection, and they
  # delay startup waiting for network). Remove the .mcp.json baked in by
  # the Dockerfile. The plugin's own skills still load via --plugin-dir.
  rm -f /workspace/.mcp.json

  # CLAUDECODE env var guard is for interactive terminal conflicts —
  # programmatic claude -p usage is safe to unset.
  unset CLAUDECODE

  exec claude --plugin-dir "$PLUGIN_DIR" \
    -p "$EVAL_QUERY" \
    --output-format stream-json \
    --verbose \
    --include-partial-messages \
    ${EVAL_MODEL:+--model "$EVAL_MODEL"}
fi

# ── Interactive mode (default) ───────────────────────────────────────────
echo "Starting Vite dev server on port 5173..."
npm run dev -- --host 0.0.0.0 &
DEV_PID=$!

echo "Waiting for dev server to be ready..."
for i in $(seq 1 30); do
  if curl -s -o /dev/null -w '%{http_code}' http://localhost:5173 | grep -q '200\|302\|301'; then
    echo "Dev server is ready at http://localhost:5173"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "Warning: Dev server may not be fully ready, proceeding anyway..."
  fi
  sleep 1
done

exec claude --plugin-dir "$PLUGIN_DIR" "$@"
