---
name: live
description: Live browser MCP tools for driving a hosted browser — connections, views, interactions, console, network, and tunnel. Use when reproducing flows, taking screenshots, or interacting with a running app.
metadata:
  targets: [mcp, cli]
  requires:
    skills: ["subtext:shared"]
---

# Live Browser

> **PREREQUISITE:** Read `subtext:shared` for MCP conventions and sightmap upload.
> **ENVIRONMENT:** If a `subtext-environment` skill is available in the host project, read it before connecting — it specifies which MCP server prefix to use for live tools.

API catalog for live browser tools (all prefixed `live-`) on the unified subtext MCP server. These tools let you open browser connections, navigate views, interact with elements, and inspect console/network activity.

{{if eq .Target "cli"}}## Commands{{else}}## MCP Tools{{end}}

### Connections

| Tool | Description |
|------|-------------|
| {{tool "live-connect"}} | Open a browser connection to a URL. Returns screenshot, component tree, `fs_session_url`, `trace_id`, `trace_url`, and `capture_status`. |
| {{tool "live-disconnect"}} | Close a browser connection. Returns `fs_session_url`, `trace_id`, and `trace_url`. |
| {{tool "live-emulate"}} | Set device emulation (viewport, user agent, etc.) |

### Views

| Tool | Description |
|------|-------------|
| {{tool "live-view-navigate"}} | Navigate the current view to a new URL |
| {{tool "live-view-new"}} | Open a new view (tab) |
| {{tool "live-view-list"}} | List all open views |
| {{tool "live-view-select"}} | Switch to a different view |
| {{tool "live-view-close"}} | Close a view |
| {{tool "live-view-snapshot"}} | Component tree snapshot (no screenshot) |
| {{tool "live-view-inspect"}} | Component tree with full CSS selectors — for sightmap authoring only, not general use |
| {{tool "live-view-screenshot"}} | Visual screenshot of current view. Pass `component_id` to clip to a specific element's bounding box; optional `expand_pct` (0–100) grows the clip rect outward for surrounding context, clamped to the viewport. |
| {{tool "live-view-resize"}} | Resize the viewport |

### Interactions

| Tool | Description |
|------|-------------|
| {{tool "live-act-click"}} | Click an element by UID |
| {{tool "live-act-hover"}} | Hover over an element |
| {{tool "live-act-fill"}} | Fill a text input |
| {{tool "live-act-keypress"}} | Press a key or key combination |
| {{tool "live-act-drag"}} | Drag from one element to another |
| {{tool "live-act-scroll"}} | Scroll the view: by component UID (into view), pixel delta, or absolute position |
| {{tool "live-act-wait-for"}} | Wait for a condition (selector, navigation, timeout) |
| {{tool "live-act-dialog"}} | Accept or dismiss a browser dialog |
| {{tool "live-act-upload"}} | Upload a file to a file input |

### Developer Tools

| Tool | Description |
|------|-------------|
| {{tool "live-eval-script"}} | Run JavaScript in the page context |
| {{tool "live-log-list"}} | List console messages |
| {{tool "live-log-get"}} | Get details of a specific console message |
| {{tool "live-net-list"}} | List network requests |
| {{tool "live-net-get"}} | Get details of a specific network request |

### Signals

| Tool | Description |
|------|-------------|
| {{tool "live-signal"}} | Poll the trace for operator state and new comment signals. Returns `{operator, operator_email?, signals[], cursor, server_time}`. Cursor-based — pass `since` back on the next call. |

### Tunnel

| Tool | Description |
|------|-------------|
| {{tool "live-tunnel"}} | Get tunnel relay URL for connecting to localhost |

## Discovering Parameters

Parameter schemas are visible in the tool definition at call time.

## Trace and Session URLs

`fs_session_url`, `trace_id`, and `trace_url` are returned by {{tool "live-connect"}}, {{tool "live-disconnect"}}, {{tool "live-view-navigate"}}, {{tool "live-view-new"}}, and {{tool "live-view-snapshot"}}.

- **fs_session_url** — the raw Fullstory session URL.
- **trace_id** — the 12-char base62 id for this connection's trace. **Capture and reuse this** as the parent identifier for `comment-*` tools and as input to {{tool "review-open"}} later. The trailing path segment of `trace_url` is the same id.
- **trace_url** — a shareable link that opens the live viewer in a browser. **Always print this to the user** so they can watch the agent's browser in real time.

