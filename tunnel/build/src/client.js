import { EventEmitter } from 'node:events';
import { WebSocket } from './third_party/index.js';
import { parseOriginPatterns } from './allowlist.js';
import { RECONNECT_BASE_MS, RECONNECT_MAX_MS, RESUME_SUBPROTOCOL_PREFIX, STALE_CONNECTION_MS, YAMUX_PING_INTERVAL_MS, } from './types.js';
import { LegacyTransport } from './transport_legacy.js';
import { YamuxTransport } from './transport_yamux.js';
/**
 * TunnelClient manages the WebSocket connection lifecycle: connect, handshake,
 * reconnect. After the hello/ready exchange it delegates all protocol-specific
 * work to a TunnelTransport (LegacyTransport or YamuxTransport).
 *
 * Emits 'need_live_tunnel' when a resume token is rejected (401), indicating
 * the caller must obtain a fresh relay URL via live-tunnel before reconnecting.
 */
export class TunnelClient extends EventEmitter {
    #relayUrl;
    #initialConnectionId;
    #connectionId;
    #upgradeHeaders;
    #log;
    #allowedOriginsRaw;
    #allowedOrigins;
    #staleTimeoutMs;
    #yamuxPingIntervalMs;
    #ws = null;
    #state = 'disconnected';
    #tunnelId;
    #transport = null;
    #reconnectAttempts = 0;
    #reconnectTimer = null;
    #staleTimer = null;
    #connectedSince = null;
    #intentionalDisconnect = false;
    #resumeToken;
    #traceId;
    constructor(opts) {
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
    get state() {
        return this.#state;
    }
    get tunnelId() {
        return this.#tunnelId;
    }
    get connectionId() {
        return this.#connectionId;
    }
    get traceId() {
        return this.#traceId;
    }
    connect() {
        this.#intentionalDisconnect = false;
        this.#doConnect();
    }
    disconnect() {
        this.#intentionalDisconnect = true;
        this.#cleanup();
        this.#state = 'disconnected';
    }
    // ----- Connection lifecycle -----
    #doConnect() {
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
        let protocols;
        if (this.#resumeToken) {
            u.searchParams.delete('token');
            if (this.#connectionId) {
                u.searchParams.set('connection_id', this.#connectionId);
            }
            protocols = [`${RESUME_SUBPROTOCOL_PREFIX}${this.#resumeToken}`];
        }
        else if (this.#initialConnectionId) {
            u.searchParams.set('connection_id', this.#initialConnectionId);
        }
        const wsUrlStr = u.toString();
        this.#log(`Connecting to ${wsUrlStr}`);
        const ws = protocols
            ? new WebSocket(wsUrlStr, protocols, { headers: this.#upgradeHeaders })
            : new WebSocket(wsUrlStr, { headers: this.#upgradeHeaders });
        // Handle non-101 upgrade responses (e.g. 401 on resume token replay).
        ws.on('unexpected-response', (_req, res) => {
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
            const hello = {
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
            this.#resetStaleTimer();
        });
        // Listen for the ready message (always JSON, regardless of protocol).
        const handshakeHandler = (data) => {
            this.#resetStaleTimer();
            let msg;
            try {
                msg = JSON.parse(data.toString());
            }
            catch {
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
            // The server preserves the connection_id across resume (lidar
            // tryResume reads it from the trace row), so the chromium browser
            // context's forward proxy continues to find tunnels after reconnect.
            if (msg.resumeToken !== undefined)
                this.#resumeToken = msg.resumeToken;
            if (msg.traceId !== undefined)
                this.#traceId = msg.traceId;
            this.#state = 'ready';
            this.#reconnectAttempts = 0;
            this.#log(`Tunnel ready: ${msg.tunnelId} (connection ${msg.connectionId})`);
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
                });
            }
            else {
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
            this.#transport.serve().catch((err) => {
                this.#log(`Transport error: ${err instanceof Error ? err.message : String(err)}`);
                this.#onDisconnect();
            });
        };
        ws.on('message', handshakeHandler);
        ws.on('close', (code, reason) => {
            this.#log(`WebSocket closed: ${code} ${reason.toString()}`);
            this.#onDisconnect();
        });
        ws.on('error', (err) => {
            this.#log(`WebSocket error: ${err.message}`);
            // 'close' fires after 'error', so reconnect happens there
        });
        this.#ws = ws;
    }
    // ----- Disconnect / reconnect -----
    #onDisconnect() {
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
        if (this.#connectedSince !== null &&
            Date.now() - this.#connectedSince > 60_000) {
            this.#reconnectAttempts = 0;
        }
        this.#state = 'disconnected';
        this.#scheduleReconnect();
    }
    #scheduleReconnect() {
        const delay = Math.min(RECONNECT_BASE_MS * Math.pow(2, this.#reconnectAttempts), RECONNECT_MAX_MS);
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
    #resetStaleTimer() {
        this.#clearStaleTimer();
        this.#staleTimer = setTimeout(() => {
            this.#log('Connection stale, reconnecting');
            this.#ws?.close();
        }, this.#staleTimeoutMs);
    }
    #clearStaleTimer() {
        if (this.#staleTimer !== null) {
            clearTimeout(this.#staleTimer);
            this.#staleTimer = null;
        }
    }
    // ----- Cleanup -----
    #cleanup() {
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
            this.#ws.on('error', () => { });
            this.#ws.close();
            this.#ws = null;
        }
        this.#tunnelId = undefined;
    }
}
