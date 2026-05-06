import {EventEmitter} from 'node:events';
import type {IncomingMessage} from 'node:http';
import {WebSocket, type RawData} from './third_party/index.js';
import type {OriginPattern} from './allowlist.js';
import {parseOriginPatterns} from './allowlist.js';
import {EventRing} from './history.js';
import type {HelloMessage, RelayMessage, TunnelState} from './types.js';
import {
  RECONNECT_BASE_MS,
  RECONNECT_MAX_MS,
  RESUME_SUBPROTOCOL_PREFIX,
  STALE_CONNECTION_MS,
  YAMUX_PING_INTERVAL_MS,
} from './types.js';
import type {TunnelTransport} from './transport.js';
import {LegacyTransport} from './transport_legacy.js';
import {YamuxTransport} from './transport_yamux.js';

export interface TunnelClientOptions {
  relayUrl: string;
  connectionId?: string;
  headers?: Record<string, string>;
  log: (msg: string) => void;
  // Per-tunnel origin allowlist. Strings here must conform to the grammar
  // in allowlist.ts and are validated at construction. The relay routes
  // each request to one of these origins; the client refuses anything not
  // on the list.
  allowedOrigins?: string[];
  /**
   * Override the inactivity threshold (ms) before the WS is treated as silently
   * dropped and reconnected. Defaults to STALE_CONNECTION_MS. Tests use a small
   * value to exercise the reconnect path quickly.
   */
  staleTimeoutMs?: number;
  /**
   * Override the yamux client-initiated PING cadence (ms). 0 disables.
   * Defaults to YAMUX_PING_INTERVAL_MS.
   */
  yamuxPingIntervalMs?: number;
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
  readonly #initialConnectionId: string | undefined;
  #connectionId: string | undefined;
  readonly #upgradeHeaders: Record<string, string>;
  readonly #log: (msg: string) => void;
  readonly #allowedOriginsRaw: string[] | undefined;
  readonly #allowedOrigins: OriginPattern[];
  readonly #staleTimeoutMs: number;
  readonly #yamuxPingIntervalMs: number;

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

  /**
   * Per-client lifecycle event ring. Read-only from the outside; surfaced via
   * the `tunnel-history` MCP tool so callers (esp. agents) can self-diagnose
   * why a tunnel went stale or why a resume failed without needing kubectl.
   */
  readonly history: EventRing = new EventRing();

  constructor(opts: TunnelClientOptions) {
    super();
    this.#relayUrl = opts.relayUrl;
    this.#initialConnectionId = opts.connectionId;
    this.#connectionId = opts.connectionId;
    this.#log = opts.log;
    this.#upgradeHeaders = opts.headers ?? {};
    // Parse the allowlist once at construction. Throws if any entry is
    // malformed — surfacing the error here is friendlier than waiting for
    // the relay to reject the hello.
    this.#allowedOriginsRaw = opts.allowedOrigins;
    this.#allowedOrigins = parseOriginPatterns(opts.allowedOrigins);
    this.#staleTimeoutMs = opts.staleTimeoutMs ?? STALE_CONNECTION_MS;
    this.#yamuxPingIntervalMs = opts.yamuxPingIntervalMs ?? YAMUX_PING_INTERVAL_MS;
  }

  get state(): TunnelState {
    return this.#state;
  }

  get tunnelId(): string | undefined {
    return this.#tunnelId;
  }

  get connectionId(): string | undefined {
    return this.#connectionId;
  }

  get traceId(): string | undefined {
    return this.#traceId;
  }

  connect(): void {
    this.#intentionalDisconnect = false;
    this.history.push('connect-start', {resume: false});
    this.#doConnect();
  }

  disconnect(): void {
    this.history.push('disconnect-requested');
    this.#intentionalDisconnect = true;
    this.#cleanup();
    this.#state = 'disconnected';
  }

  // ----- Connection lifecycle -----

  #doConnect(): void {
    this.#state = 'connecting';

