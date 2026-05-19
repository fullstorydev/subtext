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

**Grammar: `host:port`. No scheme. Subdomains are implicit.**

- Each entry is a bare `host:port` — for example `example.test:8043` or `localhost:3000`.
- For DNS hosts, the entry matches the bare host **and any subdomain on the same port**. List the trunk you want to allow, not individual subdomains: `example.test:8043` covers `app.example.test:8043`, `oauthtest.example.test:8043`, and so on.
- Hosts are restricted to the loopback class: `localhost`, `127.x`, `::1`, `*.test`, `*.localhost`.
- IP literals (`127.0.0.1:3000`, `[::1]:443`) match exactly with no subdomain expansion.
- Scheme is not part of the grammar; the same entry covers `http://` and `https://` on that `host:port`.

The response from `tunnel-connect` may include a `canonicalized` field if your inputs were rewritten:

```json
"canonicalized": [
  {"input": "www.example.test:8043", "canonical": "example.test:8043"}
]
```

Treat this as a soft warning: the relay accepted your entry but registered it as the canonical form. Use the canonical form in future calls. The parser also tolerates legacy `scheme://...` and `*.host:port` inputs for compatibility — both get canonicalized away.

Default deny: omit something and chromium can't reach it through this tunnel.

## Two Flows

### Tunnel-first (recommended for localhost URLs)

Set up the tunnel before opening a view. `live-tunnel` allocates the browser connection and returns a `connectionId` — use it with `live-view-new` to navigate.

1. Call `live-tunnel` on the **subtext** MCP server → returns `relayUrl`, `connectionId`, and `sightmapUploadUrl`
2. If the project has `.sightmap/` definitions, upload them now (see `subtext:shared`). Upload before `live-view-new` so the sightmap is active for the first snapshot.
3. Call `tunnel-connect` on the **subtext-tunnel** MCP server with `relayUrl` and `allowedOrigins`
4. Verify `state` is `"ready"` in the response
5. Call `live-view-new` on **subtext** with the `connection_id` from step 1 and the full localhost URL

```
live-tunnel() → { relayUrl, connectionId: "abc-123", sightmapUploadUrl: "..." }
# upload .sightmap/ here if project has definitions (see subtext:shared)
tunnel-connect({
  relayUrl,
  allowedOrigins: ["localhost:3000"],
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
  allowedOrigins: ["localhost:3000"],
}) → { state: "ready", tunnelId: "..." }
live-view-navigate({ connection_id: "existing-conn-id", url: "http://localhost:3000" })
```

## Picking an allowlist

> **Default: list the trunk, not the subdomain you happen to be navigating to.** OAuth/SSO redirects will bounce out of any narrower entry within seconds of login, and chromium lands on `chrome-error://chromewebdata/` when that happens. The bare trunk implicitly covers every subdomain on the same port.

- **App with auth/SSO redirects between subdomains** (the common case). List the trunk:
  ```
  allowedOrigins: ["example.test:8043"]
  ```
  This covers `app.example.test:8043`, `oauthtest.example.test:8043`, every other subdomain. Don't narrow to `app.example.test:8043` — the first OAuth bounce will fail.

- **Multi-port local stack** (web app on `:3000` + API on `:4200`, frontend + asset server, etc.) — list each origin:
  ```
  allowedOrigins: [
    "localhost:3000",
    "localhost:4200",
  ]
  ```

- **Single-page local app, one origin, no auth** — bare trunk works:
  ```
  allowedOrigins: ["localhost:3000"]
  ```
  (Subdomains of `localhost` would also match. That's fine — they all resolve to your loopback interface anyway.)

- **Mixed hosts** — combine freely in one tunnel:
  ```
  allowedOrigins: [
    "example.test:8043",
    "127.0.0.1:8766",
  ]
  ```

## Diagnosing a chrome-error page

Symptom: chromium lands on `chrome-error://chromewebdata/` (visible in `live-view-screenshot` or as a blank page after a navigation/click).

Likely cause: an allowlist miss on a redirect — the navigation went somewhere not on `allowedOrigins` and the tunnel refused it. OAuth and SSO logins are the dominant trigger.

Recovery (do this; don't keep navigating):

1. `tunnel-disconnect` the current tunnel.
2. `live-tunnel` again — the `connection_id` is preserved across reconnect, so chromium continuity is fine.
3. `tunnel-connect` with a trunk that covers the redirect target (e.g. `example.test:8043` instead of `app.example.test:8043`).
4. Retry the navigation that failed.

If the trunk reconnect still fails the same way, the navigation is going somewhere outside that trunk entirely (different domain, different port). Widen further or ask a human.

## Common mistakes

- **Don't use `live-connect` for localhost / local URLs.** It mints its own connection ID and can't bind to a tunnel — use the tunnel-first flow (`live-tunnel` → `tunnel-connect` → `live-view-new`) instead.
- **Don't narrow the allowlist to a specific subdomain.** Login flows redirect; the navigation target is rarely the only origin you'll need. Default to the trunk.
- **Don't include `https://` or `*.` in entries.** The parser strips them for compatibility, but the canonical form is just `host:port`.
- **Don't open multiple tunnels per connection.** A single tunnel carries many origins — widen the allowlist instead.

## Notes

- **Never fabricate a `connectionId`** — only use IDs returned from `live-connect`, `live-tunnel`, or `tunnel-connect` calls.
- `live-tunnel` allocates a browser connection on the same pod as the tunnel relay. In tunnel-first flow, this replaces `live-connect` — use `live-view-new` to open views instead.
- The tunnel stays connected across multiple views — you only need to set it up once per connection.
- If the tunnel disconnects (e.g. the relay restarts), it reconnects automatically. Call `tunnel-status` to check.
- The tunnel only needs to be set up for localhost/local URLs. Remote URLs (e.g. `https://example.com`) work directly without a tunnel.
