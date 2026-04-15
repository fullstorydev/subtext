---
name: subtext:tunnel
description: Use when opening a hosted browser connection against a localhost or local dev server URL. Sets up a reverse tunnel so the hosted browser can reach the user's local server.
metadata:
  requires:
    skills: ["subtext:shared", "subtext:live"]
---

# Tunnel Setup for Hosted Browser

> **ENVIRONMENT:** If a `subtext-environment` skill is available in the host project, read it before connecting — it specifies which MCP server prefix to use for live and tunnel tools.

When the hosted browser needs to load a page from the user's local dev server (e.g. `http://localhost:3000`), a reverse tunnel is required. The hosted browser cannot reach localhost directly — the tunnel proxies requests from the hosted infrastructure back to the user's machine.

## MCP Tools

| Tool | Server | Description |
|------|--------|-------------|
| `live-tunnel` | subtext | Allocate a connection and get a relay URL for tunneling |
| `tunnel-connect` | subtext-tunnel | Connect local server to relay |
| `tunnel-status` | subtext-tunnel | Check tunnel connection state |

## When to Use

- `live-connect` is called with a `localhost`, `127.0.0.1`, or other local URL
- The user asks to screenshot, test, or interact with their local dev server using hosted browser tools

## Two Flows

### Tunnel-first (recommended for localhost URLs)

Set up the tunnel before opening a view. `live-tunnel` allocates the browser connection and returns a `connectionId` — use it with `live-view-new` to navigate.

1. Call `live-tunnel` on the **subtext** MCP server → returns `relayUrl` and `connectionId`
2. Call `tunnel-connect` on the **subtext-tunnel** MCP server with `relayUrl` and `target` (the local URL base, e.g. `http://localhost:3000`)
3. Verify `state` is `"ready"` in the response
4. Call `live-view-new` on **subtext** with the `connection_id` from step 1 and the full localhost URL

```
live-tunnel() → { relayUrl, connectionId: "abc-123" }
tunnel-connect({ relayUrl, target: "http://localhost:3000" }) → { state: "ready", tunnelId: "..." }
live-view-new({ connection_id: "abc-123", url: "http://localhost:3000/dashboard" }) → screenshot + component tree
```

### Connection-first (attach tunnel to existing connection)

If `live-connect` was already called and you need to attach a tunnel afterward, pass the existing `connectionId` to `live-tunnel`.

1. Call `live-tunnel` on the **subtext** MCP server with `connection_id` from the existing connection → returns `relayUrl`
2. Call `tunnel-connect` on the **subtext-tunnel** MCP server with `relayUrl` and `target`
3. Verify `state` is `"ready"` in the response
4. Navigate to the localhost URL with `live-view-navigate`

```
live-tunnel({ connection_id: "existing-conn-id" }) → { relayUrl, connectionId: "existing-conn-id" }
tunnel-connect({ relayUrl, target: "http://localhost:3000" }) → { state: "ready", tunnelId: "..." }
live-view-navigate({ connection_id: "existing-conn-id", url: "http://localhost:3000" }) → screenshot + component tree
```

## Notes

- **Never fabricate a `connectionId`** — only use IDs returned from `live-connect`, `live-tunnel`, or `tunnel-connect` calls.
- `live-tunnel` allocates a browser connection on the same pod as the tunnel relay. In tunnel-first flow, this replaces `live-connect` — use `live-view-new` to open views instead.
- `live-connect` always mints its own connection ID and cannot accept one. For localhost URLs, use the tunnel-first flow instead.
- The tunnel stays connected across multiple views — you only need to set it up once per connection.
- If the tunnel disconnects (e.g. the relay restarts), it reconnects automatically. Call `tunnel-status` to check.
- The tunnel only needs to be set up for localhost/local URLs. Remote URLs (e.g. `https://example.com`) work directly without a tunnel.