    // Resume path authenticates via subprotocol; strip the (spent) nonce token.
    // Keep connection_id in the URL — the relay's affinity router hashes on it
    // to send the WS to the pod that owns the chromium browser context. Without
    // it, the affinity router mints a fresh UUID and the reconnect lands on a
    // random pod; the new tunnel registers there with the (correct, preserved)
    // connection_id, but the chromium-side forward proxy on the original pod
    // still can't see it and the next navigation gets ERR_TUNNEL_CONNECTION_FAILED.
    // Initial path keeps the relay URL intact and sets connection_id if provided.
    const u = new URL(this.#relayUrl);
    let protocols: string[] | undefined;
    if (this.#resumeToken) {
      u.searchParams.delete('token');
      if (this.#connectionId) {
        u.searchParams.set('connection_id', this.#connectionId);
      }
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
      this.history.push('unexpected-response', {statusCode: res.statusCode});
      if (res.statusCode === 401) {
        this.#resumeToken = undefined;
        this.#traceId = undefined;
        this.#intentionalDisconnect = true;
        this.history.push('need-live-tunnel', {reason: '401 on upgrade'});
        this.emit('need_live_tunnel');
      }
      res.resume(); // drain so socket can be released
    });

    ws.on('open', () => {
      this.#state = 'connected';
      this.#connectedSince = Date.now();
      this.#log('WebSocket open, sending hello');
      this.history.push('ws-open');
      const hello: HelloMessage = {
        type: 'hello',
        protocol: 'yamux',
        streaming: true,
      };
      if (this.#allowedOriginsRaw && this.#allowedOriginsRaw.length > 0) {
        hello.allowedOrigins = this.#allowedOriginsRaw;
      }
      // On resume path the server already knows the connectionId; don't echo
      // the stale initial value.
      if (this.#initialConnectionId && !this.#resumeToken) {
        hello.connectionId = this.#initialConnectionId;
      }
      ws.send(JSON.stringify(hello));
      this.history.push('hello-sent', {
        resume: !!this.#resumeToken,
        hasAllowedOrigins: !!hello.allowedOrigins,
      });
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
        this.history.push('handshake-error', {message: msg.message});
        this.#resumeToken = undefined;
        this.#traceId = undefined;
        ws.removeListener('message', handshakeHandler);
        this.#intentionalDisconnect = true;
        ws.close();
        this.history.push('need-live-tunnel', {reason: 'handshake error'});
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
      // The server preserves the connection_id across resume (lidar
      // tryResume reads it from the trace row), so the chromium browser
      // context's forward proxy continues to find tunnels after reconnect.
      if (msg.resumeToken !== undefined) this.#resumeToken = msg.resumeToken;
      if (msg.traceId !== undefined) this.#traceId = msg.traceId;
      this.#state = 'ready';
      this.#reconnectAttempts = 0;
      this.#log(`Tunnel ready: ${msg.tunnelId} (connection ${msg.connectionId})`);
      this.history.push('ready', {
        tunnelId: msg.tunnelId,
        connectionId: msg.connectionId,
        gotResumeToken: msg.resumeToken !== undefined,
        gotTraceId: msg.traceId !== undefined,
        protocol: msg.protocol,
      });

      // Create the transport based on negotiated protocol. Both transports
      // wire onActivity to the stale-timer reset: yamux server-initiated
      // pings alone are not sufficient for liveness, since a silently dropped
      // WS leaves us with no way to learn the peer is gone. The yamux session
      // also sends its own client-initiated PINGs to keep stateful
      // intermediaries (linkerd, NATs, LBs) from idling us out.
      if (msg.protocol === 'yamux') {
        this.#transport = new YamuxTransport({
          ws,
          log: this.#log,
          streaming: msg.streaming === true,
          allowedOrigins: this.#allowedOrigins,
          onActivity: () => this.#resetStaleTimer(),
          pingIntervalMs: this.#yamuxPingIntervalMs,
          // Diagnostic: record every successful ping enqueue. Lets callers
          // verify the keepalive timer is actually firing during quiet idle
          // windows; an absence of ping-sent events between connect and
          // stale-fired is a strong signal of event-loop starvation.
          onPingSent: () => this.history.push('ping-sent'),
        });
      } else {
        this.#transport = new LegacyTransport({
          ws,
          log: this.#log,
          onActivity: () => this.#resetStaleTimer(),
          allowedOrigins: this.#allowedOrigins,
        });
      }

      // Transport.serve() resolves when the WebSocket closes or the session
      // tears down. The close handler below then triggers reconnect.
      // Catch unexpected rejections so they don't become unhandled and kill
      // the process -- treat them the same as a connection drop.
      this.#transport.serve().catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        this.#log(`Transport error: ${message}`);
        this.history.push('transport-error', {message});
        this.#onDisconnect();
      });
    };
    ws.on('message', handshakeHandler);

    ws.on('close', (code: number, reason: Buffer) => {
      this.#log(`WebSocket closed: ${code} ${reason.toString()}`);
      this.history.push('ws-close', {code, reason: reason.toString()});
      this.#onDisconnect();
    });

    ws.on('error', (err: Error) => {
      this.#log(`WebSocket error: ${err.message}`);
      this.history.push('ws-error', {message: err.message});
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
    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(2, this.#reconnectAttempts),
      RECONNECT_MAX_MS,
    );
    // Add jitter: 0-25% of delay
    const jitter = Math.random() * delay * 0.25;
    const total = Math.round(delay + jitter);
    this.#reconnectAttempts++;
    this.#log(`Reconnecting in ${total}ms (attempt ${this.#reconnectAttempts})`);
    this.history.push('reconnect-scheduled', {
      delayMs: total,
      attempt: this.#reconnectAttempts,
      resume: !!this.#resumeToken,
    });
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
      this.history.push('stale-fired', {timeoutMs: this.#staleTimeoutMs});
      this.#ws?.close();
    }, this.#staleTimeoutMs);
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
      // Re-attach a no-op error handler: close() on a CONNECTING socket emits
      // 'error' synchronously; without a listener Node throws.
      this.#ws.on('error', () => {});
      this.#ws.close();
      this.#ws = null;
    }
    this.#tunnelId = undefined;
  }
}
