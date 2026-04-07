# Subtext CLI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build both a bash CLI and a Node.js CLI/SDK that wrap the Subtext MCP JSON-RPC API, making all 30+ tools accessible from the terminal.

**Architecture:** Both CLIs translate user-friendly commands (e.g. `subtext connect <url>`) into JSON-RPC 2.0 calls to `https://api.fullstory.com/mcp/subtext` with Bearer token auth. The bash version is a single self-contained script using curl. The Node.js version is a publishable npm package (`@fullstory/subtext-cli`) with a programmatic SDK layer and a CLI entry point built on yargs.

**Tech Stack:** Bash + curl + python3 (bash CLI); Node.js + TypeScript + yargs (Node CLI/SDK)

---

## Task 1: Bash CLI — Core Framework

**Files:**
- Create: `tools/subtext-cli.sh`

**Step 1: Write the bash CLI framework**

Create `tools/subtext-cli.sh` with:
- Shebang, `set -euo pipefail`
- `SECRET_SUBTEXT_API_KEY` env var check (required)
- `SUBTEXT_API_URL` env var (default: `https://api.fullstory.com/mcp/subtext`)
- `SUBTEXT_SCREENSHOT_DIR` env var (optional, for auto-saving screenshots)
- A `call_mcp()` function that:
  - Accepts tool name + JSON params
  - Sends JSON-RPC 2.0 POST via curl to `$SUBTEXT_API_URL`
  - Sets `Authorization: Bearer $SECRET_SUBTEXT_API_KEY`
  - Parses response, extracts `result.content` array
  - If `SUBTEXT_SCREENSHOT_DIR` is set and response contains base64 image, decode and save it via python3
  - Prints text content to stdout
- A `usage()` function showing help
- A `case` dispatch on `$1` for subcommands

**Step 2: Run a smoke test**

```bash
chmod +x tools/subtext-cli.sh
bash tools/subtext-cli.sh --help
```

Expected: prints usage info, exits 0.

**Step 3: Commit**

```bash
git add tools/subtext-cli.sh
git commit -m "feat: add bash CLI framework with MCP JSON-RPC transport"
```

---

## Task 2: Bash CLI — Browser Control Commands

**Files:**
- Modify: `tools/subtext-cli.sh`

**Step 1: Add browser control subcommands**

Add case branches for:
- `connect <url>` → `live-connect` with `{"url": "$2"}`
- `disconnect <conn_id>` → `live-disconnect` with `{"connection_id": "$2"}`
- `snapshot <conn_id> [view_id]` → `live-view-snapshot`
- `screenshot <conn_id> [view_id]` → `live-view-screenshot`
- `navigate <conn_id> <url>` → `live-view-navigate`
- `new-tab <conn_id> [url]` → `live-view-new`
- `close-tab <conn_id> <view_id>` → `live-view-close`
- `tabs <conn_id>` → `live-view-list`
- `emulate <conn_id> <device>` → `live-emulate`
- `resize <conn_id> <w> <h>` → `live-view-resize`

**Step 2: Add the `connect` output parser**

After `connect`, parse the response to print:
```
connection_id: <id>
viewer_url: <url>
```
This makes it easy to capture in scripts: `CONN=$(subtext connect "$URL" | grep "connection_id:" | awk '{print $2}')`

**Step 3: Commit**

```bash
git add tools/subtext-cli.sh
git commit -m "feat(bash-cli): add browser control commands (connect, disconnect, snapshot, navigate, tabs)"
```

---

## Task 3: Bash CLI — Interaction Commands

**Files:**
- Modify: `tools/subtext-cli.sh`

**Step 1: Add interaction subcommands**

Add case branches for:
- `click <conn_id> <component_id>` → `live-act-click`
- `fill <conn_id> <comp_id> <value>` → `live-act-fill`
- `fill-multi <conn_id> <json>` → `live-act-fill` with multiple fields
- `hover <conn_id> <component_id>` → `live-act-hover`
- `keypress <conn_id> <key> [comp]` → `live-act-keypress`
- `drag <conn_id> <comp> <dx> <dy>` → `live-act-drag`
- `wait <conn_id> <type> <value>` → `live-act-wait-for`

