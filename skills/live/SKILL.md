---
name: subtext:live
description: Live browser MCP tools for driving a hosted browser — connections, views, interactions, console, network, and tunnel. Use when reproducing flows, taking screenshots, or interacting with a running app.
metadata:
  requires:
    skills: ["subtext:shared"]
---

# Live Browser

> **PREREQUISITE — Read inline before any other action:** Read skill `subtext:shared` for MCP prefix conventions and environment detection. Do not use the Skill tool — read the file directly.

API catalog for live browser tools (all prefixed `live-`) on the unified subtext MCP server. These tools let you open browser connections, navigate views, interact with elements, and inspect console/network activity.

## MCP Tools

### Connections

| Tool | Description |
|------|-------------|
| `live-connect` | Open a browser connection to a URL. Returns screenshot + component tree. |
| `live-disconnect` | Close a browser connection and free resources. |
| `live-emulate` | Set device emulation (viewport, user agent, etc.) |

### Views

| Tool | Description |
|------|-------------|
| `live-view-navigate` | Navigate the current view to a new URL |
| `live-view-new` | Open a new view (tab) |
| `live-view-list` | List all open views |
| `live-view-select` | Switch to a different view |
| `live-view-close` | Close a view |
| `live-view-components` | Accessibility tree snapshot with component UIDs |
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

## Tips

- `live-connect` returns both a screenshot and component tree — use it as your first look at a page.
- Always `live-view-components` before interacting — you need element UIDs to click/fill.
- `live-view-components` is cheaper than `live-view-screenshot`. Prefer snapshots; use screenshots for visual evidence.
- Component names from sightmap appear in snapshots — use `[src: ...]` annotations to find source files.
- Close connections when done to free server resources.

## Tunnel Setup

When the hosted browser needs to reach `localhost` or local dev URLs, set up a tunnel first:

1. Call `live-tunnel` to get the relay URL
2. Call `tunnel-connect` on the **live-tunnel** MCP server with `relayUrl`, `connectionId`, and `target`
3. Then call `live-connect` with the localhost URL — traffic routes through the tunnel

See `subtext:tunnel` for the full tunnel setup flow.

## See Also

- `subtext:shared` — MCP prefix conventions and environment detection
- `subtext:tunnel` — Reverse tunnel setup for localhost access
