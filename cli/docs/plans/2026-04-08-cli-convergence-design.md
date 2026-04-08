# Subtext CLI Convergence — Design Doc

## Goal

Converge the StoryArc Python CLI wrapper and the canonical Node.js CLI/SDK into a single `@fullstorydev/subtext-cli` package with:
- Automatic sightmap upload via a post-connect hook
- Automatic localhost tunnel setup
- TDD test coverage for all new and existing modules

## Background

Three CLI implementations exist today:
- **`@fullstorydev/subtext-cli`** (Node.js/TypeScript) — 25+ commands, SDK + CLI separation, npm-publishable, but no sightmap awareness
- **`tools/subtext-cli.py`** (StoryArc) — 15 commands, auto-uploads sightmap on connect, auto-detects localhost tunnel, but single-file, no tests
- **`tools/subtext-cli.sh`** (Bash) — minimal fallback, no sightmap

The Python script proved that sightmap auto-upload and tunnel auto-detection are high-value features. This design formalizes them in the canonical CLI.

## Architecture

```
@fullstorydev/subtext-cli/
  src/
    sdk/
      client.ts          # SubtextClient — gains hooks + smart connect
      transport.ts        # JSON-RPC 2.0 over fetch (unchanged)
      hooks.ts            # Hook registry + built-in post-connect hook
      sightmap.ts         # Sightmap discovery, YAML parsing, upload
      tunnel.ts           # Tunnel orchestration for localhost URLs
    cli/
      commands.ts         # yargs CLI — gains --no-hooks flag
      index.ts            # Entry point (unchanged)
  tests/
    client.test.ts        # Existing + new hook/connect tests
    transport.test.ts     # Existing (unchanged)
    cli-smoke.test.ts     # Existing + --no-hooks test
    sightmap.test.ts      # NEW: YAML parsing, flattening, discovery, upload
    hooks.test.ts         # NEW: Hook lifecycle, enable/disable
    tunnel.test.ts        # NEW: Localhost detection, tunnel orchestration
```

## Connection Flows

### Public URL (no tunnel needed)

```
client.connect("https://example.com")
  1. callTool("live-connect", { url }) → response with connection_id, sightmap_upload_url
  2. [post-connect hook] Upload sightmap if .sightmap/ found
  3. Return response
```

### Localhost URL (tunnel-first flow)

```
client.connect("http://localhost:3000")
  1. Detect localhost/127.0.0.1 URL
  2. callTool("live-tunnel", {}) → { relayUrl, connectionId }
  3. Emit tunnel event for local tunnel-connect (user handles, or CLI orchestrates)
  4. callTool("live-view-new", { connection_id, url }) → response with sightmap_upload_url
  5. [post-connect hook] Upload sightmap if .sightmap/ found
  6. Return response
```

The tunnel-connect step (step 3) requires the `subtext-tunnel` MCP server, which is a separate local process. In the CLI, the `connect` command orchestrates this automatically. In the SDK, a `tunnelConnect` callback or the raw `tunnel-connect` call can be used.

**Important:** `live-connect` always mints its own connection ID. For localhost URLs, the tunnel-first flow uses `live-tunnel` (which allocates the connection) + `live-view-new` (which opens a view on that connection), NOT `live-connect`.

## Hooks

### Design

Minimal lifecycle hooks — not a generic plugin system.

```typescript
interface HookContext {
  connectionId: string;
  url: string;
  response: ToolResult;
  sightmapUploadUrl?: string;
}

interface Hooks {
  postConnect?: (ctx: HookContext) => Promise<void>;
}
```

### Built-in: Post-Connect Sightmap Upload

After a successful connection (either flow), the hook:
1. Checks if `.sightmap/` exists (walks up from `cwd`, max 5 levels)
2. Extracts `sightmap_upload_url` from the connect/view-new response
3. Parses all `.yaml`/`.yml` files in `.sightmap/`
4. Flattens hierarchical components into compound CSS selectors
5. Collects global `memory` entries
6. POSTs JSON to the upload URL (single-use token, no additional auth)
7. Logs: `sightmap: uploaded N components`

If no `.sightmap/` found or upload fails, continues silently.

### Disabling

```typescript
// SDK
const client = new SubtextClient({ apiKey, hooks: false });

// CLI
subtext connect https://example.com --no-hooks

// Environment
SUBTEXT_NO_HOOKS=1
```

## Sightmap Module (`sightmap.ts`)

Ports the Python `collect_and_upload_sightmap.py` logic to TypeScript:

```typescript
// Discovery
function findSightmapRoot(cwd: string): string | null;

// Parsing
function parseSightmapFile(path: string): SightmapConfig;
function flattenComponents(components: SightmapComponent[], parentSelectors: string[], parentSource: string): FlatComponent[];

// Collection
function collectComponents(root: string): FlatComponent[];
function collectMemory(root: string): string[];

// Upload
function uploadSightmap(uploadUrl: string, components: FlatComponent[], memory: string[]): Promise<UploadResult>;

// Orchestrator (called by hook)
function autoUploadSightmap(sightmapUploadUrl: string, cwd?: string): Promise<void>;
```

