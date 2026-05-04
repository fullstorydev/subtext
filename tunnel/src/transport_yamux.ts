import * as net from 'node:net';

import type {WireHeaders} from './types.js';
import {MAX_RESPONSE_BODY_BYTES} from './types.js';
import type {TunnelTransport, TransportOptions} from './transport.js';
import {
  wireHeadersToHeaders,
  headersToWireHeaders,
  stripTransferHeaders,
  parseHostPort,
  MAX_YAMUX_HEADER_BYTES,
} from './transport.js';
import {YamuxSession, YamuxStream} from './yamux.js';

export const STREAM_TYPE_REQUEST = 0x01;
export const STREAM_TYPE_CONNECT = 0x02;
export const CONNECT_STATUS_OK   = 0x00;
export const CONNECT_STATUS_ERR  = 0x01;

/**
 * YamuxTransport handles the binary yamux multiplexing protocol. After the
 * hello/ready handshake, the WebSocket carries raw yamux frames. The server
 * opens streams; each stream starts with a 1-byte type prefix:
 *
 *  - STREAM_TYPE_REQUEST (0x01): HTTP request/response
 *  - STREAM_TYPE_CONNECT (0x02): CONNECT (TCP pipe)
 */
export class YamuxTransport implements TunnelTransport {
  readonly #target: string;
  readonly #log: (msg: string) => void;
  readonly #session: YamuxSession;
  readonly #streaming: boolean;

  constructor(opts: TransportOptions) {
    this.#target = opts.target;
    this.#log = opts.log;
    this.#session = new YamuxSession(opts.ws, {
      onActivity: opts.onActivity,
      pingIntervalMs: opts.pingIntervalMs,
    });
    this.#streaming = opts.streaming ?? false;
  }

  async serve(): Promise<void> {
    while (true) {
      const stream = await this.#session.accept();
      if (stream === null) break;
      void this.#handleStream(stream).catch((err: unknown) => {
        this.#log(`yamux stream ${stream.id} error: ${errMsg(err)}`);
      });
    }
  }

  close(): void {
    this.#session.close();
  }

  // ----- Stream dispatch -----

  async #handleStream(stream: YamuxStream): Promise<void> {
    const typeBuf = await stream.readExact(1);
    const streamType = typeBuf[0];
    if (streamType === STREAM_TYPE_REQUEST) {
      await this.#handleHttpStream(stream);
    } else if (streamType === STREAM_TYPE_CONNECT) {
      await this.#handleConnectStream(stream);
    } else {
      this.#log(`yamux stream ${stream.id}: unknown type 0x${streamType.toString(16)}`);
      stream.close();
    }
  }

  // ----- Shared: read length-prefixed JSON header from stream -----

  async #readJsonHeader<T>(stream: YamuxStream): Promise<T> {
    const lenBuf = await stream.readExact(4);
    const headerLen = lenBuf.readUInt32BE(0);
    if (headerLen > MAX_YAMUX_HEADER_BYTES) {
      throw new Error(`header too large: ${headerLen} bytes (max ${MAX_YAMUX_HEADER_BYTES})`);
    }
    const headerBuf = await stream.readExact(headerLen);
    return JSON.parse(headerBuf.toString()) as T;
  }

  // ----- HTTP request/response -----

  async #handleHttpStream(stream: YamuxStream): Promise<void> {
    try {
      const header = await this.#readJsonHeader<{
        method: string;
        url: string;
        headers: WireHeaders;
        bodyLen: number;
      }>(stream);

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

      const respHeaders = headersToWireHeaders(resp.headers);
      stripTransferHeaders(respHeaders);

      if (this.#streaming) {
        // Send header immediately, then stream body bytes until FIN.
        await stream.write(streamingResponseFrame(resp.status, respHeaders));
        if (resp.body) {
          const reader = resp.body.getReader();
          try {
            while (true) {
              const {done, value} = await reader.read();
              if (done) break;
              await stream.write(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
            }
          } finally {
            reader.releaseLock();
          }
        }
      } else {
        const respBody = await resp.arrayBuffer();
        if (respBody.byteLength > MAX_RESPONSE_BODY_BYTES) {
          throw new Error(
            `response body too large: ${respBody.byteLength} bytes (max ${MAX_RESPONSE_BODY_BYTES})`,
          );
        }
        await stream.write(bufferedResponseFrame(resp.status, respHeaders, Buffer.from(respBody)));
      }
    } catch (err) {
      await this.#writeHttpError(stream, err);
      throw err;
    } finally {
      stream.close();
    }
  }

  // ----- CONNECT (TCP pipe) -----

  async #handleConnectStream(stream: YamuxStream): Promise<void> {
    const {host} = await this.#readJsonHeader<{host: string}>(stream);
    this.#log(`yamux stream ${stream.id}: CONNECT ${host}`);

    const {hostname, port} = parseHostPort(host);
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
      resp[0] = CONNECT_STATUS_ERR;
      errBuf.copy(resp, 1);
      await stream.write(resp).catch(() => undefined);
      stream.close();
      return;
    }

    // Write success byte.
    await stream.write(Buffer.from([CONNECT_STATUS_OK]));

    // Pump socket -> yamux stream with backpressure.
    const socketDone = new Promise<void>((resolve) => {
      socket.on('data', (chunk: Buffer) => {
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
      } catch {
        socket.destroy();
      }
    })();

    await Promise.all([socketDone, yamuxDone]);
  }

  // Write a synthetic 502 so the relay reads a valid framed response instead of EOF.
  // Mirrors the error-response path in #handleConnectStream.
  async #writeHttpError(stream: YamuxStream, err: unknown): Promise<void> {
    const body = Buffer.from(errMsg(err));
    await stream.write(bufferedResponseFrame(502, {}, body)).catch(() => undefined);
  }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Build a length-prefixed JSON frame: [4-byte hdr len][hdr JSON][optional body]. */
export function frameJson(hdrJson: Buffer, body?: Buffer): Buffer {
  const lenPrefix = Buffer.allocUnsafe(4);
  lenPrefix.writeUInt32BE(hdrJson.length, 0);
  return body ? Buffer.concat([lenPrefix, hdrJson, body]) : Buffer.concat([lenPrefix, hdrJson]);
}

/** Streaming response frame: header only, body follows as raw chunks until FIN. */
export function streamingResponseFrame(status: number, headers: WireHeaders): Buffer {
  return frameJson(Buffer.from(JSON.stringify({status, headers})));
}

/** Buffered response frame: header + full body in one write. */
export function bufferedResponseFrame(status: number, headers: WireHeaders, body: Buffer): Buffer {
  return frameJson(Buffer.from(JSON.stringify({status, headers, bodyLen: body.length})), body);
}