**Step 2: Commit**

```bash
git add tools/subtext-cli.sh
git commit -m "feat(bash-cli): add interaction commands (click, fill, hover, keypress, drag, wait)"
```

---

## Task 4: Bash CLI — Observation & Utility Commands

**Files:**
- Modify: `tools/subtext-cli.sh`

**Step 1: Add observation and utility subcommands**

Add case branches for:
- `eval <conn_id> <expression>` → `live-eval-script`
- `logs <conn_id> [level] [limit]` → `live-log-list`
- `network <conn_id> [pattern] [limit]` → `live-net-list`
- `tools` → calls `tools/list` JSON-RPC method to list available tools
- `raw <tool_name> <json>` → pass-through to any MCP tool (the escape hatch)

**Step 2: Verify `--help` shows all commands**

```bash
bash tools/subtext-cli.sh --help
```

Expected: all commands listed with descriptions.

**Step 3: Commit**

```bash
git add tools/subtext-cli.sh
git commit -m "feat(bash-cli): add eval, logs, network, tools, and raw escape hatch"
```

---

## Task 5: Node.js SDK — Project Setup

**Files:**
- Create: `cli/package.json`
- Create: `cli/tsconfig.json`
- Create: `cli/.gitignore`

**Step 1: Create the Node.js package**

Create `cli/package.json`:
```json
{
  "name": "@fullstory/subtext",
  "version": "0.1.0",
  "description": "CLI and SDK for Subtext — FullStory's agent browser testing tool",
  "type": "module",
  "main": "./build/sdk/index.js",
  "types": "./build/sdk/index.d.ts",
  "bin": {
    "subtext": "./build/cli/index.js"
  },
  "exports": {
    ".": {
      "types": "./build/sdk/index.d.ts",
      "import": "./build/sdk/index.js"
    }
  },
  "files": ["build/"],
  "scripts": {
    "build": "tsc",
    "test": "node --test build/tests/**/*.js",
    "prepublishOnly": "npm run build"
  },
  "keywords": ["fullstory", "subtext", "mcp", "browser-testing", "cli"],
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/fullstorydev/subtext.git",
    "directory": "cli"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.9.2",
    "yargs": "18.0.0",
    "@types/yargs": "^17.0.35"
  },
  "engines": {
    "node": "^20.11.0 || ^22.12.0 || >=23"
  }
}
```

Create `cli/tsconfig.json` extending a standard config, targeting ES2022, `outDir: "build"`, `rootDir: "src"`, strict, declaration: true.

Create `cli/.gitignore`:
```
build/
node_modules/
```

**Step 2: Install dependencies**

```bash
cd cli && npm install
```

**Step 3: Commit**

```bash
git add cli/package.json cli/tsconfig.json cli/.gitignore cli/package-lock.json
git commit -m "feat(node-cli): scaffold @fullstory/subtext package"
```

---

## Task 6: Node.js SDK — Transport Layer

**Files:**
- Create: `cli/src/sdk/transport.ts`
- Create: `cli/tests/transport.test.ts`

**Step 1: Write transport test**

Create `cli/tests/transport.test.ts`:
- Test that `callTool()` constructs correct JSON-RPC 2.0 payload
- Test that it sets Authorization header correctly
- Test error handling for HTTP failures and JSON-RPC errors
- Use a mock fetch (Node 22 has built-in fetch; mock via `--test` test runner)

**Step 2: Run tests to see them fail**

```bash
cd cli && npm run build && npm test
```

Expected: FAIL — transport.ts doesn't exist yet.

**Step 3: Write transport implementation**

