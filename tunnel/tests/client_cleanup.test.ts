/**
 * Tests for TunnelClient disconnect() correctness and reconnect robustness.
 *
 * Policy under test:
 *  - The client reconnects indefinitely on any client-side error (ECONNRESET,
 *    pre-ready drop, stale close, etc.) with exponential backoff capped at
 *    RECONNECT_MAX_MS. It never gives up on its own.
 *  - The only two legitimate stop conditions are:
 *      1. disconnect() — explicit caller request.
 *      2. Server-side rejection — 401 on upgrade or {type:'error'} during
 *         handshake — both emit 'need_live_tunnel' and set intentionalDisconnect.
 *  - disconnect() in any lifecycle state must not crash the process.
 *    (Original bug: removeAllListeners() + close() on a half-open socket caused
 *    an unhandled 'error' event that killed the MCP server. Fixed by terminate().)
 */
import {describe, it, before, after, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {WebSocketServer, WebSocket as WsClient} from 'ws';
import {TunnelClient} from '../src/client.js';
import type {HelloMessage} from '../src/types.js';

async function waitFor(
  fn: () => boolean,
  timeoutMs = 2000,
  intervalMs = 20,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!fn()) {
    if (Date.now() > deadline)
      throw new Error(`waitFor timed out after ${timeoutMs}ms`);
    await new Promise(r => setTimeout(r, intervalMs));
  }
}

function nextMessage(ws: WsClient): Promise<unknown> {
  return new Promise(resolve => {
    ws.once('message', data => resolve(JSON.parse(data.toString())));
  });
}