### Sightmap YAML Schema (v1)

```yaml
version: 1

memory:
  - "Global note shown in every snapshot's [Guide] section"

components:
  - name: NavBar
    selector: "nav.main-nav"    # string or string[]
    source: src/NavBar.tsx      # optional
    description: "..."          # optional, not uploaded
    memory:                     # optional, uploaded
      - "Contextual hint"
    children:                   # optional, selectors scoped to parent
      - name: NavLink
        selector: "a.nav-link"

views:
  - name: Login
    route: "/login"             # glob pattern matched against pathname
    source: app/(auth)/login.tsx
    components: [...]           # view-scoped, merged with globals

requests:
  - name: FetchFlights
    route: "/api/flights"
    method: GET
    request: { fields: [...] }
    response: { fields: [...] }
```

## Tunnel Module (`tunnel.ts`)

```typescript
function isLocalUrl(url: string): boolean;

// Orchestrates tunnel-first flow via MCP tools
async function setupTunnel(
  config: SubtextConfig,
  targetUrl: string
): Promise<{ connectionId: string; relayUrl: string }>;
```

Localhost detection: matches `localhost`, `127.0.0.1`, `0.0.0.0`, `[::1]`, and any `.local` hostname.

**Note:** The tunnel-connect step requires the `subtext-tunnel` local MCP server. In the CLI, this is orchestrated via a child process or direct WebSocket connection. In the SDK, the user provides a `tunnelConnect` callback or uses the raw method. The CLI handles this transparently; the SDK exposes it as a composable step.

## SDK API Changes

```typescript
class SubtextClient {
  constructor(config: SubtextConfig & { hooks?: boolean });

  // Enhanced: auto-detects localhost, sets up tunnel, runs hooks
  async connect(url: string, options?: ConnectOptions): Promise<ConnectResult>;

  // New: explicit sightmap upload
  async uploadSightmap(uploadUrl: string, root?: string): Promise<UploadResult>;

  // New: explicit tunnel setup (for advanced use)
  async tunnel(connectionId?: string): Promise<TunnelResult>;

  // Existing methods unchanged...
}

interface ConnectOptions {
  hooks?: boolean;        // override instance-level hook setting
  tunnelTarget?: string;  // override auto-detected tunnel target
}

interface ConnectResult extends ToolResult {
  connectionId: string;
  viewerUrl: string;
  sightmapUploadUrl?: string;
}
```

## CLI Changes

```bash
# Existing (unchanged)
subtext connect <url>
subtext disconnect <connection_id>
subtext snapshot <connection_id>
# ... all existing commands

# New flag
subtext connect <url> --no-hooks    # skip sightmap upload

# New command
subtext sightmap upload <url>       # manual sightmap upload to a sightmap_upload_url
subtext sightmap show               # display parsed .sightmap/ contents (debug)
```

## MCP Response Shapes (from live testing)

### `live-connect` (public URL)
```
connection_id: <uuid>
current_view: view_1
url: <navigated url>
fs_session_url: https://app.fullstory.com/ui/<org>/client-session/<device>%3A<session>
viewer_url: https://app.fullstory.com/subtext/<org>/session/<device>:<session>?connection_id=<uuid>
capture_status: active
[Guide]
- <memory entries>

<component tree — text format with uid, role, name, interactive flag>

sightmap_upload_url: https://st.fullstory.com/subtext/sightmap?token=<uuid>&affinity_key=<connection_id>
```

### `live-tunnel`
```json
{
  "relayUrl": "wss://st.fullstory.com/subtext/live/tunnel?token=<uuid>&connection_id=<uuid>",
  "connectionId": "<uuid>"
}
```

### `tunnel-connect`
```json
{
  "state": "ready",
  "tunnelId": "<uuid>",
  "connectionId": "<uuid>",
  "target": "http://localhost:8081",
  "relayUrl": "wss://..."
}
```

### `live-view-navigate` / `live-view-snapshot`
Same as `live-connect` response minus `sightmap_upload_url`.

### `live-disconnect`
```
Connection closed.
fs_session_url: <url>
viewer_url: <url>
```

## TDD Test Plan

Tests written BEFORE implementation, using Node.js built-in `node:test`.

### `tests/sightmap.test.ts` — Sightmap module

**Discovery:**
- `findSightmapRoot()` returns path when `.sightmap/` exists in cwd
- `findSightmapRoot()` walks up directory tree to find `.sightmap/`
- `findSightmapRoot()` returns null when no `.sightmap/` found within 5 levels
- `findSightmapRoot()` returns null for empty `.sightmap/` directory (no YAML files)

**YAML Parsing:**
- `parseSightmapFile()` parses valid v1 YAML with components, views, requests, memory
- `parseSightmapFile()` throws on missing `version` field
- `parseSightmapFile()` handles empty file gracefully (returns empty config)
- `parseSightmapFile()` ignores `description` field (not uploaded)

