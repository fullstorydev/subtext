---
name: tunnel
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
| `tunnel-connect` | subtext-tunnel | Connect local server(s) to relay |
| `tunnel-status` | subtext-tunnel | Check tunnel connection state |

## When to Use

- `live-connect` is called with a `localhost`, `127.0.0.1`, or other local URL
- The user asks to screenshot, test, or interact with their local dev server using hosted browser tools

## The allowlist model

`tunnel-connect` registers the tunnel with an **`allowedOrigins`** list. Every request that flows through the proxy is matched against the list; anything off-list is refused with a 502 (`ERR_TUNNEL_CONNECTION_FAILED` from chromium's perspective). This is the security boundary — without it, a buggy or hostile relay could probe arbitrary localhost services on the user's machine.

Pattern grammar:

- **Exact origin**: `scheme://host:port` — e.g. `http://localhost:3000`, `https://app.example.test:8043`.
- **Subdomain wildcard**: `scheme://*.suffix:port` — matches `foo.suffix`, `foo.bar.suffix`, etc., on the exact scheme and port.
- No bare `*`. No port ranges. No paths.
- Hosts must be loopback-resolving (`localhost`, `127.x`, `::1`, `*.test`, `*.localhost`).
- Schemes can mix freely — one tunnel can serve `http://...` and `https://...` entries.

Default deny: omit something and chromium can't reach it through this tunnel.

## Two Flows

### Tunnel-first (recommended for localhost URLs)

Set up the tunnel before opening a view. `live-tunnel` allocates the browser connection and returns a `connectionId` — use it with `live-view-new` to navigate.

1. Call `live-tunnel` on the **subtext** MCP server → returns `relayUrl` and `connectionId`
2. Call `tunnel-connect` on the **subtext-tunnel** MCP server with `relayUrl` and `allowedOrigins`
3. Verify `state` is `"ready"` in the response
4. Call `live-view-new` on **subtext** with the `connection_id` from step 1 and the full localhost URL

```
live-tunnel() → { relayUrl, connectionId: "abc-123" }
tunnel-connect({
  relayUrl,
  allowedOrigins: ["http://localhost:3000"],
}) → { state: "ready", tunnelId: "..." }
live-view-new({ connection_id: "abc-123", url: "http://localhost:3000/dashboard" })
```

### Connection-first (attach tunnel to existing connection)

If `live-connect` was already called and you need to attach a tunnel afterward, pass the existing `connectionId` to `live-tunnel`.

1. Call `live-tunnel` on the **subtext** MCP server with `connection_id` from the existing connection → returns `relayUrl`
2. Call `tunnel-connect` on the **subtext-tunnel** MCP server with `relayUrl` and `allowedOrigins`
3. Verify `state` is `"ready"` in the response
4. Navigate to the localhost URL with `live-view-navigate`

```
live-tunnel({ connection_id: "existing-conn-id" }) → { relayUrl, connectionId: "existing-conn-id" }
tunnel-connect({
  relayUrl,
  allowedOrigins: ["http://localhost:3000"],
}) → { state: "ready", tunnelId: "..." }
live-view-navigate({ connection_id: "existing-conn-id", url: "http://localhost:3000" })
```

## Picking an allowlist

> **Default: if the app has any kind of auth/SSO, use a wildcard.** The OAuth bounce will exit your initial host within seconds of login. An exact-host allowlist will pass the first navigation and then immediately fail with `chrome-error://chromewebdata/` on the redirect. When in doubt, wildcard.

- **App that redirects across subdomains during normal use** (the common case for any app with login — **OAuth/SSO logins almost always do this**). Use a wildcard so the redirect chain stays inside the allowlist:
  ```
  allowedOrigins: ["https://*.example.test:8043"]
  ```
  Without the wildcard, the first redirect into the SSO subdomain (`oauthtest.example.test`, `auth.example.test`, etc.) returns a 502 and chromium lands on `chrome-error://chromewebdata/`.

- **Multi-port local stack** (web app on `:3000` + API on `:4200`, frontend + asset server, etc.) — list each origin:
  ```
  allowedOrigins: [
    "http://localhost:3000",
    "http://localhost:4200",
  ]
  ```

- **Single-page local app, one origin, no auth** — exact entry is fine:
  ```
  allowedOrigins: ["http://localhost:3000"]
  ```

- **Mixed schemes / hosts** — combine freely in one tunnel:
  ```
  allowedOrigins: [
    "https://*.example.test:8043",
    "http://127.0.0.1:8766",
  ]
  ```

A wildcard is tighter than no allowlist and survives redirect chains the user didn't think to mention. Prefer it over enumerating subdomains for any non-trivial app.

## Diagnosing a chrome-error page

Symptom: chromium lands on `chrome-error://chromewebdata/` (visible in `live-view-screenshot` or as a blank page after a navigation/click).

Likely cause: an allowlist miss on a redirect — the navigation went somewhere not on `allowedOrigins` and the tunnel refused it. OAuth and SSO logins are the dominant trigger.

Recovery (do this; don't keep navigating):

1. `tunnel-disconnect` the current tunnel.
2. `live-tunnel` again — the `connection_id` is preserved across reconnect, so chromium continuity is fine.
3. `tunnel-connect` with a wildcard that covers the redirect target (e.g. `https://*.example.test:8043` instead of `https://app.example.test:8043`).
4. Retry the navigation that failed.

If the wildcard reconnect still fails the same way, the navigation is going somewhere outside the suffix entirely (different domain, different port). Widen further or ask a human.

## Common mistakes

- **Don't use `live-connect` for localhost / local URLs.** It mints its own connection ID and can't bind to a tunnel — use the tunnel-first flow (`live-tunnel` → `tunnel-connect` → `live-view-new`) instead.
- **Don't narrow the allowlist to "the URL I'm navigating to".** Login flows redirect; the navigation target is rarely the only origin you'll need. Default to a wildcard.
- **Don't open multiple tunnels per connection.** A single tunnel carries many origins — widen the allowlist instead.

## Notes

- **Never fabricate a `connectionId`** — only use IDs returned from `live-connect`, `live-tunnel`, or `tunnel-connect` calls.
- `live-tunnel` allocates a browser connection on the same pod as the tunnel relay. In tunnel-first flow, this replaces `live-connect` — use `live-view-new` to open views instead.
- The tunnel stays connected across multiple views — you only need to set it up once per connection.
- If the tunnel disconnects (e.g. the relay restarts), it reconnects automatically. Call `tunnel-status` to check.
- The tunnel only needs to be set up for localhost/local URLs. Remote URLs (e.g. `https://example.com`) work directly without a tunnel.
