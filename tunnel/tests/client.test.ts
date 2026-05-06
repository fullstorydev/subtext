import {describe, it, before, after, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import {WebSocketServer, WebSocket as WsClient} from 'ws';
import {TunnelClient} from '../src/client.js';
import type {
  HelloMessage,
  ResponseMessage,
  ErrorMessage,
  ConnectedMessage,
  StreamDataMessage,
  StreamEndMessage,
  StreamErrorMessage,
  ClientMessage,
  RequestMessage,
} from '../src/types.js';

/** Wait for a condition to become true within a timeout. */
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

/** Collect the next N JSON messages from a WebSocket. */
function collectMessages(
  ws: WsClient,
  count: number,
): Promise<ClientMessage[]> {
  return new Promise(resolve => {
    const msgs: ClientMessage[] = [];
    const handler = (data: Buffer) => {
      msgs.push(JSON.parse(data.toString()));
      if (msgs.length >= count) {
        ws.off('message', handler);
        resolve(msgs);
      }
    };
    ws.on('message', handler);
  });
}

/** Wait for the next single message. */
function nextMessage(ws: WsClient): Promise<ClientMessage> {
  return collectMessages(ws, 1).then(msgs => msgs[0]);
}

describe('TunnelClient', () => {
  let wss: WebSocketServer;
  let httpServer: http.Server;
  let relayUrl: string;
  let logs: string[];

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
    // Close all relay-side connections between tests
    for (const ws of wss.clients) {
      ws.close();
    }
  });

  // The client no longer carries a target; tests that need to drive a real
  // backend pass the URL as `origin` on each RequestMessage they construct.
  // `currentTarget` is just a convenience holder so the per-test setup can
  // pass it through to the request builder below.
  let currentTarget = 'http://localhost:9999';
  function createClient(target = 'http://localhost:9999'): TunnelClient {
    logs = [];
    currentTarget = target;
    return new TunnelClient({
      relayUrl,
      connectionId: 'test-connection-id',
      log: msg => logs.push(msg),
    });
  }

  it('starts disconnected', () => {
    const client = createClient();
    assert.equal(client.state, 'disconnected');
    assert.equal(client.tunnelId, undefined);
  });

  it('connects and receives ready', async () => {
    const client = createClient();

    const connectionPromise = new Promise<{ws: WsClient; req: http.IncomingMessage}>(resolve => {
      wss.once('connection', (ws, req) => resolve({ws, req}));
    });

    client.connect();
    assert.equal(client.state, 'connecting');

    const {ws: relayWs, req} = await connectionPromise;

    // Verify connection_id is passed as a query param on the upgrade request
    console.log(req.url!)
    const upgradeUrl = new URL(req.url!, `http://${req.headers.host}`);
    assert.equal(upgradeUrl.searchParams.get('connection_id'), 'test-connection-id');

    const hello = (await nextMessage(relayWs)) as HelloMessage;

    assert.equal(hello.type, 'hello');
    assert.equal(hello.connectionId, 'test-connection-id');
    assert.equal(client.state, 'connected');

    relayWs.send(JSON.stringify({type: 'ready', tunnelId: 't_test123', connectionId: 'test-connection-id'}));
    await waitFor(() => client.state === 'ready');

    assert.equal(client.tunnelId, 't_test123');
    assert.equal(client.connectionId, 'test-connection-id');

    client.disconnect();
    assert.equal(client.state, 'disconnected');
  });

  it('responds to ping with pong', async () => {
    const client = createClient();

    const connectionPromise = new Promise<WsClient>(resolve => {
      wss.once('connection', resolve);
    });

    client.connect();
    const relayWs = await connectionPromise;
    await nextMessage(relayWs); // hello

    relayWs.send(JSON.stringify({type: 'ready', tunnelId: 't_ping', connectionId: 'test-connection-id'}));
    await waitFor(() => client.state === 'ready');

    // Send a ping
    relayWs.send(JSON.stringify({type: 'ping'}));
    const pong = await nextMessage(relayWs);
    assert.equal(pong.type, 'pong');

    client.disconnect();
  });

  it('proxies a request to localhost', async () => {
    // Spin up a tiny target HTTP server
    const targetServer = http.createServer((req, res) => {
      res.writeHead(200, {'Content-Type': 'text/plain', 'X-Custom': 'hello'});
      res.end('ok');
    });
    await new Promise<void>(resolve => {
      targetServer.listen(0, '127.0.0.1', resolve);
    });
    const targetAddr = targetServer.address() as {port: number};
    const targetUrl = `http://127.0.0.1:${targetAddr.port}`;

    const client = createClient(targetUrl);
    const connectionPromise = new Promise<WsClient>(resolve => {
      wss.once('connection', resolve);
    });

    client.connect();
    const relayWs = await connectionPromise;
    await nextMessage(relayWs); // hello

    relayWs.send(JSON.stringify({type: 'ready', tunnelId: 't_proxy', connectionId: 'test-connection-id'}));
    await waitFor(() => client.state === 'ready');

    // Send a request
    const req: RequestMessage = {
      type: 'request',
      requestId: 'r_1',
      method: 'GET',
      url: '/test?foo=bar',
      headers: {Accept: ['text/plain']},
      body: null,
      origin: currentTarget,
    };
    relayWs.send(JSON.stringify(req));

    const resp = (await nextMessage(relayWs)) as ResponseMessage;
    assert.equal(resp.type, 'response');
    assert.equal(resp.requestId, 'r_1');
    assert.equal(resp.status, 200);
    assert.deepEqual(resp.headers['content-type'], ['text/plain']);
    assert.deepEqual(resp.headers['x-custom'], ['hello']);
    assert.equal(
      Buffer.from(resp.body!, 'base64').toString(),
      'ok',
    );

    client.disconnect();
    targetServer.close();
  });

  it('sends error when target is unreachable', async () => {
    // Target on a port nothing is listening on
    const client = createClient('http://127.0.0.1:1');
    const connectionPromise = new Promise<WsClient>(resolve => {
      wss.once('connection', resolve);
    });

    client.connect();
    const relayWs = await connectionPromise;
    await nextMessage(relayWs); // hello

    relayWs.send(JSON.stringify({type: 'ready', tunnelId: 't_err', connectionId: 'test-connection-id'}));
    await waitFor(() => client.state === 'ready');

    const req: RequestMessage = {
      type: 'request',
      requestId: 'r_err',
      method: 'GET',
      url: '/',
      headers: {},
      body: null,
      origin: currentTarget,
    };
    relayWs.send(JSON.stringify(req));

    const errMsg = (await nextMessage(relayWs)) as ErrorMessage;
    assert.equal(errMsg.type, 'error');
    assert.equal(errMsg.requestId, 'r_err');
    assert.ok(errMsg.message.length > 0);

    client.disconnect();
  });

  /** Connect a client and complete the handshake, returning the relay WS. */
  async function connectAndReady(
    client: TunnelClient,
    tunnelId = 't_test',
    connectionId = 'test-connection-id',
  ): Promise<WsClient> {
    const connectionPromise = new Promise<WsClient>(resolve => {
      wss.once('connection', resolve);
    });
    client.connect();
    const relayWs = await connectionPromise;
    await nextMessage(relayWs); // hello
    relayWs.send(JSON.stringify({type: 'ready', tunnelId, connectionId}));
    await waitFor(() => client.state === 'ready');
    return relayWs;
  }

  it('streams data bidirectionally through a CONNECT tunnel', async () => {
    // Start a TCP echo server as the local target.
    const echoServer = net.createServer(socket => {
      socket.on('data', chunk => socket.write(chunk));
    });
    await new Promise<void>(resolve => {
      echoServer.listen(0, '127.0.0.1', resolve);
    });
    const echoPort = (echoServer.address() as net.AddressInfo).port;

    const client = createClient(`http://127.0.0.1:${echoPort}`);
    const relayWs = await connectAndReady(client, 't_stream');

    // Send a connect message from the "relay".
    relayWs.send(
      JSON.stringify({
        type: 'connect',
        streamId: 's_1',
        host: `127.0.0.1:${echoPort}`,
      }),
    );

    // Wait for the client to confirm the connection.
    const connected = (await nextMessage(relayWs)) as ConnectedMessage;
    assert.equal(connected.type, 'connected');
    assert.equal(connected.streamId, 's_1');

    // Send data from relay → client → echo server → client → relay.
    const payload = Buffer.from('hello tunnel').toString('base64');
    relayWs.send(
      JSON.stringify({type: 'data', streamId: 's_1', data: payload}),
    );

    const echoed = (await nextMessage(relayWs)) as StreamDataMessage;
    assert.equal(echoed.type, 'data');
    assert.equal(echoed.streamId, 's_1');
    assert.equal(Buffer.from(echoed.data, 'base64').toString(), 'hello tunnel');

    // Close the stream from the relay side.
    relayWs.send(JSON.stringify({type: 'end', streamId: 's_1'}));

    // The client should send an 'end' back once the local socket closes.
    const end = (await nextMessage(relayWs)) as StreamEndMessage;
    assert.equal(end.type, 'end');
    assert.equal(end.streamId, 's_1');

    client.disconnect();
    echoServer.close();
  });

  it('sends stream_error when target is unreachable', async () => {
    const client = createClient('http://127.0.0.1:1');
    const relayWs = await connectAndReady(client, 't_stream_err');

    // Ask client to connect to a port nothing is listening on.
    relayWs.send(
      JSON.stringify({
        type: 'connect',
        streamId: 's_bad',
        host: '127.0.0.1:1',
      }),
    );

    const errMsg = (await nextMessage(relayWs)) as StreamErrorMessage;
    assert.equal(errMsg.type, 'stream_error');
    assert.equal(errMsg.streamId, 's_bad');
    assert.ok(errMsg.message.length > 0);

    client.disconnect();
  });

  it('cleans up streams on disconnect', async () => {
    // Start a TCP server that holds connections open.
    const holdServer = net.createServer(() => {
      // Don't close — just hold the connection.
    });
    await new Promise<void>(resolve => {
      holdServer.listen(0, '127.0.0.1', resolve);
    });
    const holdPort = (holdServer.address() as net.AddressInfo).port;

    const client = createClient(`http://127.0.0.1:${holdPort}`);
    const relayWs = await connectAndReady(client, 't_cleanup');

    // Open a stream.
    relayWs.send(
      JSON.stringify({
        type: 'connect',
        streamId: 's_cleanup',
        host: `127.0.0.1:${holdPort}`,
      }),
    );
    const connected = (await nextMessage(relayWs)) as ConnectedMessage;
    assert.equal(connected.type, 'connected');

    // Disconnect the client — should not throw or leak.
    client.disconnect();
    assert.equal(client.state, 'disconnected');

    holdServer.close();
  });

  it('tunnel-first: connects without connectionId and picks it up from ready', async () => {
    logs = [];
    const client = new TunnelClient({
      relayUrl,
      log: msg => logs.push(msg),
    });

    assert.equal(client.connectionId, undefined);

    const connectionPromise = new Promise<WsClient>(resolve => {
      wss.once('connection', resolve);
    });

    client.connect();
    const relayWs = await connectionPromise;
    const hello = (await nextMessage(relayWs)) as HelloMessage;

    assert.equal(hello.type, 'hello');
    assert.equal(hello.connectionId, undefined);

    relayWs.send(JSON.stringify({type: 'ready', tunnelId: 't_tf', connectionId: 'server-minted-id'}));
    await waitFor(() => client.state === 'ready');

    assert.equal(client.connectionId, 'server-minted-id');
    assert.equal(client.tunnelId, 't_tf');

    client.disconnect();
  });

  it('connection-first: appends connection_id query param to relay URL', async () => {
    logs = [];
    const client = new TunnelClient({
      relayUrl,
      connectionId: 'my-conn-id',
      log: msg => logs.push(msg),
    });

    const connectionPromise = new Promise<WsClient & {upgradeReq?: http.IncomingMessage}>(resolve => {
      wss.once('connection', (ws, req) => {
        (ws as any).upgradeReq = req;
        resolve(ws as any);
      });
    });

    client.connect();
    const relayWs = await connectionPromise;

    const upgradeUrl = (relayWs as any).upgradeReq?.url ?? '';
    assert.ok(upgradeUrl.includes('connection_id=my-conn-id'), `Expected connection_id in URL, got: ${upgradeUrl}`);

    await nextMessage(relayWs); // hello
    relayWs.send(JSON.stringify({type: 'ready', tunnelId: 't_qp', connectionId: 'my-conn-id'}));
    await waitFor(() => client.state === 'ready');

    client.disconnect();
  });

  it('tunnel-first: relay URL has no connection_id query param', async () => {
    logs = [];
    const client = new TunnelClient({
      relayUrl,
      log: msg => logs.push(msg),
    });

    const connectionPromise = new Promise<WsClient & {upgradeReq?: http.IncomingMessage}>(resolve => {
      wss.once('connection', (ws, req) => {
        (ws as any).upgradeReq = req;
        resolve(ws as any);
      });
    });

    client.connect();
    const relayWs = await connectionPromise;

    const upgradeUrl = (relayWs as any).upgradeReq?.url ?? '';
    assert.ok(!upgradeUrl.includes('connection_id'), `Expected no connection_id in URL, got: ${upgradeUrl}`);

    await nextMessage(relayWs); // hello
    relayWs.send(JSON.stringify({type: 'ready', tunnelId: 't_nqp', connectionId: 'server-minted'}));
    await waitFor(() => client.state === 'ready');

    client.disconnect();
  });

  it('reconnects after relay closes the connection', async () => {
    const client = createClient();

    let connectionCount = 0;
    const secondConnection = new Promise<WsClient>(resolve => {
      wss.on('connection', ws => {
        connectionCount++;
        if (connectionCount === 2) {
          resolve(ws);
        }
      });
    });

    const firstConnection = new Promise<WsClient>(resolve => {
      wss.once('connection', resolve);
    });

    client.connect();
    const firstWs = await firstConnection;
    await nextMessage(firstWs); // hello

    // Close the relay side — client should reconnect
    firstWs.close();

    const secondWs = await secondConnection;
    const hello = (await nextMessage(secondWs)) as HelloMessage;
    assert.equal(hello.type, 'hello');

    client.disconnect();
  });

  it('reconnect sends resume subprotocol when resumeToken is set', async () => {
    const client = createClient();

    const firstConnPromise = new Promise<{ws: WsClient; req: http.IncomingMessage}>(resolve => {
      wss.once('connection', (ws, req) => resolve({ws, req}));
    });
    client.connect();
    const {ws: ws1} = await firstConnPromise;
    await nextMessage(ws1); // hello
    ws1.send(JSON.stringify({
      type: 'ready', tunnelId: 't_rp1', connectionId: 'c1', resumeToken: 'tok-abc',
    }));
    await waitFor(() => client.state === 'ready');

    const secondConnPromise = new Promise<{ws: WsClient; req: http.IncomingMessage}>(resolve => {
      wss.once('connection', (ws, req) => resolve({ws, req}));
    });
    ws1.close();

    const {ws: ws2, req: req2} = await secondConnPromise;
    assert.ok(
      req2.headers['sec-websocket-protocol']?.includes('subtext-resume.v1.tok-abc'),
      `Expected resume subprotocol, got: ${req2.headers['sec-websocket-protocol']}`,
    );

    // Settle the new handshake before disconnect so the in-flight upgrade
    // doesn't emit an unhandled close error after the test ends.
    await nextMessage(ws2);
    ws2.send(JSON.stringify({type: 'ready', tunnelId: 't_rp2', connectionId: 'c2'}));
    await waitFor(() => client.state === 'ready');
    client.disconnect();
  });

  it('resumeToken rotates: each reconnect uses the latest token', async () => {
    const client = createClient();

    const conn1Promise = new Promise<WsClient>(resolve => wss.once('connection', resolve));
    client.connect();
    const ws1 = await conn1Promise;
    await nextMessage(ws1);
    ws1.send(JSON.stringify({type: 'ready', tunnelId: 't_rot1', connectionId: 'c1', resumeToken: 'token-1'}));
    await waitFor(() => client.state === 'ready');

    // Second connection: complete handshake and issue token-2.
    const conn2Promise = new Promise<WsClient>(resolve => wss.once('connection', resolve));
    ws1.close();
    const ws2 = await conn2Promise;
    await nextMessage(ws2); // hello (with resume subprotocol)
    ws2.send(JSON.stringify({type: 'ready', tunnelId: 't_rot2', connectionId: 'c2', resumeToken: 'token-2'}));
    await waitFor(() => client.state === 'ready');

    // Third connection: verify token-2 is used.
    const conn3Promise = new Promise<{ws: WsClient; req: http.IncomingMessage}>(resolve => {
      wss.once('connection', (ws, req) => resolve({ws, req}));
    });
    ws2.close();
    const {ws: ws3, req: req3} = await conn3Promise;
    assert.ok(
      req3.headers['sec-websocket-protocol']?.includes('subtext-resume.v1.token-2'),
      `Expected token-2 in subprotocol, got: ${req3.headers['sec-websocket-protocol']}`,
    );

    // Settle the in-flight upgrade before disconnect.
    await nextMessage(ws3);
    ws3.send(JSON.stringify({type: 'ready', tunnelId: 't_rot3', connectionId: 'c3'}));
    await waitFor(() => client.state === 'ready');
    client.disconnect();
  });

  it('emits need_live_tunnel on 401 and stops reconnecting', async () => {
    // Separate HTTP server that returns 401 for resume subprotocol upgrades.
    const rawHttpServer = http.createServer();
    const rawWss = new WebSocketServer({noServer: true});
    rawHttpServer.on('upgrade', (req, socket, head) => {
      const proto = req.headers['sec-websocket-protocol'] ?? '';
      if (proto.includes('subtext-resume')) {
        socket.write(
          'HTTP/1.1 401 Unauthorized\r\nContent-Length: 12\r\nContent-Type: text/plain\r\n\r\nresume_replay',
        );
        socket.end();
        return;
      }
      rawWss.handleUpgrade(req, socket, head, ws => rawWss.emit('connection', ws, req));
    });
    await new Promise<void>(resolve => rawHttpServer.listen(0, '127.0.0.1', resolve));
    const rawAddr = rawHttpServer.address() as {port: number};
    const rawUrl = `ws://127.0.0.1:${rawAddr.port}`;

    logs = [];
    const client = new TunnelClient({relayUrl: rawUrl, log: msg => logs.push(msg)});
    const needLiveTunnel = new Promise<void>(resolve => client.once('need_live_tunnel', resolve));

    // First connect succeeds via nonce path.
    const conn1Promise = new Promise<WsClient>(resolve => rawWss.once('connection', resolve));
    client.connect();
    const ws1 = await conn1Promise;
    await nextMessage(ws1); // hello
    ws1.send(JSON.stringify({type: 'ready', tunnelId: 't_401', connectionId: 'c1', resumeToken: 'bad-tok'}));
    await waitFor(() => client.state === 'ready');

    // Drop the connection → client reconnects with subprotocol → 401 → event.
    ws1.close();
    await needLiveTunnel;

    await waitFor(() => client.state === 'disconnected');
    assert.equal(client.state, 'disconnected');

    client.disconnect();
    rawWss.close();
    await new Promise<void>(resolve => rawHttpServer.close(() => resolve()));
  });

  it('resume reconnect strips spent token but preserves connection_id', async () => {
    // The token is single-use — replaying it would trip the resume-replay
    // detector and 401 the reconnect. The connection_id, on the other hand,
    // MUST be preserved: the relay's affinity router hashes on it to route
    // the WS to the pod that owns the chromium browser context. Drop it, and
    // the reconnect lands on a random pod; the new tunnel registers there
    // but the chromium-side forward proxy on the original pod can't see it,
    // and the next navigation gets ERR_TUNNEL_CONNECTION_FAILED.
    logs = [];
    const nonceUrl = `${relayUrl}/?token=spent-nonce&connection_id=initial-cid`;
    const client = new TunnelClient({
      relayUrl: nonceUrl,
      connectionId: 'initial-cid',
      log: msg => logs.push(msg),
    });

    const firstConnPromise = new Promise<WsClient>(resolve => wss.once('connection', resolve));
    client.connect();
    const ws1 = await firstConnPromise;
    await nextMessage(ws1);
    ws1.send(JSON.stringify({
      type: 'ready', tunnelId: 't_hyg1', connectionId: 'server-cid', resumeToken: 'T1',
    }));
    await waitFor(() => client.state === 'ready');

    const secondConnPromise = new Promise<{ws: WsClient; req: http.IncomingMessage}>(resolve => {
      wss.once('connection', (ws, req) => resolve({ws, req}));
    });
    ws1.close();
    const {ws: ws2, req: req2} = await secondConnPromise;

    const upgradeUrl = new URL(req2.url!, `http://${req2.headers.host}`);
    assert.equal(upgradeUrl.searchParams.get('token'), null, 'spent token must not appear on reconnect');
    // The server's tryResume preserves the connection_id from the trace row, so
    // the post-ready value (`server-cid` here) is what the affinity router needs
    // to see, not the initial value the client started with.
    assert.equal(
      upgradeUrl.searchParams.get('connection_id'),
      'server-cid',
      'connection_id must remain on resume URL so affinity routing reaches the chromium-owning pod',
    );
    assert.ok(
      req2.headers['sec-websocket-protocol']?.includes('subtext-resume.v1.T1'),
      `Expected resume subprotocol, got: ${req2.headers['sec-websocket-protocol']}`,
    );

    // Complete the handshake before disconnecting; otherwise disconnect races
    // the in-flight upgrade and the ws library emits an unhandled error.
    await nextMessage(ws2); // hello
    ws2.send(JSON.stringify({type: 'ready', tunnelId: 't_hyg2', connectionId: 'c2'}));
    await waitFor(() => client.state === 'ready');

    client.disconnect();
  });

  it('end-to-end: proxies a request, drops, resumes, and proxies another', async () => {
    // Real HTTP target behind the tunnel.
    const targetServer = http.createServer((req, res) => {
      res.writeHead(200, {'Content-Type': 'text/plain'});
      res.end(`hello ${req.url}`);
    });
    await new Promise<void>(resolve => targetServer.listen(0, '127.0.0.1', resolve));
    const targetPort = (targetServer.address() as net.AddressInfo).port;
    const client = createClient(`http://127.0.0.1:${targetPort}`);

    // First connection + ready with resume token + trace id.
    const conn1Promise = new Promise<WsClient>(resolve => wss.once('connection', resolve));
    client.connect();
    const ws1 = await conn1Promise;
    await nextMessage(ws1); // hello
    ws1.send(JSON.stringify({
      type: 'ready', tunnelId: 't_e2e_1', connectionId: 'c1',
      resumeToken: 'T1', traceId: 'trace-e2e',
    }));
    await waitFor(() => client.state === 'ready');
    assert.equal(client.traceId, 'trace-e2e');
    assert.equal(client.tunnelId, 't_e2e_1');

    // Proxy a request over the first tunnel.
    const firstReq: RequestMessage = {
      type: 'request', requestId: 'r_before', method: 'GET',
      url: '/before', headers: {}, body: null,
      origin: currentTarget,
    };
    ws1.send(JSON.stringify(firstReq));
    const resp1 = (await nextMessage(ws1)) as ResponseMessage;
    assert.equal(resp1.status, 200);
    assert.equal(Buffer.from(resp1.body!, 'base64').toString(), 'hello /before');

    // Simulate a transient drop.
    const conn2Promise = new Promise<{ws: WsClient; req: http.IncomingMessage}>(resolve => {
      wss.once('connection', (ws, req) => resolve({ws, req}));
    });
    ws1.close();

    // Reconnect uses the resume subprotocol.
    const {ws: ws2, req: req2} = await conn2Promise;
    assert.ok(
      req2.headers['sec-websocket-protocol']?.includes('subtext-resume.v1.T1'),
      `Expected resume subprotocol, got: ${req2.headers['sec-websocket-protocol']}`,
    );

    await nextMessage(ws2); // hello
    ws2.send(JSON.stringify({
      type: 'ready', tunnelId: 't_e2e_2', connectionId: 'c2',
      resumeToken: 'T2', traceId: 'trace-e2e',
    }));
    await waitFor(() => client.state === 'ready');

    // traceId stable, tunnelId rotated, resumeToken rotated.
    assert.equal(client.traceId, 'trace-e2e', 'traceId must survive the drop');
    assert.equal(client.tunnelId, 't_e2e_2', 'tunnelId should update to the new ready');

    // Proxy another request on the RESUMED tunnel — the real proof.
    const secondReq: RequestMessage = {
      type: 'request', requestId: 'r_after', method: 'GET',
      url: '/after', headers: {}, body: null,
      origin: currentTarget,
    };
    ws2.send(JSON.stringify(secondReq));
    const resp2 = (await nextMessage(ws2)) as ResponseMessage;
    assert.equal(resp2.status, 200, 'resumed tunnel must serve requests');
    assert.equal(Buffer.from(resp2.body!, 'base64').toString(), 'hello /after');

    client.disconnect();
    targetServer.close();
  });

  it('traceId persists across reconnects', async () => {
    const client = createClient();

    const conn1Promise = new Promise<WsClient>(resolve => wss.once('connection', resolve));
    client.connect();
    const ws1 = await conn1Promise;
    await nextMessage(ws1);
    ws1.send(JSON.stringify({
      type: 'ready', tunnelId: 't_tid1', connectionId: 'c1',
      traceId: 'trace-stable', resumeToken: 'tok',
    }));
    await waitFor(() => client.state === 'ready');
    assert.equal(client.traceId, 'trace-stable');

    // Drop connection; traceId should survive while reconnecting.
    const conn2Promise = new Promise<WsClient>(resolve => wss.once('connection', resolve));
    ws1.close();
    await waitFor(() => client.state !== 'ready');
    assert.equal(client.traceId, 'trace-stable');

    // Complete the reconnect with the same traceId.
    const ws2 = await conn2Promise;
    await nextMessage(ws2);
    ws2.send(JSON.stringify({
      type: 'ready', tunnelId: 't_tid2', connectionId: 'c2',
      traceId: 'trace-stable', resumeToken: 'tok2',
    }));
    await waitFor(() => client.state === 'ready');
    assert.equal(client.traceId, 'trace-stable');

    client.disconnect();
  });

  it('history ring records connect, ws-open, hello-sent, ready, ws-close', async () => {
    // Smoke test for the diagnostic ring used by the tunnel-history MCP tool.
    // We verify the kinds appear in the expected chronological order on a
    // single connect/ready/disconnect cycle. Detail payloads are intentionally
    // not asserted in detail — they're for human reading and may evolve.
    const client = createClient();
    const connPromise = new Promise<WsClient>(resolve =>
      wss.once('connection', resolve),
    );
    client.connect();
    const ws = await connPromise;
    await nextMessage(ws);
    ws.send(JSON.stringify({
      type: 'ready', tunnelId: 't_hist', connectionId: 'cid', resumeToken: 'r',
    }));
    await waitFor(() => client.state === 'ready');

    // Snapshot before disconnect so we don't race the close event.
    const events = client.history.snapshot();
    const kinds = events.map(e => e.kind);
    assert.deepEqual(
      kinds.slice(0, 4),
      ['connect-start', 'ws-open', 'hello-sent', 'ready'],
      `unexpected event order: ${kinds.join(', ')}`,
    );
    // Timestamps must be monotonically non-decreasing.
    for (let i = 1; i < events.length; i++) {
      assert.ok(events[i].ts >= events[i - 1].ts, 'event timestamps decreased');
    }
    // Detail spot-check: the ready event carries the negotiated identifiers.
    const ready = events.find(e => e.kind === 'ready');
    assert.ok(ready, 'expected a ready event');
    assert.equal((ready!.detail as Record<string, unknown>)?.tunnelId, 't_hist');
    assert.equal(
      (ready!.detail as Record<string, unknown>)?.gotResumeToken,
      true,
    );

    client.disconnect();
  });
});