**Component Flattening:**
- `flattenComponents()` converts single component to flat format: `{ name, selectors, source, memory }`
- `flattenComponents()` handles string selector (wraps in array)
- `flattenComponents()` handles array selector (preserves as-is)
- `flattenComponents()` flattens children with compound selectors: parent + child joined with space
- `flattenComponents()` inherits parent source when child omits source
- `flattenComponents()` handles 3-level nesting (grandchildren)
- `flattenComponents()` skips components with no name or no selector
- `flattenComponents()` deduplicates by name

**Collection:**
- `collectComponents()` merges components from multiple YAML files
- `collectComponents()` includes view-scoped components
- `collectMemory()` collects top-level memory from all files
- `collectMemory()` includes component-level memory entries
- `collectComponents()` finds files recursively in subdirectories

**Upload:**
- `uploadSightmap()` POSTs correct JSON payload to upload URL
- `uploadSightmap()` returns component count from server response
- `uploadSightmap()` handles HTTP error (non-2xx) gracefully
- `uploadSightmap()` handles network failure gracefully
- `uploadSightmap()` sends no auth header (token is in URL)

**Orchestrator:**
- `autoUploadSightmap()` finds `.sightmap/`, collects, and uploads
- `autoUploadSightmap()` silently no-ops when no `.sightmap/` found
- `autoUploadSightmap()` silently no-ops on upload failure
- `autoUploadSightmap()` logs component count on success

### `tests/hooks.test.ts` — Hook system

**Lifecycle:**
- Post-connect hook fires after successful `live-connect`
- Post-connect hook receives correct context (connectionId, url, sightmapUploadUrl)
- Post-connect hook does NOT fire when hooks disabled via constructor
- Post-connect hook does NOT fire when `--no-hooks` / `SUBTEXT_NO_HOOKS=1`
- Post-connect hook does NOT fire when connect fails (error response)
- Post-connect hook failure does not propagate — connect still succeeds

**Sightmap Hook Integration:**
- Default post-connect hook calls `autoUploadSightmap()` with extracted URL
- Hook extracts `sightmap_upload_url` from text content via regex
- Hook handles response with no `sightmap_upload_url` (no-op)

### `tests/tunnel.test.ts` — Tunnel module

**URL Detection:**
- `isLocalUrl()` returns true for `http://localhost:3000`
- `isLocalUrl()` returns true for `http://127.0.0.1:8080`
- `isLocalUrl()` returns true for `http://0.0.0.0:3000`
- `isLocalUrl()` returns true for `http://[::1]:3000`
- `isLocalUrl()` returns true for `http://myapp.local:3000`
- `isLocalUrl()` returns false for `https://example.com`
- `isLocalUrl()` returns false for `https://storyarc-app.netlify.app`
- `isLocalUrl()` returns false for `http://192.168.1.100:3000` (LAN IP, not localhost)

**Tunnel Setup:**
- `setupTunnel()` calls `live-tunnel` and returns connectionId + relayUrl
- `setupTunnel()` throws on `live-tunnel` error

### `tests/client.test.ts` — Enhanced client tests (additions to existing)

**Smart Connect:**
- `connect()` calls `live-connect` for public URLs
- `connect()` uses tunnel-first flow for localhost URLs
- `connect()` runs post-connect hook after public URL connect
- `connect()` runs post-connect hook after tunnel connect + view-new
- `connect()` returns parsed ConnectResult with connectionId and viewerUrl
- `connect()` with `{ hooks: false }` skips hook

**Sightmap Upload:**
- `uploadSightmap()` delegates to sightmap module
- `uploadSightmap()` works with URL from connect response

### `tests/cli-smoke.test.ts` — CLI additions

- `connect --no-hooks` flag is accepted
- `sightmap upload` command exists and shows help
- `sightmap show` command exists and shows help
- Missing sightmap_upload_url argument shows error

## Migration Path

1. Write tests (TDD — tests first, all failing)
2. Implement `sightmap.ts` (passes sightmap tests)
3. Implement `hooks.ts` (passes hook tests)
4. Implement `tunnel.ts` (passes tunnel tests)
5. Enhance `client.ts` connect method (passes client tests)
6. Add CLI commands and flags (passes CLI tests)
7. Publish new version of `@fullstorydev/subtext-cli`
8. Update StoryArc to use `npx @fullstorydev/subtext-cli` instead of Python script
9. Deprecate `tools/subtext-cli.py` with comment pointing to npm package

## What Stays

- `.claude/skills/shared/collect_and_upload_sightmap.py` — Claude Code plugin still uses this via the skill system. The TypeScript port is a parallel path, not a replacement.
- `.sightmap/` YAML format — unchanged, same v1 schema.
- Bash CLI (`tools/subtext-cli.sh`) — minimal fallback for environments without Node.js.

## Dependencies

- `js-yaml` (new) — YAML parsing (production dep)
- `yargs` (existing) — CLI argument parsing
- No other new dependencies