After every connection is established — via {{tool "live-connect"}} or {{tool "live-view-new"}} (tunnel-first flow) — output the URL on its own line:

```
Viewer: {trace_url}
```

## Capture Status

Every live tool response that touches a view includes a `capture_status` field —
this includes {{tool "live-connect"}}, {{tool "live-view-new"}}, {{tool "live-view-navigate"}},
{{tool "live-view-snapshot"}}, and {{tool "live-view-screenshot"}}. Check it after **every** such
call (not just {{tool "live-connect"}}) and respond as follows:

- `active`: proceed normally.
- `blocked`: tell the user to check capture quota and verify the target domain is allow listed in Subtext data capture settings.
- `snippet_not_found` or `api_unavailable`: tell the user something went wrong during setup and they should run onboarding again.
- any other status: something went wrong, try again

This matters especially in the **tunnel-first flow**, where {{tool "live-connect"}} is
never called — it's easy to miss the status if you assume the check only applies
to that one tool.

## Operator and Signals

{{tool "live-signal"}} is the trace's read channel for human-side activity. Call it
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

1. First call after {{tool "live-connect"}}: omit `since` to baseline the cursor.
2. Subsequent calls: pass the previous response's `cursor` as `since`. Only signals newer than the cursor come back.
3. Comment signals carry full text and metadata inline — no follow-up {{tool "comment-list"}} is needed for the new ones.
4. Save the new `cursor` after every call.

**Operator gate.** When `operator=human`, the user has taken browser control. The `live-act-*` input tools (click, fill, hover, keypress, drag, dialog, upload) return a structured error and **must not be retried**. Read-only tools ({{tool "live-view-snapshot"}}, {{tool "live-view-screenshot"}}, `live-log-*`, `live-net-*`, {{tool "live-signal"}}) keep working. Stay read-only and keep polling — when `operator` flips back to `agent`, resume normal work.

{{tool "live-act-wait-for"}} is excluded from the gate (observation-only).

## Tips

- **Default to {{tool "live-view-snapshot"}} for all page observation.** It carries sightmap context (component names, view names, `[src: ...]` annotations) and provides the component UIDs needed by `act-*` tools. Always call it before any interaction sequence.
- **Use {{tool "live-view-screenshot"}} only for visual evidence** — before/after comparisons, layout debugging, or screenshots to embed in PRs. The tool returns the image inline by default so you can verify framing. Pass `upload:true` only when you need a hosted URL for a PR or comment attachment.
- When the screenshot is evidence about a specific element, clip to it with `component_id` (and small `expand_pct` for context). `expand_pct` caps at 100, so very short elements (a label, a textbox) still produce thin slices — clip to a wider parent in that case.
- {{tool "live-view-inspect"}} is for **sightmap authoring only** — it returns verbose CSS selectors on every node. Do not use it as a general snapshot replacement. Use it once to discover selectors, write your `.sightmap/` YAML, then use {{tool "live-view-snapshot"}} for everything else.
- Component names from sightmap appear in snapshots — use `[src: ...]` annotations to find source files.
- Close connections when done to free server resources.

## Tunnel Setup

When the hosted browser needs to reach `localhost` or local dev URLs, use the tunnel-first flow:

1. Call {{tool "live-tunnel"}} — allocates a browser connection and returns `relayUrl` + `connectionId`
2. Call {{tool "tunnel-connect"}} on the **subtext-tunnel** MCP server with `relayUrl` and `allowedOrigins` (one or more local origins the tunnel may serve)
3. Call {{tool "live-view-new"}} with the `connection_id` and localhost URL

Do **not** use {{tool "live-connect"}} for localhost URLs — it mints its own connection ID and can't bind to the tunnel. See `subtext:tunnel` for full details, including the trunk pattern (`host:port` covers all subdomains on the same port) needed when local apps redirect across subdomains (e.g. OAuth flows).

## See Also

- `subtext:shared` — MCP conventions and sightmap upload
- `subtext:tunnel` — Reverse tunnel setup for localhost access
