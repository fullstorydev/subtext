/**
 * Minimal yamux client implementation.
 *
 * Only implements the CLIENT role: accepts streams opened by the server,
 * reads/writes data on those streams, and responds to pings. It never
 * initiates streams (no Open) and never sends GoAway.
 *
 * Wire format reference: https://github.com/hashicorp/yamux/blob/master/spec.md
 *
 * Each yamux frame has a 12-byte header (big-endian):
 *   [0]   version  (always 0)
 *   [1]   type     (0=data, 1=window_update, 2=ping, 3=go_away)
 *   [2-3] flags    (SYN=0x01, ACK=0x02, FIN=0x04, RST=0x08)
 *   [4-7] streamId
 *   [8-11] length  (for DATA: payload size; for others: a value, no payload follows)
 */

import type {RawData} from './third_party/index.js';

// ----- Protocol constants -----

const PROTO_VERSION = 0;
const HEADER_SIZE = 12;

/** Initial send/receive window per stream (matches hashicorp/yamux default). */
const INITIAL_WINDOW = 256 * 1024;

const TYPE_DATA = 0;
const TYPE_WINDOW_UPDATE = 1;
const TYPE_PING = 2;
// TYPE_GO_AWAY = 3 — we close the session on receipt; no need to name it

const FLAG_SYN = 0x01;
const FLAG_ACK = 0x02;
const FLAG_FIN = 0x04;
const FLAG_RST = 0x08;

// ----- YamuxStream -----

/**
 * One bidirectional stream opened by the server. Supports sequential
 * readExact / readAll / write operations. Not safe for concurrent reads or
 * concurrent writes; the use-pattern is one reader and one writer.
 */
export class YamuxStream {
  readonly id: number;
  readonly #session: YamuxSession;

  // Receive side
  #recvBuf = Buffer.alloc(0);
  #recvWindow = INITIAL_WINDOW; // remaining receive quota
  #recvConsumed = 0; // bytes consumed since last window update sent

  // Send side (starts at INITIAL_WINDOW; incremented by window_update from server)
  #sendWindow = INITIAL_WINDOW;
  #sendWaiters: Array<() => void> = [];

  #finReceived = false;
  #rstReceived = false;
  #closed = false;

  // Resolved when new data (or FIN/RST) is added to #recvBuf.
  // Only one outstanding waiter at a time (sequential reads).
  #recvWaiter: (() => void) | null = null;

  constructor(id: number, session: YamuxSession) {
    this.id = id;
    this.#session = session;
  }

  // ----- Called by YamuxSession -----

  _onData(data: Buffer): void {
    this.#recvBuf = Buffer.concat([this.#recvBuf, data]);
    this.#recvWindow -= data.length;
    this.#recvWaiter?.();
    this.#recvWaiter = null;
  }

  _onFin(): void {
    this.#finReceived = true;
    this.#recvWaiter?.();
    this.#recvWaiter = null;
  }

  _onRst(): void {
    this.#rstReceived = true;
    this.#closed = true;
    this.#recvWaiter?.();
    this.#recvWaiter = null;
    const waiters = this.#sendWaiters.splice(0);
    for (const w of waiters) w();
  }

  _onWindowUpdate(delta: number): void {
    this.#sendWindow += delta;
    const waiters = this.#sendWaiters.splice(0);
    for (const w of waiters) w();
  }

  // ----- Public API -----

