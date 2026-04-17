import {WebSocket, type RawData} from './third_party/index.js';
import * as net from 'node:net';
import {gzip} from 'node:zlib';
import {promisify} from 'node:util';

const gzipAsync = promisify(gzip);
import type {
  ClientMessage,
  ConnectMessage,
  RelayMessage,
  ReadyMessage,
  RequestMessage,
  StreamDataMessage,
  StreamEndMessage,
  StreamPauseMessage,
  StreamResumeMessage,
  TunnelState,
  WireHeaders,
} from './types.js';
import {
  MAX_INFLIGHT,
  MAX_RESPONSE_BODY_BYTES,
  REQUEST_TIMEOUT_MS,
  RECONNECT_BASE_MS,
  RECONNECT_MAX_MS,
  STALE_CONNECTION_MS,
  MAX_RECONNECT_ATTEMPTS,
} from './types.js';
import {YamuxSession, YamuxStream} from './yamux.js';

export interface TunnelClientOptions {
  relayUrl: string;
  target: string;
  connectionId?: string;
  headers?: Record<string, string>;
  log: (msg: string) => void;
}

export class TunnelClient {
  readonly #relayUrl: string;
  readonly #target: string;
  readonly #initialConnectionId: string | undefined;
  #connectionId: string | undefined;
  readonly #upgradeHeaders: Record<string, string>;
  readonly #log: (msg: string) => void;

  #ws: InstanceType<typeof WebSocket> | null = null;
  #state: TunnelState = 'disconnected';
  #tunnelId: string | undefined;
  #inflight = new Map<string, AbortController>();
  #streams = new Map<string, net.Socket>();
  #reconnectAttempts = 0;
  #reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  #staleTimer: ReturnType<typeof setTimeout> | null = null;
  #connectedSince: number | null = null;
  #intentionalDisconnect = false;
  #yamuxSession: YamuxSession | null = null;

  constructor(opts: TunnelClientOptions) {
    this.#relayUrl = opts.relayUrl;
    this.#target = opts.target;
    this.#initialConnectionId = opts.connectionId;
    this.#connectionId = opts.connectionId;
    this.#log = opts.log;

    this.#upgradeHeaders = opts.headers ?? {};
  }

  get state(): TunnelState {
    return this.#state;
  }

  get tunnelId(): string | undefined {
    return this.#tunnelId;
  }

  get target(): string {
    return this.#target;
  }

  get connectionId(): string | undefined {
    return this.#connectionId;
  }

  connect(): void {
    this.#intentionalDisconnect = false;
    this.#doConnect();
  }

  disconnect(): void {
    this.#intentionalDisconnect = true;
    this.#cleanup();
    this.#state = 'disconnected';
  }

  #doConnect(): void {
    this.#state = 'connecting';

    const wsUrl = new URL(this.#relayUrl);
    if (this.#initialConnectionId) {
      wsUrl.searchParams.set('connection_id', this.#initialConnectionId);
    }

    this.#log(`Connecting to ${wsUrl}`);

    const ws = new WebSocket(wsUrl.toString(), {
      headers: this.#upgradeHeaders,
    });

    ws.on('open', () => {
      this.#state = 'connected';
      this.#connectedSince = Date.now();
      this.#log('WebSocket open, sending hello');
      const hello: {type: 'hello'; target: string; connectionId?: string; protocol: 'yamux'} = {
        type: 'hello',
        target: this.#target,
        protocol: 'yamux',
      };
      if (this.#initialConnectionId) {
        hello.connectionId = this.#initialConnectionId;
      }
      this.#send(hello);
      this.#resetStaleTimer();
    });

    const messageHandler = (data: RawData) => {
      this.#resetStaleTimer();
      let msg: RelayMessage;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        this.#log(`Invalid message from relay: ${data.toString().slice(0, 200)}`);
        return;
      }

      switch (msg.type) {
        case 'ready':
          this.#tunnelId = msg.tunnelId;
          this.#connectionId = msg.connectionId;
          this.#state = 'ready';
          this.#reconnectAttempts = 0;
          this.#log(`Tunnel ready: ${msg.tunnelId} (connection ${msg.connectionId})`);
          if (msg.protocol === 'yamux') {
            ws.removeListener('message', messageHandler);
            this.#clearStaleTimer(); // yamux keepalive handles liveness
            this.#startYamuxMode(ws, msg);
          }
          break;
        case 'request':
          void this.#handleRequest(msg);
          break;
        case 'connect':
          this.#handleConnect(msg);
          break;
        case 'data':
          this.#handleStreamData(msg);
          break;
        case 'end':
          this.#handleStreamEnd(msg);
          break;
        case 'pause':
          this.#handleStreamPause(msg);
          break;
        case 'resume':
          this.#handleStreamResume(msg);
          break;
        case 'ping':
          this.#send({type: 'pong'});
          break;
        default:
          this.#log(`Unknown message type: ${(msg as {type: string}).type}`);
      }
    };
    ws.on('message', messageHandler);

    ws.on('close', (code: number, reason: Buffer) => {
      this.#log(`WebSocket closed: ${code} ${reason.toString()}`);
      this.#onDisconnect();
    });

    ws.on('error', (err: Error) => {
      this.#log(`WebSocket error: ${err.message}`);
      // 'close' fires after 'error', so reconnect happens there
    });

    this.#ws = ws;
  }

