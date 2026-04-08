import {WebSocket, type RawData} from './third_party/index.js';
import * as net from 'node:net';
import type {
  ClientMessage,
  ConnectMessage,
  RelayMessage,
  RequestMessage,
  StreamDataMessage,
  StreamEndMessage,
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
      const hello: {type: 'hello'; target: string; connectionId?: string} = {
        type: 'hello',
        target: this.#target,
      };
      if (this.#initialConnectionId) {
        hello.connectionId = this.#initialConnectionId;
      }
      this.#send(hello);
      this.#resetStaleTimer();
    });

    ws.on('message', (data: RawData) => {
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
        case 'ping':
          this.#send({type: 'pong'});
          break;
        default:
          this.#log(`Unknown message type: ${(msg as {type: string}).type}`);
      }
    });

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

      const encodedBody =
        respBody.byteLength > 0
          ? Buffer.from(respBody).toString('base64')
          : null;

      this.#send({
        type: 'response',
        requestId: msg.requestId,
        status: resp.status,
        headers: respHeaders,
        body: encodedBody,
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

  #send(msg: ClientMessage): void {
    if (this.#ws?.readyState === WebSocket.OPEN) {
      this.#ws.send(JSON.stringify(msg));
    }
  }

  #onDisconnect(): void {
    this.#abortInflight();
    this.#clearStaleTimer();
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
      socket.destroy();
    }
    this.#streams.clear();
  }

  #cleanup(): void {
    this.#abortInflight();
    this.#closeStreams();
    this.#clearStaleTimer();
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
