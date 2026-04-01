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
| `live-tunnel` | subtext | Request a relay URL for tunneling |
| `tunnel-connect` | live-tunnel | Connect local server to relay, returns `connectionId` |
| `tunnel-status` | live-tunnel | Check tunnel connection state |

## When to Use

- `live-connect` is called with a `localhost`, `127.0.0.1`, or other local URL
- The user asks to screenshot, test, or interact with their local dev server using hosted browser tools

## Two Flows

The tunnel and connection can be created in either order.

### Tunnel-first (recommended for new connections)

Set up the tunnel before opening a connection. The server mints a `connectionId` and returns it in the `tunnel-connect` response — pass it to `live-connect` so both bind to the same pod.

1. Call `live-tunnel` on the **subtext** MCP server → returns `relayUrl`
2. Call `tunnel-connect` on the **live-tunnel** MCP server with `relayUrl` and `target` (no `connectionId`)
3. Verify `state` is `"ready"` in the response; grab `connectionId` from the response
4. Call `live-connect` on **subtext** with the localhost URL and `connection_id` set to the value from step 3

Authentication is handled automatically by the MCP server's configured credentials (OAuth token or API key header, depending on how the user set up the plugin).

```
live-tunnel() → { relayUrl }
tunnel-connect({ relayUrl, target: "http://localhost:3000" }) → { state: "ready", tunnelId: "...", connectionId: "abc-123" }
live-connect({ url: "http://localhost:3000/dashboard", connection_id: "abc-123" }) → screenshot + component tree
```

### Connection-first (when a connection already exists)

If `live-connect` was already called (without a tunnel) and you need to attach a tunnel afterward, use the `connectionId` that `live-connect` returned. **Do not make up a `connectionId`** — only pass one if you already have one from a prior `live-connect` or `tunnel-connect` call. The server always generates IDs; the client never invents them.

1. Call `live-tunnel` on the **subtext** MCP server → returns `relayUrl`
2. Call `tunnel-connect` on the **live-tunnel** MCP server with `relayUrl`, `connectionId` (from the existing `live-connect`), and `target`
3. Verify `state` is `"ready"` in the response

```
live-tunnel() → { relayUrl }
tunnel-connect({ relayUrl, connectionId: "existing-conn-id", target: "http://localhost:3000" }) → { state: "ready", tunnelId: "...", connectionId: "existing-conn-id" }
```

## Notes

- **Never fabricate a `connectionId`** — only pass one you received from a prior `live-connect` or `tunnel-connect` call. When no prior ID exists, omit it and let the server mint one.
- The `tunnel-connect` response always includes `connectionId` — either the one you passed in or the one the server minted.
- When calling `live-connect` without a prior tunnel, do **not** pass `connection_id`. The server generates one. You only pass `connection_id` when you got one back from `tunnel-connect` (tunnel-first flow).
- The tunnel stays connected across multiple `live-connect` calls — you only need to set it up once per connection.
- If the tunnel disconnects (e.g. the relay restarts), it reconnects automatically. Call `tunnel-status` to check.
- The tunnel only needs to be set up for localhost/local URLs. Remote URLs (e.g. `https://example.com`) work directly without a tunnel.
