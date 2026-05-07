import { WebSocket } from './third_party/index.js';
import * as net from 'node:net';
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';
const gzipAsync = promisify(gzip);
import { MAX_INFLIGHT, MAX_RESPONSE_BODY_BYTES } from './types.js';
import { matchesAny } from './allowlist.js';
import { resolveLoopbackOrigin } from './loopback.js';
import { wireHeadersToHeaders, headersToWireHeaders, stripTransferHeaders, parseHostPort } from './transport.js';
/**
 * LegacyTransport handles the JSON-over-WebSocket protocol with base64-encoded
 * bodies, channel-based stream management, and pause/resume flow control.
 */
export class LegacyTransport {
    #ws;
    #log;
    #onActivity;
    #allowedOrigins;
    #inflight = new Map();
    #streams = new Map();
    constructor(opts) {
        this.#ws = opts.ws;
        this.#log = opts.log;
        this.#onActivity = opts.onActivity;
        this.#allowedOrigins = opts.allowedOrigins ?? [];
    }
    serve() {
        return new Promise((resolve) => {
            const handler = (data) => {
                this.#onActivity();
                let msg;
                try {
                    msg = JSON.parse(data.toString());
                }
                catch {
                    this.#log(`Invalid message from relay: ${data.toString().slice(0, 200)}`);
                    return;
                }
                switch (msg.type) {
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
                        this.#send({ type: 'pong' });
                        break;
                    default:
                        this.#log(`Unknown message type: ${msg.type}`);
                }
            };
            this.#ws.on('message', handler);
            this.#ws.once('close', () => {
                this.#ws.removeListener('message', handler);
                resolve();
            });
        });
    }
    close() {
        this.#abortInflight();
        this.#closeStreams();
    }
    // ----- Request handling -----
    async #handleRequest(msg) {
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
            // The relay is the source of truth for which origin a request belongs
            // to. A request without `origin` is a protocol violation by the relay.
            if (!msg.origin) {
                throw new Error('legacy request missing origin');
            }
            const origin = msg.origin;
            if (this.#allowedOrigins.length > 0 && !matchesAny(this.#allowedOrigins, origin)) {
                throw new Error(`origin not in allowlist: ${origin}`);
            }
            const resolved = await resolveLoopbackOrigin(origin);
            const url = resolved.ipUrl + msg.url;
            const headers = wireHeadersToHeaders(msg.headers);
            headers.set('Host', `${resolved.hostname}:${resolved.port}`);
            const body = msg.body !== null ? Buffer.from(msg.body, 'base64') : undefined;
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
            stripTransferHeaders(respHeaders);
            let bodyBuf = Buffer.from(respBody);
            let encoding;
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
        }
        catch (err) {
            if (ac.signal.aborted)
                return;
            const message = err instanceof Error ? err.message : String(err);
            this.#send({
                type: 'error',
                requestId: msg.requestId,
                message,
            });
        }
        finally {
            this.#inflight.delete(msg.requestId);
        }
    }
    // ----- CONNECT stream handling -----
    #handleConnect(msg) {
        const { streamId, host } = msg;
        this.#log(`Stream ${streamId}: connecting to ${host}`);
        const { hostname, port } = parseHostPort(host);
        const socket = net.connect({ host: hostname, port });
        socket.once('connect', () => {
            this.#log(`Stream ${streamId}: connected to ${host}`);
            this.#streams.set(streamId, socket);
            this.#send({ type: 'connected', streamId });
            socket.on('data', (chunk) => {
                this.#send({
                    type: 'data',
                    streamId,
                    data: chunk.toString('base64'),
                });
            });
            socket.on('end', () => {
                this.#log(`Stream ${streamId}: remote end closed`);
                this.#streams.delete(streamId);
                this.#send({ type: 'end', streamId });
            });
            socket.on('error', (err) => {
                this.#log(`Stream ${streamId}: socket error: ${err.message}`);
                this.#streams.delete(streamId);
                this.#send({ type: 'end', streamId });
            });
        });
        socket.once('error', (err) => {
            if (!this.#streams.has(streamId)) {
                this.#log(`Stream ${streamId}: connect error: ${err.message}`);
                this.#send({ type: 'stream_error', streamId, message: err.message });
            }
        });
    }
    #handleStreamData(msg) {
        const socket = this.#streams.get(msg.streamId);
        if (socket) {
            socket.write(Buffer.from(msg.data, 'base64'));
        }
    }
    #handleStreamEnd(msg) {
        const socket = this.#streams.get(msg.streamId);
        if (socket) {
            this.#streams.delete(msg.streamId);
            socket.end();
        }
    }
    #handleStreamPause(msg) {
        const socket = this.#streams.get(msg.streamId);
        if (socket) {
            socket.pause();
        }
    }
    #handleStreamResume(msg) {
        const socket = this.#streams.get(msg.streamId);
        if (socket) {
            socket.resume();
        }
    }
    // ----- Helpers -----
    #send(msg) {
        if (this.#ws?.readyState === WebSocket.OPEN) {
            this.#ws.send(JSON.stringify(msg));
            return true;
        }
        this.#log(`Dropped ${msg.type} message (ws state=${this.#ws?.readyState})`);
        return false;
    }
    #abortInflight() {
        for (const ac of this.#inflight.values()) {
            ac.abort();
        }
        this.#inflight.clear();
    }
    #closeStreams() {
        for (const socket of this.#streams.values()) {
            socket.end();
        }
        this.#streams.clear();
    }
}
