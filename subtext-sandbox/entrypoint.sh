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

  # The plugin mount at /opt/subtext is read-only, but we need to rewrite
  # SKILL.md's frontmatter description so the routing layer sees the test
  # description. Copy to a writable location and modify there.
  #
  # Pre-fix history: prior to 2026-04-25, EVAL_DESCRIPTION was staged at
  # /workspace/.claude/commands/<name>.md (a slash command file), which is
  # NOT auto-routable. The model routed against the on-disk SKILL.md instead.
  # See tools/skill-eval/iterations/2026-04-25-proof/diagnostic-1/results.md.
  RUNTIME_PLUGIN_DIR=/tmp/subtext-runtime
  rm -rf "$RUNTIME_PLUGIN_DIR"
  cp -R "$PLUGIN_DIR" "$RUNTIME_PLUGIN_DIR"

  SKILL_FILE="$RUNTIME_PLUGIN_DIR/skills/${EVAL_CLEAN_NAME}/SKILL.md"
  if [ ! -f "$SKILL_FILE" ]; then
    echo "Error: SKILL.md not found at $SKILL_FILE" >&2
    exit 1
  fi

  # Rewrite the frontmatter description: line in place. EVAL_DESCRIPTION
  # must be single-line — newlines would break YAML. ENVIRON avoids awk's
  # backslash-escape processing on the value.
  if EVAL_DESCRIPTION="$EVAL_DESCRIPTION" awk '
    BEGIN { fm = 0; new_desc = ENVIRON["EVAL_DESCRIPTION"]; replaced = 0 }
    /^---$/ { fm++ }
    fm == 1 && /^description: / && !replaced { print "description: " new_desc; replaced = 1; next }
    { print }
    END { if (!replaced) exit 1 }
  ' "$SKILL_FILE" > "$SKILL_FILE.tmp"; then
    mv "$SKILL_FILE.tmp" "$SKILL_FILE"
  else
    echo "Error: no 'description: ' line found in frontmatter of $SKILL_FILE" >&2
    rm -f "$SKILL_FILE.tmp"
    exit 1
  fi

  # Diagnostic echo: confirm what landed in the SKILL.md the loader sees.
  echo "[entrypoint] Staged description on $SKILL_FILE:" >&2
  grep -m1 '^description: ' "$SKILL_FILE" | head -c 300 >&2
  echo >&2

  # Dry-run hook for the acceptance test suite: short-circuit before exec'ing
  # claude so T1 can exercise staging without firing the API. Also dumps the
  # full staged frontmatter to stderr for content assertions.
  if [ -n "${EVAL_DRY_RUN:-}" ]; then
    echo "[entrypoint] EVAL_DRY_RUN=1 set; skipping claude. Frontmatter:" >&2
    awk '/^---$/{c++; print; if (c==2) exit; next} c==1 {print}' "$SKILL_FILE" >&2
    exit 0
  fi

  # Disable MCP connections (not needed for trigger detection, and they
  # delay startup waiting for network). Remove the .mcp.json baked in by
  # the Dockerfile. The plugin's own skills still load via --plugin-dir.
  rm -f /workspace/.mcp.json

  # CLAUDECODE env var guard is for interactive terminal conflicts —
  # programmatic claude -p usage is safe to unset.
  unset CLAUDECODE

  exec claude --plugin-dir "$RUNTIME_PLUGIN_DIR" \
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
