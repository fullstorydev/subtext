import * as net from 'node:net';
import { matchesAny } from './allowlist.js';
import { resolveLoopbackOrigin } from './loopback.js';
import { MAX_RESPONSE_BODY_BYTES } from './types.js';
import { wireHeadersToHeaders, headersToWireHeaders, stripTransferHeaders, parseHostPort, MAX_YAMUX_HEADER_BYTES, } from './transport.js';
import { YamuxSession } from './yamux.js';
export const STREAM_TYPE_REQUEST = 0x01;
export const STREAM_TYPE_CONNECT = 0x02;
export const CONNECT_STATUS_OK = 0x00;
export const CONNECT_STATUS_ERR = 0x01;
/**
 * YamuxTransport handles the binary yamux multiplexing protocol. After the
 * hello/ready handshake, the WebSocket carries raw yamux frames. The server
 * opens streams; each stream starts with a 1-byte type prefix:
 *
 *  - STREAM_TYPE_REQUEST (0x01): HTTP request/response
 *  - STREAM_TYPE_CONNECT (0x02): CONNECT (TCP pipe)
 */
export class YamuxTransport {
    #target;
    #log;
    #session;
    #streaming;
    #allowedOrigins;
    constructor(opts) {
        this.#target = opts.target;
        this.#log = opts.log;
        this.#session = new YamuxSession(opts.ws);
        this.#streaming = opts.streaming ?? false;
        this.#allowedOrigins = opts.allowedOrigins ?? [];
    }
    async serve() {
        while (true) {
            const stream = await this.#session.accept();
            if (stream === null)
                break;
            void this.#handleStream(stream).catch((err) => {
                this.#log(`yamux stream ${stream.id} error: ${errMsg(err)}`);
            });
        }
    }
    close() {
        this.#session.close();
    }
    // ----- Stream dispatch -----
    async #handleStream(stream) {
        const typeBuf = await stream.readExact(1);
        const streamType = typeBuf[0];
        if (streamType === STREAM_TYPE_REQUEST) {
            await this.#handleHttpStream(stream);
        }
        else if (streamType === STREAM_TYPE_CONNECT) {
            await this.#handleConnectStream(stream);
        }
        else {
            this.#log(`yamux stream ${stream.id}: unknown type 0x${streamType.toString(16)}`);
            stream.close();
        }
    }
    // ----- Shared: read length-prefixed JSON header from stream -----
    async #readJsonHeader(stream) {
        const lenBuf = await stream.readExact(4);
        const headerLen = lenBuf.readUInt32BE(0);
        if (headerLen > MAX_YAMUX_HEADER_BYTES) {
            throw new Error(`header too large: ${headerLen} bytes (max ${MAX_YAMUX_HEADER_BYTES})`);
        }
        const headerBuf = await stream.readExact(headerLen);
        return JSON.parse(headerBuf.toString());
    }
    // ----- HTTP request/response -----
    async #handleHttpStream(stream) {
        try {
            const header = await this.#readJsonHeader(stream);
            let reqBody;
            if (header.bodyLen > 0) {
                reqBody = await stream.readExact(header.bodyLen);
            }
            // Pick the origin to fetch. New relays send `origin` per request; old
            // ones don't, in which case we fall back to the tunnel's single Target.
            const origin = header.origin ?? this.#target;
            // Allowlist gate: defense in depth. The relay also enforces this — but
            // a compromised or buggy relay must not be able to drive us to fetch an
            // origin the user didn't opt into.
            if (this.#allowedOrigins.length > 0 && !matchesAny(this.#allowedOrigins, origin)) {
                throw new Error(`origin not in allowlist: ${origin}`);
            }
            // DNS resolve-and-pin: rebinding defense. resolveLoopbackOrigin does
            // ONE DNS lookup, asserts loopback, and gives us back a URL with the
            // resolved IP literal so fetch() doesn't re-resolve. The Host: header
            // is restored to the original hostname so virtual-host routing
            // (Rails, etc.) on the upstream still works.
            const resolved = await resolveLoopbackOrigin(origin);
            const url = resolved.ipUrl + header.url;
            const fetchHeaders = wireHeadersToHeaders(header.headers);
            // Set Host explicitly even when it's already in headers — the
            // resolved IP URL has the wrong authority for Host inference.
            fetchHeaders.set('Host', `${resolved.hostname}:${resolved.port}`);
            const resp = await fetch(url, {
                method: header.method,
                headers: fetchHeaders,
                body: reqBody,
                redirect: 'manual',
            });
            const respHeaders = headersToWireHeaders(resp.headers);
            stripTransferHeaders(respHeaders);
            if (this.#streaming) {
                // Send header immediately, then stream body bytes until FIN.
                await stream.write(streamingResponseFrame(resp.status, respHeaders));
                if (resp.body) {
                    const reader = resp.body.getReader();
                    try {
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done)
                                break;
                            await stream.write(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
                        }
                    }
                    finally {
                        reader.releaseLock();
                    }
                }
            }
            else {
                const respBody = await resp.arrayBuffer();
                if (respBody.byteLength > MAX_RESPONSE_BODY_BYTES) {
                    throw new Error(`response body too large: ${respBody.byteLength} bytes (max ${MAX_RESPONSE_BODY_BYTES})`);
                }
                await stream.write(bufferedResponseFrame(resp.status, respHeaders, Buffer.from(respBody)));
            }
        }
        catch (err) {
            await this.#writeHttpError(stream, err);
            throw err;
        }
        finally {
            stream.close();
        }
    }
    // ----- CONNECT (TCP pipe) -----
    async #handleConnectStream(stream) {
        const { host } = await this.#readJsonHeader(stream);
        this.#log(`yamux stream ${stream.id}: CONNECT ${host}`);
        const { hostname, port } = parseHostPort(host);
        const socket = net.connect({ host: hostname, port });
        try {
            await new Promise((resolve, reject) => {
                socket.once('connect', resolve);
                socket.once('error', reject);
            });
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.#log(`yamux stream ${stream.id}: connect error: ${msg}`);
            const errBuf = Buffer.from(msg);
            const resp = Buffer.allocUnsafe(1 + errBuf.length);
            resp[0] = CONNECT_STATUS_ERR;
            errBuf.copy(resp, 1);
            await stream.write(resp).catch(() => undefined);
            stream.close();
            return;
        }
        // Write success byte.
        await stream.write(Buffer.from([CONNECT_STATUS_OK]));
        // Pump socket -> yamux stream with backpressure.
        const socketDone = new Promise((resolve) => {
            socket.on('data', (chunk) => {
                socket.pause();
                stream
                    .write(chunk)
                    .then(() => {
                    socket.resume();
                })
                    .catch(() => {
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
        // Pump yamux stream -> socket (read loop).
        const yamuxDone = (async () => {
            try {
                while (true) {
                    const chunk = await stream.read();
                    if (chunk.length === 0) {
                        socket.end();
                        break;
                    }
                    socket.write(chunk);
                }
            }
            catch {
                socket.destroy();
            }
        })();
        await Promise.all([socketDone, yamuxDone]);
    }
    // Write a synthetic 502 so the relay reads a valid framed response instead of EOF.
    // Mirrors the error-response path in #handleConnectStream.
    async #writeHttpError(stream, err) {
        const body = Buffer.from(errMsg(err));
        await stream.write(bufferedResponseFrame(502, {}, body)).catch(() => undefined);
    }
}
function errMsg(err) {
    return err instanceof Error ? err.message : String(err);
}
/** Build a length-prefixed JSON frame: [4-byte hdr len][hdr JSON][optional body]. */
export function frameJson(hdrJson, body) {
    const lenPrefix = Buffer.allocUnsafe(4);
    lenPrefix.writeUInt32BE(hdrJson.length, 0);
    return body ? Buffer.concat([lenPrefix, hdrJson, body]) : Buffer.concat([lenPrefix, hdrJson]);
}
/** Streaming response frame: header only, body follows as raw chunks until FIN. */
export function streamingResponseFrame(status, headers) {
    return frameJson(Buffer.from(JSON.stringify({ status, headers })));
}
/** Buffered response frame: header + full body in one write. */
export function bufferedResponseFrame(status, headers, body) {
    return frameJson(Buffer.from(JSON.stringify({ status, headers, bodyLen: body.length })), body);
}
