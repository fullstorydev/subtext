import {EventEmitter} from 'node:events';
import type {IncomingMessage} from 'node:http';
import {WebSocket, type RawData} from './third_party/index.js';
import type {HelloMessage, RelayMessage, TunnelState} from './types.js';
import {
  RECONNECT_BASE_MS,
  RECONNECT_MAX_MS,
  RESUME_SUBPROTOCOL_PREFIX,
  STALE_CONNECTION_MS,
  MAX_RECONNECT_ATTEMPTS,
} from './types.js';
import type {TunnelTransport} from './transport.js';
import {LegacyTransport} from './transport_legacy.js';
import {YamuxTransport} from './transport_yamux.js';

export interface TunnelClientOptions {
  relayUrl: string;
  target: string;
  connectionId?: string;
  headers?: Record<string, string>;
  log: (msg: string) => void;
}

type TunnelClientEvents = {
  need_live_tunnel: [];
};

/**
 * TunnelClient manages the WebSocket connection lifecycle: connect, handshake,
 * reconnect. After the hello/ready exchange it delegates all protocol-specific
 * work to a TunnelTransport (LegacyTransport or YamuxTransport).
 *
 * Emits 'need_live_tunnel' when a resume token is rejected (401), indicating
 * the caller must obtain a fresh relay URL via live-tunnel before reconnecting.
 */
export class TunnelClient extends EventEmitter<TunnelClientEvents> {
  readonly #relayUrl: string;
  readonly #target: string;
  readonly #initialConnectionId: string | undefined;
  #connectionId: string | undefined;
  readonly #upgradeHeaders: Record<string, string>;
  readonly #log: (msg: string) => void;

  #ws: InstanceType<typeof WebSocket> | null = null;
  #state: TunnelState = 'disconnected';
  #tunnelId: string | undefined;
  #transport: TunnelTransport | null = null;
  #reconnectAttempts = 0;
  #reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  #staleTimer: ReturnType<typeof setTimeout> | null = null;
  #connectedSince: number | null = null;
  #intentionalDisconnect = false;
  #resumeToken: string | undefined;
  #traceId: string | undefined;

  constructor(opts: TunnelClientOptions) {
    super();
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

  get traceId(): string | undefined {
    return this.#traceId;
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

  // ----- Connection lifecycle -----

  #doConnect(): void {
    this.#state = 'connecting';

    // Resume path authenticates via subprotocol; strip the (spent) nonce params.
    // Initial path keeps the relay URL intact and sets connection_id if provided.
    const u = new URL(this.#relayUrl);
    let protocols: string[] | undefined;
    if (this.#resumeToken) {
      u.searchParams.delete('token');
      u.searchParams.delete('connection_id');
      protocols = [`${RESUME_SUBPROTOCOL_PREFIX}${this.#resumeToken}`];
    } else if (this.#initialConnectionId) {
      u.searchParams.set('connection_id', this.#initialConnectionId);
    }
    const wsUrlStr = u.toString();

    this.#log(`Connecting to ${wsUrlStr}`);

    const ws = protocols
      ? new WebSocket(wsUrlStr, protocols, {headers: this.#upgradeHeaders})
      : new WebSocket(wsUrlStr, {headers: this.#upgradeHeaders});

    // Handle non-101 upgrade responses (e.g. 401 on resume token replay).
    ws.on('unexpected-response', (_req: unknown, res: IncomingMessage) => {
      this.#log(`Relay rejected upgrade: ${res.statusCode}`);
      if (res.statusCode === 401) {
        this.#resumeToken = undefined;
        this.#traceId = undefined;
        this.#intentionalDisconnect = true;
        this.emit('need_live_tunnel');
      }
      res.resume(); // drain so socket can be released
    });

    ws.on('open', () => {
      this.#state = 'connected';
      this.#connectedSince = Date.now();
      this.#log('WebSocket open, sending hello');
      const hello: HelloMessage = {
        type: 'hello',
        target: this.#target,
        protocol: 'yamux',
        streaming: true,
      };
      // On resume path the server already knows the connectionId; don't echo
      // the stale initial value.
      if (this.#initialConnectionId && !this.#resumeToken) {
        hello.connectionId = this.#initialConnectionId;
      }
      ws.send(JSON.stringify(hello));
      this.#resetStaleTimer();
    });

    // Listen for the ready message (always JSON, regardless of protocol).
    const handshakeHandler = (data: RawData) => {
      this.#resetStaleTimer();
      let msg: RelayMessage;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        this.#log(`Invalid message from relay: ${data.toString().slice(0, 200)}`);
        return;
      }

      if (msg.type === 'error') {
        // Server rejected the resume (e.g. RotateConnection DB failure).
        // Token already revoked server-side; skip reconnect and request a
        // fresh live-tunnel instead.
        this.#log(`Relay handshake error: ${msg.message}`);
        this.#resumeToken = undefined;
        this.#traceId = undefined;
        ws.removeListener('message', handshakeHandler);
        this.#intentionalDisconnect = true;
        ws.close();
        this.emit('need_live_tunnel');
        return;
      }
      if (msg.type !== 'ready') {
        this.#log(`Expected ready, got: ${msg.type}`);
        return;
      }

      ws.removeListener('message', handshakeHandler);

      this.#tunnelId = msg.tunnelId;
      this.#connectionId = msg.connectionId;
      // Capture rotating resume token and stable trace ID from the server.
      if (msg.resumeToken !== undefined) this.#resumeToken = msg.resumeToken;
      if (msg.traceId !== undefined) this.#traceId = msg.traceId;
      this.#state = 'ready';
      this.#reconnectAttempts = 0;
      this.#log(`Tunnel ready: ${msg.tunnelId} (connection ${msg.connectionId})`);

      // Create the transport based on negotiated protocol.
      if (msg.protocol === 'yamux') {
        this.#clearStaleTimer(); // yamux keepalive handles liveness
        this.#transport = new YamuxTransport({
          ws,
          target: this.#target,
          log: this.#log,
          streaming: msg.streaming === true,
        });
      } else {
        this.#transport = new LegacyTransport({
          ws,
          target: this.#target,
          log: this.#log,
          onActivity: () => this.#resetStaleTimer(),
        });
      }

      // Transport.serve() resolves when the WebSocket closes or the session
      // tears down. The close handler below then triggers reconnect.
      void this.#transport.serve();
    };
    ws.on('message', handshakeHandler);

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

  // ----- Disconnect / reconnect -----

  #onDisconnect(): void {
    this.#transport?.close();
    this.#transport = null;
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

  // ----- Stale connection detection -----

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

  // ----- Cleanup -----

  #cleanup(): void {
    this.#transport?.close();
    this.#transport = null;
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
