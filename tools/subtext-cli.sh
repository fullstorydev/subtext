#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# subtext-cli.sh — CLI wrapper for the Subtext MCP server
#
# Requires: bash, curl, python3 (for base64 image decoding)
# Environment:
#   SECRET_SUBTEXT_API_KEY  (required) — Bearer token for the API
#   SUBTEXT_API_URL         (optional) — API endpoint
#   SUBTEXT_SCREENSHOT_DIR  (optional) — Directory to auto-save screenshots
###############################################################################

# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------

if [[ -z "${SECRET_SUBTEXT_API_KEY:-}" ]]; then
  echo "Error: SECRET_SUBTEXT_API_KEY is not set." >&2
  echo "Export your Subtext API key before running this script:" >&2
  echo "  export SECRET_SUBTEXT_API_KEY='your-api-key'" >&2
  exit 1
fi

SUBTEXT_API_URL="${SUBTEXT_API_URL:-https://api.fullstory.com/mcp/subtext}"

# ---------------------------------------------------------------------------
# call_mcp  —  Send a JSON-RPC 2.0 tools/call request and process the response
#
# Usage: call_mcp <tool_name> <json_arguments>
#   tool_name       — The MCP tool name (e.g. "browser_snapshot")
#   json_arguments  — A JSON object string with the tool arguments
#
# Behavior:
#   - Prints text content items to stdout
#   - If SUBTEXT_SCREENSHOT_DIR is set, saves any base64 image content to files
#   - Exits non-zero on HTTP or JSON-RPC errors
# ---------------------------------------------------------------------------
call_mcp() {
  local tool_name="$1"
  local arguments="$2"

  local payload
  payload=$(cat <<ENDJSON
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "${tool_name}",
    "arguments": ${arguments}
  }
}
ENDJSON
)

  local http_code body response
  # Use a temp file so we can capture both the body and the HTTP status code
  local tmp_body
  tmp_body=$(mktemp)
  trap 'rm -f "$tmp_body"' RETURN

  http_code=$(curl -s -o "$tmp_body" -w "%{http_code}" \
    -X POST \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${SECRET_SUBTEXT_API_KEY}" \
    -d "$payload" \
    "$SUBTEXT_API_URL" 2>&1) || {
    echo "Error: curl request failed." >&2
    return 1
  }

  body=$(cat "$tmp_body")

  # Check HTTP status
  if [[ "$http_code" -lt 200 || "$http_code" -ge 300 ]]; then
    echo "Error: HTTP $http_code from $SUBTEXT_API_URL" >&2
    echo "$body" >&2
    return 1
  fi

  # Check for JSON-RPC error
  local rpc_error
  rpc_error=$(printf '%s' "$body" | python3 -c "
import sys, json
resp = json.load(sys.stdin)
if 'error' in resp:
    e = resp['error']
    print(f\"JSON-RPC error {e.get('code','?')}: {e.get('message','unknown')}\")
" 2>/dev/null || true)

  if [[ -n "$rpc_error" ]]; then
    echo "Error: $rpc_error" >&2
    return 1
  fi

  # Process result.content array
  printf '%s' "$body" | python3 -c "
import sys, json, os, base64, datetime

resp = json.load(sys.stdin)
content = resp.get('result', {}).get('content', [])
screenshot_dir = os.environ.get('SUBTEXT_SCREENSHOT_DIR', '')

for item in content:
    if item.get('type') == 'text':
        print(item.get('text', ''))
    elif item.get('type') == 'image':
        data = item.get('data', '')
        mime = item.get('mimeType', 'image/png')
        ext = 'png' if 'png' in mime else 'jpg' if 'jpeg' in mime or 'jpg' in mime else 'webp'
        if screenshot_dir and data:
            os.makedirs(screenshot_dir, exist_ok=True)
            ts = datetime.datetime.now().strftime('%Y%m%d_%H%M%S_%f')
            filepath = os.path.join(screenshot_dir, f'screenshot_{ts}.{ext}')
            with open(filepath, 'wb') as f:
                f.write(base64.b64decode(data))
            print(f'Screenshot saved: {filepath}')
        elif data:
            print(f'[image: {mime}, {len(data)} bytes base64 — set SUBTEXT_SCREENSHOT_DIR to save]')
"
}

# ---------------------------------------------------------------------------
# usage  —  Print help text
# ---------------------------------------------------------------------------
usage() {
  cat <<'EOF'
subtext-cli — Command-line interface for the Subtext MCP browser automation server

Usage: subtext-cli.sh <command> [options]

Environment variables:
  SECRET_SUBTEXT_API_KEY   (required)  API key for authentication
  SUBTEXT_API_URL          (optional)  API endpoint (default: https://api.fullstory.com/mcp/subtext)
  SUBTEXT_SCREENSHOT_DIR   (optional)  Directory to auto-save screenshot images

Commands:
  connect          Connect to a browser session
  disconnect       Disconnect from the current session
  snapshot         Take an accessibility snapshot of the current page
  screenshot       Take a screenshot of the current page
  click            Click an element on the page
  fill             Fill a single input field
  fill-multi       Fill multiple input fields at once
  hover            Hover over an element
  keypress         Send a keypress or key combination
  navigate         Navigate to a URL
  new-tab          Open a new browser tab
  close-tab        Close a browser tab
  tabs             List open browser tabs
  wait             Wait for a condition or timeout
  logs             Retrieve browser console logs
  network          Inspect network requests
  emulate          Set device emulation (viewport, user-agent, etc.)
  eval             Evaluate JavaScript in the browser context
  drag             Drag an element to a target position
  resize           Resize the browser viewport
  tools            List available MCP tools on the server
  raw              Send a raw MCP tool call (advanced)

Options:
  -h, --help       Show this help message

Examples:
  subtext-cli.sh connect --url "https://example.com"
  subtext-cli.sh screenshot
  subtext-cli.sh click --selector "#submit-btn"
  subtext-cli.sh fill --selector "#email" --value "user@example.com"
  subtext-cli.sh navigate --url "https://example.com/dashboard"
  subtext-cli.sh eval --expression "document.title"
EOF
}

# ---------------------------------------------------------------------------
# Command dispatch
# ---------------------------------------------------------------------------

if [[ $# -eq 0 ]]; then
  usage
  exit 0
fi

case "${1}" in
  -h|--help)
    usage
    exit 0
    ;;
  *)
    echo "Error: Unknown command '${1}'." >&2
    echo "Run 'subtext-cli.sh --help' for usage information." >&2
    exit 1
    ;;
esac
