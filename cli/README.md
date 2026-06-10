# Subtext CLI

[![npm](https://img.shields.io/npm/v/%40subtextdev%2Fsubtext-cli)](https://www.npmjs.com/package/@subtextdev/subtext-cli)
[![GitHub release](https://img.shields.io/github/v/release/fullstorydev/subtext?filter=cli%2Fv*&label=release)](https://github.com/fullstorydev/subtext/releases?q=cli%2Fv)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A command-line interface for the [Subtext](https://subtext.fullstory.com) MCP server. Open a browser, inspect the page, click things, take screenshots — from a shell or CI script.

---

## Table of Contents

- [What is the Subtext CLI?](#what-is-the-subtext-cli)
- [Installation](#installation)
- [Quickstart](#quickstart)
- [Concepts](#concepts)
- [Commands](#commands)
- [Authentication](#authentication)
- [Configuration](#configuration)
- [Output formats](#output-formats)
- [Environment variables](#environment-variables)
- [Common workflows](#common-workflows)
- [Exit codes](#exit-codes)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Releasing](#releasing)

---

## What is the Subtext CLI?

The Subtext CLI opens a hosted browser session and lets you drive it: navigate, inspect the DOM, click, type, take screenshots, and close — all from a shell. Built for AI agents and CI pipelines, but works just as well for manual spot-checks.

Each command maps directly to a [Subtext MCP](https://subtext.fullstory.com) tool: `subtext live connect` calls `live-connect`, `subtext comment add` calls `comment-add`, and so on. Schemas are fetched live so `--help` always reflects the current API.

---

## Installation

### npx (no install required)

```bash
npx -y @subtextdev/subtext-cli auth whoami
```

### npm (global)

```bash
npm install -g @subtextdev/subtext-cli
subtext version
```

### go install

```bash
go install github.com/fullstorydev/subtext/cli/cmd/subtext@latest
```

Requires Go 1.22+. The binary is placed in `$(go env GOPATH)/bin`.

### Binary download

Pre-built binaries for Linux, macOS, and Windows (amd64 + arm64) are available on the [releases page](https://github.com/fullstorydev/subtext/releases?q=cli%2Fv). Download, extract, and place the `subtext` binary somewhere on your `PATH`.

### Verify

```bash
subtext version
# subtext v1.0.0
```

---

## Quickstart

Set your API key once, then drive a browser:

```bash
export SUBTEXT_API_KEY=fs-...
subtext auth whoami
# OK. Endpoint: https://api.fullstory.com/mcp/subtext. Key source: env:SUBTEXT_API_KEY.
```

```bash
# Open a browser
subtext live connect --url https://example.com --format text
# Viewer: https://app.fullstory.com/ui/.../trace/...

# Snapshot the page — every element gets a UID
subtext live view-snapshot
# uid=1_0  RootWebArea "Example Domain"
# uid=1_1    main visible
# uid=1_2      heading "Example Domain" visible
# uid=1_3      paragraph visible
# uid=1_4      link "More information..." visible interactive

# Interact using the component_id from the snapshot
subtext live act-click --component_id 1_4
subtext live act-fill --component_id 1_10 --value "hello world"

# Clip a screenshot to a specific element
subtext live view-screenshot --upload --component_id 1_4
# {"ok":true,"data":{"screenshot_url":"https://storage.googleapis.com/..."}}

# Close
subtext live disconnect
```

`view-snapshot` assigns a `uid` to every element. Pass it as `--component_id` to `act-*` and `view-screenshot` — no CSS selectors needed. That's the core loop. The rest of the CLI adds [comments](#comment), [proof documents](#doc), [localhost tunnels](#tunnel), and [sightmaps](#sightmap) on top of it.

---

## Concepts

### Namespaces and verbs

Every command follows `subtext <namespace> <verb> [--flags]`. The namespace + verb pair maps to an MCP tool name: `live connect` → `live-connect`. Schemas are fetched from the server at call time, so running `subtext live connect --help` always shows the live API definition, not a cached copy.

Per-tool help:

```bash
subtext live --help            # list all verbs in the live namespace
subtext live connect --help    # full schema for live-connect
subtext doc create --help      # full schema for doc-create
```

### Sessions, traces, and viewer links

Every `live` command response includes a `trace_url`. Print it immediately after connecting and share it with teammates for a real-time view of the session:

```bash
subtext live connect --url https://example.com --format text
# Viewer: https://app.fullstory.com/ui/.../trace/...
```

### Tunnels (localhost access)

The hosted browser cannot reach `localhost` directly. Use the tunnel-first flow:

```
live tunnel  →  tunnel connect  →  live view-new
```

`subtext live connect` cannot bind a tunnel — it mints its own connection. You must use `live tunnel` when working with local dev servers. See [Drive a localhost dev server](#drive-a-localhost-dev-server).

`--allowed-origins` takes `host:port` pairs (no scheme). To avoid `chrome-error://` pages on OAuth or SSO redirects, default to the trunk domain rather than a subdomain:

```
# Good: covers all subdomains on that port
--allowed-origins localhost:3000

# Multi-port stack
--allowed-origins localhost:3000,localhost:4200
```

### Component UIDs

`view-snapshot` assigns a stable `uid` to every element in the page tree:

```
uid=1_0  RootWebArea "Example Domain"
uid=1_1    main visible
uid=1_4    link "More information..." visible interactive
```

Pass the `uid` as `--component_id` to `act-*` commands and `view-screenshot`. No CSS selectors needed — use the value from the snapshot you just took:

```bash
subtext live act-click --component_id 1_4
subtext live act-fill --component_id 1_10 --value "search query"
subtext live view-screenshot --upload --component_id 1_4   # clip to that element
```

UIDs are stable within a connection. Take a fresh snapshot after navigation to get updated UIDs.

### Sightmaps

`.sightmap/` YAML files in your project root map CSS selectors and routes to semantic component names. After uploading, the hosted browser resolves those names in snapshots, screenshots, and interaction targets. Upload them before calling `live view-new` so the very first snapshot is enriched.

The nonce URL used for uploading is **single-use and expires in 5 minutes**. Mint a fresh one for each upload.

### Operator handoff

When `subtext live signal` returns `operator=human`, the session has been handed to a human viewer. All `live act-*` commands will error during this state — do not retry them. Read-only commands (`view-snapshot`, `view-screenshot`, etc.) continue to work. Poll `live signal` with the saved `cursor` and resume when `operator` flips back to `agent`.

---

## Commands

| Namespace | Type | Description |
|-----------|------|-------------|
| `live` | passthrough | Connect to and drive a hosted browser |
| `comment` | passthrough | Add, list, reply to, and resolve session replay comments |
| `doc` | passthrough | Create and manage proof documents |
| `artifact` | passthrough | Upload and retrieve file artifacts |
| `privacy` | passthrough | Detect PII and manage element-block privacy rules |
| `review` | passthrough | Deep-review a recorded session (screenshots, diffs, component trees) |
| `tunnel` | native | Manage reverse tunnels for localhost access |
| `sightmap` | native | Upload `.sightmap/` component definitions |
| `auth` | native | Verify authentication (`whoami`) |
| `version` | native | Print version |

**Passthrough** namespaces delegate to the MCP server. **Native** namespaces have hand-written implementations.

### `live`

```bash
subtext live connect --url <url>                         # open a new session
subtext live view-snapshot                               # DOM snapshot — assigns UIDs to every element
subtext live act-click --component_id <uid>              # click by uid from snapshot
subtext live act-fill --component_id <uid> --value <text>  # fill a text input
subtext live act-hover --component_id <uid>              # hover
subtext live act-keypress --key <key>                    # key press (e.g. Enter, Tab)
subtext live act-scroll --component_id <uid>             # scroll element into view
subtext live view-screenshot [--upload] [--component_id <uid>]  # screenshot; clip to UID
subtext live view-navigate --url <url>                   # navigate to a new URL
subtext live view-new --url <url>                        # open new tab (tunnel-first flow)
subtext live emulate --device <name>                     # emulate a device (mobile, tablet)
subtext live eval-script --script <js>                   # run JavaScript
subtext live signal [--since <cursor>]                   # poll for operator/user signals
subtext live tunnel [--allowed-origins <origins>]        # mint session + relay URL for localhost
subtext live disconnect                                  # end the session
```

`view-snapshot` is the primary inspection tool — take one before any interaction, then use the UIDs it returns. `view-inspect` produces verbose CSS output for sightmap authoring only, not general use.

Every response that touches a view includes `capture_status`. Check it each call — values: `active`, `blocked`, `snippet_not_found`, `api_unavailable`.

### `comment`

```bash
subtext comment list --trace_id <id>
subtext comment add --trace_id <id> --text "..." --intent bug
subtext comment reply --comment_id <id> --text "..."
subtext comment resolve --comment_id <id>
```

Always call `comment list` before adding new comments to avoid duplicates. `--intent` values: `bug`, `tweak`, `ask`, `looks-good`.

When attaching a screenshot to a comment, pass `screenshot_url` **verbatim** including the full `?Expires=&GoogleAccessId=&Signature=` query string. Stripping any part of it returns a 403.

### `doc`

```bash
subtext doc create --title "..."
subtext doc list
subtext doc read --doc_id <id>
subtext doc update --doc_id <id> --append "..."
subtext doc attach --doc_id <id> --label "..." --text "..." --content_type text/markdown
subtext doc attach --doc_id <id> --label "..." --url <screenshot_url> --render_as image
subtext doc diff --doc_id <id>
subtext doc close --doc_id <id>
```

Lifecycle: `create` → `[update / attach]*` → `close`. Closed docs produce an immutable snapshot (`v1.md`, `v2.md`, …).

Open documents auto-close as `abandoned` after 24 hours of inactivity. Reopen by calling `doc update` on a closed doc.

When attaching text content, use `--text` + `--content_type text/markdown` rather than `--base64_data` to avoid ~33% size inflation.

### `tunnel`

```bash
subtext tunnel connect --relay-url <url> [--allowed-origins <origins>] [--detach]
subtext tunnel status --tunnel-id <id>
subtext tunnel disconnect --tunnel-id <id>
subtext tunnel disconnect --all
```

`--detach` runs the tunnel in the background and prints the tunnel ID. Use it in CI scripts. The relay URL comes from `subtext live tunnel --format json | jq -r .data.relayUrl`.

One tunnel per connection. Widen `--allowed-origins` rather than opening additional tunnels.

### `sightmap`

```bash
subtext sightmap upload --url <nonce-url>
subtext sightmap upload --url <nonce-url> --root /path/to/project
subtext sightmap upload --url <nonce-url> --format json
# {"ok":true,"components":12}
```

Without `--root`, the project root is auto-detected from the current directory. The upload URL comes from `live tunnel` (JSON field `sightmapUploadUrl`) or `live connect` (text line `sightmap_upload_url:`).

### `artifact`

```bash
subtext artifact upload --filename <name> --text "..."           # text/markdown content
subtext artifact upload --filename <name> --base64_data <b64>    # binary content
subtext artifact url --artifact_id <id> --ext <ext>              # refresh an expired URL
```

### `privacy`

```bash
subtext privacy propose --session_url <url>                  # scan a session for PII (dry-run)
subtext privacy create --selectors '[{"selector":".email"}]' # create rules in preview scope
subtext privacy list                                         # list all editable rules
subtext privacy list --scope_filter preview                  # preview-scoped rules only
subtext privacy promote --rule_ids '["<id>"]'                # promote to all sessions
subtext privacy delete --rule_ids '["<id>"]'                 # delete a preview-scoped rule
```

Rules are always created in `PREVIEW_SESSIONS_ONLY` scope and must be explicitly promoted. `propose` is a dry-run and persists nothing. Only `mask` and `exclude` block types are supported — unmask rules cannot be created or deleted here.

### `review`

```bash
subtext review open --trace_id <id>                  # open by trace ID
subtext review open --session_url <url>              # open by session URL
subtext review view --client_id <id> --page_id <p> --timestamp <ts>      # screenshot + component tree
subtext review inspect --client_id <id> --page_id <p> --timestamp <ts>   # detailed component tree with selectors
subtext review diff --client_id <id> --page_id <p> --from_ts <ts> --to_ts <ts>  # diff two moments
subtext review close --client_id <id> --use_case bug_diagnosis --was_helpful true
```

`open` accepts `trace_id`, `session_url`, `device_id`+`session_id`, `email_address`, or `user_uid`. Always call `close` when done — it releases server resources and records feedback.

Primary use cases: verify another agent's proof work (chapter markers as the spine), diagnose a bug from a captured session, produce a structured summary of what happened. Sessions are read-only — use `subtext live` to drive a running app instead.

### `auth`

```bash
subtext auth whoami
# OK. Endpoint: https://api.fullstory.com/mcp/subtext. Key source: env:SUBTEXT_API_KEY.
```

### `version`

```bash
subtext version
# subtext v0.2.0
```

---

## Authentication

The CLI resolves your API key in this order:

1. `--api-key <key>` flag — pass `-` to read from stdin, keeping the key out of shell history
2. `SUBTEXT_API_KEY` environment variable
3. `api_key` field in the config file

```bash
# Verify which key source is active
subtext auth whoami

# Read key from stdin (CI-safe)
echo "$MY_SECRET" | subtext --api-key - auth whoami
```

No interactive login flow exists. Obtain an API key from the [Subtext dashboard](https://subtext.fullstory.com).

---

## Configuration

Default path: `~/.config/subtext/config.yaml`. All fields are optional.

```yaml
api_key: fs-...             # overridden by --api-key / SUBTEXT_API_KEY
region: na1                 # na1 (default) or eu1
endpoint: https://...       # overrides region if set
sightmap_root: /path/to/project  # overridden by --root / SIGHTMAP_ROOT
```

Override the config file path with `--config <file>` or `SUBTEXT_CONFIG`.

---

## Output formats

All commands accept `--format json` (default) or `--format text`.

```bash
# JSON (default) — pipe-friendly
subtext live connect --url https://example.com
# {"ok":true,"data":{"trace_url":"...","connection_id":"..."}}

# Human-readable
subtext live connect --url https://example.com --format text
# Connected. Viewer: https://...

# Extract a field with jq
TRACE=$(subtext live connect --url https://example.com | jq -r .data.trace_url)

# Pass complex arguments from a file
subtext doc update --doc_id abc --params-file edits.json
```

---

## Environment variables

| Variable | Purpose |
|----------|---------|
| `SUBTEXT_API_KEY` | API key |
| `SUBTEXT_REGION` | Default region: `na1` (default) or `eu1` |
| `SUBTEXT_ENDPOINT` | Override the MCP endpoint URL |
| `SUBTEXT_CONFIG` | Override config file path |
| `SUBTEXT_ALLOW_INSECURE_ENDPOINT` | Set to `1` to allow `http://` endpoints |
| `SIGHTMAP_ROOT` | Root directory for `sightmap upload`; auto-detected from CWD if unset |
| `SUBTEXT_SKIP_DOWNLOAD` | Set to `1` to skip binary download during `npm install` |
| `SUBTEXT_TUNNEL_DAEMON` | Set to `1` internally by `tunnel connect --detach`; do not set manually |

---

## Common workflows

### Basic browser session

```bash
# Open
subtext live connect --url https://example.com --format text
# Viewer: https://app.fullstory.com/ui/.../trace/...

# Snapshot — assigns a uid to every element
subtext live view-snapshot
# uid=1_0  RootWebArea "Example Domain"
# uid=1_5    nav visible
# uid=1_6      link "Login" visible interactive
# uid=1_10   main visible
# uid=1_11     form visible
# uid=1_12       textbox "Email" visible interactive

# Interact using the component_id from the snapshot
subtext live act-click --component_id 1_6
subtext live act-fill --component_id 1_12 --value "user@example.com"
subtext live view-navigate --url https://example.com/dashboard

# Clip a screenshot to a specific element, or capture the full page
subtext live view-screenshot --upload --component_id 1_11
# {"ok":true,"data":{"screenshot_url":"https://storage.googleapis.com/..."}}

# Close
subtext live disconnect
```

### Drive a localhost dev server

The hosted browser cannot reach `localhost` directly. Use the tunnel-first flow:

```bash
# 1. Mint a session and get the relay URL + sightmap nonce
TUNNEL=$(subtext live tunnel --format json)
RELAY_URL=$(echo "$TUNNEL" | jq -r .data.relayUrl)
SIGHTMAP_URL=$(echo "$TUNNEL" | jq -r .data.sightmapUploadUrl)
TRACE_URL=$(echo "$TUNNEL" | jq -r .data.traceUrl)

echo "Viewer: $TRACE_URL"

# 2. Start the reverse tunnel (in background)
subtext tunnel connect --relay-url "$RELAY_URL" \
  --allowed-origins localhost:3000 \
  --detach

# 3. Upload sightmaps before the first snapshot
subtext sightmap upload --url "$SIGHTMAP_URL"

# 4. Open the page in the hosted browser
subtext live view-new --url http://localhost:3000
```

### Upload sightmaps and verify

```bash
# Mint session, upload, then check the snapshot has named components
SIGHTMAP_URL=$(subtext live tunnel --format json | jq -r .data.sightmapUploadUrl)
subtext sightmap upload --url "$SIGHTMAP_URL"
# Uploaded 12 component(s).

subtext live view-snapshot
# [View: Dashboard > Main content] — confirms sightmap resolved
```

### Capture a PR-ready screenshot

```bash
subtext live view-navigate --url https://example.com/feature
SCREENSHOT=$(subtext live view-screenshot --upload | jq -r .data.screenshot_url)

# Attach to a proof doc — pass the full URL verbatim (signed query string included)
subtext doc attach --doc_id "$DOC_ID" --label "screenshot" --url "$SCREENSHOT" --render_as image
```

### Poll for operator signals

```bash
# First call: omit --since
RESULT=$(subtext live signal)
CURSOR=$(echo "$RESULT" | jq -r .data.cursor)
OPERATOR=$(echo "$RESULT" | jq -r .data.operator)

# Subsequent calls: pass cursor back as --since
while true; do
  RESULT=$(subtext live signal --since "$CURSOR")
  CURSOR=$(echo "$RESULT" | jq -r .data.cursor)
  OPERATOR=$(echo "$RESULT" | jq -r .data.operator)

  if [ "$OPERATOR" = "agent" ]; then
    echo "Control returned to agent"
    break
  fi
  sleep 5
done
```

### CI/script mode

```bash
# Run a headless check; exit non-zero on error or auth failure
set -euo pipefail

subtext auth whoami                                            # exit 4 if key invalid
subtext live connect --url "$URL" --format json > /tmp/session.json
TRACE=$(jq -r .data.trace_url /tmp/session.json)
echo "Viewer: $TRACE"

# Detached tunnel for localhost — clean up on exit
TUNNEL_ID=$(subtext tunnel connect --relay-url "$RELAY" --detach | jq -r .data.tunnelId)
trap 'subtext tunnel disconnect --tunnel-id "$TUNNEL_ID"' EXIT
```

---

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Generic error |
| `2` | Usage error (bad flags, missing required argument) |
| `3` | Not found (tool not found, tunnel not found) |
| `4` | Auth error (invalid or missing API key) |

---

## Troubleshooting

**`subtext: binary not found`**
The postinstall download was skipped or failed. Reinstall: `npm install @subtextdev/subtext-cli`. If you set `SUBTEXT_SKIP_DOWNLOAD=1`, the binary was intentionally not downloaded.

**`chrome-error://chromewebdata/` after navigation**
The hosted browser hit a page outside the tunnel's allowed origins (common with OAuth/SSO redirects). Widen `--allowed-origins` to the trunk domain, then reconnect the tunnel:

```bash
subtext tunnel disconnect --tunnel-id "$TUNNEL_ID"
subtext tunnel connect --relay-url "$RELAY_URL" \
  --allowed-origins example.test:3000 \
  --detach
```

**`403` when attaching a screenshot URL to a comment or doc**
The signed GCS URL was modified. Pass the `screenshot_url` from `view-screenshot --upload` verbatim, including the full query string (`?Expires=&GoogleAccessId=&Signature=...`).

**`Control transferred to human viewer`**
A human has taken over the session. Do not retry `act-*` commands. Poll `subtext live signal` with the saved cursor until `operator` returns to `agent`.

**Sightmap upload returns `404`**
The nonce URL expired (valid for 5 minutes). Mint a fresh one with `subtext live tunnel` and upload again.

**`live connect` can't reach localhost**
`live connect` does not support tunnels. Use the tunnel-first flow: `live tunnel` → `tunnel connect` → `live view-new`.

---

## Development

See [DEVELOPMENT.md](DEVELOPMENT.md) for full setup instructions.

```bash
cd cli
go build -o /tmp/subtext ./cmd/subtext
/tmp/subtext auth whoami

go test ./...
```

Requires Go 1.22+.

---

## Releasing

See [RELEASING.md](RELEASING.md).

---

## License

MIT. See [LICENSE](../LICENSE) or the `license` field in [npm/package.json](npm/package.json).
