# @subtextdev/subtext-embed

Host SDK for embedding the Subtext trace viewer in a third-party page. Mints embed-scoped access tokens on demand, renders the iframe, and refreshes tokens via `postMessage` so viewing sessions survive past the 5-minute token TTL.

Protocol and backend described in the design doc (`docs/plans/2026-04-22-subtext-embed-design.md` in the mn monorepo). The iframe-side counterpart lives in `packages/subtext-replay-ui/src/embed/`.

## Install

```
npm install @subtextdev/subtext-embed
```

## Try it out

A standalone end-to-end harness lives in [`demo/`](./demo/). It pairs a mock "agent chat" page with a token-mint script (`scripts/mint-token.mjs`) so you can exercise both the embed iframe and the `POST /auth/v1/subtext:embedToken` endpoint without integrating the SDK into a real app first.

## Vanilla

```js
import { SubtextEmbed } from '@subtextdev/subtext-embed';

const handle = await SubtextEmbed.render({
  parentElement: '#replay-container',
  traceUrl: 'https://app.fullstory.com/subtext/o-ABC/trace/tr-xyz12345',

  // Called once on mount and again each time the iframe asks for a
  // fresh token (before expiry, or after a 401). Typically this hits
  // your backend, which in turn calls POST /auth/v1/subtext:embedToken
  // with your agent API key.
  refreshAuthToken: async () => {
    const res = await fetch('/api/subtext-embed-token', { method: 'POST' });
    const { token, expiresAt } = await res.json();
    return { token, expiresAt };
  },

  onReady: () => console.log('embed ready'),
  onError: ({ code, message }) => console.error(code, message),
  onModeChanged: mode => console.log('mode:', mode), // 'live' | 'review'

  width: '100%',
  height: 675,
});

// Later:
handle.destroy();
```

## React

```jsx
import { SubtextEmbed } from '@subtextdev/subtext-embed/react';

export function TracePanel({ traceUrl }) {
  return (
    <SubtextEmbed
      traceUrl={traceUrl}
      refreshAuthToken={async () => {
        const res = await fetch('/api/subtext-embed-token', { method: 'POST' });
        return res.json(); // { token, expiresAt }
      }}
      onReady={() => {}}
      onError={err => console.error(err)}
      width="100%"
      height={675}
    />
  );
}
```

## `refreshAuthToken` contract

Return either:

- A bare string — the Bearer token. The iframe only re-requests on 401 / scheduled refresh.
- `{ token, expiresAt }` — same Bearer, plus an ISO 8601 expiry. The iframe uses `expiresAt` to proactively request a fresh token at `expiresAt − 60s`.

The function is called with no arguments. It's invoked:

1. Once, synchronously, during `render()` — the initial token is injected into the iframe URL fragment so the first API call carries a Bearer.
2. Again on every `ST_EMBED_TOKEN_REQUEST` message from the iframe.

Throwing rejects the request; the iframe reports `auth_failed` via `onError`.

## `postMessage` protocol

Messages use the `ST_EMBED_` prefix. Origin checks on both sides validate that sender/receiver match the app origin (host) or the parent origin (iframe). Unknown `ST_EMBED_*` message names are ignored so new events can ship without breaking older peers.

| Direction        | Name                         | Payload                                                      |
| ---------------- | ---------------------------- | ------------------------------------------------------------ |
| iframe → host    | `ST_EMBED_TOKEN_REQUEST`     | `{ reqId }`                                                  |
| host → iframe    | `ST_EMBED_TOKEN_RESPOND`     | `{ reqId?, body: { tokenType, tokenString, expiresAt? } }`   |
| iframe → host    | `ST_EMBED_READY_EVT`         | _none_                                                       |
| iframe → host    | `ST_EMBED_ERROR_EVT`         | `{ code, message? }`                                         |
| iframe → host    | `ST_EMBED_MODE_CHANGED`      | `{ mode: 'live' \| 'review' }`                               |

## Security

- Tokens travel via URL fragment and `postMessage`, never query params, body, or headers on same-origin navigation.
- Host SDK filters inbound messages by `event.source === iframe.contentWindow` (not spoofable across origins) and `event.origin === appHost`.
- Iframe mirrors the check on its side.
- The embed-scoped token carries `PermViewPlayback` only and is restricted to a single `traceId`.

## License

MIT.