  async #handleRequest(msg: RequestMessage): Promise<void> {
    if (this.#inflight.size >= MAX_INFLIGHT) {
      this.#send({
        type: 'error',
        requestId: msg.requestId,
        message: `Too many inflight requests (max ${MAX_INFLIGHT})`,
      });
      return;
    }

    const ac = new AbortController();
    this.#inflight.set(msg.requestId, ac);

    try {
      const url = this.#target + msg.url;
      const headers = wireHeadersToHeaders(msg.headers);
      const body =
        msg.body !== null ? Buffer.from(msg.body, 'base64') : undefined;

      const resp = await fetch(url, {
        method: msg.method,
        headers,
        body,
        signal: ac.signal,
        redirect: 'manual',
      });

      const respBody = await resp.arrayBuffer();
      if (respBody.byteLength > MAX_RESPONSE_BODY_BYTES) {
        this.#send({
          type: 'error',
          requestId: msg.requestId,
          message: `Response body too large: ${respBody.byteLength} bytes (max ${MAX_RESPONSE_BODY_BYTES})`,
        });
        return;
      }

      const respHeaders = headersToWireHeaders(resp.headers);

      // Node's fetch() transparently decompresses responses (gzip, br, etc.)
      // but preserves the original Content-Encoding header. Strip encoding-
      // related headers so the relay doesn't tell the browser the body is
      // compressed when it's already been decoded.
      delete respHeaders['content-encoding'];
      delete respHeaders['content-length'];

      let bodyBuf = Buffer.from(respBody);
      let encoding: 'gzip' | undefined;
      if (bodyBuf.length > 0) {
        const compressed = await gzipAsync(bodyBuf);
        if (compressed.length < bodyBuf.length) {
          bodyBuf = compressed;
          encoding = 'gzip';
        }
      }

      const encodedBody = bodyBuf.length > 0 ? bodyBuf.toString('base64') : null;

      this.#send({
        type: 'response',
        requestId: msg.requestId,
        status: resp.status,
        headers: respHeaders,
        body: encodedBody,
        encoding,
      });
    } catch (err) {
      if (ac.signal.aborted) return;
      const message = err instanceof Error ? err.message : String(err);
      this.#send({
        type: 'error',
        requestId: msg.requestId,
        message,
      });
    } finally {
      this.#inflight.delete(msg.requestId);
    }
  }

  #handleConnect(msg: ConnectMessage): void {
    const {streamId, host} = msg;
    this.#log(`Stream ${streamId}: connecting to ${host}`);

    // Parse host:port. Always use raw TCP — the browser negotiates TLS
    // end-to-end through the CONNECT tunnel, so adding TLS here would
    // cause double-encryption and break the handshake.
    const [hostname, portStr] = host.includes(':')
      ? [host.slice(0, host.lastIndexOf(':')), host.slice(host.lastIndexOf(':') + 1)]
      : [host, '80'];
    const port = parseInt(portStr, 10);

    const socket = net.connect({host: hostname, port});

    socket.once('connect', () => {
      this.#log(`Stream ${streamId}: connected to ${host}`);
      this.#streams.set(streamId, socket);
      this.#send({type: 'connected', streamId});

      socket.on('data', (chunk: Buffer) => {
        this.#send({
          type: 'data',
          streamId,
          data: chunk.toString('base64'),
        });
      });

      socket.on('end', () => {
        this.#log(`Stream ${streamId}: remote end closed`);
        this.#streams.delete(streamId);
        this.#send({type: 'end', streamId});
      });

      socket.on('error', (err: Error) => {
        this.#log(`Stream ${streamId}: socket error: ${err.message}`);
        this.#streams.delete(streamId);
        this.#send({type: 'end', streamId});
      });
    });

    socket.once('error', (err: Error) => {
      // Connection failed before establishing.
      if (!this.#streams.has(streamId)) {
        this.#log(`Stream ${streamId}: connect error: ${err.message}`);
        this.#send({type: 'stream_error', streamId, message: err.message});
      }
    });
  }

  #handleStreamData(msg: StreamDataMessage): void {
    const socket = this.#streams.get(msg.streamId);
    if (socket) {
      socket.write(Buffer.from(msg.data, 'base64'));
    }
  }

  #handleStreamEnd(msg: StreamEndMessage): void {
    const socket = this.#streams.get(msg.streamId);
    if (socket) {
      this.#streams.delete(msg.streamId);
      socket.end();
    }
  }

  #handleStreamPause(msg: StreamPauseMessage): void {
    const socket = this.#streams.get(msg.streamId);
    if (socket) {
      socket.pause();
    }
  }

  #handleStreamResume(msg: StreamResumeMessage): void {
    const socket = this.#streams.get(msg.streamId);
    if (socket) {
      socket.resume();
    }
  }

  // ----- Yamux mode -----

  #startYamuxMode(ws: InstanceType<typeof WebSocket>, _ready: ReadyMessage): void {
    const session = new YamuxSession(ws);
    this.#yamuxSession = session;
    void this.#yamuxAcceptLoop(session);
  }

  async #yamuxAcceptLoop(session: YamuxSession): Promise<void> {
    while (true) {
      const stream = await session.accept();
      if (stream === null) break; // session closed
      void this.#handleYamuxStream(stream).catch((err: unknown) => {
        this.#log(`yamux stream ${stream.id} error: ${err instanceof Error ? err.message : String(err)}`);
      });
    }
  }

  async #handleYamuxStream(stream: YamuxStream): Promise<void> {
    // First byte is stream type prefix.
    const typeBuf = await stream.readExact(1);
    const streamType = typeBuf[0];
    if (streamType === 0x01) {
      await this.#handleYamuxHttpStream(stream);
    } else if (streamType === 0x02) {
      await this.#handleYamuxConnectStream(stream);
    } else {
      this.#log(`yamux stream ${stream.id}: unknown type 0x${streamType.toString(16)}`);
      stream.close();
    }
  }

  async #handleYamuxHttpStream(stream: YamuxStream): Promise<void> {
    // Read [4-byte JSON len][JSON header][raw body]
    const lenBuf = await stream.readExact(4);
    const headerLen = lenBuf.readUInt32BE(0);
    const headerBuf = await stream.readExact(headerLen);
    const header = JSON.parse(headerBuf.toString()) as {
      method: string;
      url: string;
      headers: WireHeaders;
      bodyLen: number;
    };

    let reqBody: Buffer | undefined;
    if (header.bodyLen > 0) {
      reqBody = await stream.readExact(header.bodyLen);
    }

    const url = this.#target + header.url;
    const fetchHeaders = wireHeadersToHeaders(header.headers);

    const resp = await fetch(url, {
      method: header.method,
      headers: fetchHeaders,
      body: reqBody,
      redirect: 'manual',
    });

    const respBodyBuf = Buffer.from(await resp.arrayBuffer());
    const respHeaders = headersToWireHeaders(resp.headers);
    delete respHeaders['content-encoding'];
    delete respHeaders['content-length'];

    // Write [4-byte JSON len][JSON header][raw body]
    const respHdrJson = Buffer.from(
      JSON.stringify({status: resp.status, headers: respHeaders, bodyLen: respBodyBuf.length}),
    );
    const lenPrefix = Buffer.allocUnsafe(4);
    lenPrefix.writeUInt32BE(respHdrJson.length, 0);
    await stream.write(Buffer.concat([lenPrefix, respHdrJson, respBodyBuf]));
    stream.close();
  }

  async #handleYamuxConnectStream(stream: YamuxStream): Promise<void> {
    // Read [4-byte JSON len][JSON header: {host}]
    const lenBuf = await stream.readExact(4);
    const headerLen = lenBuf.readUInt32BE(0);
    const headerBuf = await stream.readExact(headerLen);
    const {host} = JSON.parse(headerBuf.toString()) as {host: string};

    this.#log(`yamux stream ${stream.id}: CONNECT ${host}`);

    const lastColon = host.lastIndexOf(':');
    const [hostname, portStr] =
      lastColon >= 0
        ? [host.slice(0, lastColon), host.slice(lastColon + 1)]
        : [host, '80'];
    const port = parseInt(portStr, 10);

    const socket = net.connect({host: hostname, port});
    try {
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('error', reject);
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.#log(`yamux stream ${stream.id}: connect error: ${msg}`);
      const errBuf = Buffer.from(msg);
      const resp = Buffer.allocUnsafe(1 + errBuf.length);
      resp[0] = 0x01;
      errBuf.copy(resp, 1);
      await stream.write(resp).catch(() => undefined);
      stream.close();
      return;
    }

    // Write success byte.
    await stream.write(Buffer.from([0x00]));

    // Pump socket → yamux stream (event-driven).
    const socketDone = new Promise<void>((resolve) => {
      socket.on('data', (chunk: Buffer) => {
        stream.write(chunk).catch(() => {
          socket.destroy();
          resolve();
        });
      });
      socket.once('end', () => {
        stream.close();
        resolve();
      });
      socket.once('error', () => {
        stream.close();
        resolve();
      });
    });

    // Pump yamux stream → socket (read loop).
    const yamuxDone = (async () => {
      try {
        while (true) {
          const chunk = await stream.read();
          if (chunk.length === 0) {
            // FIN from server: half-close the TCP socket.
            socket.end();
            break;
          }
          socket.write(chunk);
        }
      } catch {
        socket.destroy();
      }
    })();

    await Promise.all([socketDone, yamuxDone]);
  }

  #send(msg: ClientMessage): boolean {
    if (this.#ws?.readyState === WebSocket.OPEN) {
      this.#ws.send(JSON.stringify(msg));
      return true;
    }
    this.#log(`Dropped ${msg.type} message (ws state=${this.#ws?.readyState})`);
    return false;
  }

  #onDisconnect(): void {
    this.#abortInflight();
    this.#closeStreams();
    this.#clearStaleTimer();
    this.#yamuxSession?.close();
    this.#yamuxSession = null;
    this.#tunnelId = undefined;
    this.#ws = null;

    if (this.#intentionalDisconnect) {
      this.#state = 'disconnected';
      return;
    }

    // Reset backoff if we had a healthy connection for >60s
    if (
      this.#connectedSince !== null &&
      Date.now() - this.#connectedSince > 60_000
    ) {
      this.#reconnectAttempts = 0;
    }

    this.#state = 'disconnected';
    this.#scheduleReconnect();
  }

  #scheduleReconnect(): void {
    if (this.#reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.#log(
        `Reached max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}); stopping reconnect loop`,
      );
      return;
    }

    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(2, this.#reconnectAttempts),
      RECONNECT_MAX_MS,
    );
    // Add jitter: 0-25% of delay
    const jitter = Math.random() * delay * 0.25;
    const total = Math.round(delay + jitter);
    this.#reconnectAttempts++;
    this.#log(`Reconnecting in ${total}ms (attempt ${this.#reconnectAttempts})`);
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null;
      this.#doConnect();
    }, total);
  }

  #resetStaleTimer(): void {
    this.#clearStaleTimer();
    this.#staleTimer = setTimeout(() => {
      this.#log('Connection stale, reconnecting');
      this.#ws?.close();
    }, STALE_CONNECTION_MS);
  }

  #clearStaleTimer(): void {
    if (this.#staleTimer !== null) {
      clearTimeout(this.#staleTimer);
      this.#staleTimer = null;
    }
  }

  #abortInflight(): void {
    for (const ac of this.#inflight.values()) {
      ac.abort();
    }
    this.#inflight.clear();
  }

  #closeStreams(): void {
    for (const socket of this.#streams.values()) {
      socket.end(); // graceful FIN; let in-progress TLS records complete
    }
    this.#streams.clear();
  }

  #cleanup(): void {
    this.#abortInflight();
    this.#closeStreams();
    this.#clearStaleTimer();
    this.#yamuxSession?.close();
    this.#yamuxSession = null;
    if (this.#reconnectTimer !== null) {
      clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = null;
    }
    if (this.#ws) {
      this.#ws.removeAllListeners();
      this.#ws.close();
      this.#ws = null;
    }
    this.#tunnelId = undefined;
  }
}

/** Convert wire headers (Record<string, string[]>) to fetch Headers. */
function wireHeadersToHeaders(wire: WireHeaders): Headers {
  const h = new Headers();
  for (const [name, values] of Object.entries(wire)) {
    for (const v of values) {
      h.append(name, v);
    }
  }
  return h;
}

/** Convert fetch Headers to wire headers (Record<string, string[]>). */
function headersToWireHeaders(headers: Headers): WireHeaders {
  const wire: WireHeaders = {};
  // Use getSetCookie() for Set-Cookie since Headers.entries() merges them
  const setCookies = headers.getSetCookie();
  if (setCookies.length > 0) {
    wire['set-cookie'] = setCookies;
  }
  headers.forEach((value, name) => {
    if (name.toLowerCase() === 'set-cookie') return; // handled above
    wire[name] = [value];
  });
  return wire;
}
