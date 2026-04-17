import { WebSocket } from './third_party/index.js';
import { RECONNECT_BASE_MS, RECONNECT_MAX_MS, STALE_CONNECTION_MS, MAX_RECONNECT_ATTEMPTS, } from './types.js';
import { LegacyTransport } from './transport_legacy.js';
import { YamuxTransport } from './transport_yamux.js';
/**
 * TunnelClient manages the WebSocket connection lifecycle: connect, handshake,
 * reconnect. After the hello/ready exchange it delegates all protocol-specific
 * work to a TunnelTransport (LegacyTransport or YamuxTransport).
 */
export class TunnelClient {
    #relayUrl;
    #target;
    #initialConnectionId;
    #connectionId;
    #upgradeHeaders;
    #log;
    #ws = null;
    #state = 'disconnected';
    #tunnelId;
    #transport = null;
    #reconnectAttempts = 0;
    #reconnectTimer = null;
    #staleTimer = null;
    #connectedSince = null;
    #intentionalDisconnect = false;
    constructor(opts) {
        this.#relayUrl = opts.relayUrl;
        this.#target = opts.target;
        this.#initialConnectionId = opts.connectionId;
        this.#connectionId = opts.connectionId;
        this.#log = opts.log;
        this.#upgradeHeaders = opts.headers ?? {};
    }
    get state() {
        return this.#state;
    }
    get tunnelId() {
        return this.#tunnelId;
    }
    get target() {
        return this.#target;
    }
    get connectionId() {
        return this.#connectionId;
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
            const hello = {
                type: 'hello',
                target: this.#target,
                protocol: 'yamux',
                streaming: true,
            };
            if (this.#initialConnectionId) {
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
            if (msg.type !== 'ready') {
                this.#log(`Expected ready, got: ${msg.type}`);
                return;
            }
            ws.removeListener('message', handshakeHandler);
            this.#tunnelId = msg.tunnelId;
            this.#connectionId = msg.connectionId;
            this.#state = 'ready';
            this.#reconnectAttempts = 0;
            this.#log(`Tunnel ready: ${msg.tunnelId} (connection ${msg.connectionId})`);
            // Create the transport based on negotiated protocol.
            if (msg.protocol === 'yamux') {
                this.#clearStaleTimer(); // yamux keepalive handles liveness
                this.#transport = new YamuxTransport({ ws, target: this.#target, log: this.#log, streaming: msg.streaming === true });
            }
            else {
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
        if (this.#reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            this.#log(`Reached max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}); stopping reconnect loop`);
            return;
        }
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
        }, STALE_CONNECTION_MS);
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
            this.#ws.close();
            this.#ws = null;
        }
        this.#tunnelId = undefined;
    }
}
