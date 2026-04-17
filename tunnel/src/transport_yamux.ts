import * as net from 'node:net';

import type {WireHeaders} from './types.js';
import type {TunnelTransport, TransportOptions} from './transport.js';
import {wireHeadersToHeaders, headersToWireHeaders} from './transport.js';
import {YamuxSession, YamuxStream} from './yamux.js';

/**
 * YamuxTransport handles the binary yamux multiplexing protocol. After the
 * hello/ready handshake, the WebSocket carries raw yamux frames. The server
 * opens streams; each stream starts with a 1-byte type prefix:
 *
 *  - 0x01: HTTP request/response
 *  - 0x02: CONNECT (TCP pipe)
 */
export class YamuxTransport implements TunnelTransport {
  readonly #target: string;
  readonly #log: (msg: string) => void;
  readonly #session: YamuxSession;

  constructor(opts: TransportOptions) {
    this.#target = opts.target;
    this.#log = opts.log;
    this.#session = new YamuxSession(opts.ws);
  }

  async serve(): Promise<void> {
    while (true) {
      const stream = await this.#session.accept();
      if (stream === null) break; // session closed
      void this.#handleStream(stream).catch((err: unknown) => {
        this.#log(`yamux stream ${stream.id} error: ${err instanceof Error ? err.message : String(err)}`);
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
    if (streamType === 0x01) {
      await this.#handleHttpStream(stream);
    } else if (streamType === 0x02) {
      await this.#handleConnectStream(stream);
    } else {
      this.#log(`yamux stream ${stream.id}: unknown type 0x${streamType.toString(16)}`);
      stream.close();
    }
  }

  // ----- HTTP request/response -----

  async #handleHttpStream(stream: YamuxStream): Promise<void> {
    // Read [4-byte JSON len][JSON header][raw body]
    const lenBuf = await stream.readExact(4);
    const headerLen = lenBuf.readUInt32BE(0);
    const headerBuf = await stream.readExact(headerLen);
    const header = JSON.parse(headerBuf.toString()) as {
      method: string;
      url: string;
      headers: WireHeaders;
      bodyLen: number;
    };

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

    const respBodyBuf = Buffer.from(await resp.arrayBuffer());
    const respHeaders = headersToWireHeaders(resp.headers);
    delete respHeaders['content-encoding'];
    delete respHeaders['content-length'];

    // Write [4-byte JSON len][JSON header][raw body]
    const respHdrJson = Buffer.from(
      JSON.stringify({status: resp.status, headers: respHeaders, bodyLen: respBodyBuf.length}),
    );
    const lenPrefix = Buffer.allocUnsafe(4);
    lenPrefix.writeUInt32BE(respHdrJson.length, 0);
    await stream.write(Buffer.concat([lenPrefix, respHdrJson, respBodyBuf]));
    stream.close();
  }

  // ----- CONNECT (TCP pipe) -----

  async #handleConnectStream(stream: YamuxStream): Promise<void> {
    // Read [4-byte JSON len][JSON header: {host}]
    const lenBuf = await stream.readExact(4);
    const headerLen = lenBuf.readUInt32BE(0);
    const headerBuf = await stream.readExact(headerLen);
    const {host} = JSON.parse(headerBuf.toString()) as {host: string};

    this.#log(`yamux stream ${stream.id}: CONNECT ${host}`);

    const lastColon = host.lastIndexOf(':');
    const [hostname, portStr] =
      lastColon >= 0
        ? [host.slice(0, lastColon), host.slice(lastColon + 1)]
        : [host, '80'];
    const port = parseInt(portStr, 10);

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
      resp[0] = 0x01;
      errBuf.copy(resp, 1);
      await stream.write(resp).catch(() => undefined);
      stream.close();
      return;
    }

    // Write success byte.
    await stream.write(Buffer.from([0x00]));

    // Pump socket -> yamux stream (event-driven).
    const socketDone = new Promise<void>((resolve) => {
      socket.on('data', (chunk: Buffer) => {
        stream.write(chunk).catch(() => {
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
            // FIN from server: half-close the TCP socket.
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
}
