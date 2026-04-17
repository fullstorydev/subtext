import {WebSocket, type RawData} from './third_party/index.js';
import * as net from 'node:net';
import {gzip} from 'node:zlib';
import {promisify} from 'node:util';

const gzipAsync = promisify(gzip);

import type {
  ClientMessage,
  ConnectMessage,
  RelayMessage,
  RequestMessage,
  StreamDataMessage,
  StreamEndMessage,
  StreamPauseMessage,
  StreamResumeMessage,
} from './types.js';
import {MAX_INFLIGHT, MAX_RESPONSE_BODY_BYTES} from './types.js';
import type {TunnelTransport, TransportOptions} from './transport.js';
import {wireHeadersToHeaders, headersToWireHeaders, stripTransferHeaders, parseHostPort} from './transport.js';

/**
 * LegacyTransport handles the JSON-over-WebSocket protocol with base64-encoded
 * bodies, channel-based stream management, and pause/resume flow control.
 */
export class LegacyTransport implements TunnelTransport {
  readonly #ws: InstanceType<typeof WebSocket>;
  readonly #target: string;
  readonly #log: (msg: string) => void;
  readonly #onActivity: () => void;

  #inflight = new Map<string, AbortController>();
  #streams = new Map<string, net.Socket>();

  constructor(opts: TransportOptions & {onActivity: () => void}) {
    this.#ws = opts.ws;
    this.#target = opts.target;
    this.#log = opts.log;
    this.#onActivity = opts.onActivity;
  }

  serve(): Promise<void> {
    return new Promise<void>((resolve) => {
      const handler = (data: RawData) => {
        this.#onActivity();
        let msg: RelayMessage;
        try {
          msg = JSON.parse(data.toString());
        } catch {
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
            this.#send({type: 'pong'});
            break;
          default:
            this.#log(`Unknown message type: ${(msg as {type: string}).type}`);
        }
      };

      this.#ws.on('message', handler);
      this.#ws.once('close', () => {
        this.#ws.removeListener('message', handler);
        resolve();
      });
    });
  }

  close(): void {
    this.#abortInflight();
    this.#closeStreams();
  }

  // ----- Request handling -----

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

      stripTransferHeaders(respHeaders);

      let bodyBuf = Buffer.from(respBody);
      let encoding: 'gzip' | undefined;
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

  // ----- CONNECT stream handling -----

  #handleConnect(msg: ConnectMessage): void {
    const {streamId, host} = msg;
    this.#log(`Stream ${streamId}: connecting to ${host}`);

    const {hostname, port} = parseHostPort(host);

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

  #handleStreamPause(msg: StreamPauseMessage): void {
    const socket = this.#streams.get(msg.streamId);
    if (socket) {
      socket.pause();
    }
  }

  #handleStreamResume(msg: StreamResumeMessage): void {
    const socket = this.#streams.get(msg.streamId);
    if (socket) {
      socket.resume();
    }
  }

  // ----- Helpers -----

  #send(msg: ClientMessage): boolean {
    if (this.#ws?.readyState === WebSocket.OPEN) {
      this.#ws.send(JSON.stringify(msg));
      return true;
    }
    this.#log(`Dropped ${msg.type} message (ws state=${this.#ws?.readyState})`);
    return false;
  }

  #abortInflight(): void {
    for (const ac of this.#inflight.values()) {
      ac.abort();
    }
    this.#inflight.clear();
  }

  #closeStreams(): void {
    for (const socket of this.#streams.values()) {
      socket.end();
    }
    this.#streams.clear();
  }
}
