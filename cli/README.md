# subtext CLI — local dev

## Build

```bash
cd projects/fullstory
bazel build //go/src/fs/services/lidar/main/subtext:subtext
```

## Shell alias

```bash
alias subtext="$(pwd)/bazel-bin/go/src/fs/services/lidar/main/subtext/subtext_/subtext"
```

Or add the directory to `$PATH` for the session:

```bash
export PATH="$(pwd)/bazel-bin/go/src/fs/services/lidar/main/subtext/subtext_:$PATH"
```

## Auth

The CLI resolves your API key from multiple sources in precedence order:

1. `--api-key` flag (use `-` to read from stdin, keeping the key out of shell history)
2. `SUBTEXT_API_KEY` env var
3. `api_key` field in the config file (see [Config file](#config-file) below)

```bash
subtext auth whoami
# OK. Endpoint: https://api.fullstory.com/mcp/subtext. Key source: env:SUBTEXT_API_KEY. Server reports N tools.

echo $MY_KEY | subtext --api-key - auth whoami
```

## Config file

`~/.config/subtext/config.yaml` (optional). All fields are optional and act as the lowest-priority fallback after flags and env vars.

```yaml
api_key: fs-...            # optional; overridden by --api-key / SUBTEXT_API_KEY
region: na1                # optional; na1 (default) or eu1
endpoint: https://...      # optional; overrides region if set
sightmap_root: /path/to/project  # optional; overridden by --root / SIGHTMAP_ROOT
```

Override the path with `--config <file>` or `SUBTEXT_CONFIG`.

```bash
subtext --config ~/.config/subtext/config.yaml auth whoami
SUBTEXT_CONFIG=/path/to/config.yaml subtext auth whoami
```

## Calling tools

Tools are invoked via the namespace verb pattern: `subtext <namespace> <verb> [--flags]`.

```bash
# Per-tool help (fetches schema live from server)
subtext live connect --help
subtext comment add --help
subtext doc create --help

# Call a tool
subtext live connect --url=https://example.com
subtext doc create --title="My doc" --tags=ux --tags=p1

# JSON output (default)
subtext live connect --url=https://example.com --format json

# Text output
subtext live connect --url=https://example.com --format text

# Complex (nested object) args via a JSON file
subtext doc update --params-file=edits.json
```

## Sightmap upload

`.sightmap/` YAML files map component names to CSS selectors. Uploading them to
a live session lets the hosted browser resolve names to elements for screenshots
and interactions.

**How it works:**

1. `subtext live tunnel` mints a session and returns a `sightmapUploadUrl` — a
   URL with a single-use nonce (`token=…`) baked in as a query param. The nonce
   is the credential (no `Authorization` header needed) and expires in 5 minutes.
2. `subtext sightmap upload --url <URL>` walks the `.sightmap/` directory,
   flattens nested `children:` into compound CSS selectors using the descendant
   combinator, collects per-component and top-level `memory:` strings, and POSTs
   the result to the nonce URL.
3. The server wires the component map into the live session. After upload the
   hosted browser can resolve component names to DOM elements.

```bash
# Mint a session and capture the sightmap upload URL
URL=$(subtext live tunnel --format json | jq -r '.data.sightmapUploadUrl')

# Upload from the current project (auto-detects .sightmap/ by walking up)
subtext sightmap upload --url "$URL"
# Uploaded 12 sightmap component(s).

# Explicit root
subtext sightmap upload --url "$URL" --root /path/to/project

# JSON output
subtext sightmap upload --url "$URL" --format json
# {"ok":true,"components":12}
```

The nonce is single-use — a second `upload` call with the same URL will fail
with `invalid or expired nonce`. Mint a fresh URL for each upload.

## Commands to try

```bash
# Connectivity check
subtext auth whoami
subtext auth whoami --json

# Dynamic help — fetches live tool names + descriptions from the server
subtext live --help
subtext comment --help
subtext doc --help
subtext tunnel --help
subtext artifact --help

# Offline fallback (no SUBTEXT_API_KEY set → static Long text + skill URL)
FULLSTORY_API_KEY= SUBTEXT_API_KEY= subtext live --help

# eu1 region
subtext --region eu1 auth whoami

# Custom endpoint (staging, localdev with SUBTEXT_ALLOW_INSECURE_ENDPOINT=1)
subtext --endpoint https://api.staging.fullstory.com/mcp/subtext auth whoami
SUBTEXT_ALLOW_INSECURE_ENDPOINT=1 subtext --endpoint http://localhost:8080 auth whoami

# JSON output
subtext auth whoami --json
```

## Environment variables

| Variable | Purpose |
|---|---|
| `SUBTEXT_API_KEY` | API key |
| `SUBTEXT_REGION` | Default region: `na1` (default) or `eu1` |
| `SUBTEXT_ENDPOINT` | Override endpoint URL entirely |
| `SUBTEXT_CONFIG` | Override config file path |
| `SUBTEXT_ALLOW_INSECURE_ENDPOINT` | Set to `1` to allow `http://` endpoints |
| `SIGHTMAP_ROOT` | Root for `sightmap upload` — overrides `sightmap_root` in config; auto-detected if both unset |