  /**
   * Read exactly `n` bytes. Waits until enough bytes have arrived.
   * Throws if the stream is reset or closed before `n` bytes arrive.
   */
  async readExact(n: number): Promise<Buffer> {
    while (this.#recvBuf.length < n) {
      if (this.#rstReceived) throw new Error(`yamux stream ${this.id} reset`);
      if (this.#finReceived) {
        throw new Error(
          `yamux stream ${this.id} closed before ${n} bytes (have ${this.#recvBuf.length})`,
        );
      }
      await new Promise<void>((resolve) => {
        this.#recvWaiter = resolve;
      });
    }
    const result = Buffer.from(this.#recvBuf.subarray(0, n));
    this.#recvBuf = this.#recvBuf.subarray(n);
    this.#creditWindowFor(n);
    return result;
  }

  /**
   * Read and return whatever data is currently buffered, waiting if the buffer
   * is empty. Returns an empty buffer on FIN (EOF). Throws on RST.
   * Suitable for streaming/piping use cases where chunk boundaries don't matter.
   */
  async read(): Promise<Buffer> {
    while (this.#recvBuf.length === 0) {
      if (this.#rstReceived) throw new Error(`yamux stream ${this.id} reset`);
      if (this.#finReceived) return Buffer.alloc(0);
      await new Promise<void>((resolve) => {
        this.#recvWaiter = resolve;
      });
    }
    const result = Buffer.from(this.#recvBuf);
    const consumed = result.length;
    this.#recvBuf = Buffer.alloc(0);
    this.#creditWindowFor(consumed);
    return result;
  }

  /**
   * Read all remaining bytes until the stream is FIN-closed.
   * Throws if the stream is reset.
   */
  async readAll(): Promise<Buffer> {
    const chunks: Buffer[] = [];
    while (true) {
      if (this.#rstReceived) throw new Error(`yamux stream ${this.id} reset`);
      if (this.#finReceived && this.#recvBuf.length === 0) break;
      if (this.#recvBuf.length > 0) {
        const consumed = this.#recvBuf.length;
        chunks.push(Buffer.from(this.#recvBuf));
        this.#recvBuf = Buffer.alloc(0);
        this.#creditWindowFor(consumed);
      } else {
        await new Promise<void>((resolve) => {
          this.#recvWaiter = resolve;
        });
      }
    }
    return Buffer.concat(chunks);
  }

  /**
   * Write `data` to the stream, respecting the send window.
   * Blocks if the window is exhausted until the server grants more credit.
   */
  async write(data: Buffer): Promise<void> {
    if (this.#closed || this.#rstReceived) {
      throw new Error(`yamux stream ${this.id} closed`);
    }
    let offset = 0;
    while (offset < data.length) {
      while (this.#sendWindow === 0) {
        if (this.#rstReceived) throw new Error(`yamux stream ${this.id} reset`);
        await new Promise<void>((resolve) => {
          this.#sendWaiters.push(resolve);
        });
      }
      const n = Math.min(this.#sendWindow, data.length - offset);
      this.#session._sendData(this.id, data.subarray(offset, offset + n));
      this.#sendWindow -= n;
      offset += n;
    }
  }

  /** Send FIN and remove this stream from the session. */
  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#session._sendFin(this.id);
    this.#session._removeStream(this.id);
  }

  // ----- Private helpers -----

  /** Account for consumed bytes and send a window update when the threshold is met. */
  #creditWindowFor(n: number): void {
    this.#recvConsumed += n;
    // Send update when consumed >= half the window (matches yamux heuristic).
    if (this.#recvConsumed >= INITIAL_WINDOW / 2) {
      this.#session._sendWindowUpdate(this.id, this.#recvConsumed);
      this.#recvWindow += this.#recvConsumed;
      this.#recvConsumed = 0;
    }
  }
}

// ----- YamuxSession -----

/** Minimal interface for the WebSocket object that the session needs. */
interface WSAdapter {
  on(event: 'message', handler: (data: RawData) => void): void;
  on(event: 'close', handler: () => void): void;
  send(data: Buffer): void;
}

/**
 * Yamux session (client role). Wraps a WebSocket that has already completed
 * the hello/ready handshake and is now in binary yamux mode.
 *
 * The server opens streams; we accept them. Call `accept()` in a loop.
 */
export class YamuxSession {
  readonly #ws: WSAdapter;
  readonly #streams = new Map<number, YamuxStream>();

  #acceptQueue: YamuxStream[] = [];
  #acceptWaiters: Array<(stream: YamuxStream | null) => void> = [];
  #closed = false;

  /** Accumulator for incomplete frames across WebSocket messages. */
  #readBuf: Buffer = Buffer.alloc(0);

  constructor(ws: WSAdapter) {
    this.#ws = ws;
    ws.on('message', (data: RawData) => {
      const chunk = toBuffer(data);
      this.#readBuf =
        this.#readBuf.length === 0
          ? chunk
          : Buffer.concat([this.#readBuf, chunk]);
      this.#processFrames();
    });
    ws.on('close', () => {
      this.#onClose();
    });
  }

  // ----- Public API -----

  /**
   * Wait for the next server-initiated stream.
   * Returns `null` when the session closes.
   */
  async accept(): Promise<YamuxStream | null> {
    if (this.#acceptQueue.length > 0) return this.#acceptQueue.shift()!;
    if (this.#closed) return null;
    return new Promise<YamuxStream | null>((resolve) => {
      this.#acceptWaiters.push(resolve);
    });
  }

  /** Close the session (does not send GoAway; just tears down locally). */
  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    for (const stream of this.#streams.values()) {
      stream._onRst();
    }
    this.#streams.clear();
    this.#drainWaiters();
  }

  // ----- Called by YamuxStream -----

  _sendData(streamId: number, data: Buffer): void {
    const hdr = makeHeader(TYPE_DATA, 0, streamId, data.length);
    this.#ws.send(Buffer.concat([hdr, data]));
  }

  _sendWindowUpdate(streamId: number, delta: number): void {
    this.#ws.send(makeHeader(TYPE_WINDOW_UPDATE, 0, streamId, delta));
  }

  _sendFin(streamId: number): void {
    // Send an empty DATA frame with FIN flag.
    this.#ws.send(makeHeader(TYPE_DATA, FLAG_FIN, streamId, 0));
  }

  _removeStream(streamId: number): void {
    this.#streams.delete(streamId);
  }

  // ----- Frame processing -----

  #processFrames(): void {
    const buf = this.#readBuf;
    let offset = 0;

    while (offset + HEADER_SIZE <= buf.length) {
      const version = buf[offset];
      if (version !== PROTO_VERSION) {
        this.close();
        return;
      }
      const type = buf[offset + 1];
      const flags = buf.readUInt16BE(offset + 2);
      const streamId = buf.readUInt32BE(offset + 4);
      const length = buf.readUInt32BE(offset + 8);

      if (type === TYPE_DATA) {
        // DATA frames carry a payload of `length` bytes.
        if (offset + HEADER_SIZE + length > buf.length) break; // incomplete
        const payload = buf.subarray(offset + HEADER_SIZE, offset + HEADER_SIZE + length);
        this.#handleData(flags, streamId, payload);
        offset += HEADER_SIZE + length;
      } else {
        // All other frame types have no payload; `length` is a scalar value.
        this.#handleControl(type, flags, streamId, length);
        offset += HEADER_SIZE;
      }
    }

    // Keep leftover bytes for the next message.
    this.#readBuf = offset === 0 ? buf : buf.subarray(offset);
  }

  #handleData(flags: number, streamId: number, payload: Buffer): void {
    if (flags & FLAG_SYN) {
      this.#openStream(streamId);
    }
    const stream = this.#streams.get(streamId);
    if (!stream) return;

    if (flags & FLAG_RST) {
      stream._onRst();
      this.#streams.delete(streamId);
      return;
    }
    if (payload.length > 0) {
      stream._onData(payload);
    }
    if (flags & FLAG_FIN) {
      stream._onFin();
    }
  }

  #handleControl(type: number, flags: number, streamId: number, length: number): void {
    switch (type) {
      case TYPE_WINDOW_UPDATE: {
        if (flags & FLAG_SYN) {
          // Server is opening a new stream via a window_update frame (the
          // common case in hashicorp/yamux's OpenStream implementation).
          this.#openStream(streamId);
        }
        const stream = this.#streams.get(streamId);
        if (stream) {
          if (!(flags & FLAG_SYN) && length > 0) {
            // Server is granting us additional send credits.
            stream._onWindowUpdate(length);
          }
          if (flags & FLAG_FIN) stream._onFin();
          if (flags & FLAG_RST) {
            stream._onRst();
            this.#streams.delete(streamId);
          }
        }
        break;
      }
      case TYPE_PING: {
        if (flags & FLAG_SYN) {
          // Server sent a keepalive ping — echo back as ACK with same value.
          this.#ws.send(makeHeader(TYPE_PING, FLAG_ACK, 0, length));
        }
        // FLAG_ACK pings are responses to client-initiated pings (we never send those).
        break;
      }
      default:
        // TYPE_GO_AWAY or unknown: close the session.
        this.close();
        break;
    }
  }

  #openStream(streamId: number): void {
    if (this.#streams.has(streamId)) return; // duplicate SYN; ignore

    const stream = new YamuxStream(streamId, this);
    this.#streams.set(streamId, stream);

    // Respond with ACK (length=0 — both sides start with INITIAL_WINDOW already).
    this.#ws.send(makeHeader(TYPE_WINDOW_UPDATE, FLAG_ACK, streamId, 0));

    if (this.#acceptWaiters.length > 0) {
      this.#acceptWaiters.shift()!(stream);
    } else {
      this.#acceptQueue.push(stream);
    }
  }

  #onClose(): void {
    this.#closed = true;
    for (const stream of this.#streams.values()) {
      stream._onRst();
    }
    this.#streams.clear();
    this.#drainWaiters();
  }

  #drainWaiters(): void {
    const waiters = this.#acceptWaiters.splice(0);
    for (const w of waiters) w(null);
  }
}

// ----- Helpers -----

function makeHeader(
  type: number,
  flags: number,
  streamId: number,
  length: number,
): Buffer {
  const hdr = Buffer.allocUnsafe(HEADER_SIZE);
  hdr[0] = PROTO_VERSION;
  hdr[1] = type;
  hdr.writeUInt16BE(flags, 2);
  hdr.writeUInt32BE(streamId, 4);
  hdr.writeUInt32BE(length, 8);
  return hdr;
}

function toBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (Array.isArray(data)) return Buffer.concat(data as Buffer[]);
  return Buffer.from(data as ArrayBuffer);
}
