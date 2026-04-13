---
name: subtext:tunnel
description: Use when opening a hosted browser connection against a localhost or local dev server URL. Sets up a reverse tunnel so the hosted browser can reach the user's local server.
metadata:
  requires:
    skills: ["subtext:shared", "subtext:live"]
---

# Tunnel Setup for Hosted Browser

When the hosted browser needs to load a page from the user's local dev server (e.g. `http://localhost:3000`), a reverse tunnel is required. The hosted browser cannot reach localhost directly — the tunnel proxies requests from the hosted infrastructure back to the user's machine.

## MCP Tools

| Tool | Server | Description |
|------|--------|-------------|
| `tunnel-connect` | subtext-tunnel | Connect local server to relay |
| `tunnel-status` | subtext-tunnel | Check tunnel connection state |

## When to Use

- `live-connect` returns a `tunnel_required` response
- The user asks to screenshot, test, or interact with their local dev server

## Flow

`live-connect` is always the entry point. For local URLs, it returns `tunnel_required` instantly (no navigation attempt) with all the info needed to set up the tunnel.

1. Call `live-connect({ url })` on the **subtext** MCP server
   - If the URL is local (localhost, 127.0.0.1, *.localhost, *.test), it returns `tunnel_required` with `connection_id` and `relayUrl`
   - If the URL is public, it navigates directly — no tunnel needed

2. Call `tunnel-connect({ relayUrl, target })` on the **subtext-tunnel** MCP server
   - `relayUrl` comes from the `tunnel_required` response
   - `target` is the local origin, e.g. `http://localhost:3000`
   - Verify `state` is `"ready"` in the response

3. Call `live-connect({ url, connection_id })` on the **subtext** MCP server
   - Use the `connection_id` from the `tunnel_required` response
   - Returns screenshot, component tree, and viewer_url

```
live-connect({ url: "http://localhost:3000" })
  → tunnel_required: { connection_id: "abc-123", relayUrl: "wss://..." }

tunnel-connect({ relayUrl: "wss://...", target: "http://localhost:3000" })
  → { state: "ready", tunnelId: "...", connectionId: "abc-123" }

live-connect({ url: "http://localhost:3000", connection_id: "abc-123" })
  → screenshot + component tree + viewer_url
```

## Notes

- **Never fabricate a `connection_id`** — only use IDs returned from `live-connect` or `tunnel-connect`.
- The tunnel stays connected across multiple views — you only need to set it up once per connection.
- If the tunnel disconnects, it reconnects automatically. Call `tunnel-status` to check.
- Only local URLs need tunneling. Public URLs (e.g. `https://example.com`) work directly without a tunnel.
