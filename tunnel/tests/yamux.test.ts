/**
 * Unit tests for the yamux protocol implementation.
 *
 * Tests cover: frame parsing, stream lifecycle, window management,
 * ping/pong, FIN/RST handling, and multi-stream concurrency.
 *
 * These tests use a raw in-memory WebSocket pair to exercise the yamux
 * layer in isolation, without any tunnel handshake.
 */
import {describe, it, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {WebSocketServer, WebSocket as WsClient} from 'ws';
import http from 'node:http';
import {YamuxSession, YamuxStream} from '../src/yamux.js';

// ----- Protocol constants (duplicated from yamux.ts for test assertions) -----
const HEADER_SIZE = 12;
const TYPE_DATA = 0;
const TYPE_WINDOW_UPDATE = 1;
const TYPE_PING = 2;
const TYPE_GO_AWAY = 3;
const FLAG_SYN = 0x01;
const FLAG_ACK = 0x02;
const FLAG_FIN = 0x04;
const FLAG_RST = 0x08;
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

/** Collect binary messages from a WebSocket until the predicate returns true or timeout. */
function collectFrames(
  ws: WsClient,
  predicate: (frames: Buffer[]) => boolean,
  timeoutMs = 3000,
): Promise<Buffer[]> {
  return new Promise((resolve, reject) => {
    const frames: Buffer[] = [];
    const timeout = setTimeout(() => {
      ws.off('message', handler);
      reject(new Error(`collectFrames timed out after ${timeoutMs}ms (got ${frames.length} frames)`));
    }, timeoutMs);
    function handler(data: Buffer) {
      frames.push(Buffer.isBuffer(data) ? data : Buffer.from(data));
      if (predicate(frames)) {
        clearTimeout(timeout);
        ws.off('message', handler);
        resolve(frames);
      }
    }
    ws.on('message', handler);
    // Check immediately in case predicate is already satisfied
    if (predicate(frames)) {
      clearTimeout(timeout);
      resolve(frames);
    }
  });
}

/** Wait for at least one frame from the WebSocket. */
function nextFrame(ws: WsClient): Promise<Buffer> {
  return collectFrames(ws, (f) => f.length >= 1).then((f) => f[0]);
}

/** Parse a yamux frame header from a buffer. */
function parseHeader(buf: Buffer) {
  return {
    version: buf[0],
    type: buf[1],
    flags: buf.readUInt16BE(2),
    streamId: buf.readUInt32BE(4),
    length: buf.readUInt32BE(8),
  };
}

describe('YamuxSession', () => {
  let wss: WebSocketServer;
  let httpServer: http.Server;
  let serverUrl: string;

  before(async () => {
    httpServer = http.createServer();
    wss = new WebSocketServer({server: httpServer});
    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', resolve);
    });
    const addr = httpServer.address() as {port: number};
    serverUrl = `ws://127.0.0.1:${addr.port}`;
  });

  after(() => {
    wss.close();
    httpServer.close();
  });

  /** Helper: connect a WS client and create a YamuxSession on it. Returns both sides. */
  async function createPair(): Promise<{session: YamuxSession; server: WsClient}> {
    const serverPromise = new Promise<WsClient>((resolve) => {
      wss.once('connection', resolve);
    });
    const client = new WsClient(serverUrl);
    await new Promise<void>((resolve) => client.on('open', resolve));
    const serverWs = await serverPromise;
    const session = new YamuxSession(client);
    return {session, server: serverWs};
  }

  it('accepts a server-initiated stream (SYN via window_update)', async () => {
    const {session, server} = await createPair();

    // Server opens stream 2 (even = server-initiated) via SYN on a window_update frame.
    const synFrame = makeHeader(TYPE_WINDOW_UPDATE, FLAG_SYN, 2, 0);
    server.send(synFrame);

    const stream = await session.accept();
    assert.ok(stream, 'accept should return a stream');
    assert.equal(stream!.id, 2);

    // The client should have sent an ACK back.
    const ackBuf = await nextFrame(server);
    const ack = parseHeader(ackBuf);
    assert.equal(ack.type, TYPE_WINDOW_UPDATE);
    assert.equal(ack.flags & FLAG_ACK, FLAG_ACK);
    assert.equal(ack.streamId, 2);

    stream!.close();
    session.close();
    server.close();
  });

  it('accepts a server-initiated stream (SYN via data frame)', async () => {
    const {session, server} = await createPair();

    // Server opens stream 4 via SYN on a data frame with payload.
    const payload = Buffer.from('hello');
    const synData = Buffer.concat([
      makeHeader(TYPE_DATA, FLAG_SYN, 4, payload.length),
      payload,
    ]);
    server.send(synData);

    const stream = await session.accept();
    assert.ok(stream);
    assert.equal(stream!.id, 4);

    // Read the data that came with the SYN.
    const data = await stream!.readExact(5);
    assert.equal(data.toString(), 'hello');

    stream!.close();
    session.close();
    server.close();
  });

  it('delivers data to the correct stream', async () => {
    const {session, server} = await createPair();

    // Open two streams.
    server.send(makeHeader(TYPE_WINDOW_UPDATE, FLAG_SYN, 2, 0));
    server.send(makeHeader(TYPE_WINDOW_UPDATE, FLAG_SYN, 4, 0));

    const s2 = await session.accept();
    const s4 = await session.accept();

    // Wait for ACKs to arrive before sending data (avoid interleaving with ACK frames).
    await new Promise((r) => setTimeout(r, 50));

    // Send data to stream 4 first, then stream 2.
    server.send(Buffer.concat([makeHeader(TYPE_DATA, 0, 4, 5), Buffer.from('four!')]));
    server.send(Buffer.concat([makeHeader(TYPE_DATA, 0, 2, 4), Buffer.from('two!')]));

    const d4 = await s4!.readExact(5);
    assert.equal(d4.toString(), 'four!');

    const d2 = await s2!.readExact(4);
    assert.equal(d2.toString(), 'two!');

    s2!.close();
    s4!.close();
    session.close();
    server.close();
  });

  it('handles FIN (half-close from server)', async () => {
    const {session, server} = await createPair();

    server.send(makeHeader(TYPE_WINDOW_UPDATE, FLAG_SYN, 2, 0));
    const stream = await session.accept();

    // Wait for ACK.
    await nextFrame(server);

    // Send data with FIN.
    const payload = Buffer.from('final');
    server.send(Buffer.concat([makeHeader(TYPE_DATA, FLAG_FIN, 2, payload.length), payload]));

    const data = await stream!.readExact(5);
    assert.equal(data.toString(), 'final');

    // Next read should return empty (EOF) since FIN was received.
    const eof = await stream!.read();
    assert.equal(eof.length, 0);

    stream!.close();
    session.close();
    server.close();
  });

  it('handles RST (stream reset from server)', async () => {
    const {session, server} = await createPair();

    server.send(makeHeader(TYPE_WINDOW_UPDATE, FLAG_SYN, 2, 0));
    const stream = await session.accept();

    // Wait for ACK.
    await nextFrame(server);

    // Send RST.
    server.send(makeHeader(TYPE_DATA, FLAG_RST, 2, 0));

    // Read should throw.
    await assert.rejects(stream!.readExact(1), /reset/);

    session.close();
    server.close();
  });

  it('responds to server pings with ACK pongs', async () => {
    const {session, server} = await createPair();

    // Send a ping with a specific value.
    const pingValue = 42;
    server.send(makeHeader(TYPE_PING, FLAG_SYN, 0, pingValue));

    const pongBuf = await nextFrame(server);
    const pong = parseHeader(pongBuf);
    assert.equal(pong.type, TYPE_PING);
    assert.equal(pong.flags & FLAG_ACK, FLAG_ACK);
    assert.equal(pong.length, pingValue); // echoed value

    session.close();
    server.close();
  });

  it('closes session on GoAway', async () => {
    const {session, server} = await createPair();

    // Send GoAway.
    server.send(makeHeader(TYPE_GO_AWAY, 0, 0, 0));

    // accept() should return null after GoAway.
    const stream = await session.accept();
    assert.equal(stream, null);

    server.close();
  });

  it('sends window updates after consuming data', async () => {
    const {session, server} = await createPair();

    server.send(makeHeader(TYPE_WINDOW_UPDATE, FLAG_SYN, 2, 0));
    const stream = await session.accept();

    // Wait for ACK.
    await nextFrame(server);

    // Send enough data to trigger a window update (>= INITIAL_WINDOW/2 = 128KB).
    const chunkSize = 32 * 1024;
    const numChunks = 5; // 160KB total > 128KB threshold
    for (let i = 0; i < numChunks; i++) {
      const chunk = Buffer.alloc(chunkSize, i);
      server.send(Buffer.concat([makeHeader(TYPE_DATA, 0, 2, chunkSize), chunk]));
    }

    // Read all chunks to trigger consumption and window update.
    for (let i = 0; i < numChunks; i++) {
      await stream!.readExact(chunkSize);
    }

    // Collect window update frame from client.
    const frames = await collectFrames(server, (f) => {
      return f.some((buf) => {
        if (buf.length < HEADER_SIZE) return false;
        const hdr = parseHeader(buf);
        return hdr.type === TYPE_WINDOW_UPDATE && hdr.streamId === 2 && !(hdr.flags & FLAG_ACK);
      });
    });

    const windowUpdate = frames.find((buf) => {
      const hdr = parseHeader(buf);
      return hdr.type === TYPE_WINDOW_UPDATE && hdr.streamId === 2 && !(hdr.flags & FLAG_ACK);
    });
    assert.ok(windowUpdate, 'expected a window_update frame');
    const hdr = parseHeader(windowUpdate!);
    assert.ok(hdr.length > 0, `window update delta should be > 0, got ${hdr.length}`);

    stream!.close();
    session.close();
    server.close();
  });

  it('client write respects send window', async () => {
    const {session, server} = await createPair();

    server.send(makeHeader(TYPE_WINDOW_UPDATE, FLAG_SYN, 2, 0));
    const stream = await session.accept();

    // Wait for ACK.
    await nextFrame(server);

    // Write INITIAL_WINDOW bytes — should succeed (fills the window).
    const bigBuf = Buffer.alloc(INITIAL_WINDOW, 0xAA);
    await stream!.write(bigBuf);

    // Next write should block until server grants more window.
    let writeResolved = false;
    const writePromise = stream!.write(Buffer.from('more')).then(() => {
      writeResolved = true;
    });

    // Give it a moment to verify it's blocked.
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(writeResolved, false, 'write should be blocked waiting for window');

    // Server grants window update.
    server.send(makeHeader(TYPE_WINDOW_UPDATE, 0, 2, 1024));

    await writePromise;
    assert.equal(writeResolved, true, 'write should resolve after window update');

    stream!.close();
    session.close();
    server.close();
  });

  it('handles many concurrent streams', async () => {
    const {session, server} = await createPair();

    const numStreams = 50;
    const streams: YamuxStream[] = [];

    // Open all streams.
    for (let i = 0; i < numStreams; i++) {
      const streamId = (i + 1) * 2; // even = server-initiated
      server.send(makeHeader(TYPE_WINDOW_UPDATE, FLAG_SYN, streamId, 0));
    }

    // Accept all streams.
    for (let i = 0; i < numStreams; i++) {
      const s = await session.accept();
      assert.ok(s, `failed to accept stream ${i}`);
      streams.push(s!);
    }

    // Wait for all ACKs.
    await new Promise((r) => setTimeout(r, 100));

    // Send unique data to each stream.
    for (let i = 0; i < numStreams; i++) {
      const streamId = (i + 1) * 2;
      const payload = Buffer.from(`stream-${streamId}-data`);
      server.send(Buffer.concat([makeHeader(TYPE_DATA, FLAG_FIN, streamId, payload.length), payload]));
    }

    // Read and verify each stream gets its own data.
    const results = await Promise.all(
      streams.map(async (s) => {
        const data = await s.readAll();
        return data.toString();
      }),
    );

    for (let i = 0; i < numStreams; i++) {
      const streamId = (i + 1) * 2;
      assert.equal(results[i], `stream-${streamId}-data`, `stream ${streamId} data mismatch`);
    }

    for (const s of streams) s.close();
    session.close();
    server.close();
  });

  it('readAll collects all data until FIN', async () => {
    const {session, server} = await createPair();

    server.send(makeHeader(TYPE_WINDOW_UPDATE, FLAG_SYN, 2, 0));
    const stream = await session.accept();

    // Wait for ACK.
    await nextFrame(server);

    // Send multiple data frames, then FIN.
    server.send(Buffer.concat([makeHeader(TYPE_DATA, 0, 2, 5), Buffer.from('chunk')]));
    server.send(Buffer.concat([makeHeader(TYPE_DATA, 0, 2, 4), Buffer.from('more')]));
    server.send(makeHeader(TYPE_DATA, FLAG_FIN, 2, 0));

    const all = await stream!.readAll();
    assert.equal(all.toString(), 'chunkmore');

    stream!.close();
    session.close();
    server.close();
  });

  it('read() returns available data without waiting for exact count', async () => {
    const {session, server} = await createPair();

    server.send(makeHeader(TYPE_WINDOW_UPDATE, FLAG_SYN, 2, 0));
    const stream = await session.accept();

    // Wait for ACK.
    await nextFrame(server);

    server.send(Buffer.concat([makeHeader(TYPE_DATA, 0, 2, 3), Buffer.from('abc')]));

    const data = await stream!.read();
    assert.equal(data.toString(), 'abc');

    stream!.close();
    session.close();
    server.close();
  });

  it('close sends FIN frame', async () => {
    const {session, server} = await createPair();

    server.send(makeHeader(TYPE_WINDOW_UPDATE, FLAG_SYN, 2, 0));
    const stream = await session.accept();

    // Wait for ACK.
    await nextFrame(server);

    stream!.close();

    // Should receive a DATA frame with FIN flag.
    const finBuf = await nextFrame(server);
    const fin = parseHeader(finBuf);
    assert.equal(fin.type, TYPE_DATA);
    assert.equal(fin.flags & FLAG_FIN, FLAG_FIN);
    assert.equal(fin.streamId, 2);
    assert.equal(fin.length, 0);

    session.close();
    server.close();
  });

  it('session close resets all active streams', async () => {
    const {session, server} = await createPair();

    server.send(makeHeader(TYPE_WINDOW_UPDATE, FLAG_SYN, 2, 0));
    const stream = await session.accept();

    session.close();

    // Reading from the stream after session close should throw.
    await assert.rejects(stream!.readExact(1), /reset/);

    server.close();
  });

  it('write after close throws', async () => {
    const {session, server} = await createPair();

    server.send(makeHeader(TYPE_WINDOW_UPDATE, FLAG_SYN, 2, 0));
    const stream = await session.accept();
    await nextFrame(server); // ACK

    stream!.close();

    await assert.rejects(stream!.write(Buffer.from('nope')), /closed/);

    session.close();
    server.close();
  });

  it('duplicate SYN for same stream ID is ignored', async () => {
    const {session, server} = await createPair();

    // Send SYN twice for the same stream.
    server.send(makeHeader(TYPE_WINDOW_UPDATE, FLAG_SYN, 2, 0));
    server.send(makeHeader(TYPE_WINDOW_UPDATE, FLAG_SYN, 2, 0));

    // Should only get one stream from accept.
    const stream = await session.accept();
    assert.ok(stream);
    assert.equal(stream!.id, 2);

    // Send data — should work fine (stream not duplicated).
    server.send(Buffer.concat([makeHeader(TYPE_DATA, FLAG_FIN, 2, 4), Buffer.from('test')]));
    const data = await stream!.readAll();
    assert.equal(data.toString(), 'test');

    stream!.close();
    session.close();
    server.close();
  });
});
