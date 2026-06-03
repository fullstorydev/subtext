import * as http from 'node:http';
import * as https from 'node:https';
import * as net from 'node:net';

import {matchesAny, type OriginPattern} from './allowlist.js';
import {resolveLoopbackOrigin} from './loopback.js';
import type {WireHeaders} from './types.js';
import {MAX_RESPONSE_BODY_BYTES} from './types.js';
import type {TunnelTransport, TransportOptions} from './transport.js';
import {
  wireHeadersToHeaders,
  incomingHeadersToWireHeaders,
  stripTransferHeaders,
  nodeRequest,
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
  readonly #log: (msg: string) => void;
  readonly #session: YamuxSession;
  readonly #streaming: boolean;
  readonly #allowedOrigins: OriginPattern[];

  constructor(opts: TransportOptions) {
    this.#log = opts.log;
    this.#session = new YamuxSession(opts.ws, {
      onActivity: opts.onActivity,
      pingIntervalMs: opts.pingIntervalMs,
    });
    this.#streaming = opts.streaming ?? false;
    this.#allowedOrigins = opts.allowedOrigins ?? [];
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
    // Set to true once #pumpWebSocket writes the response frame. If the pump
    // then throws during bidirectional copy, the outer catch must not attempt
    // to write a second response (502) onto a stream that already carried a
    // 101 — the relay cannot parse two consecutive response frames.
    let headersSent = false;
    try {
      const header = await this.#readJsonHeader<{
        method: string;
        url: string;
        headers: WireHeaders;
        bodyLen: number;
        origin: string;
      }>(stream);

      let reqBody: Buffer | undefined;
      if (header.bodyLen > 0) {
        reqBody = await stream.readExact(header.bodyLen);
      }

      // The relay is the source of truth for which origin a request belongs
      // to. A header without `origin` is a protocol violation by the relay.
      if (!header.origin) {
        throw new Error('yamux request header missing origin');
      }
      const origin = header.origin;

      // Allowlist gate: defense in depth. The relay also enforces this — but
      // a compromised or buggy relay must not be able to drive us to fetch an
      // origin the user didn't opt into.
      if (this.#allowedOrigins.length > 0 && !matchesAny(this.#allowedOrigins, origin)) {
        throw new Error(`origin not in allowlist: ${origin}`);
      }

      // DNS resolve-and-pin: rebinding defense. resolveLoopbackOrigin does
      // ONE DNS lookup, asserts loopback, and gives us back a URL with the
      // resolved IP literal so fetch() doesn't re-resolve. The Host: header
      // is restored to the original hostname so virtual-host routing on the
      // upstream still works.
      const resolved = await resolveLoopbackOrigin(origin);
      const reqHeaders = wireHeadersToHeaders(header.headers);
      // Set Host explicitly even when it's already in headers — the
      // resolved IP URL has the wrong authority for Host inference.
      reqHeaders.set('Host', `${resolved.hostname}:${resolved.port}`);

      // WebSocket upgrade: use a raw TCP pipe instead of HTTP request/response.
      // http.request cannot carry the bidirectional WebSocket conversation after
      // the 101 handshake without listening for the 'upgrade' event.
      if (reqHeaders.get('upgrade')?.toLowerCase() === 'websocket') {
        // #pumpWebSocket uses streamingResponseFrame (no bodyLen field). A
        // relay in buffered mode cannot parse that format, so we refuse early
        // and return a buffered 502 the relay can parse.
        if (!this.#streaming) {
          throw new Error('WebSocket upgrade requires streaming mode');
        }
        await this.#pumpWebSocket(stream, header, reqHeaders, resolved, () => {
          headersSent = true;
        });
        return;
      }

      const resp = await nodeRequest(
        resolved.scheme,
        resolved.resolvedIp,
        resolved.port,
        header.method,
        header.url,
        reqHeaders,
        reqBody,
      );

      const respHeaders = incomingHeadersToWireHeaders(resp.headers);
      stripTransferHeaders(respHeaders);

      if (this.#streaming) {
        // Send header immediately, then stream body bytes until FIN.
        await stream.write(streamingResponseFrame(resp.statusCode!, respHeaders));
        for await (const chunk of resp) {
          await stream.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
        }
      } else {
        const chunks: Buffer[] = [];
        let total = 0;
        for await (const chunk of resp) {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
          total += buf.length;
          if (total > MAX_RESPONSE_BODY_BYTES) {
            throw new Error(
              `response body too large: ${total} bytes (max ${MAX_RESPONSE_BODY_BYTES})`,
            );
          }
          chunks.push(buf);
        }
        await stream.write(
          bufferedResponseFrame(resp.statusCode!, respHeaders, Buffer.concat(chunks)),
        );
      }
    } catch (err) {
      if (!headersSent) {
        await this.#writeHttpError(stream, err);
      }
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

    // Resolve and pin to a loopback IP before connecting. Same IPv4-preference
    // logic as HTTP: avoids ::1 winning on dual-stack hosts when the server
    // only binds 127.0.0.1.
    let resolvedIp: string;
    try {
      ({resolvedIp} = await resolveLoopbackOrigin(`http://${hostname}:${port}`));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.#log(`yamux stream ${stream.id}: loopback resolve error: ${msg}`);
      const errBuf = Buffer.from(msg);
      const resp = Buffer.allocUnsafe(1 + errBuf.length);
      resp[0] = CONNECT_STATUS_ERR;
      errBuf.copy(resp, 1);
      await stream.write(resp).catch(() => undefined);
      stream.close();
      return;
    }

    const socket = net.connect({host: resolvedIp, port});
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

  // ----- WebSocket upgrade via HTTP stream -----

  /**
   * Handles a WebSocket upgrade request arriving via the HTTP stream type.
   * Dials a raw TCP connection to the local server, sends the HTTP upgrade
   * request, and pumps bytes bidirectionally after the 101 handshake.
   *
   * Node's http.request closes the connection when the server sends 101 unless
   * the caller listens for the 'upgrade' event — this method does exactly that
   * so that WebSocket frame traffic can flow in both directions over the yamux
   * stream, matching the behaviour of streamTypeConnect.
   */
  async #pumpWebSocket(
    stream: YamuxStream,
    header: {method: string; url: string},
    reqHeaders: Headers,
    resolved: import('./loopback.js').ResolvedOrigin,
    onHeadersSent: () => void,
  ): Promise<void> {
    const headersObj = Object.fromEntries(reqHeaders.entries());
    const baseOptions: http.RequestOptions = {
      hostname: resolved.resolvedIp,
      port: parseInt(resolved.port, 10),
      path: header.url,
      method: header.method,
      headers: headersObj,
    };

    // Use the http.request 'upgrade' event to obtain the raw socket after the
    // 101 handshake. Without this listener Node closes the connection on 101.
    const {statusCode, incomingHeaders, socket, head} = await new Promise<{
      statusCode: number;
      incomingHeaders: http.IncomingHttpHeaders;
      socket: net.Socket | null;
      head: Buffer;
    }>((resolve, reject) => {
      const req =
        resolved.scheme === 'https'
          ? https.request({...baseOptions, rejectUnauthorized: false})
          : http.request(baseOptions);

      req.on('upgrade', (res, sock, headBuf) => {
        resolve({
          statusCode: res.statusCode!,
          incomingHeaders: res.headers,
          socket: sock,
          head: headBuf,
        });
      });
      req.on('response', (res) => {
        // Non-101 response — drain and surface the status so the relay sees it.
        res.resume();
        resolve({statusCode: res.statusCode!, incomingHeaders: res.headers, socket: null, head: Buffer.alloc(0)});
      });
      req.on('error', reject);
      req.end();
    });

    // Forward the HTTP response as a streaming yamux frame.
    const wireHeaders = incomingHeadersToWireHeaders(incomingHeaders as http.IncomingHttpHeaders & Record<string, string | string[]>);
    stripTransferHeaders(wireHeaders);
    await stream.write(streamingResponseFrame(statusCode, wireHeaders));
    // Signal to the caller that a response frame is now on the wire. Any
    // subsequent throw must not attempt to write a second response frame.
    onHeadersSent();

    if (socket === null || statusCode !== 101) {
      return;
    }

    // Write any bytes the HTTP parser already buffered past the upgrade headers.
    if (head.length > 0) {
      await stream.write(Buffer.from(head));
    }

    // Bidirectional pump: relay yamux stream ↔ raw local TCP socket.
    const socketDone = new Promise<void>((done) => {
      socket.on('data', (chunk: Buffer) => {
        socket.pause();
        stream.write(chunk).then(() => socket.resume()).catch(() => {
          socket.destroy();
          done();
        });
      });
      socket.once('end', () => { stream.close(); done(); });
      socket.once('error', () => { stream.close(); done(); });
    });

    const yamuxDone = (async () => {
      try {
        while (true) {
          const chunk = await stream.read();
          if (chunk.length === 0) { socket.end(); break; }
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
