import process from "node:process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { McpServer, StdioServerTransport, z, yargs, hideBin, } from "./third_party/index.js";
import { TunnelClient } from "./client.js";
// Single source of truth: read version from package.json at runtime so it
// can't drift from what npm publishes. From build/src/main.js, package.json
// sits two levels up at the package root.
const pkg = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json"), "utf8"));
const VERSION = pkg.version;
const argv = await yargs(hideBin(process.argv))
    .option("target", {
    type: "string",
    description: "Local origin to proxy to (required via flag or tool param)",
})
    .version(VERSION)
    .help()
    .parse();
const defaultTarget = argv.target;
// Wrap console.error so a broken stderr (e.g. parent process died and closed
// the read side of the pipe) cannot recurse into our error handlers below.
// Without this guard the sequence stderr.write -> EPIPE -> uncaughtException
// -> log() -> stderr.write spins at 100% CPU forever. See orphan_spin.test.ts.
const log = (msg) => {
    try {
        console.error(`[subtext-tunnel] ${msg}`);
    }
    catch {
        // Logger itself failed; nothing we can do. Don't recurse.
    }
};
// Multiple tunnels can be active simultaneously, keyed by tunnelId.
const clients = new Map();
const server = new McpServer({
    name: "subtext_tunnel",
    version: VERSION,
}, { capabilities: {} });
server.registerTool("tunnel-connect", {
    description: "Connect a tunnel to the relay. Multiple tunnels can be active simultaneously " +
        "(e.g. one per target). Call live-tunnel on the subtext MCP server first to obtain the relayUrl.",
    inputSchema: z.object({
        relayUrl: z
            .string()
            .describe("WebSocket URL of the relay (from live-tunnel)"),
        connectionId: z
            .string()
            .optional()
            .describe("Connection ID to bind this tunnel to. Required for connection-first flow " +
            "(pass the connection_id from open_connection). Omit for tunnel-first flow " +
            "(the server mints one and returns it in the response)."),
        target: z
            .string()
            .optional()
            .describe("Local origin to proxy to (overrides --target flag)"),
    }),
}, async ({ relayUrl, connectionId, target }) => {
    const t = target ?? defaultTarget;
    if (!t) {
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        error: "No target provided. Pass --target or specify target in the tool call.",
                    }, null, 2),
                },
            ],
            isError: true,
        };
    }
    // Optional env-var overrides for the keepalive timing. Production
    // defaults (STALE_CONNECTION_MS=90s, YAMUX_PING_INTERVAL_MS=30s) are
    // appropriate for staging/cloud LBs. For local testing of the silent-
    // drop detection, set e.g. SUBTEXT_TUNNEL_STALE_MS=2000 and
    // SUBTEXT_TUNNEL_PING_MS=200 so freezes resolve in seconds.
    const staleMs = Number(process.env.SUBTEXT_TUNNEL_STALE_MS) || undefined;
    const pingMs = Number(process.env.SUBTEXT_TUNNEL_PING_MS) || undefined;
    const client = new TunnelClient({
        relayUrl,
        target: t,
        connectionId,
        log,
        staleTimeoutMs: staleMs,
        yamuxPingIntervalMs: pingMs,
    });
    // Surface a clear error if the initial handshake fails with a rejection.
    let needsLiveTunnel = false;
    client.once('need_live_tunnel', () => {
        needsLiveTunnel = true;
        log(`Tunnel needs a fresh live-tunnel call (resume token rejected)`);
    });
    client.connect();
    // Wait briefly for the handshake to complete
    const deadline = Date.now() + 5000;
    while (client.state !== "ready" && !needsLiveTunnel && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 100));
    }
    if (client.tunnelId) {
        const id = client.tunnelId;
        clients.set(id, client);
        // Capture id now: tunnelId is cleared by #onDisconnect() before the
        // reconnect that triggers need_live_tunnel, so reading client.tunnelId
        // at event-fire time is always undefined → stale map entry.
        client.once('need_live_tunnel', () => clients.delete(id));
    }
    if (needsLiveTunnel) {
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({ error: "resume token rejected; call live-tunnel to get a fresh relay URL" }, null, 2),
                },
            ],
            isError: true,
        };
    }
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({
                    state: client.state,
                    tunnelId: client.tunnelId ?? null,
                    connectionId: client.connectionId ?? null,
                    traceId: client.traceId ?? null,
                    target: t,
                    relayUrl,
                }, null, 2),
            },
        ],
    };
});
server.registerTool("tunnel-disconnect", {
    description: "Disconnect a specific tunnel by its tunnelId. If no tunnelId is given, disconnects all tunnels.",
    inputSchema: z.object({
        tunnelId: z
            .string()
            .optional()
            .describe("The tunnelId to disconnect (from tunnel-connect response). Omit to disconnect all."),
    }),
}, async ({ tunnelId }) => {
    if (tunnelId) {
        const client = clients.get(tunnelId);
        if (!client) {
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({ error: `No tunnel with id ${tunnelId}` }, null, 2),
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
                    type: "text",
                    text: JSON.stringify({ disconnected: tunnelId }, null, 2),
                },
            ],
        };
    }
    // Disconnect all
    const ids = [...clients.keys()];
    for (const client of clients.values()) {
        client.disconnect();
    }
    clients.clear();
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({ disconnected: ids }, null, 2),
            },
        ],
    };
});
server.registerTool("tunnel-status", {
    description: "Returns the status of all active tunnels",
    inputSchema: z.object({}),
}, async () => {
    const tunnels = [...clients.entries()].map(([id, client]) => ({
        tunnelId: id,
        state: client.state,
        target: client.target,
        traceId: client.traceId ?? null,
    }));
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({ tunnels, count: tunnels.length }, null, 2),
            },
        ],
    };
});
const transport = new StdioServerTransport();
await server.connect(transport);
log(`MCP server started${defaultTarget ? ` (target default: ${defaultTarget})` : ""}`);
const shutdown = () => {
    log("Shutting down");
    for (const client of clients.values()) {
        client.disconnect();
    }
    process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
// Last-resort handlers to keep the MCP server alive if something slips
// through. There is no process manager to restart us, so a crash means
// Claude Code loses the tunnel tools entirely. log() above is internally
// guarded so it cannot itself throw and re-enter these handlers.
process.on("unhandledRejection", (reason) => {
    log(`Unhandled rejection: ${reason instanceof Error ? reason.stack ?? reason.message : String(reason)}`);
});
process.on("uncaughtException", (err) => {
    log(`Uncaught exception: ${err.stack ?? err.message}`);
});
// Orphan-spin protection: if our parent process (the MCP host) exits, our
// stdio pipes break and any further write triggers EPIPE. Detect that and
// exit cleanly instead of pegging the CPU. Two complementary detectors:
//
//   1. EPIPE on stderr/stdout — fires the moment a write fails. Catches the
//      common case where the parent exits while we're mid-log.
//   2. Periodic PPID check — catches the case where the parent exits cleanly
//      and we don't write anything until the next tunnel-tool call. On Linux
//      orphaned processes are reparented to PID 1; on macOS to launchd (also
//      typically PID 1). If we see PPID === 1, we have no MCP host.
//
// Both paths exit(0) — this is not a crash, it's "our reason to live ended."
process.stderr.on("error", (err) => {
    if (err.code === "EPIPE")
        process.exit(0);
});
process.stdout.on("error", (err) => {
    if (err.code === "EPIPE")
        process.exit(0);
});
// Default 30s; overridable for tests. unref() so the timer alone doesn't
// keep the event loop alive.
const orphanCheckMs = Number(process.env.SUBTEXT_TUNNEL_ORPHAN_CHECK_MS) || 30_000;
const orphanTimer = setInterval(() => {
    if (process.ppid === 1)
        process.exit(0);
}, orphanCheckMs);
orphanTimer.unref();