Create `cli/src/sdk/transport.ts`:
```typescript
export interface SubtextConfig {
  apiKey: string;
  apiUrl?: string; // default: https://api.fullstory.com/mcp/subtext
}

export interface ToolResult {
  content: Array<{type: string; text?: string; data?: string; mimeType?: string}>;
  isError?: boolean;
}

export async function callTool(
  config: SubtextConfig,
  tool: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  const url = config.apiUrl ?? "https://api.fullstory.com/mcp/subtext";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "tools/call",
      params: { name: tool, arguments: params },
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  const body = await res.json();
  if (body.error) throw new Error(`MCP error ${body.error.code}: ${body.error.message}`);
  return body.result;
}
```

**Step 4: Run tests**

```bash
cd cli && npm run build && npm test
```

Expected: PASS

**Step 5: Commit**

```bash
git add cli/src/sdk/transport.ts cli/tests/transport.test.ts
git commit -m "feat(sdk): add JSON-RPC transport layer with callTool()"
```

---

## Task 7: Node.js SDK — Client Class

**Files:**
- Create: `cli/src/sdk/client.ts`
- Create: `cli/src/sdk/index.ts`
- Create: `cli/tests/client.test.ts`

**Step 1: Write client test**

Test the `SubtextClient` class:
- `client.connect(url)` returns `{connectionId, viewerUrl, ...}`
- `client.click(connId, componentId)` calls `live-act-click`
- `client.disconnect(connId)` calls `live-disconnect`
- Mock `callTool` at the transport layer

**Step 2: Run tests to see them fail**

**Step 3: Write the client**

Create `cli/src/sdk/client.ts`:
```typescript
import { callTool, SubtextConfig, ToolResult } from "./transport.js";

export class SubtextClient {
  constructor(private config: SubtextConfig) {}

  // Browser control
  async connect(url: string): Promise<ToolResult> { ... }
  async disconnect(connectionId: string): Promise<ToolResult> { ... }
  async snapshot(connectionId: string, viewId?: string): Promise<ToolResult> { ... }
  async screenshot(connectionId: string, viewId?: string): Promise<ToolResult> { ... }
  async navigate(connectionId: string, url: string): Promise<ToolResult> { ... }
  async newTab(connectionId: string, url?: string): Promise<ToolResult> { ... }
  async closeTab(connectionId: string, viewId: string): Promise<ToolResult> { ... }
  async tabs(connectionId: string): Promise<ToolResult> { ... }
  async emulate(connectionId: string, device: string): Promise<ToolResult> { ... }
  async resize(connectionId: string, width: number, height: number): Promise<ToolResult> { ... }

  // Interactions
  async click(connectionId: string, componentId: string): Promise<ToolResult> { ... }
  async fill(connectionId: string, componentId: string, value: string): Promise<ToolResult> { ... }
  async hover(connectionId: string, componentId: string): Promise<ToolResult> { ... }
  async keypress(connectionId: string, key: string, componentId?: string): Promise<ToolResult> { ... }
  async drag(connectionId: string, componentId: string, dx: number, dy: number): Promise<ToolResult> { ... }
  async waitFor(connectionId: string, type: string, value: string): Promise<ToolResult> { ... }

  // Observation
  async eval(connectionId: string, expression: string): Promise<ToolResult> { ... }
  async logs(connectionId: string, level?: string, limit?: number): Promise<ToolResult> { ... }
  async network(connectionId: string, pattern?: string, limit?: number): Promise<ToolResult> { ... }

  // Raw escape hatch
  async raw(tool: string, params: Record<string, unknown>): Promise<ToolResult> { ... }

  // List tools
  async tools(): Promise<ToolResult> { ... }
}
```

Create `cli/src/sdk/index.ts` exporting `SubtextClient`, `SubtextConfig`, `ToolResult`, and `callTool`.

**Step 4: Run tests**

Expected: PASS

**Step 5: Commit**

```bash
git add cli/src/sdk/ cli/tests/client.test.ts
git commit -m "feat(sdk): add SubtextClient with all browser, interaction, and observation methods"
```

---

## Task 8: Node.js CLI — Entry Point

