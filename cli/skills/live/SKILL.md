---

name: live
description: Live browser MCP tools for driving a hosted browser — connections, views, interactions, console, network, and tunnel. Use when reproducing flows, taking screenshots, or interacting with a running app.
metadata:
  _generated_from: templates/skills/live/SKILL.template
  requires:
    skills: ["subtext:shared"]
---
# Live Browser

> **PREREQUISITE:** Read `subtext:shared` for conventions and sightmap upload.

Command catalog for live browser commands (`subtext live *`). These commands let you open browser connections, navigate views, interact with elements, and inspect console/network activity.

## Commands

### Connections

| Command | Description |
|---------|-------------|
| `subtext live connect` | Open a browser connection to a URL. Returns screenshot, component tree, `fs_session_url`, `trace_id`, `trace_url`, and `capture_status`. |
| `subtext live disconnect` | Close a browser connection. Returns `fs_session_url`, `trace_id`, and `trace_url`. |
| `subtext live emulate` | Set device emulation (viewport, user agent, etc.) |

### Views

| Command | Description |
|---------|-------------|
| `subtext live view-navigate` | Navigate the current view to a new URL |
| `subtext live view-new` | Open a new view (tab) |
| `subtext live view-list` | List all open views |
| `subtext live view-select` | Switch to a different view |
| `subtext live view-close` | Close a view |
| `subtext live view-snapshot` | Component tree snapshot (no screenshot) |
| `subtext live view-inspect` | Component tree with full CSS selectors — for sightmap authoring only, not general use |
| `subtext live view-screenshot` | Visual screenshot of current view. Pass `component_id` to clip to a specific element's bounding box; optional `expand_pct` (0–100) grows the clip rect outward for surrounding context, clamped to the viewport. |
| `subtext live view-resize` | Resize the viewport |

### Interactions

| Command | Description |
|---------|-------------|
| `subtext live act-click` | Click an element by UID |
| `subtext live act-hover` | Hover over an element |
| `subtext live act-fill` | Fill a text input |
| `subtext live act-keypress` | Press a key or key combination |
| `subtext live act-drag` | Drag from one element to another |
| `subtext live act-scroll` | Scroll the view: by component UID (into view), pixel delta, or absolute position |
| `subtext live act-wait-for` | Wait for a condition (selector, navigation, timeout) |
| `subtext live act-dialog` | Accept or dismiss a browser dialog |
| `subtext live act-upload` | Upload a file to a file input |

### Developer Tools

| Command | Description |
|---------|-------------|
| `subtext live eval-script` | Run JavaScript in the page context |
| `subtext live log-list` | List console messages |
| `subtext live log-get` | Get details of a specific console message |
| `subtext live net-list` | List network requests |
| `subtext live net-get` | Get details of a specific network request |

### Signals

| Command | Description |
|---------|-------------|
| `subtext live signal` | Poll the trace for operator state and new comment signals. Returns `{operator, operator_email?, signals[], cursor, server_time}`. Cursor-based — pass `since` back on the next call. |

### Tunnel

| Command | Description |
|---------|-------------|
| `subtext live tunnel` | Get tunnel relay URL for connecting to localhost |

## Discovering Parameters

Run `subtext live <command> --help` to see parameters for any command.

## Trace and Session URLs

`fs_session_url`, `trace_id`, and `trace_url` are returned by `subtext live connect`, `subtext live disconnect`, `subtext live view-navigate`, `subtext live view-new`, and `subtext live view-snapshot`.

- **fs_session_url** — the raw Fullstory session URL.
- **trace_id** — the 12-char base62 id for this connection's trace. **Capture and reuse this** as the parent identifier for `subtext comment *` commands. The trailing path segment of `trace_url` is the same id.
- **trace_url** — a shareable link that opens the live viewer in a browser. **Always print this to the user** so they can watch the agent's browser in real time.

After every connection is established — via `subtext live connect` or `subtext live view-new` (tunnel-first flow) — output the URL on its own line:

```
Viewer: {trace_url}
```

## Capture Status

Every live command response that touches a view includes a `capture_status` field —
this includes `subtext live connect`, `subtext live view-new`, `subtext live view-navigate`,
`subtext live view-snapshot`, and `subtext live view-screenshot`. Check it after **every** such
call (not just `subtext live connect`) and respond as follows:

- `active`: proceed normally.
- `blocked`: tell the user to check capture quota and verify the target domain is allow listed in Subtext data capture settings.
- `snippet_not_found` or `api_unavailable`: tell the user something went wrong during setup and they should check their API key and endpoint configuration.
- any other status: something went wrong, try again

This matters especially in the **tunnel-first flow**, where `subtext live connect` is
never called — it's easy to miss the status if you assume the check only applies
to that one tool.

## Operator and Signals

`subtext live signal` is the trace's read channel for human-side activity. Call it
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

1. First call after `subtext live connect`: omit `since` to baseline the cursor.
2. Subsequent calls: pass the previous response's `cursor` as `since`. Only signals newer than the cursor come back.
3. Comment signals carry full text and metadata inline — no follow-up `subtext comment list` is needed for the new ones.
4. Save the new `cursor` after every call.

**Operator gate.** When `operator=human`, the user has taken browser control. The `live-act-*` input commands (click, fill, hover, keypress, drag, dialog, upload) return a structured error and **must not be retried**. Read-only commands (`subtext live view-snapshot`, `subtext live view-screenshot`, `live-log-*`, `live-net-*`, `subtext live signal`) keep working. Stay read-only and keep polling — when `operator` flips back to `agent`, resume normal work.

`subtext live act-wait-for` is excluded from the gate (observation-only).

## Tips

- **Default to `subtext live view-snapshot` for all page observation.** It carries sightmap context (component names, view names, `[src: ...]` annotations) and provides the component UIDs needed by `act-*` commands. Always call it before any interaction sequence.
- **Use `subtext live view-screenshot` only for visual evidence** — before/after comparisons, layout debugging, or screenshots to embed in PRs. The command returns the image inline by default so you can verify framing. Pass `--upload` only when you need a hosted URL for a PR or comment attachment.
- When the screenshot is evidence about a specific element, clip to it with `--component_id` (and small `--expand_pct` for context). `expand_pct` caps at 100, so very short elements (a label, a textbox) still produce thin slices — clip to a wider parent in that case.
- `subtext live view-inspect` is for **sightmap authoring only** — it returns verbose CSS selectors on every node. Do not use it as a general snapshot replacement. Use it once to discover selectors, write your `.sightmap/` YAML, then use `subtext live view-snapshot` for everything else.
- Component names from sightmap appear in snapshots — use `[src: ...]` annotations to find source files.
- Close connections when done to free server resources.

## Tunnel Setup

When the hosted browser needs to reach `localhost` or local dev URLs, use the tunnel-first flow:

1. Run `subtext live tunnel` — allocates a browser connection and returns `relayUrl` + `connectionId`
2. Run `subtext tunnel connect` with `relayUrl` and `allowedOrigins` (one or more local origins the tunnel may serve)
3. Run `subtext live view-new` with the `connection_id` and localhost URL

Do **not** use `subtext live connect` for localhost URLs — it mints its own connection ID and can't bind to the tunnel. See `subtext:tunnel` for full details, including the trunk pattern (`host:port` covers all subdomains on the same port) needed when local apps redirect across subdomains (e.g. OAuth flows).

## See Also

- `subtext:shared` — shared conventions and sightmap upload
- `subtext:tunnel` — Reverse tunnel setup for localhost access
