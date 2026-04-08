/**
 * Tunnel proxy — bridges a WebSocket relay to a local HTTP server.
 *
 * The hosted browser can't reach localhost directly. This proxy:
 * 1. Connects to a relay WebSocket
 * 2. Receives HTTP requests forwarded from the hosted browser
 * 3. Fetches them from the local target server
 * 4. Sends responses back through the relay
 *
 * Uses native WebSocket on Node 22+, falls back to `ws` package on Node 20.
 */

export interface TunnelProxyOptions {
  /** WebSocket URL returned by `live-tunnel` MCP tool. */
  relayUrl: string;
  /** Local target origin, e.g. "http://localhost:3000". */
  target: string;
  /** Optional connection ID for connection-first flow. */
  connectionId?: string;
  /** Called when the relay sends `ready` with tunnel info. */
  onReady?: (info: { tunnelId: string; connectionId: string }) => void;
  /** Called on WebSocket or proxy errors. */
  onError?: (err: Error) => void;
  /** Called when the WebSocket closes. */
  onClose?: () => void;
}

export type TunnelProxyState = "connecting" | "connected" | "ready" | "closed";

export interface TunnelProxy {
  close(): void;
  readonly state: TunnelProxyState;
  readonly connectionId: string | null;
}

/** Wire protocol message types — client to relay. */
interface HelloMessage {
  type: "hello";
  target: string;
  connectionId?: string;
}

interface ResponseMessage {
  type: "response";
  requestId: string;
  status: number;
  headers: Record<string, string[]>;
  body: string | null;
}

interface ErrorMessage {
  type: "error";
  requestId: string;
  message: string;
}

interface PongMessage {
  type: "pong";
}

type OutgoingMessage = HelloMessage | ResponseMessage | ErrorMessage | PongMessage;

/** Wire protocol message types — relay to client. */
interface ReadyMessage {
  type: "ready";
  tunnelId: string;
  connectionId: string;
}

interface RequestMessage {
  type: "request";
  requestId: string;
  method: string;
  url: string;
  headers: Record<string, string[]>;
  body: string | null;
}

interface PingMessage {
  type: "ping";
}

type IncomingMessage = ReadyMessage | RequestMessage | PingMessage;

/**
 * Start a tunnel proxy that bridges a WebSocket relay to a local HTTP server.
 *
 * The proxy runs until `close()` is called or the WebSocket drops.
 */
// Use native WebSocket (Node 22+) or fall back to ws package (Node 20)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const WS: typeof WebSocket = globalThis.WebSocket ?? require("ws");

export function startTunnelProxy(options: TunnelProxyOptions): TunnelProxy {
  const { relayUrl, target, onReady, onError, onClose } = options;

  let state: TunnelProxyState = "connecting";
  let connectionId: string | null = null;

  // Normalize target — strip trailing slash
  const normalizedTarget = target.replace(/\/+$/, "");

  const ws = new WS(relayUrl);

  function send(msg: OutgoingMessage): void {
    if (ws.readyState === WS.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  ws.addEventListener("open", () => {
    state = "connected";
    const hello: HelloMessage = {
      type: "hello",
      target: normalizedTarget,
    };
    if (options.connectionId) {
      hello.connectionId = options.connectionId;
    }
    send(hello);
  });

  ws.addEventListener("message", (event: MessageEvent) => {
    let msg: IncomingMessage;
    try {
      const data = typeof event.data === "string" ? event.data : String(event.data);
      msg = JSON.parse(data) as IncomingMessage;
    } catch {
      onError?.(new Error("Failed to parse relay message"));
      return;
    }

    switch (msg.type) {
      case "ready":
        state = "ready";
        connectionId = msg.connectionId;
        onReady?.({ tunnelId: msg.tunnelId, connectionId: msg.connectionId });
        break;

      case "request":
        handleRequest(msg, normalizedTarget, send).catch((err) => {
          onError?.(err instanceof Error ? err : new Error(String(err)));
        });
        break;

      case "ping":
        send({ type: "pong" });
        break;
    }
  });

  ws.addEventListener("error", (event: Event) => {
    const errorEvent = event as ErrorEvent;
    const err = new Error(errorEvent.message ?? "WebSocket error");
    onError?.(err);
  });

  ws.addEventListener("close", () => {
    state = "closed";
    onClose?.();
  });

  const proxy: TunnelProxy = {
    close() {
      state = "closed";
      ws.close();
    },
    get state() {
      return state;
    },
    get connectionId() {
      return connectionId;
    },
  };

  return proxy;
}

/**
 * Proxy an HTTP request from the relay to the local target server.
 */
async function handleRequest(
  msg: RequestMessage,
  target: string,
  send: (msg: OutgoingMessage) => void,
): Promise<void> {
  const url = target + msg.url;
  const headers = new Headers();
  for (const [key, vals] of Object.entries(msg.headers ?? {})) {
    for (const val of vals) {
      headers.append(key, val);
    }
  }

  // Don't send body for GET/HEAD
  const hasBody = msg.method !== "GET" && msg.method !== "HEAD" && msg.body != null;
  const body = hasBody ? Buffer.from(msg.body!, "base64") : undefined;

  try {
    const resp = await fetch(url, {
      method: msg.method,
      headers,
      body,
      redirect: "manual",
    });

    const respBody = await resp.arrayBuffer();

    // Collect response headers as Record<string, string[]>
    const respHeaders: Record<string, string[]> = {};
    resp.headers.forEach((val, key) => {
      if (!respHeaders[key]) respHeaders[key] = [];
      respHeaders[key].push(val);
    });

    // Remove headers that won't be valid after re-encoding
    delete respHeaders["content-encoding"];
    delete respHeaders["content-length"];

    send({
      type: "response",
      requestId: msg.requestId,
      status: resp.status,
      headers: respHeaders,
      body: respBody.byteLength > 0 ? Buffer.from(respBody).toString("base64") : null,
    });
  } catch (err) {
    send({
      type: "error",
      requestId: msg.requestId,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
