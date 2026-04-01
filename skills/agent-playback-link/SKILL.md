---
name: subtext:agent-playback-link
description: Transform an fs_session_url from live browser tools into a shareable agent playback link that humans can open to review agent work.
---

# Agent Playback Link

Transform an `fs_session_url` into a shareable **agent playback link** that humans open to review agent work — replay with agent comments in the sidebar.

## When to Use

Any time you have an `fs_session_url` (from `live-connect`, `live-view-navigate`, or `live-disconnect`) and need to share a reviewable link with the user.

## URL Transformation

The `fs_session_url` returned by live MCP tools has the format:
```
https://{host}/ui/{orgId}/client-session/{deviceId}%3A{sessionId}
```

Transform it into the agent playback link:
```
https://{host}/subtext/{orgId}/session/{deviceId}:{sessionId}
```

**Rules:**
- Extract `{host}`, `{orgId}`, `{deviceId}`, and `{sessionId}` dynamically from the `fs_session_url`
- Never hardcode hostnames, org IDs, or session IDs
- Decode `%3A` to `:` in the final URL (the session URL uses URL-encoded colon)
- The path changes from `/ui/{orgId}/client-session/` to `/subtext/{orgId}/session/`

## Live Mode Links

To share a link that opens directly in **live mode** (streaming the agent's browser in real time with a Playback/Live toggle), append `?connection_id={id}`:

```
https://{host}/subtext/{orgId}/session/{deviceId}:{sessionId}?connection_id={connectionId}
```

- `{connectionId}` is from the `live-connect` response's `connection_id` field
- No `ws_url` or `token` parameters needed — the server injects the WebSocket URL and auth is cookie-based
- The link stays valid for the lifetime of the live connection
- Without `connection_id`, the link opens in review-only mode (no live toggle)

## Examples

```
# Review-only link (session replay + comments):
https://app.fullstory.com/subtext/o-xyz-na1/session/ab81ed94-1234:4e04042c-5678

# Live mode link (streaming + Playback/Live toggle):
https://app.fullstory.com/subtext/o-xyz-na1/session/ab81ed94-1234:4e04042c-5678?connection_id=my-session
```

## Presenting to Users

When sharing an agent playback link:
- Call it an "agent playback link" (not "replay viewer link" or "session URL")
- For live links, mention they can watch the agent work in real time and toggle between Live and Review modes
- Explain that it shows the replay of the agent's session with agent comments in the sidebar
- Place the link on its own line for easy clicking
- If sharing multiple links (e.g., before/after comparison), label each clearly

## Composition

- **Referenced by**: `visual-verification`, `first-session`, `onboard`, `comments`, and any skill that generates session links
- **Type**: Atomic reference skill — no tools, no workflow, just a transformation pattern