**Files:**
- Create: `cli/src/cli/index.ts`
- Create: `cli/src/cli/commands.ts`

**Step 1: Write CLI entry point**

Create `cli/src/cli/index.ts`:
```typescript
#!/usr/bin/env node
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { registerCommands } from "./commands.js";

const argv = yargs(hideBin(process.argv));
registerCommands(argv);
argv.demandCommand(1, "Run subtext --help for usage")
  .strict()
  .help()
  .parse();
```

**Step 2: Write commands**

Create `cli/src/cli/commands.ts` that registers yargs commands mapping to `SubtextClient` methods:
- Each command reads `SECRET_SUBTEXT_API_KEY` from env
- Reads `SUBTEXT_API_URL` from env (optional)
- Reads `SUBTEXT_SCREENSHOT_DIR` from env (optional)
- Creates a `SubtextClient` and calls the appropriate method
- Prints text content to stdout
- If `SUBTEXT_SCREENSHOT_DIR` is set and response has image content, saves PNG

Commands to register (matching the bash CLI surface):
- `connect <url>`
- `disconnect <connection_id>`
- `snapshot <connection_id> [view_id]`
- `screenshot <connection_id> [view_id]`
- `click <connection_id> <component_id>`
- `fill <connection_id> <component_id> <value>`
- `hover <connection_id> <component_id>`
- `keypress <connection_id> <key> [component_id]`
- `navigate <connection_id> <url>`
- `new-tab <connection_id> [url]`
- `close-tab <connection_id> <view_id>`
- `tabs <connection_id>`
- `emulate <connection_id> <device>`
- `resize <connection_id> <width> <height>`
- `drag <connection_id> <component_id> <dx> <dy>`
- `wait <connection_id> <type> <value>`
- `eval <connection_id> <expression>`
- `logs <connection_id> [level] [limit]`
- `network <connection_id> [pattern] [limit]`
- `tools`
- `raw <tool_name> <json>`

**Step 3: Build and test help output**

```bash
cd cli && npm run build && node build/cli/index.js --help
```

Expected: all commands listed.

**Step 4: Commit**

```bash
git add cli/src/cli/
git commit -m "feat(cli): add yargs CLI entry point with all commands"
```

---

## Task 9: Integration Test

**Files:**
- Create: `cli/tests/cli-smoke.test.ts`

**Step 1: Write smoke test**

Test that the CLI:
- `--help` exits 0 and shows usage
- `connect` without args shows error
- `raw` with no tool name shows error
- Commands without `SECRET_SUBTEXT_API_KEY` print a clear error

These tests use `child_process.execFile` to invoke the built CLI.

**Step 2: Run tests**

```bash
cd cli && npm run build && npm test
```

Expected: PASS

**Step 3: Commit**

```bash
git add cli/tests/cli-smoke.test.ts
git commit -m "test: add CLI smoke tests"
```

---

## Task 10: Final Polish

**Files:**
- Modify: `tools/subtext-cli.sh` (if needed)
- Modify: `cli/package.json` (if needed)

**Step 1: Verify bash CLI help matches Node CLI help**

Run both `--help` and compare the command surfaces match.

**Step 2: Add a top-level README section**

Don't create a new file — update the existing `README.md` to mention the CLI existence and point to `tools/` and `cli/`.

**Step 3: Final commit**

```bash
git add -A
git commit -m "docs: add CLI references to README"
```

---

## Summary

| Deliverable | Location | Install |
|---|---|---|
| Bash CLI | `tools/subtext-cli.sh` | `cp tools/subtext-cli.sh /usr/local/bin/subtext` |
| Node CLI | `cli/` | `npm install -g @fullstory/subtext` |
| Node SDK | `cli/src/sdk/` | `import { SubtextClient } from "@fullstory/subtext"` |

All three share the same command surface and env var conventions (`SECRET_SUBTEXT_API_KEY`, `SUBTEXT_API_URL`, `SUBTEXT_SCREENSHOT_DIR`).
