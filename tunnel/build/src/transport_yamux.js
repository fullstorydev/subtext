import * as net from 'node:net';
import { MAX_RESPONSE_BODY_BYTES } from './types.js';
import { wireHeadersToHeaders, headersToWireHeaders, stripTransferHeaders, parseHostPort, MAX_YAMUX_HEADER_BYTES, } from './transport.js';
import { YamuxSession } from './yamux.js';
/**
 * YamuxTransport handles the binary yamux multiplexing protocol. After the
 * hello/ready handshake, the WebSocket carries raw yamux frames. The server
 * opens streams; each stream starts with a 1-byte type prefix:
 *
 *  - 0x01: HTTP request/response
 *  - 0x02: CONNECT (TCP pipe)
 */
export class YamuxTransport {
    #target;
    #log;
    #session;
    #streaming;
    constructor(opts) {
        this.#target = opts.target;
        this.#log = opts.log;
        this.#session = new YamuxSession(opts.ws);
        this.#streaming = opts.streaming ?? false;
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
        if (streamType === 0x01) {
            await this.#handleHttpStream(stream);
        }
        else if (streamType === 0x02) {
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
            const url = this.#target + header.url;
            const fetchHeaders = wireHeadersToHeaders(header.headers);
            const resp = await fetch(url, {
                method: header.method,
                headers: fetchHeaders,
                body: reqBody,
                redirect: 'manual',
            });
            const respHeaders = headersToWireHeaders(resp.headers);
            stripTransferHeaders(respHeaders);
            if (this.#streaming) {
                // Send header immediately (no bodyLen), then stream body bytes.
                // stream.close() in finally sends FIN — the relay uses that as EOF.
                const respHdrJson = Buffer.from(JSON.stringify({ status: resp.status, headers: respHeaders }));
                const lenPrefix = Buffer.allocUnsafe(4);
                lenPrefix.writeUInt32BE(respHdrJson.length, 0);
                await stream.write(Buffer.concat([lenPrefix, respHdrJson]));
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
                // Buffered path: read full body, include bodyLen in header.
                const respBody = await resp.arrayBuffer();
                if (respBody.byteLength > MAX_RESPONSE_BODY_BYTES) {
                    throw new Error(`response body too large: ${respBody.byteLength} bytes (max ${MAX_RESPONSE_BODY_BYTES})`);
                }
                const respBodyBuf = Buffer.from(respBody);
                const respHdrJson = Buffer.from(JSON.stringify({ status: resp.status, headers: respHeaders, bodyLen: respBodyBuf.length }));
                const lenPrefix = Buffer.allocUnsafe(4);
                lenPrefix.writeUInt32BE(respHdrJson.length, 0);
                await stream.write(Buffer.concat([lenPrefix, respHdrJson, respBodyBuf]));
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
            resp[0] = 0x01;
            errBuf.copy(resp, 1);
            await stream.write(resp).catch(() => undefined);
            stream.close();
            return;
        }
        // Write success byte.
        await stream.write(Buffer.from([0x00]));
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
        const bodyBuf = Buffer.from(errMsg(err));
        const hdrJson = Buffer.from(JSON.stringify({ status: 502, headers: {}, bodyLen: bodyBuf.length }));
        const lenPrefix = Buffer.allocUnsafe(4);
        lenPrefix.writeUInt32BE(hdrJson.length, 0);
        await stream.write(Buffer.concat([lenPrefix, hdrJson, bodyBuf])).catch(() => undefined);
    }
}
function errMsg(err) {
    return err instanceof Error ? err.message : String(err);
}
