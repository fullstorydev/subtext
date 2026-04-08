---
name: subtext:live
description: Live browser MCP tools for driving a hosted browser — connections, views, interactions, console, network, and tunnel. Use when reproducing flows, taking screenshots, or interacting with a running app.
metadata:
  requires:
    skills: ["subtext:shared"]
---

# Live Browser

> **PREREQUISITE:** Read `subtext:shared` for MCP conventions and sightmap upload.

API catalog for live browser tools (all prefixed `live-`) on the unified subtext MCP server. These tools let you open browser connections, navigate views, interact with elements, and inspect console/network activity.

## MCP Tools

### Connections

| Tool | Description |
|------|-------------|
| `live-connect` | Open a browser connection to a URL. Returns screenshot, component tree, `fs_session_url`, and `viewer_url`. |
| `live-disconnect` | Close a browser connection. Returns `fs_session_url` and `viewer_url`. |
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
| `live-view-screenshot` | Visual screenshot of current view |
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

### Tunnel

| Tool | Description |
|------|-------------|
| `live-tunnel` | Get tunnel relay URL for connecting to localhost |

## Discovering Parameters

Parameter schemas are visible in the tool definition at call time.

## Session URLs

Both `fs_session_url` and `viewer_url` are returned by `live-connect`, `live-disconnect`, `live-view-navigate`, `live-view-new`, and `live-view-snapshot`.

- **fs_session_url** — the raw Fullstory session URL.
- **viewer_url** — a shareable link that opens the live viewer in a browser. **Always print this to the user** so they can watch the agent's browser in real time.

After every `live-connect`, output the viewer URL on its own line:

```
Viewer: {viewer_url}
```

## Tips

- Always `live-view-snapshot` before interacting — you need element UIDs to click/fill.
- `live-view-snapshot` is cheaper than `live-view-screenshot`. Prefer snapshots; use screenshots for visual evidence.
- Component names from sightmap appear in snapshots — use `[src: ...]` annotations to find source files.
- Close connections when done to free server resources.

## Tunnel Setup

When the hosted browser needs to reach `localhost` or local dev URLs, set up a tunnel first:

1. Call `live-tunnel` to get the relay URL
2. Call `tunnel-connect` on the **subtext-tunnel** MCP server with `relayUrl`, `connectionId`, and `target`
3. Then call `live-connect` with the localhost URL — traffic routes through the tunnel

See `subtext:tunnel` for the full tunnel setup flow.

## See Also

- `subtext:shared` — MCP conventions and sightmap upload
- `subtext:tunnel` — Reverse tunnel setup for localhost access
