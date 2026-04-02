/**
 * Smoke test: mock relay + mock target server + tunnel client.
 *
 * Verifies the full proxy path:
 *   relay --[request]--> tunnel client --[fetch]--> target server
 *   relay <--[response]-- tunnel client
 *
 * Usage: node tests/smoke.mjs
 */

import http from 'node:http';
import {WebSocketServer} from 'ws';

// 1. Start a mock target server (stands in for localhost dev server)
const target = http.createServer((req, res) => {
  console.log(`[target] ${req.method} ${req.url}`);
  if (req.url === '/hello') {
    res.writeHead(200, {'Content-Type': 'text/plain', 'X-Custom': 'works'});
    res.end('Hello from the target!');
  } else if (req.url === '/json') {
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({status: 'ok', tunnel: true}));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});
await new Promise(resolve => target.listen(0, '127.0.0.1', resolve));
const targetPort = target.address().port;
console.log(`[target] Listening on http://127.0.0.1:${targetPort}`);

// 2. Start a mock relay (WebSocket server)
const relayHttp = http.createServer();
const relay = new WebSocketServer({server: relayHttp});
await new Promise(resolve => relayHttp.listen(0, '127.0.0.1', resolve));
const relayPort = relayHttp.address().port;
console.log(`[relay]  Listening on ws://127.0.0.1:${relayPort}`);

// 3. Start the tunnel client as a child process
const {spawn} = await import('node:child_process');
const tunnelProc = spawn(
  'node',
  [
    'build/src/index.js',
    '--relay', `ws://127.0.0.1:${relayPort}`,
    '--target', `http://127.0.0.1:${targetPort}`,
    '--token', 'smoke-test',
  ],
  {
    cwd: new URL('..', import.meta.url).pathname,
    stdio: ['pipe', 'pipe', 'pipe'],
  },
);
tunnelProc.stderr.on('data', d => process.stderr.write(`[tunnel] ${d}`));

// 4. Relay: handle the tunnel connection and send test requests
const results = await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('Timed out')), 10000);

  relay.on('connection', async (ws) => {
    console.log('[relay]  Client connected');

    // Wait for hello
    const hello = await nextMsg(ws);
    console.log(`[relay]  Got hello: target=${hello.target}`);

    // Send ready
    ws.send(JSON.stringify({type: 'ready', tunnelId: 't_smoke'}));
    console.log('[relay]  Sent ready');

    // Give the client a moment to process ready
    await sleep(100);

    // Test 1: GET /hello
    console.log('[relay]  Sending request: GET /hello');
    ws.send(JSON.stringify({
      type: 'request',
      requestId: 'r_1',
      method: 'GET',
      url: '/hello',
      headers: {'Accept': ['text/plain']},
      body: null,
    }));
    const resp1 = await nextMsg(ws);

    // Test 2: GET /json
    console.log('[relay]  Sending request: GET /json');
    ws.send(JSON.stringify({
      type: 'request',
      requestId: 'r_2',
      method: 'GET',
      url: '/json',
      headers: {'Accept': ['application/json']},
      body: null,
    }));
    const resp2 = await nextMsg(ws);

    // Test 3: GET /nonexistent (should get 404)
    console.log('[relay]  Sending request: GET /nonexistent');
    ws.send(JSON.stringify({
      type: 'request',
      requestId: 'r_3',
      method: 'GET',
      url: '/nonexistent',
      headers: {},
      body: null,
    }));
    const resp3 = await nextMsg(ws);

    // Test 4: ping/pong
    console.log('[relay]  Sending ping');
    ws.send(JSON.stringify({type: 'ping'}));
    const pong = await nextMsg(ws);

    clearTimeout(timeout);
    resolve({resp1, resp2, resp3, pong});
  });
});

// 5. Print results
console.log('\n--- Results ---\n');

const {resp1, resp2, resp3, pong} = results;

const body1 = Buffer.from(resp1.body, 'base64').toString();
console.log(`GET /hello  → ${resp1.status} "${body1}" (headers: ${JSON.stringify(resp1.headers)})`);
assert(resp1.status === 200, `Expected 200, got ${resp1.status}`);
assert(body1 === 'Hello from the target!', `Unexpected body: ${body1}`);

const body2 = Buffer.from(resp2.body, 'base64').toString();
console.log(`GET /json   → ${resp2.status} ${body2}`);
assert(resp2.status === 200, `Expected 200, got ${resp2.status}`);
assert(JSON.parse(body2).tunnel === true, `Unexpected body: ${body2}`);

const body3 = Buffer.from(resp3.body, 'base64').toString();
console.log(`GET /404    → ${resp3.status} "${body3}"`);
assert(resp3.status === 404, `Expected 404, got ${resp3.status}`);

console.log(`ping/pong   → ${pong.type}`);
assert(pong.type === 'pong', `Expected pong, got ${pong.type}`);

console.log('\nAll checks passed!');

// Cleanup
tunnelProc.kill();
target.close();
relayHttp.close();

// --- helpers ---

function nextMsg(ws) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('No message within 5s')), 5000);
    ws.once('message', data => {
      clearTimeout(timer);
      resolve(JSON.parse(data.toString()));
    });
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function assert(cond, msg) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}
