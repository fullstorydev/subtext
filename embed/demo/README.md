# Embed harness

End-to-end test harness for the `@subtextdev/subtext-embed` host SDK and the
embed token mint endpoint (`POST /auth/v1/subtext:embedToken`).

There are two ways to run it:

- **Direct load** — open the embed URL straight from `app.fullstory.com`. Same-origin, simplest, doesn't exercise the cross-origin path that real customer integrations hit.
- **Proxied load** — serve the harness HTML through `proxy.mjs` so the iframe and its API/WS calls all share one local hostname. Useful for tunnels and for simulating a real third-party embed.

## Files

- `embed-harness.html` — Mock "agent chat" page with a slot for the embedded iframe. Reads `?src=<url-encoded-embed-url>` so you can deep-link.
- `proxy.mjs` — Optional reverse proxy. Serves the harness at `/` and forwards everything else (including WS upgrades) to your Subtext app host.
- `../scripts/mint-token.mjs` — Standalone token minter. Hits the `:embedToken` endpoint with your agent API key.

## 1. Mint a token

```bash
export SUBTEXT_API_KEY=sk_...

# canonical trace URL form
node ../scripts/mint-token.mjs \
  --trace-url "https://app.fullstory.com/subtext/o-XXX/trace/tr-yyyyyyyyyy"

# or org + trace separately
node ../scripts/mint-token.mjs --org o-XXX --trace-id tr-yyyyyyyyyy
```

The default output is the embed URL. Pass `--html` for an `<iframe>` snippet, or `--json` for `{accessToken, expiresAt, embedUrl}`.

If you're testing against a non-prod backend, set `SUBTEXT_API_BASE` (e.g. `https://api.staging.fullstory.com`) before running the script. The script derives the app host by swapping `api.` for `app.` in the base.

## 2a. Direct load (no proxy)

Just open the embed URL the script printed. It's a self-contained page on `app.fullstory.com` (or whichever host you're pointed at) — no harness needed if you only care about the iframe behavior.

## 2b. Harness load (proxied)

Start the proxy:

```bash
node proxy.mjs
# embed-preview proxy listening on http://localhost:9876
#   /           → embed-harness.html
#   /*          → https://app.fullstory.com/*
```

Convert the embed URL to a path-only form (the proxy rewrites the host for you) and load:

```bash
EMBED_PATH="/subtext/o-XXX/trace/tr-yyyyyyyyyy/embed?embed=true#token=$TOKEN"
ENCODED=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$EMBED_PATH")
open "http://localhost:9876/?src=$ENCODED"
```

Override the upstream via env vars:

```bash
UPSTREAM_HOST=app.staging.fullstory.com node proxy.mjs

# local dev with a self-signed cert
UPSTREAM_HOST=app.fullstory.test UPSTREAM_PORT=8043 ALLOW_INSECURE=1 node proxy.mjs
```

## What to verify in DevTools

Load either flow, open DevTools (iframe context for harness load):

- **Network** — playback call goes to `https://api.<env>.fullstory.com/playback/v1/session?trace_id=<TRACE>` with `Authorization: Bearer ...`. If you see calls to `/session?Encoded=UID:SID` instead, the iframe didn't pick up the embed-mode API host.
- **Console** — no 401 (auth wired). Mismatched-trace tokens return a clean 403 ("embed token is scoped to a different trace") — easy negative test: mint for trace A, load URL for trace B.
- **Live mode** — if the trace is `pending` or `live` with a `connection_id`, the LiveViewer mounts and connects via `wss://api.X/.../live-viewer-stream?trace_id=&token=`. When the connection drops, status flips to `review` and the ReplayPlayer takes over.

## Token TTL

Tokens currently expire in 5 minutes. The host SDK refreshes proactively at `expiresAt - 60s` (when `refreshAuthToken` returns `{token, expiresAt}`) or reactively on a 401. For the harness, just re-run `mint-token.mjs` and reload if the iframe goes stale.
