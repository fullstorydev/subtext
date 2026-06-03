---

name: tunnel
description: Use when opening a hosted browser connection against a localhost or local dev server URL. Sets up a reverse tunnel so the hosted browser can reach the user's local server.
metadata:
  _generated_from: templates/skills/tunnel/SKILL.template
  requires:
    skills: ["subtext:shared", "subtext:live"]
---
# Tunnel Setup for Hosted Browser

When the hosted browser needs to load a page from the user's local dev server (e.g. `http://localhost:3000`), a reverse tunnel is required. The hosted browser cannot reach localhost directly — the tunnel proxies requests from the hosted infrastructure back to the user's machine.

## Commands

| Command | Description |
|---------|-------------|
| `subtext live tunnel` | Allocate a connection and get a relay URL for tunneling |
| `subtext tunnel connect` | Connect local server(s) to relay |
| `subtext tunnel status` | Check tunnel connection state |

## When to Use

- `subtext live connect` is called with a `localhost`, `127.0.0.1`, or other local URL
- The user asks to screenshot, test, or interact with their local dev server using hosted browser tools

## The allowlist model

`subtext tunnel connect` registers the tunnel with an **`allowedOrigins`** list. Every request that flows through the proxy is matched against the list; anything off-list is refused with a 502 (`ERR_TUNNEL_CONNECTION_FAILED` from chromium's perspective). This is the security boundary — without it, a buggy or hostile relay could probe arbitrary localhost services on the user's machine.

**Grammar: `host:port`. No scheme. Subdomains are implicit.**

- Each entry is a bare `host:port` — for example `example.test:8043` or `localhost:3000`.
- For DNS hosts, the entry matches the bare host **and any subdomain on the same port**. List the trunk you want to allow, not individual subdomains: `example.test:8043` covers `app.example.test:8043`, `oauthtest.example.test:8043`, and so on.
- Hosts are restricted to the loopback class: `localhost`, `127.x`, `::1`, `*.test`, `*.localhost`.
- IP literals (`127.0.0.1:3000`, `[::1]:443`) match exactly with no subdomain expansion.
- Scheme is not part of the grammar; the same entry covers `http://` and `https://` on that `host:port`.

The response from `subtext tunnel connect` may include a `canonicalized` field if your inputs were rewritten:

```json
"canonicalized": [
  {"input": "www.example.test:8043", "canonical": "example.test:8043"}
]
```

Treat this as a soft warning: the relay accepted your entry but registered it as the canonical form. Use the canonical form in future calls. The parser also tolerates legacy `scheme://...` and `*.host:port` inputs for compatibility — both get canonicalized away.

Default deny: omit something and chromium can't reach it through this tunnel.

## Two Flows

### Tunnel-first (recommended for localhost URLs)

Set up the tunnel before opening a view. `subtext live tunnel` allocates the browser connection and returns a `connectionId` — use it with `subtext live view-new` to navigate.

1. Run `subtext live tunnel` → returns `relayUrl`, `connectionId`, and `sightmapUploadUrl`
2. If the project has `.sightmap/` definitions, upload them now (see `subtext:shared`). Upload before `subtext live view-new` so the sightmap is active for the first snapshot.
3. Run `subtext tunnel connect` with `relayUrl` and `allowedOrigins`
4. Verify `state` is `"ready"` in the response
5. Run `subtext live view-new` with the `connection_id` from step 1 and the full localhost URL

```
subtext live tunnel → { relayUrl, connectionId: "abc-123", sightmapUploadUrl: "..." }
# upload .sightmap/ here if project has definitions (see subtext:shared)
subtext tunnel connect --relay-url <relayUrl> --allowed-origins localhost:3000
→ { state: "ready", tunnelId: "..." }
subtext live view-new --connection_id abc-123 --url http://localhost:3000/dashboard
```

### Connection-first (attach tunnel to existing connection)

If `subtext live connect` was already called and you need to attach a tunnel afterward, pass the existing `connectionId` to `subtext live tunnel`.

1. Run `subtext live tunnel` with `--connection_id` from the existing connection → returns `relayUrl`
2. Run `subtext tunnel connect` with `relayUrl` and `allowedOrigins`
3. Verify `state` is `"ready"` in the response
4. Navigate to the localhost URL with `subtext live view-navigate`

## Picking an allowlist

> **Default: list the trunk, not the subdomain you happen to be navigating to.** OAuth/SSO redirects will bounce out of any narrower entry within seconds of login, and chromium lands on `chrome-error://chromewebdata/` when that happens. The bare trunk implicitly covers every subdomain on the same port.

- **App with auth/SSO redirects between subdomains** (the common case). List the trunk:
  ```
  --allowed-origins example.test:8043
  ```
  This covers `app.example.test:8043`, `oauthtest.example.test:8043`, every other subdomain. Don't narrow to `app.example.test:8043` — the first OAuth bounce will fail.

- **Multi-port local stack** (web app on `:3000` + API on `:4200`) — list each origin:
  ```
  --allowed-origins localhost:3000,localhost:4200
  ```

- **Single-page local app, one origin, no auth** — bare trunk works:
  ```
  --allowed-origins localhost:3000
  ```

## Diagnosing a chrome-error page

Symptom: chromium lands on `chrome-error://chromewebdata/` (visible in `subtext live view-screenshot` or as a blank page after a navigation/click).

Likely cause: an allowlist miss on a redirect — the navigation went somewhere not on `allowedOrigins` and the tunnel refused it. OAuth and SSO logins are the dominant trigger.

Recovery (do this; don't keep navigating):

1. `subtext tunnel disconnect` the current tunnel.
2. `subtext live tunnel` again — the `connection_id` is preserved across reconnect, so chromium continuity is fine.
3. `subtext tunnel connect` with a trunk that covers the redirect target (e.g. `example.test:8043` instead of `app.example.test:8043`).
4. Retry the navigation that failed.

If the trunk reconnect still fails the same way, the navigation is going somewhere outside that trunk entirely (different domain, different port). Widen further or ask a human.

## Common mistakes

- **Don't use `subtext live connect` for localhost / local URLs.** It mints its own connection ID and can't bind to a tunnel — use the tunnel-first flow (`subtext live tunnel` → `subtext tunnel connect` → `subtext live view-new`) instead.
- **Don't narrow the allowlist to a specific subdomain.** Login flows redirect; the navigation target is rarely the only origin you'll need. Default to the trunk.
- **Don't include `https://` or `*.` in entries.** The parser strips them for compatibility, but the canonical form is just `host:port`.
- **Don't open multiple tunnels per connection.** A single tunnel carries many origins — widen the allowlist instead.

## Notes

- **Never fabricate a `connectionId`** — only use IDs returned from `subtext live connect`, `subtext live tunnel`, or `subtext tunnel connect` calls.
- `subtext live tunnel` allocates a browser connection on the same pod as the tunnel relay. In tunnel-first flow, this replaces `subtext live connect` — use `subtext live view-new` to open views instead.
- The tunnel stays connected across multiple views — you only need to set it up once per connection.
- If the tunnel disconnects (e.g. the relay restarts), it reconnects automatically. Run `subtext tunnel status` to check.
- The tunnel only needs to be set up for localhost/local URLs. Remote URLs (e.g. `https://example.com`) work directly without a tunnel.
