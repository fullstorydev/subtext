# Subtext CLI

A command-line tool for driving the [Subtext](https://subtext.fullstory.com) MCP server from your terminal. Use it to control live browser sessions, manage session replay comments, create proof documents, and upload sightmaps — the same operations your AI agent performs, but from a shell or CI script.

## Install

```bash
# npx (no install required)
npx @fullstory/subtext-cli auth whoami

# npm (global install)
npm install -g @fullstory/subtext-cli

# go install
go install github.com/fullstorydev/subtext/cli/cmd/subtext@latest

# Download a binary directly
# https://github.com/fullstorydev/subtext/releases
```

## Quickstart

```bash
# 1. Set your API key
export SUBTEXT_API_KEY=fs-...

# 2. Verify connectivity
subtext auth whoami

# 3. Open a live browser session
subtext live connect --url https://example.com

# 4. Take a screenshot
subtext live view-screenshot

# 5. Create a proof document
subtext doc create --title "My review"
```

## Commands

| Namespace | Description |
|-----------|-------------|
| `live` | Connect to and drive a hosted browser (navigate, click, screenshot, inspect) |
| `comment` | Add, list, reply to, and resolve session comments |
| `doc` | Create and manage proof documents (create, update, attach, close) |
| `tunnel` | Manage reverse tunnels for localhost access |
| `artifact` | Upload and retrieve file artifacts |
| `sightmap` | Upload `.sightmap/` component definitions to a live session |
| `auth` | Manage authentication (`login`, `whoami`) |

Every namespace supports per-tool help that fetches live schema from the server:

```bash
subtext live --help
subtext live connect --help
subtext doc create --help
```

## Calling tools

Tools follow the `subtext <namespace> <verb> [--flags]` pattern:

```bash
# Connect a browser and navigate
subtext live connect --url https://example.com
subtext live view-navigate --url https://example.com/dashboard

# Create a document and attach a screenshot
subtext doc create --title "Regression check" --tags p1
subtext live view-screenshot
subtext doc attach --session-url <url>

# JSON output (default)
subtext live connect --url https://example.com --format json

# Human-readable text output
subtext live connect --url https://example.com --format text

# Pass complex nested args from a file
subtext doc update --params-file edits.json
```

## Auth

The CLI resolves your API key in this order:

1. `--api-key` flag (pass `-` to read from stdin, keeping the key out of shell history)
2. `SUBTEXT_API_KEY` environment variable
3. `api_key` field in the config file

```bash
subtext auth whoami
# OK. Endpoint: https://api.fullstory.com/mcp/subtext. Key source: env:SUBTEXT_API_KEY.

echo "$MY_KEY" | subtext --api-key - auth whoami
```

## Config file

`~/.config/subtext/config.yaml` (all fields optional):

```yaml
api_key: fs-...            # overridden by --api-key / SUBTEXT_API_KEY
region: na1                # na1 (default) or eu1
endpoint: https://...      # overrides region if set
sightmap_root: /path/to/project  # overridden by --root / SIGHTMAP_ROOT
```

Override the path with `--config <file>` or `SUBTEXT_CONFIG`.

## Environment variables

| Variable | Purpose |
|----------|---------|
| `SUBTEXT_API_KEY` | API key |
| `SUBTEXT_REGION` | Default region: `na1` (default) or `eu1` |
| `SUBTEXT_ENDPOINT` | Override endpoint URL |
| `SUBTEXT_CONFIG` | Override config file path |
| `SUBTEXT_ALLOW_INSECURE_ENDPOINT` | Set to `1` to allow `http://` endpoints |
| `SIGHTMAP_ROOT` | Root for `sightmap upload`; auto-detected if unset |

## Sightmap upload

`.sightmap/` YAML files map component names to CSS selectors. Upload them to a live session so the hosted browser can resolve component names to DOM elements.

**How it works:**

1. `subtext live tunnel` mints a session and returns a `sightmapUploadUrl` — a nonce URL (no `Authorization` header needed) that expires in 5 minutes.
2. `subtext sightmap upload --url <URL>` walks `.sightmap/`, flattens nested `children:` into compound CSS selectors, collects `memory:` strings, and POSTs to the nonce URL.
3. After upload, the hosted browser can resolve component names during screenshots and interactions.

```bash
# Mint a session and capture the upload URL
URL=$(subtext live tunnel --format json | jq -r '.data.sightmapUploadUrl')

# Upload from the current project root
subtext sightmap upload --url "$URL"
# Uploaded 12 component(s).

# Explicit root
subtext sightmap upload --url "$URL" --root /path/to/project

# JSON output
subtext sightmap upload --url "$URL" --format json
# {"ok":true,"components":12}
```

The nonce is single-use. Mint a fresh URL for each upload.

## Development

```bash
cd cli
go build ./cmd/subtext
go test ./...
```

Requires Go 1.22+.
