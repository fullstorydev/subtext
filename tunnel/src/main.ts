import process from "node:process";

import {
  McpServer,
  StdioServerTransport,
  z,
  yargs,
  hideBin,
} from "./third_party/index.js";
import { TunnelClient } from "./client.js";

const VERSION = "0.1.0";

const argv = await yargs(hideBin(process.argv))
  .option("target", {
    type: "string",
    description: "Local origin to proxy to (required via flag or tool param)",
  })
  .version(VERSION)
  .help()
  .parse();

const defaultTarget = argv.target as string | undefined;
const log = (msg: string) => console.error(`[subtext-tunnel] ${msg}`);

// Multiple tunnels can be active simultaneously, keyed by tunnelId.
const clients = new Map<string, TunnelClient>();

const server = new McpServer(
  {
    name: "subtext_tunnel",
    version: VERSION,
  },
  { capabilities: {} },
);

server.registerTool(
  "tunnel-connect",
  {
    description:
      "Connect a tunnel to the relay. Multiple tunnels can be active simultaneously " +
      "(e.g. one per target). Call live-tunnel on the subtext MCP server first to obtain the relayUrl.",
    inputSchema: z.object({
      relayUrl: z
        .string()
        .describe("WebSocket URL of the relay (from live-tunnel)"),
      connectionId: z
        .string()
        .optional()
        .describe(
          "Connection ID to bind this tunnel to. Required for connection-first flow " +
            "(pass the connection_id from open_connection). Omit for tunnel-first flow " +
            "(the server mints one and returns it in the response).",
        ),
      target: z
        .string()
        .optional()
        .describe("Local origin to proxy to (overrides --target flag)"),
    }),
  },
  async ({ relayUrl, connectionId, target }) => {
    const t = target ?? defaultTarget;
    if (!t) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                error:
                  "No target provided. Pass --target or specify target in the tool call.",
              },
              null,
              2,
            ),
          },
        ],
        isError: true,
      };
    }

    const client = new TunnelClient({
      relayUrl,
      target: t,
      connectionId,
      log,
    });
    client.connect();

    // Wait briefly for the handshake to complete
    const deadline = Date.now() + 5000;
    while (client.state !== "ready" && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
    }

    if (client.tunnelId) {
      clients.set(client.tunnelId, client);
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              state: client.state,
              tunnelId: client.tunnelId ?? null,
              connectionId: client.connectionId ?? null,
              target: t,
              relayUrl,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

server.registerTool(
  "tunnel-disconnect",
  {
    description:
      "Disconnect a specific tunnel by its tunnelId. If no tunnelId is given, disconnects all tunnels.",
    inputSchema: z.object({
      tunnelId: z
        .string()
        .optional()
        .describe(
          "The tunnelId to disconnect (from tunnel-connect response). Omit to disconnect all.",
        ),
    }),
  },
  async ({ tunnelId }) => {
    if (tunnelId) {
      const client = clients.get(tunnelId);
      if (!client) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { error: `No tunnel with id ${tunnelId}` },
                null,
                2,
              ),
            },
          ],
          isError: true,
        };
      }
      client.disconnect();
      clients.delete(tunnelId);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ disconnected: tunnelId }, null, 2),
          },
        ],
      };
    }

    // Disconnect all
    const ids = [...clients.keys()];
    for (const [id, client] of clients) {
      client.disconnect();
    }
    clients.clear();
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ disconnected: ids }, null, 2),
        },
      ],
    };
  },
);

server.registerTool(
  "tunnel-status",
  {
    description: "Returns the status of all active tunnels",
    inputSchema: z.object({}),
  },
  async () => {
    const tunnels = [...clients.entries()].map(([id, client]) => ({
      tunnelId: id,
      state: client.state,
      target: client.target,
    }));
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ tunnels, count: tunnels.length }, null, 2),
        },
      ],
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
log(
  `MCP server started${defaultTarget ? ` (target default: ${defaultTarget})` : ""}`,
);

const shutdown = () => {
  log("Shutting down");
  for (const client of clients.values()) {
    client.disconnect();
  }
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
