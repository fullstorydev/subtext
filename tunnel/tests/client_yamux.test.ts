/**
 * End-to-end tests for the TunnelClient in yamux mode.
 *
 * These tests simulate a relay that speaks the yamux server protocol:
 *   1. Accept WebSocket, read JSON hello, send JSON ready with protocol:"yamux"
 *   2. Create a yamux.Server session over the WebSocket
 *   3. Open streams to the client: type 0x01 (HTTP) or type 0x02 (CONNECT)
 *   4. Verify the client correctly proxies requests and pipes TCP
 *
 * This is the TypeScript mirror of the Go TestYamux* tests.
 */
import {describe, it, before, after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import {WebSocketServer, WebSocket as WsClient} from 'ws';
import {TunnelClient} from '../src/client.js';

// ----- Yamux protocol helpers (server side in tests) -----

const HEADER_SIZE = 12;
const TYPE_DATA = 0;
const TYPE_WINDOW_UPDATE = 1;
const FLAG_SYN = 0x01;
const FLAG_ACK = 0x02;
const FLAG_FIN = 0x04;
const INITIAL_WINDOW = 256 * 1024;

function makeHeader(
  type: number,
  flags: number,
  streamId: number,
  length: number,
): Buffer {
  const hdr = Buffer.allocUnsafe(HEADER_SIZE);
  hdr[0] = 0; // version
  hdr[1] = type;
  hdr.writeUInt16BE(flags, 2);
  hdr.writeUInt32BE(streamId, 4);
  hdr.writeUInt32BE(length, 8);
  return hdr;
}

function parseHeader(buf: Buffer) {
  return {
    version: buf[0],
    type: buf[1],
    flags: buf.readUInt16BE(2),
    streamId: buf.readUInt32BE(4),
    length: buf.readUInt32BE(8),
  };
}

/** Wait for a condition with timeout. */
async function waitFor(
  fn: () => boolean,
  timeoutMs = 5000,
  intervalMs = 20,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!fn()) {
    if (Date.now() > deadline)
      throw new Error(`waitFor timed out after ${timeoutMs}ms`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

/**
 * Minimal yamux server session for testing. Runs over a WebSocket,
 * opens streams to the client, and reads/writes data on them.
 */
class TestYamuxServer {
  readonly #ws: WsClient;
  #readBuf: Buffer = Buffer.alloc(0) as Buffer;
  readonly #streams = new Map<number, TestYamuxStream>();
  #nextStreamId = 2; // server uses even IDs
  #readWaiters: Array<() => void> = [];

  constructor(ws: WsClient) {
    this.#ws = ws;
    ws.on('message', (data: Buffer) => {
      const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data);
      this.#readBuf = this.#readBuf.length === 0 ? chunk : Buffer.concat([this.#readBuf, chunk]);
      this.#processFrames();
      // Wake any waiters.
      const waiters = this.#readWaiters.splice(0);
      for (const w of waiters) w();
    });
  }

  #processFrames(): void {
    let offset = 0;
    while (offset + HEADER_SIZE <= this.#readBuf.length) {
      const type = this.#readBuf[offset + 1];
      const flags = this.#readBuf.readUInt16BE(offset + 2);
      const streamId = this.#readBuf.readUInt32BE(offset + 4);
      const length = this.#readBuf.readUInt32BE(offset + 8);

      if (type === TYPE_DATA) {
        if (offset + HEADER_SIZE + length > this.#readBuf.length) break;
        const payload = this.#readBuf.subarray(offset + HEADER_SIZE, offset + HEADER_SIZE + length);
        this.#onData(flags, streamId, payload);
        offset += HEADER_SIZE + length;
      } else {
        this.#onControl(type, flags, streamId, length);
        offset += HEADER_SIZE;
      }
    }
    this.#readBuf = offset === 0 ? this.#readBuf : this.#readBuf.subarray(offset);
  }

  #onData(flags: number, streamId: number, payload: Buffer): void {
    const stream = this.#streams.get(streamId);
    if (!stream) return;
    if (payload.length > 0) stream._pushData(payload);
    if (flags & FLAG_FIN) stream._pushFin();
  }

  #onControl(type: number, flags: number, streamId: number, length: number): void {
    if (type === TYPE_WINDOW_UPDATE) {
      const stream = this.#streams.get(streamId);
      if (stream && !(flags & FLAG_ACK) && length > 0) {
        stream._addSendWindow(length);
      }
    }
  }

  /** Open a new stream to the client. Returns a TestYamuxStream for reading/writing. */
  openStream(): TestYamuxStream {
    const id = this.#nextStreamId;
    this.#nextStreamId += 2;
    const stream = new TestYamuxStream(id, this.#ws);
    this.#streams.set(id, stream);
    // Send SYN.
    this.#ws.send(makeHeader(TYPE_WINDOW_UPDATE, FLAG_SYN, id, 0));
    return stream;
  }

  /** Wait for the client's ACK for a specific stream. */
  async waitForAck(streamId: number, timeoutMs = 3000): Promise<void> {
    // The ACK may already have been processed; check directly.
    // For simplicity, just wait a bit.
    await new Promise((r) => setTimeout(r, 100));
  }

  close(): void {
    this.#ws.close();
  }
}

class TestYamuxStream {
  readonly id: number;
  readonly #ws: WsClient;
  #recvBuf: Buffer = Buffer.alloc(0) as Buffer;
  #finReceived = false;
  #recvWaiter: (() => void) | null = null;
  #sendWindow = INITIAL_WINDOW;
  #sendWaiters: Array<() => void> = [];
  #recvConsumed = 0;

  constructor(id: number, ws: WsClient) {
    this.id = id;
    this.#ws = ws;
  }

  _pushData(data: Buffer): void {
    this.#recvBuf = Buffer.concat([this.#recvBuf, data]);
    // Send window updates eagerly as data arrives (not only when consumed)
    // to prevent deadlock when the client's send window is exhausted.
    this.#recvConsumed += data.length;
    if (this.#recvConsumed >= INITIAL_WINDOW / 2) {
      this.#ws.send(makeHeader(TYPE_WINDOW_UPDATE, 0, this.id, this.#recvConsumed));
      this.#recvConsumed = 0;
    }
    this.#recvWaiter?.();
    this.#recvWaiter = null;
  }

  _pushFin(): void {
    this.#finReceived = true;
    this.#recvWaiter?.();
    this.#recvWaiter = null;
  }

  _addSendWindow(delta: number): void {
    this.#sendWindow += delta;
    const waiters = this.#sendWaiters.splice(0);
    for (const w of waiters) w();
  }

  /** Send a window update to the client when enough data has been consumed. */
  #creditWindow(n: number): void {
    this.#recvConsumed += n;
    if (this.#recvConsumed >= INITIAL_WINDOW / 2) {
      this.#ws.send(makeHeader(TYPE_WINDOW_UPDATE, 0, this.id, this.#recvConsumed));
      this.#recvConsumed = 0;
    }
  }

  async readExact(n: number): Promise<Buffer> {
    while (this.#recvBuf.length < n) {
      if (this.#finReceived) throw new Error(`stream ${this.id} FIN before ${n} bytes`);
      await new Promise<void>((resolve) => {
        this.#recvWaiter = resolve;
      });
    }
    const result = Buffer.from(this.#recvBuf.subarray(0, n));
    this.#recvBuf = this.#recvBuf.subarray(n);
    this.#creditWindow(n);
    return result;
  }

  async readAll(): Promise<Buffer> {
    const chunks: Buffer[] = [];
    while (true) {
      if (this.#finReceived && this.#recvBuf.length === 0) break;
      if (this.#recvBuf.length > 0) {
        const consumed = this.#recvBuf.length;
        chunks.push(Buffer.from(this.#recvBuf));
        this.#recvBuf = Buffer.alloc(0) as Buffer;
        this.#creditWindow(consumed);
      } else {
        await new Promise<void>((resolve) => {
          this.#recvWaiter = resolve;
        });
      }
    }
    return Buffer.concat(chunks);
  }

  async write(data: Buffer): Promise<void> {
    let offset = 0;
    while (offset < data.length) {
      while (this.#sendWindow === 0) {
        await new Promise<void>((resolve) => {
          this.#sendWaiters.push(resolve);
        });
      }
      const n = Math.min(this.#sendWindow, data.length - offset);
      const chunk = data.subarray(offset, offset + n);
      this.#ws.send(Buffer.concat([makeHeader(TYPE_DATA, 0, this.id, chunk.length), chunk]));
      this.#sendWindow -= n;
      offset += n;
    }
  }

  sendFin(): void {
    this.#ws.send(makeHeader(TYPE_DATA, FLAG_FIN, this.id, 0));
  }
}

// ----- Tests -----

describe('TunnelClient yamux mode', () => {
  let wss: WebSocketServer;
  let httpServer: http.Server;
  let relayUrl: string;
  let logs: string[];

  before(async () => {
    httpServer = http.createServer();
    wss = new WebSocketServer({server: httpServer});
    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', resolve);
    });
    const addr = httpServer.address() as {port: number};
    relayUrl = `ws://127.0.0.1:${addr.port}`;
  });

  after(() => {
    wss.close();
    httpServer.close();
  });

  /** Connect client, complete yamux handshake, return server session. */
  async function connectYamux(target: string): Promise<{
    client: TunnelClient;
    yamux: TestYamuxServer;
    relayWs: WsClient;
  }> {
    logs = [];
    const client = new TunnelClient({
      relayUrl,
      connectionId: 'test-yamux-conn',
      log: (msg) => logs.push(msg),
    });
    // Note: `target` parameter is no longer passed to TunnelClient; callers
    // must include `origin: target` in each request header they construct.

    const wsPromise = new Promise<WsClient>((resolve) => {
      wss.once('connection', resolve);
    });

    client.connect();
    const relayWs = await wsPromise;

    // Read hello.
    await new Promise<void>((resolve) => {
      relayWs.once('message', (data: Buffer) => {
        const msg = JSON.parse(data.toString());
        assert.equal(msg.type, 'hello');
        assert.equal(msg.protocol, 'yamux');
        resolve();
      });
    });

    // Send ready with yamux protocol.
    relayWs.send(
      JSON.stringify({
        type: 'ready',
        tunnelId: 't_yamux_test',
        connectionId: 'test-yamux-conn',
        protocol: 'yamux',
      }),
    );

    await waitFor(() => client.state === 'ready');

    // Now the client has switched to yamux mode. Create a test yamux server.
    const yamux = new TestYamuxServer(relayWs);
    return {client, yamux, relayWs};
  }

  it('negotiates yamux protocol in hello/ready', async () => {
    const {client, yamux, relayWs} = await connectYamux('http://localhost:9999');
    assert.equal(client.state, 'ready');
    assert.equal(client.tunnelId, 't_yamux_test');
    client.disconnect();
  });

  it('proxies HTTP request through yamux', async () => {
    // Start a target HTTP server.
    const targetServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk: Buffer) => (body += chunk.toString()));
      req.on('end', () => {
        res.writeHead(200, {'Content-Type': 'text/plain', 'X-Echo': 'yes'});
        res.end(body || 'empty');
      });
    });
    await new Promise<void>((resolve) => targetServer.listen(0, '127.0.0.1', resolve));
    const targetAddr = targetServer.address() as {port: number};
    const targetUrl = `http://127.0.0.1:${targetAddr.port}`;

    const {client, yamux} = await connectYamux(targetUrl);

    // Open a yamux stream and send an HTTP request (type 0x01).
    const stream = yamux.openStream();
    await yamux.waitForAck(stream.id);

    // Write: [type prefix][4-byte header len][JSON header][body]
    const reqBody = Buffer.from('hello from test');
    const header = JSON.stringify({
      method: 'POST',
      url: '/echo',
      headers: {'Content-Type': ['text/plain']},
      bodyLen: reqBody.length,
      origin: targetUrl,
    });
    const headerBuf = Buffer.from(header);
    const prefix = Buffer.allocUnsafe(1 + 4);
    prefix[0] = 0x01; // HTTP request type
    prefix.writeUInt32BE(headerBuf.length, 1);
    await stream.write(Buffer.concat([prefix, headerBuf, reqBody]));

    // Read response: [4-byte header len][JSON header][body]
    const respLenBuf = await stream.readExact(4);
    const respHdrLen = respLenBuf.readUInt32BE(0);
    const respHdrBuf = await stream.readExact(respHdrLen);
    const respHdr = JSON.parse(respHdrBuf.toString()) as {
      status: number;
      headers: Record<string, string[]>;
      bodyLen: number;
    };

    assert.equal(respHdr.status, 200);

    let respBody: Buffer = Buffer.alloc(0);
    if (respHdr.bodyLen > 0) {
      respBody = await stream.readExact(respHdr.bodyLen);
    }
    assert.equal(respBody.toString(), 'hello from test');

    client.disconnect();
    targetServer.close();
  });

  it('handles CONNECT stream through yamux', async () => {
    // Start a TCP echo server.
    const echoServer = net.createServer((socket) => {
      socket.on('data', (chunk) => socket.write(chunk));
    });
    await new Promise<void>((resolve) => echoServer.listen(0, '127.0.0.1', resolve));
    const echoPort = (echoServer.address() as net.AddressInfo).port;

    const {client, yamux} = await connectYamux(`http://127.0.0.1:${echoPort}`);

    const stream = yamux.openStream();
    await yamux.waitForAck(stream.id);

    // Write CONNECT header: [type prefix][4-byte len][JSON {host}]
    const connectHdr = JSON.stringify({host: `127.0.0.1:${echoPort}`});
    const connectBuf = Buffer.from(connectHdr);
    const prefix = Buffer.allocUnsafe(1 + 4);
    prefix[0] = 0x02; // CONNECT type
    prefix.writeUInt32BE(connectBuf.length, 1);
    await stream.write(Buffer.concat([prefix, connectBuf]));

    // Read status byte.
    const status = await stream.readExact(1);
    assert.equal(status[0], 0x00, 'expected success status byte');

    // Send data through the tunnel and verify echo.
    const testData = Buffer.from('echo this through yamux CONNECT');
    await stream.write(testData);
    stream.sendFin(); // signal end of write

    const echoed = await stream.readAll();
    assert.equal(echoed.toString(), 'echo this through yamux CONNECT');

    client.disconnect();
    echoServer.close();
  });

  it('handles CONNECT error (unreachable target)', async () => {
    const {client, yamux} = await connectYamux('http://127.0.0.1:1');

    const stream = yamux.openStream();
    await yamux.waitForAck(stream.id);

    // CONNECT to unreachable port.
    const connectHdr = JSON.stringify({host: '127.0.0.1:1'});
    const connectBuf = Buffer.from(connectHdr);
    const prefix = Buffer.allocUnsafe(1 + 4);
    prefix[0] = 0x02;
    prefix.writeUInt32BE(connectBuf.length, 1);
    await stream.write(Buffer.concat([prefix, connectBuf]));

    // Read status byte — should be 0x01 (error).
    const status = await stream.readExact(1);
    assert.equal(status[0], 0x01, 'expected error status byte');

    // Read error message.
    const errMsg = await stream.readAll();
    assert.ok(errMsg.length > 0, 'expected error message');

    client.disconnect();
  });

  it('handles multiple concurrent HTTP requests', async () => {
    const targetServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk: Buffer) => (body += chunk.toString()));
      req.on('end', () => {
        res.writeHead(200, {'Content-Type': 'text/plain'});
        res.end(body);
      });
    });
    await new Promise<void>((resolve) => targetServer.listen(0, '127.0.0.1', resolve));
    const targetAddr = targetServer.address() as {port: number};
    const targetUrl = `http://127.0.0.1:${targetAddr.port}`;

    const {client, yamux} = await connectYamux(targetUrl);

    const results = await Promise.all(
      Array.from({length: 10}, async (_, i) => {
        const stream = yamux.openStream();
        await yamux.waitForAck(stream.id);

        const body = Buffer.from(`request-${i}`);
        const header = JSON.stringify({
          method: 'POST',
          url: `/path-${i}`,
          headers: {},
          bodyLen: body.length,
          origin: targetUrl,
        });
        const headerBuf = Buffer.from(header);
        const prefix = Buffer.allocUnsafe(1 + 4);
        prefix[0] = 0x01;
        prefix.writeUInt32BE(headerBuf.length, 1);
        await stream.write(Buffer.concat([prefix, headerBuf, body]));

        const respLenBuf = await stream.readExact(4);
        const respHdrLen = respLenBuf.readUInt32BE(0);
        const respHdrBuf = await stream.readExact(respHdrLen);
        const respHdr = JSON.parse(respHdrBuf.toString()) as {
          status: number;
          bodyLen: number;
        };

        let respBody: Buffer = Buffer.alloc(0);
        if (respHdr.bodyLen > 0) {
          respBody = await stream.readExact(respHdr.bodyLen);
        }

        return {status: respHdr.status, body: respBody.toString()};
      }),
    );

    for (let i = 0; i < 10; i++) {
      assert.equal(results[i].status, 200, `request ${i} status`);
      assert.equal(results[i].body, `request-${i}`, `request ${i} body`);
    }

    client.disconnect();
    targetServer.close();
  });

  it('handles multiple concurrent CONNECT streams', async () => {
    // TCP echo server.
    const echoServer = net.createServer((socket) => {
      socket.on('data', (chunk) => socket.write(chunk));
    });
    await new Promise<void>((resolve) => echoServer.listen(0, '127.0.0.1', resolve));
    const echoPort = (echoServer.address() as net.AddressInfo).port;

    const {client, yamux} = await connectYamux(`http://127.0.0.1:${echoPort}`);

    const results = await Promise.all(
      Array.from({length: 10}, async (_, i) => {
        const stream = yamux.openStream();
        await yamux.waitForAck(stream.id);

        const connectHdr = JSON.stringify({host: `127.0.0.1:${echoPort}`});
        const connectBuf = Buffer.from(connectHdr);
        const prefix = Buffer.allocUnsafe(1 + 4);
        prefix[0] = 0x02;
        prefix.writeUInt32BE(connectBuf.length, 1);
        await stream.write(Buffer.concat([prefix, connectBuf]));

        const status = await stream.readExact(1);
        assert.equal(status[0], 0x00, `stream ${i} expected success`);

        const payload = Buffer.from(`echo-stream-${i}`);
        await stream.write(payload);
        stream.sendFin();

        const echoed = await stream.readAll();
        return echoed.toString();
      }),
    );

    for (let i = 0; i < 10; i++) {
      assert.equal(results[i], `echo-stream-${i}`, `stream ${i} echo mismatch`);
    }

    client.disconnect();
    echoServer.close();
  });

  it('handles large HTTP response through yamux (exceeds initial window)', async () => {
    const bigBody = Buffer.alloc(512 * 1024, 0x42); // 512KB > 256KB window
    const targetServer = http.createServer((_req, res) => {
      res.writeHead(200, {'Content-Type': 'application/octet-stream'});
      res.end(bigBody);
    });
    await new Promise<void>((resolve) => targetServer.listen(0, '127.0.0.1', resolve));
    const targetAddr = targetServer.address() as {port: number};
    const targetUrl = `http://127.0.0.1:${targetAddr.port}`;

    const {client, yamux} = await connectYamux(targetUrl);

    const stream = yamux.openStream();
    await yamux.waitForAck(stream.id);

    const header = JSON.stringify({
      method: 'GET',
      url: '/big',
      headers: {},
      bodyLen: 0,
      origin: targetUrl,
    });
    const headerBuf = Buffer.from(header);
    const prefix = Buffer.allocUnsafe(1 + 4);
    prefix[0] = 0x01;
    prefix.writeUInt32BE(headerBuf.length, 1);
    await stream.write(Buffer.concat([prefix, headerBuf]));

    const respLenBuf = await stream.readExact(4);
    const respHdrLen = respLenBuf.readUInt32BE(0);
    const respHdrBuf = await stream.readExact(respHdrLen);
    const respHdr = JSON.parse(respHdrBuf.toString()) as {
      status: number;
      bodyLen: number;
    };

    assert.equal(respHdr.status, 200);
    assert.equal(respHdr.bodyLen, bigBody.length);

    const respBody = await stream.readExact(respHdr.bodyLen);
    assert.equal(respBody.length, bigBody.length);
    assert.ok(Buffer.compare(respBody, bigBody) === 0, 'response body mismatch');

    client.disconnect();
    targetServer.close();
  });
});
