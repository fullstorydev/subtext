#!/usr/bin/env node
/**
 * Tunnel diagnostics probe.
 *
 * Mints a relayUrl via the live-tunnel MCP tool, then drives a
 * TunnelClient directly (no MCP wrapper, no Remy) so we can watch the
 * full WS lifecycle in one process. Use this to reproduce intermittent
 * disconnect / reconnect failures against staging without round-tripping
 * through the agent harness.
 *
 * Usage:
 *   SUBTEXT_API_KEY=... node scripts/probe.mjs \
 *     [--mcp-url https://api.staging.fullstory.com/mcp/subtext] \
 *     [--allow https://*.fullstory.test:8043] \
 *     [--ping-ms 30000] \
 *     [--snapshot-every 10000]
 *
 * Requires `npm run build` first so build/src/client.js is up to date.
 *
 * Picks the API key by inspecting --mcp-url:
 *   *.staging.fullstory.com → $SUBTEXT_STAGING_API_KEY
 *   *.eu1.staging.fullstory.com → $SUBTEXT_EU1_STAGING_API_KEY
 *   api.onfire.fyi → $SUBTEXT_PLAYPEN_API_KEY
 *   anything else → $SUBTEXT_API_KEY
 * Override the auto-pick with --api-key-env VAR if needed.
 */

import {TunnelClient} from '../build/src/client.js';

// ----- args -----

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i > 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  return fallback;
}

const mcpUrl = arg('--mcp-url', 'https://api.staging.fullstory.com/mcp/subtext');
const allowedOrigins = (arg('--allow', 'https://*.fullstory.test:8043'))
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
const pingIntervalMs = Number(arg('--ping-ms', '30000'));
const snapshotEveryMs = Number(arg('--snapshot-every', '10000'));

function pickApiKeyEnv(url) {
  const explicit = arg('--api-key-env', null);
  if (explicit) return explicit;
  if (url.includes('eu1.staging.fullstory.com')) return 'SUBTEXT_EU1_STAGING_API_KEY';
  if (url.includes('staging.fullstory.com')) return 'SUBTEXT_STAGING_API_KEY';
  if (url.includes('onfire.fyi')) return 'SUBTEXT_PLAYPEN_API_KEY';
  return 'SUBTEXT_API_KEY';
}
const apiKeyEnv = pickApiKeyEnv(mcpUrl);
const apiKey = process.env[apiKeyEnv] || '';
if (!apiKey) {
  console.error(`error: set $${apiKeyEnv} (auto-picked from --mcp-url; override with --api-key-env)`);
  process.exit(1);
}

const ts = () => new Date().toISOString();
const log = msg => console.error(`${ts()} ${msg}`);

// ----- 1. mint a relayUrl via the live-tunnel MCP tool -----
//
// Stateless one-shot: a single tools/call POST is enough. We skip the
// initialize handshake because:
//   1. It would create a server-side session that can only be used from
//      the same pod, and our subsequent calls have no affinity hint to
//      land on the same pod again.
//   2. live-tunnel doesn't need any session state — it's an idempotent
//      mint operation. Stateless calls work today.
//
// We do raw fetch instead of @modelcontextprotocol/sdk's HTTP transport
// because the SDK's requestInit.headers handling drops the Authorization
// header in some versions, which makes auth against staging fail
// confusingly. Raw fetch is short and obvious.

log(`mcp: calling live-tunnel @ ${mcpUrl}`);
const res = await fetch(mcpUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
    'Authorization': `Bearer ${apiKey}`,
  },
  body: JSON.stringify({
    jsonrpc: '2.0', id: 1, method: 'tools/call',
    params: {name: 'live-tunnel', arguments: {}},
  }),
});
if (!res.ok) {
  const errText = await res.text().catch(() => '');
  console.error(`mcp: live-tunnel → ${res.status}: ${errText || res.statusText}`);
  process.exit(1);
}
const callRes = await res.json();
const text = callRes?.result?.content?.[0]?.text;
if (!text) {
  console.error('mcp: unexpected live-tunnel response:', JSON.stringify(callRes));
  process.exit(1);
}
// Tools registered with sessionDataPolicy=true wrap the response in
// <session-data>…</session-data> tags as a prompt-injection-defense fence.
// Extract the JSON object from inside the wrapper (or from a bare response
// for tools that aren't wrapped).
const jsonStart = text.indexOf('{');
const jsonEnd = text.lastIndexOf('}');
if (jsonStart < 0 || jsonEnd < jsonStart) {
  console.error('mcp: live-tunnel response has no JSON body:', text);
  process.exit(1);
}
const tunnelInfo = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
const {relayUrl, connectionId, traceId} = tunnelInfo;
log(`mcp: got relayUrl, connectionId=${connectionId}${traceId ? ` traceId=${traceId}` : ''}`);

// ----- 2. drive a TunnelClient directly -----

const client = new TunnelClient({
  relayUrl,
  connectionId,
  allowedOrigins,
  log: msg => log(`tunnel: ${msg}`),
  yamuxPingIntervalMs: pingIntervalMs,
});

client.on('need_live_tunnel', () => {
  log('!! need_live_tunnel emitted (resume token rejected — tunnel cannot recover)');
});

log(`tunnel: connecting (allowedOrigins=${JSON.stringify(allowedOrigins)}, pingIntervalMs=${pingIntervalMs})`);
client.connect();

// ----- 3. periodic history snapshots -----

let lastEventCount = 0;
function dumpHistory({force = false} = {}) {
  const events = client.history.snapshot();
  if (!force && events.length === lastEventCount) {
    log(`history: no new events (still ${events.length} total, state=${client.state}, tunnelId=${client.tunnelId ?? 'none'})`);
    return;
  }
  lastEventCount = events.length;
  log(`history: ${events.length} events, state=${client.state}, tunnelId=${client.tunnelId ?? 'none'}`);
  for (const e of events) {
    const detail = e.detail ? ` ${JSON.stringify(e.detail)}` : '';
    log(`  ${new Date(e.ts).toISOString()} ${e.kind}${detail}`);
  }
}

const snapshotTimer = setInterval(dumpHistory, snapshotEveryMs);

// ----- 4. shutdown -----

function shutdown(reason) {
  log(`shutdown: ${reason}`);
  clearInterval(snapshotTimer);
  dumpHistory({force: true});
  try {
    client.disconnect();
  } catch {
    // ignore
  }
  // give the WS close a tick to flush
  setTimeout(() => process.exit(0), 250);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// If need_live_tunnel fires we can't recover (the resume token is gone). Dump
// history and exit so the operator sees the failure mode immediately rather
// than after they Ctrl-C the script. Wait a beat so any trailing events make
// it into the snapshot before we tear down.
client.once('need_live_tunnel', () => {
  setTimeout(() => shutdown('need_live_tunnel — tunnel cannot recover'), 1000);
});
