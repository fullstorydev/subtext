/**
 * Regression tests for yamux liveness on the TS tunnel client.
 *
 * Bug history: the client originally cleared its stale-connection timer once
 * the WS upgraded to yamux, on the assumption that yamux's own keepalive
 * would handle liveness. That assumption was wrong on two counts:
 *   1. The client only RESPONDS to server-initiated PINGs; it never sends
 *      its own. If an intermediary (linkerd, GCP LB, NAT) silently dropped
 *      the WS, the server's pings stopped arriving but the client had no
 *      way to learn the connection was gone — until lidar (the relay) tried
 *      to open a new yamux stream, hit a 10s timeout reading the CONNECT
 *      status the client never sent, and propagated ERR_TUNNEL_CONNECTION_FAILED
 *      to chromium. On a document-level navigation that lands the user on
 *      chrome-error://chromewebdata/.
 *   2. There was no client-initiated keepalive, so even if the silent-drop
 *      detector worked perfectly, we wouldn't prevent stateful intermediaries
 *      from idling the WS in the first place.
 *
 * Fix: YamuxSession accepts an onActivity callback (called on every WS
 * message) and an optional pingIntervalMs (sends client-initiated PINGs).
 * TunnelClient now passes both for yamux sessions, mirroring what it has
 * always done for the legacy transport, and exposes `staleTimeoutMs` and
 * `yamuxPingIntervalMs` constructor knobs so tests can use small values.
 */
import {describe, it, before, after, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {WebSocketServer} from 'ws';
import {TunnelClient} from '../src/client.js';

// ----- Yamux protocol helpers (server side in tests) -----

const HEADER_SIZE = 12;
const TYPE_PING = 2;
const FLAG_SYN = 0x01;
const FLAG_ACK = 0x02;

function parseHeader(buf: Buffer) {
  return {
    version: buf[0],
    type: buf[1],
    flags: buf.readUInt16BE(2),
    streamId: buf.readUInt32BE(4),
    length: buf.readUInt32BE(8),
  };
}

async function waitFor(
  fn: () => boolean,
  timeoutMs = 5000,
  intervalMs = 20,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!fn()) {
    if (Date.now() > deadline)
      throw new Error(`waitFor timed out after ${timeoutMs}ms`);
    await new Promise(r => setTimeout(r, intervalMs));
  }
}

describe('yamux keepalive / liveness', () => {
  let wss: WebSocketServer;
  let httpServer: http.Server;
  let relayUrl: string;
  /**
   * If true, the test server completes the handshake but then sends NO
   * further WS frames at all (no pings, no responses) — simulating a
   * silently-dropped intermediary that leaves both peers' TCP stacks
   * believing the WS is still up.
   */
  let goSilentAfterHandshake = false;
  /** Frames received from the client in binary (post-handshake) phase. */
  let receivedFrames: ReturnType<typeof parseHeader>[] = [];

  before(async () => {
    httpServer = http.createServer();
    wss = new WebSocketServer({server: httpServer});
    await new Promise<void>(resolve => {
      httpServer.listen(0, '127.0.0.1', resolve);
    });
    const {port} = httpServer.address() as {port: number};
    relayUrl = `ws://127.0.0.1:${port}/`;

    wss.on('connection', ws => {
      ws.once('message', () => {
        // Send the ready message to upgrade to yamux. After this the WS is
        // in binary mode; we don't open any streams.
        const ready = {
          type: 'ready',
          tunnelId: 'test-tunnel',
          connectionId: 'test-connection',
          protocol: 'yamux',
          streaming: true,
        };
        ws.send(JSON.stringify(ready));
        if (goSilentAfterHandshake) return;
        // Otherwise, capture and ack any client frames so they observe activity.
        ws.on('message', (data: Buffer) => {
          const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
          if (buf.length < HEADER_SIZE) return;
          const hdr = parseHeader(buf);
          receivedFrames.push(hdr);
          // PING SYN -> PING ACK. The ACK is what the client's onActivity
          // hook needs to observe to keep the stale timer reset.
          if (hdr.type === TYPE_PING && hdr.flags & FLAG_SYN) {
            const ack = Buffer.allocUnsafe(HEADER_SIZE);
            ack[0] = 0;
            ack[1] = TYPE_PING;
            ack.writeUInt16BE(FLAG_ACK, 2);
            ack.writeUInt32BE(0, 4);
            ack.writeUInt32BE(hdr.length, 8);
            ws.send(ack);
          }
        });
      });
    });
  });

  after(async () => {
    wss.close();
    await new Promise<void>(resolve => httpServer.close(() => resolve()));
  });

  afterEach(() => {
    goSilentAfterHandshake = false;
    receivedFrames = [];
  });

  it('client sends periodic PING frames to keep the WS warm', async () => {
    const client = new TunnelClient({
      relayUrl,
      target: 'http://127.0.0.1:1', // unused; we never open a stream
      log: () => {},
      // Tight values for a fast test. STALE_CONNECTION_MS doesn't fire
      // because the server is acking our pings.
      staleTimeoutMs: 60_000,
      yamuxPingIntervalMs: 50,
    });
    try {
      client.connect();
      await waitFor(() => client.state === 'ready', 2000);
      // Three pings within 500ms is comfortable headroom over a 50ms cadence.
      await waitFor(
        () => receivedFrames.filter(f => f.type === TYPE_PING && f.flags & FLAG_SYN).length >= 3,
        2000,
      );
    } finally {
      client.disconnect();
    }
  });

  it('client reconnects when the WS goes silent (silent-drop simulation)', async () => {
    goSilentAfterHandshake = true;

    let logs: string[] = [];
    const client = new TunnelClient({
      relayUrl,
      target: 'http://127.0.0.1:1',
      log: m => { logs.push(m); },
      // Stale = 250ms; ping every 50ms. With server going silent (no acks),
      // the stale timer must fire roughly within 250ms of last activity.
      staleTimeoutMs: 250,
      yamuxPingIntervalMs: 50,
    });
    try {
      client.connect();
      await waitFor(() => client.state === 'ready', 2000);
      // Wait long enough for the stale timer to fire and trigger reconnect.
      // Reconnect base is 1s, so we look for the 'Connection stale' log
      // within ~1s of the last handshake activity.
      await waitFor(
        () => logs.some(m => m.includes('Connection stale, reconnecting')),
        2000,
      );
    } finally {
      client.disconnect();
    }
  });

  it('client does NOT spuriously trigger stale on a healthy yamux session', async () => {
    // Default: server acks pings. Client stale = 200ms, ping = 50ms. Since
    // every ping ack hits onActivity, the stale timer should never fire.
    let logs: string[] = [];
    const client = new TunnelClient({
      relayUrl,
      target: 'http://127.0.0.1:1',
      log: m => { logs.push(m); },
      staleTimeoutMs: 200,
      yamuxPingIntervalMs: 50,
    });
    try {
      client.connect();
      await waitFor(() => client.state === 'ready', 2000);
      // Sit on the connection for 4× the stale window. If the activity hook
      // is wired correctly, no 'stale' log should appear.
      await new Promise(r => setTimeout(r, 800));
      assert.equal(
        logs.filter(m => m.includes('Connection stale')).length,
        0,
        `unexpected stale fire on a healthy session: ${logs.join(' | ')}`,
      );
    } finally {
      client.disconnect();
    }
  });
});