describe('TunnelClient – disconnect and error handling', () => {
  let wss: WebSocketServer;
  let httpServer: http.Server;
  let relayUrl: string;

  before(async () => {
    httpServer = http.createServer();
    wss = new WebSocketServer({server: httpServer});
    await new Promise<void>(resolve => {
      httpServer.listen(0, '127.0.0.1', resolve);
    });
    const addr = httpServer.address() as {port: number};
    relayUrl = `ws://127.0.0.1:${addr.port}`;
  });

  after(() => {
    wss.close();
    httpServer.close();
  });

  afterEach(() => {
    for (const ws of wss.clients) ws.close();
  });

  function createClient(): TunnelClient {
    return new TunnelClient({
      relayUrl,
      target: 'http://localhost:9999',
      log: () => {},
    });
  }

  async function connectAndReady(
    client: TunnelClient,
    tunnelId = 't_test',
  ): Promise<WsClient> {
    const connPromise = new Promise<WsClient>(resolve =>
      wss.once('connection', resolve),
    );
    client.connect();
    const relayWs = await connPromise;
    await nextMessage(relayWs); // hello
    relayWs.send(JSON.stringify({type: 'ready', tunnelId, connectionId: 'c1'}));
    await waitFor(() => client.state === 'ready');
    return relayWs;
  }

  // ── disconnect() state coverage ────────────────────────────────────────────

  it('disconnect() before open does not crash or leak', async () => {
    // Original crash: removeAllListeners() then close() on a half-open socket
    // emitted an unhandled 'error' event that killed the MCP server process.
    // Now uses terminate() which destroys the socket synchronously with no
    // further events.
    const client = createClient();
    client.connect();
    client.disconnect();
    assert.equal(client.state, 'disconnected');
    await new Promise(r => setTimeout(r, 50));
    assert.equal(client.state, 'disconnected');
  });

  it('disconnect() after open but before ready does not crash', async () => {
    const client = createClient();
    const connPromise = new Promise<WsClient>(resolve =>
      wss.once('connection', resolve),
    );
    client.connect();
    const relayWs = await connPromise;
    await nextMessage(relayWs); // hello — client is in 'connected' state
    assert.equal(client.state, 'connected');

    client.disconnect();
    assert.equal(client.state, 'disconnected');
  });

  it('disconnect() in ready state transitions to disconnected', async () => {
    const client = createClient();
    await connectAndReady(client);
    client.disconnect();
    assert.equal(client.state, 'disconnected');
  });

  it('multiple disconnect() calls are idempotent', async () => {
    const client = createClient();
    await connectAndReady(client);
    client.disconnect();
    client.disconnect();
    client.disconnect();
    assert.equal(client.state, 'disconnected');
  });

  // ── infinite retry — client-side errors are transient ─────────────────────

  it('disconnect() during reconnect backoff cancels the reconnect', async () => {
    // After a pre-ready relay close the client enters backoff (minimum ~1 s).
    // disconnect() must cancel that timer; no new connection should be made.
    const client = createClient();

    const firstConnPromise = new Promise<WsClient>(resolve =>
      wss.once('connection', resolve),
    );
    client.connect();
    const ws1 = await firstConnPromise;
    await nextMessage(ws1); // hello — client is 'connected'

    ws1.close(); // Drop before ready → triggers reconnect backoff (≥ 1 s).
    await waitFor(() => client.state === 'disconnected');

    let extraConnections = 0;
    function onConn() {
      extraConnections++;
    }
    wss.on('connection', onConn);
    try {
      client.disconnect();
      await new Promise(r => setTimeout(r, 200)); // Well under the 1 s minimum backoff.
      assert.equal(
        extraConnections,
        0,
        'no new connection should arrive after disconnect()',
      );
      assert.equal(client.state, 'disconnected');
    } finally {
      wss.off('connection', onConn);
    }
  });

  it('reconnects after relay terminates the connection abruptly (ECONNRESET)', async () => {
    // ws.terminate() destroys the socket without a WebSocket CLOSE frame.
    // The client receives ECONNRESET: 'error' fires (logged), then 'close',
    // then #onDisconnect() schedules a reconnect. Client-side errors are
    // always treated as transient.
    const client = createClient();
    let count = 0;
    let resolveSecond!: (ws: WsClient) => void;
    const secondConnPromise = new Promise<WsClient>(r => {
      resolveSecond = r;
    });
    function onConn(ws: WsClient) {
      if (++count === 2) resolveSecond(ws);
    }
    wss.on('connection', onConn);
    try {
      const ws1 = await connectAndReady(client, 't_reset');
      ws1.terminate();

      const ws2 = await secondConnPromise;
      const hello = (await nextMessage(ws2)) as HelloMessage;
      assert.equal(hello.type, 'hello');
      client.disconnect();
    } finally {
      wss.off('connection', onConn);
    }
  });

  it('reconnects when relay drops the connection before the handshake completes', async () => {
    // Simulates a transient relay restart: the first accepted connection is
    // terminated immediately before 'ready' is sent. The client must retry.
    const client = createClient();
    let count = 0;
    let resolveSecond!: (ws: WsClient) => void;
    const secondConnPromise = new Promise<WsClient>(r => {
      resolveSecond = r;
    });
    function onConn(ws: WsClient) {
      if (++count === 1) {
        ws.terminate();
      } else {
        resolveSecond(ws);
      }
    }
    wss.on('connection', onConn);
    try {
      client.connect();
      const ws2 = await secondConnPromise;
      const hello = (await nextMessage(ws2)) as HelloMessage;
      assert.equal(hello.type, 'hello');
      client.disconnect();
    } finally {
      wss.off('connection', onConn);
    }
  });

  it('keeps retrying across multiple consecutive failures', async () => {
    // Verifies the client has no hard attempt cap — it retries past what was
    // previously MAX_RECONNECT_ATTEMPTS (5). Three sequential drops here are
    // enough to confirm the cap is gone without blowing through long backoffs.
    const client = createClient();
    const DROPS = 3;
    let count = 0;
    let resolveNth!: (ws: WsClient) => void;
    const nthConnPromise = new Promise<WsClient>(r => {
      resolveNth = r;
    });
    function onConn(ws: WsClient) {
      count++;
      if (count <= DROPS) {
        ws.terminate(); // Drop the first N connections immediately.
      } else {
        resolveNth(ws);
      }
    }
    wss.on('connection', onConn);
    try {
      client.connect();
      const wsN = await nthConnPromise;
      const hello = (await nextMessage(wsN)) as HelloMessage;
      assert.equal(hello.type, 'hello');
      assert.ok(count > DROPS, `expected > ${DROPS} connection attempts, got ${count}`);
      client.disconnect();
    } finally {
      wss.off('connection', onConn);
    }
  });

  // ── server-side rejection — the only legitimate stop condition ─────────────

  it('emits need_live_tunnel and stops reconnecting on relay handshake error', async () => {
    // {type:'error'} during handshake means the server explicitly rejected us
    // (e.g. DB failure rotating the resume token). This is not a transient
    // error — a fresh relay URL is required. The client emits need_live_tunnel
    // and sets intentionalDisconnect so no reconnect is attempted.
    const client = createClient();
    const needLiveTunnel = new Promise<void>(resolve =>
      client.once('need_live_tunnel', resolve),
    );

    const connPromise = new Promise<WsClient>(resolve =>
      wss.once('connection', resolve),
    );
    client.connect();
    const relayWs = await connPromise;
    await nextMessage(relayWs); // hello

    let extraConnections = 0;
    function onConn() {
      extraConnections++;
    }
    wss.on('connection', onConn);
    try {
      relayWs.send(
        JSON.stringify({type: 'error', message: 'resume token invalid or expired'}),
      );

      await needLiveTunnel;
      await waitFor(() => client.state === 'disconnected');
      assert.equal(client.state, 'disconnected');

      await new Promise(r => setTimeout(r, 200));
      assert.equal(extraConnections, 0, 'must not reconnect after server rejection');
    } finally {
      wss.off('connection', onConn);
    }
  });
});
