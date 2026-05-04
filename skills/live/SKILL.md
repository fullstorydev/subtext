---
name: live
description: Live browser MCP tools for driving a hosted browser — connections, views, interactions, console, network, and tunnel. Use when reproducing flows, taking screenshots, or interacting with a running app.
metadata:
  requires:
    skills: ["subtext:shared"]
---

# Live Browser

> **PREREQUISITE:** Read `subtext:shared` for MCP conventions and sightmap upload.
> **ENVIRONMENT:** If a `subtext-environment` skill is available in the host project, read it before connecting — it specifies which MCP server prefix to use for live tools.

API catalog for live browser tools (all prefixed `live-`) on the unified subtext MCP server. These tools let you open browser connections, navigate views, interact with elements, and inspect console/network activity.

## MCP Tools

### Connections

| Tool | Description |
|------|-------------|
| `live-connect` | Open a browser connection to a URL. Returns screenshot, component tree, `fs_session_url`, `trace_id`, `trace_url`, and `capture_status`. |
| `live-disconnect` | Close a browser connection. Returns `fs_session_url`, `trace_id`, and `trace_url`. |
| `live-emulate` | Set device emulation (viewport, user agent, etc.) |

### Views

| Tool | Description |
|------|-------------|
| `live-view-navigate` | Navigate the current view to a new URL |
| `live-view-new` | Open a new view (tab) |
| `live-view-list` | List all open views |
| `live-view-select` | Switch to a different view |
| `live-view-close` | Close a view |
| `live-view-snapshot` | Component tree snapshot (no screenshot) |
| `live-view-inspect` | Component tree with full CSS selectors — for sightmap authoring only, not general use |
| `live-view-screenshot` | Visual screenshot of current view. Pass `component_id` to clip to a specific element's bounding box; optional `expand_pct` (0–100) grows the clip rect outward for surrounding context, clamped to the viewport. |
| `live-view-resize` | Resize the viewport |

### Interactions

| Tool | Description |
|------|-------------|
| `live-act-click` | Click an element by UID |
| `live-act-hover` | Hover over an element |
| `live-act-fill` | Fill a text input |
| `live-act-keypress` | Press a key or key combination |
| `live-act-drag` | Drag from one element to another |
| `live-act-wait-for` | Wait for a condition (selector, navigation, timeout) |
| `live-act-dialog` | Accept or dismiss a browser dialog |
| `live-act-upload` | Upload a file to a file input |

### Developer Tools

| Tool | Description |
|------|-------------|
| `live-eval-script` | Run JavaScript in the page context |
| `live-log-list` | List console messages |
| `live-log-get` | Get details of a specific console message |
| `live-net-list` | List network requests |
| `live-net-get` | Get details of a specific network request |

### Signals

| Tool | Description |
|------|-------------|
| `live-signal` | Poll the trace for operator state and new comment signals. Returns `{operator, operator_email?, signals[], cursor, server_time}`. Cursor-based — pass `since` back on the next call. |

### Tunnel

| Tool | Description |
|------|-------------|
| `live-tunnel` | Get tunnel relay URL for connecting to localhost |

## Discovering Parameters

Parameter schemas are visible in the tool definition at call time.

## Trace and Session URLs

`fs_session_url`, `trace_id`, and `trace_url` are returned by `live-connect`, `live-disconnect`, `live-view-navigate`, `live-view-new`, and `live-view-snapshot`.

- **fs_session_url** — the raw Fullstory session URL.
- **trace_id** — the 12-char base62 id for this connection's trace. **Capture and reuse this** as the parent identifier for `comment-*` tools and as input to `review-open` later. The trailing path segment of `trace_url` is the same id.
- **trace_url** — a shareable link that opens the live viewer in a browser. **Always print this to the user** so they can watch the agent's browser in real time.

After every connection is established — via `live-connect` or `live-view-new` (tunnel-first flow) — output the URL on its own line:

```
Viewer: {trace_url}
```

## Capture Status

Every live tool response that touches a view includes a `capture_status` field —
this includes `live-connect`, `live-view-new`, `live-view-navigate`,
`live-view-snapshot`, and `live-view-screenshot`. Check it after **every** such
call (not just `live-connect`) and respond as follows:

- `active`: proceed normally.
- `blocked`: tell the user to check capture quota and verify the target domain is allow listed in Subtext data capture settings.
- `snippet_not_found` or `api_unavailable`: tell the user something went wrong during setup and they should run onboarding again.
- any other status: something went wrong, try again

This matters especially in the **tunnel-first flow**, where `live-connect` is
never called — it's easy to miss the status if you assume the check only applies
to that one tool.

## Operator and Signals

`live-signal` is the trace's read channel for human-side activity. Call it
between action loops to learn about new comments and the operator state.

**Response shape:**

```json
{
  "operator": "agent" | "human",
  "operator_email": "...",     // present when operator=human
  "signals": [
    {
      "type": "comment", "id": "...", "ts": "...",
      "text": "...", "author_type": "user|agent",
      "intent": "...", "resolved": false, "parent_id": "..."
    }
  ],
  "cursor": "...",             // round-trip back as `since` next call
  "server_time": "..."
}
```

**Polling pattern.**

1. First call after `live-connect`: omit `since` to baseline the cursor.
2. Subsequent calls: pass the previous response's `cursor` as `since`. Only signals newer than the cursor come back.
3. Comment signals carry full text and metadata inline — no follow-up `comment-list` is needed for the new ones.
4. Save the new `cursor` after every call.

**Operator gate.** When `operator=human`, the user has taken browser control. The `live-act-*` input tools (click, fill, hover, keypress, drag, dialog, upload) return a structured error and **must not be retried**. Read-only tools (`live-view-snapshot`, `live-view-screenshot`, `live-log-*`, `live-net-*`, `live-signal`) keep working. Stay read-only and keep polling — when `operator` flips back to `agent`, resume normal work.

`live-act-wait-for` is excluded from the gate (observation-only).

## Tips

- Always `live-view-snapshot` before interacting — you need element UIDs to click/fill.
- `live-view-snapshot` is cheaper than `live-view-screenshot`. Prefer snapshots; use screenshots for visual evidence.
- When the screenshot is evidence about a specific element, clip to it with `component_id` (and small `expand_pct` for context). `expand_pct` caps at 100, so very short elements (a label, a textbox) still produce thin slices — clip to a wider parent in that case.
- `live-view-inspect` is for **sightmap authoring only** — it returns verbose CSS selectors on every node. Do not use it as a general snapshot replacement. Use it once to discover selectors, write your `.sightmap/` YAML, then use `live-view-snapshot` for everything else.
- Component names from sightmap appear in snapshots — use `[src: ...]` annotations to find source files.
- Close connections when done to free server resources.

## Tunnel Setup

When the hosted browser needs to reach `localhost` or local dev URLs, use the tunnel-first flow:

1. Call `live-tunnel` — allocates a browser connection and returns `relayUrl` + `connectionId`
2. Call `tunnel-connect` on the **subtext-tunnel** MCP server with `relayUrl` and `target`
3. Call `live-view-new` with the `connection_id` and localhost URL

Do **not** use `live-connect` for localhost URLs — it mints its own connection ID and can't bind to the tunnel. See `subtext:tunnel` for full details.

## See Also

- `subtext:shared` — MCP conventions and sightmap upload
- `subtext:tunnel` — Reverse tunnel setup for localhost access
