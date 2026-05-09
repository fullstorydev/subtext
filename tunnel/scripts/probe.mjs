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
 * By default the probe also spins up a tiny local HTTP server and tells
 * lidar to point chromium at it via live-view-new. That makes the WS
 * carry actual proxied traffic and starts the screencast — closer to
 * what real Remy sessions look like, which seems to be required to
 * trigger the 30s death (see SUBTEXT-344). Pass --no-view to skip and
 * only exercise the bare WS lifecycle.
 *
 * Usage:
 *   SUBTEXT_API_KEY=... node scripts/probe.mjs \
 *     [--mcp-url https://api.staging.fullstory.com/mcp/subtext] \
 *     [--allow https://*.fullstory.test:8043] \
 *     [--ping-ms 30000] \
 *     [--snapshot-every 10000] \
 *     [--no-view]
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
function flag(name) {
  return process.argv.includes(name);
}

const mcpUrl = arg('--mcp-url', 'https://api.staging.fullstory.com/mcp/subtext');
const allowedOrigins = (arg('--allow', 'https://*.fullstory.test:8043'))
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
const pingIntervalMs = Number(arg('--ping-ms', '30000'));
const snapshotEveryMs = Number(arg('--snapshot-every', '10000'));
const viewUrl = arg('--url', 'https://app.fullstory.test:8043/ui');
const skipView = flag('--no-view');

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

// ----- MCP call helper -----
//
// Stateless one-shot: a single tools/call POST is enough. We skip the
// initialize handshake because:
//   1. It would create a server-side session that can only be used from
//      the same pod, and our subsequent calls have no affinity hint to
//      land on the same pod again.
//   2. live-tunnel and live-view-new don't need session state — they're
//      both routed by connection_id (or for tunnel-first mint, an
//      affinity-extractor minted UUID), so all calls for the same
//      connection land on the same pod regardless of session id.
//
// Raw fetch instead of @modelcontextprotocol/sdk's HTTP transport because
// the SDK's requestInit.headers handling drops the Authorization header
// in some versions, which makes auth against staging fail confusingly.

let mcpCallSeq = 1;
async function mcpCall(toolName, args) {
  const res = await fetch(mcpUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      jsonrpc: '2.0', id: mcpCallSeq++, method: 'tools/call',
      params: {name: toolName, arguments: args},
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`mcp: ${toolName} → ${res.status}: ${errText || res.statusText}`);
  }
  const body = await res.json();
  if (body.error) {
    throw new Error(`mcp: ${toolName} returned error: ${JSON.stringify(body.error)}`);
  }
  // Tool responses come back as `result.content[0].text`. Tools registered
  // with sessionDataPolicy=true wrap that text in <session-data>…</session-data>
  // as a prompt-injection-defense fence; pull out the JSON object that lives
  // inside (live-tunnel returns JSON; live-view-new returns plain text with
  // labelled lines and we keep the raw text for those cases).
  const text = body?.result?.content?.[0]?.text;
  if (typeof text !== 'string') {
    throw new Error(`mcp: ${toolName}: unexpected response shape: ${JSON.stringify(body)}`);
  }
  return text;
}

function extractJSON(text) {
  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}');
  if (jsonStart < 0 || jsonEnd < jsonStart) return null;
  try {
    return JSON.parse(text.slice(jsonStart, jsonEnd + 1));
  } catch {
    return null;
  }
}

// ----- 1. mint a relayUrl via the live-tunnel MCP tool -----

log(`mcp: calling live-tunnel @ ${mcpUrl}`);
const tunnelText = await mcpCall('live-tunnel', {}).catch(err => {
  console.error(err.message);
  process.exit(1);
});
const tunnelInfo = extractJSON(tunnelText);
if (!tunnelInfo?.relayUrl || !tunnelInfo?.connectionId) {
  console.error('mcp: live-tunnel response has no relayUrl/connectionId:', tunnelText);
  process.exit(1);
}
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

// ----- 3. attach chromium via live-view-new -----
//
// The minimal probe (just a registered tunnel, no chromium) survives idle
// past the 30s mark on staging. The failing case in SUBTEXT-344 had a
// chromium browser + view + screencast attached. This step fires
// live-view-new so the WS carries actual proxied traffic and the
// screencast publisher comes online — matching the failing-case profile.
//
// live-view-new's URL path goes through Goto with a 30s timeout; we wait
// for the tunnel to be `ready` first so the chromium navigation can
// actually flow through.

async function waitForReady(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (client.state !== 'ready') {
    if (Date.now() > deadline) {
      throw new Error(`tunnel did not reach 'ready' within ${timeoutMs}ms (state=${client.state})`);
    }
    await new Promise(r => setTimeout(r, 50));
  }
}

if (!skipView) {
  try {
    await waitForReady();
    log(`mcp: calling live-view-new (url=${viewUrl})`);
    const viewText = await mcpCall('live-view-new', {
      connection_id: connectionId,
      url: viewUrl,
    });
    // live-view-new returns labelled-line plain text on success: view_id,
    // current_view, trace_url, capture_status, plus a screenshot URL.
    // Print the small fields, skip any URL longer than ~200 chars (the
    // signed screenshot URL would dominate otherwise).
    const lines = viewText.split('\n').filter(l => {
      const trimmed = l.trim();
      if (!trimmed) return false;
      if (trimmed.startsWith('<') || trimmed.startsWith('</')) return false;
      return trimmed.length < 200;
    });
    for (const line of lines) log(`mcp:   ${line.trim()}`);
  } catch (err) {
    log(`mcp: live-view-new failed: ${err.message}`);
    log('continuing without chromium attached — bare-tunnel mode');
  }
}

// ----- 4. periodic history snapshots -----

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

// ----- 5. shutdown -----

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
