import { SubtextClient, ToolResult } from "../sdk/index.js";
import {
  autoUploadSightmap,
  findSightmapRoot,
  collectComponents,
  collectMemory,
} from "../sdk/sightmap.js";
import { isLocalUrl } from "../sdk/tunnel.js";
import { startTunnelProxy } from "../sdk/tunnel-proxy.js";
import { callTool } from "../sdk/transport.js";
import type { SubtextConfig } from "../sdk/transport.js";
import { SKILL_CONTENT } from "../skill-content.js";
import * as fs from "node:fs";
import * as path from "node:path";

interface ParsedComment {
  id: string;
  author: string;
  intent: string;
  text: string;
  resolved: boolean;
}

function parseComments(result: ToolResult): ParsedComment[] {
  const comments: ParsedComment[] = [];
  const text = result.content
    .filter((c) => c.type === "text" && c.text)
    .map((c) => c.text!)
    .join("\n");

  // Parse lines like: - [ID] author (TYPE): text
  // and: - [ID] [RESOLVED] author (TYPE): text
  const lines = text.split("\n").filter((l) => l.startsWith("- ["));
  for (const line of lines) {
    const match = line.match(
      /^- \[(\w+)\]\s*(\[RESOLVED\]\s*)?(\S+)\s*\((\w+)\):\s*(.*)/
    );
    if (match) {
      comments.push({
        id: match[1],
        resolved: !!match[2],
        author: match[3],
        intent: match[4],
        text: match[5].trim(),
      });
    }
  }
  return comments;
}

function handler(fn: (argv: any) => Promise<void>): (argv: any) => void {
  return (argv) => {
    fn(argv).catch((err: Error) => {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    });
  };
}

function getConfig(): SubtextConfig {
  const apiKey = process.env.SECRET_SUBTEXT_API_KEY ?? process.env.SUBTEXT_API_KEY;
  if (!apiKey) {
    console.error("Error: No API key set. Export SECRET_SUBTEXT_API_KEY or SUBTEXT_API_KEY.");
    console.error(
      "Example: export SECRET_SUBTEXT_API_KEY='your-api-key'"
    );
    process.exit(1);
  }
  return { apiKey, apiUrl: process.env.SUBTEXT_API_URL };
}

function getClient(options?: { hooks?: boolean }): SubtextClient {
  const apiKey = process.env.SECRET_SUBTEXT_API_KEY ?? process.env.SUBTEXT_API_KEY;
  if (!apiKey) {
    console.error("Error: No API key set. Export SECRET_SUBTEXT_API_KEY or SUBTEXT_API_KEY.");
    console.error(
      "Example: export SECRET_SUBTEXT_API_KEY='your-api-key'"
    );
    process.exit(1);
  }
  return new SubtextClient({
    apiKey,
    apiUrl: process.env.SUBTEXT_API_URL,
    hooks: options?.hooks,
  });
}

function printResult(result: ToolResult): void {
  const screenshotDir = process.env.SUBTEXT_SCREENSHOT_DIR;
  for (const item of result.content) {
    if (item.type === "text" && item.text) {
      console.log(item.text);
    } else if (item.type === "image" && item.data) {
      if (screenshotDir) {
        fs.mkdirSync(screenshotDir, { recursive: true });
        const ext = item.mimeType?.includes("png")
          ? "png"
          : item.mimeType?.includes("jpeg")
            ? "jpg"
            : "webp";
        const filename = `screenshot_${Date.now()}.${ext}`;
        const filepath = path.join(screenshotDir, filename);
        fs.writeFileSync(filepath, Buffer.from(item.data, "base64"));
        console.log(`Screenshot saved: ${filepath}`);
      } else {
        console.log(
          `[image: ${item.mimeType}, set SUBTEXT_SCREENSHOT_DIR to save]`
        );
      }
    }
  }
  // Exit non-zero when the MCP tool returned an error
  if (result.isError) {
    process.exit(1);
  }
}

export function registerCommands(yargs: any): void {
  yargs
    .command(
      "connect <url>",
      "Open browser, navigate to URL (auto-tunnels for localhost)",
      (yargs: any) =>
        yargs
          .option("hooks", {
            type: "boolean",
            default: true,
            description: "Run post-connect hooks (sightmap upload)",
          })
          .option("tunnel", {
            type: "boolean",
            default: true,
            description: "Auto-tunnel for localhost URLs",
          }),
      handler(async (argv: any) => {
        const url: string = argv.url;

        if (isLocalUrl(url) && argv.tunnel) {
          // Auto-tunnel flow for localhost URLs
          const config = getConfig();

          // 1. Allocate a tunnel via the live-tunnel MCP tool
          console.log(`Localhost detected — setting up tunnel for ${url}…`);
          const tunnelResult = await callTool(config, "live-tunnel", { url });
          const tunnelText = tunnelResult.content
            .filter((item) => item.type === "text" && item.text)
            .map((item) => item.text!)
            .join("\n");

          // Parse relayUrl from JSON response (may be wrapped in tags)
          const jsonMatch = tunnelText.match(/\{[^}]*"relayUrl"[^}]*\}/);
          if (!jsonMatch) {
            console.error("Error: could not parse relayUrl from live-tunnel response");
            console.error(tunnelText);
            process.exit(1);
          }
          const tunnelData = JSON.parse(jsonMatch[0].replace(/\\u0026/g, "&"));
          const relayUrl = tunnelData.relayUrl as string;

          // 2. Start the local tunnel proxy and wait for ready
          const { tunnelId, connectionId } = await new Promise<{
            tunnelId: string;
            connectionId: string;
          }>((resolve, reject) => {
            const proxy = startTunnelProxy({
              relayUrl,
              target: url,
              onReady: (info) => resolve(info),
              onError: (err) => reject(err),
              onClose: () => reject(new Error("Tunnel closed before ready")),
            });

            // Store proxy for cleanup on SIGINT
            const cleanup = () => {
              proxy.close();
              process.exit(0);
            };
            process.on("SIGINT", cleanup);
            process.on("SIGTERM", cleanup);

            // Also store the proxy on the process so the connect handler
            // can keep it alive
            (globalThis as any).__tunnelProxy = proxy;
            (globalThis as any).__tunnelCleanup = cleanup;
          });

          console.log(`Tunnel ready — tunnelId: ${tunnelId}, connectionId: ${connectionId}`);

          // 3. Open a browser view using the connectionId
          const viewResult = await callTool(config, "live-view-new", {
            connection_id: connectionId,
            url,
          });
          printResult(viewResult);

          // Keep the process alive while tunnel is running
          console.log("\nTunnel proxy running. Press Ctrl+C to disconnect.");
          await new Promise(() => {}); // Block forever
        } else {
          const result = await getClient({ hooks: argv.hooks }).connect(url);
          printResult(result);
        }
      })
    )
    .command(
      "disconnect <connection_id>",
      "Close browser session",
      {},
      handler(async (argv: any) => {
        const result = await getClient().disconnect(argv.connection_id);
        printResult(result);
      })
    )
    .command(
      "snapshot <connection_id> [view_id]",
      "Screenshot + component tree",
      {},
      handler(async (argv: any) => {
        const result = await getClient().snapshot(
          argv.connection_id,
          argv.view_id
        );
        printResult(result);
      })
    )
    .command(
      "screenshot <connection_id> [view_id]",
      "Screenshot only",
      (y: any) => y.option("output", { type: "string", alias: "o", description: "Save screenshot to this path" }),
      handler(async (argv: any) => {
        const result = await getClient().screenshot(
          argv.connection_id,
          argv.view_id
        );
        if (argv.output) {
          const img = result.content.find((c: any) => c.type === "image" && c.data);
          if (img?.data) {
            const dir = path.dirname(argv.output);
            if (dir) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(argv.output, Buffer.from(img.data, "base64"));
            console.log(`Screenshot saved: ${argv.output}`);
          }
        } else {
          printResult(result);
        }
      })
    )
    .command(
      "click <connection_id> <component_id>",
      "Click a component by UID",
      (y: any) => y.positional("component_id", { type: "string" }),
      handler(async (argv: any) => {
        const result = await getClient().click(
          argv.connection_id,
          String(argv.component_id)
        );
        printResult(result);
      })
    )
    .command(
      "fill <connection_id> <component_id> <value>",
      "Fill an input field",
      (y: any) => y.positional("component_id", { type: "string" }),
      handler(async (argv: any) => {
        const result = await getClient().fill(
          argv.connection_id,
          String(argv.component_id),
          argv.value
        );
        printResult(result);
      })
    )
    .command(
      "fill-multi <connection_id> <json>",
      "Fill multiple fields",
      {},
      handler(async (argv: any) => {
        let fields;
        try {
          fields = JSON.parse(argv.json);
        } catch {
          console.error("Error: invalid JSON for fields argument");
          process.exit(1);
        }
        const result = await getClient().raw("live-act-fill", {
          connection_id: argv.connection_id,
          fields,
        });
        printResult(result);
      })
    )
    .command(
      "hover <connection_id> <component_id>",
      "Hover over a component",
      (y: any) => y.positional("component_id", { type: "string" }),
      handler(async (argv: any) => {
        const result = await getClient().hover(
          argv.connection_id,
          String(argv.component_id)
        );
        printResult(result);
      })
    )
    .command(
      "keypress <connection_id> <key> [component_id]",
      "Press a key",
      (y: any) => y.positional("component_id", { type: "string" }),
      handler(async (argv: any) => {
        const result = await getClient().keypress(
          argv.connection_id,
          argv.key,
          argv.component_id ? String(argv.component_id) : undefined
        );
        printResult(result);
      })
    )
    .command(
      "navigate <connection_id> <url>",
      "Navigate to URL",
      {},
      handler(async (argv: any) => {
        const result = await getClient().navigate(
          argv.connection_id,
          argv.url
        );
        printResult(result);
      })
    )
    .command(
      "new-tab <connection_id> [url]",
      "Open a new tab",
      {},
      handler(async (argv: any) => {
        const result = await getClient().newTab(
          argv.connection_id,
          argv.url
        );
        printResult(result);
      })
    )
    .command(
      "close-tab <connection_id> <view_id>",
      "Close a tab",
      {},
      handler(async (argv: any) => {
        const result = await getClient().closeTab(
          argv.connection_id,
          argv.view_id
        );
        printResult(result);
      })
    )
    .command(
      "tabs <connection_id>",
      "List open tabs",
      {},
      handler(async (argv: any) => {
        const result = await getClient().tabs(argv.connection_id);
        printResult(result);
      })
    )
    .command(
      "emulate <connection_id> <device>",
      "Device emulation",
      {},
      handler(async (argv: any) => {
        const result = await getClient().emulate(
          argv.connection_id,
          argv.device
        );
        printResult(result);
      })
    )
    .command(
      "resize <connection_id> <width> <height>",
      "Resize viewport",
      {},
      handler(async (argv: any) => {
        const result = await getClient().resize(
          argv.connection_id,
          Number(argv.width),
          Number(argv.height)
        );
        printResult(result);
      })
    )
    .command(
      "drag <connection_id> <component_id> <dx> <dy>",
      "Drag component",
      (y: any) => y.positional("component_id", { type: "string" }),
      handler(async (argv: any) => {
        const result = await getClient().drag(
          argv.connection_id,
          String(argv.component_id),
          Number(argv.dx),
          Number(argv.dy)
        );
        printResult(result);
      })
    )
    .command(
      "wait <connection_id> <type> <value>",
      "Wait for condition",
      (y: any) => y.positional("value", { type: "string" }),
      handler(async (argv: any) => {
        const result = await getClient().waitFor(
          argv.connection_id,
          argv.type,
          String(argv.value)
        );
        printResult(result);
      })
    )
    .command(
      "eval <connection_id> <expression>",
      "Execute JS in page",
      {},
      handler(async (argv: any) => {
        const result = await getClient().eval(
          argv.connection_id,
          argv.expression
        );
        printResult(result);
      })
    )
    .command(
      "logs <connection_id> [level] [limit]",
      "Console messages",
      {},
      handler(async (argv: any) => {
        const result = await getClient().logs(
          argv.connection_id,
          argv.level,
          argv.limit ? Number(argv.limit) : undefined
        );
        printResult(result);
      })
    )
    .command(
      "network <connection_id> [pattern] [limit]",
      "Network requests",
      {},
      handler(async (argv: any) => {
        const result = await getClient().network(
          argv.connection_id,
          argv.pattern,
          argv.limit ? Number(argv.limit) : undefined
        );
        printResult(result);
      })
    )
    .command("tools", "List available MCP tools", {}, handler(async () => {
      const apiKey = process.env.SECRET_SUBTEXT_API_KEY ?? process.env.SUBTEXT_API_KEY;
      if (!apiKey) {
        console.error("Error: No API key set. Export SECRET_SUBTEXT_API_KEY or SUBTEXT_API_KEY.");
        process.exit(1);
      }
      const url =
        process.env.SUBTEXT_API_URL ??
        "https://api.fullstory.com/mcp/subtext";
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          params: {},
        }),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const body = (await res.json()) as any;
      if (body.error) {
        throw new Error(`MCP error ${body.error.code}: ${body.error.message}`);
      }
      const tools = body.result?.tools ?? [];
      for (const t of tools) {
        console.log(`${t.name}  —  ${t.description ?? ""}`);
      }
    }))
    .command(
      "raw <tool_name> <json>",
      "Call any MCP tool directly",
      {},
      handler(async (argv: any) => {
        let params;
        try {
          params = JSON.parse(argv.json);
        } catch {
          console.error("Error: invalid JSON argument");
          process.exit(1);
        }
        const result = await getClient().raw(argv.tool_name, params);
        printResult(result);
      })
    )
    .command(
      "embed-token",
      "Mint a short-lived playback token and print embed URL",
      (yargs: any) =>
        yargs
          .option("session-url", {
            type: "string",
            description: "FullStory session URL to embed",
          })
          .option("org", {
            type: "string",
            description: "Org ID (alternative to --session-url)",
          })
          .option("session", {
            type: "string",
            description: "Session sexp userId:sessionId (alternative to --session-url)",
          })
          .option("html", {
            type: "boolean",
            description: "Output a copy-pasteable <iframe> snippet",
          })
          .option("url-only", {
            type: "boolean",
            description: "Output only the embed URL",
          })
          .check((argv: any) => {
            if (!argv.sessionUrl && !(argv.org && argv.session)) {
              throw new Error("Provide --session-url or both --org and --session");
            }
            return true;
          }),
      handler(async (argv: any) => {
        const client = getClient();

        let orgId: string;
        let sexp: string;

        if (argv.sessionUrl) {
          const url = new URL(argv.sessionUrl);
          const parts = url.pathname.split("/").filter(Boolean);
          const sessionIdx = parts.indexOf("session");
          if (sessionIdx < 1 || sessionIdx >= parts.length - 1) {
            console.error("Error: could not parse org and session from URL");
            console.error("Expected format: .../orgId/session/userId:sessionId");
            process.exit(1);
          }
          orgId = parts[sessionIdx - 1];
          sexp = parts[sessionIdx + 1];
        } else {
          orgId = argv.org;
          sexp = argv.session;
        }

        const { accessToken } = await client.getEmbedToken();

        const mcpUrl = process.env.SUBTEXT_API_URL ?? "https://api.fullstory.com/mcp/subtext";
        const appHost = mcpUrl.replace(/api\./, "app.").replace(/\/mcp\/subtext$/, "");
        const embedUrl = `${appHost}/subtext/${orgId}/embed/${sexp}?embed=true#token=${accessToken}`;

        if (argv.urlOnly) {
          console.log(embedUrl);
        } else if (argv.html) {
          console.log(`<iframe\n  src="${embedUrl}"\n  width="100%"\n  height="600"\n  style="border: none; border-radius: 8px;"\n  allow="clipboard-write"\n  title="Subtext Session Replay"\n></iframe>`);
        } else {
          console.log(`Token: ${accessToken}`);
          console.log(`Expires: ~5 minutes\n`);
          console.log(`Embed URL:\n${embedUrl}`);
        }
      })
    )
    .command(
      "tunnel <relayUrl>",
      "Start a tunnel proxy to relay HTTP from a WebSocket to localhost",
      (yargs: any) =>
        yargs.option("target", {
          type: "string",
          alias: "t",
          default: "http://localhost:3000",
          description: "Local target URL to proxy to",
        }),
      handler(async (argv: any) => {
        const relayUrl: string = argv.relayUrl;
        const target: string = argv.target;

        console.log(`Starting tunnel proxy…`);
        console.log(`  Relay:  ${relayUrl}`);
        console.log(`  Target: ${target}`);

        const proxy = startTunnelProxy({
          relayUrl,
          target,
          onReady: (info) => {
            console.log(`\nTunnel ready!`);
            console.log(`  tunnelId:     ${info.tunnelId}`);
            console.log(`  connectionId: ${info.connectionId}`);
            console.log(`\nProxy running. Press Ctrl+C to stop.`);
          },
          onError: (err) => {
            console.error(`Tunnel error: ${err.message}`);
          },
          onClose: () => {
            console.log("Tunnel closed.");
            process.exit(0);
          },
        });

        const cleanup = () => {
          proxy.close();
          process.exit(0);
        };
        process.on("SIGINT", cleanup);
        process.on("SIGTERM", cleanup);

        // Keep the process alive
        await new Promise(() => {});
      })
    )
    .command("sightmap", "Sightmap management commands", (yargs: any) => {
      yargs
        .command(
          "upload <url>",
          "Upload sightmap to the given URL",
          {},
          handler(async (argv: any) => {
            await autoUploadSightmap(argv.url, process.cwd());
          })
        )
        .command(
          "show",
          "Show local sightmap summary",
          {},
          handler(async () => {
            const root = findSightmapRoot(process.cwd());
            if (!root) {
              console.log("No .sightmap/ directory found.");
              return;
            }
            const components = collectComponents(root);
            const memory = collectMemory(root);
            console.log(`Sightmap: ${root}`);
            console.log(`Components: ${components.length}`);
            for (const c of components) {
              console.log(`  ${c.name}  ${c.selectors.join(", ")}`);
            }
            console.log(`Memory entries: ${memory.length}`);
            if (components.length === 0) {
              console.warn("Warning: No components found. Components need a 'name' and 'selector' field.");
              console.warn("See: https://github.com/fullstorydev/subtext/tree/main/cli#sightmap");
            }
          })
        )
        .demandCommand(1, "Please specify a sightmap subcommand: upload or show")
        .strict();
    })
    .command("comments", "Comment tools", (yargs: any) => {
      yargs
        .command(
          "watch <session_id>",
          "Poll for new comments (prints as they arrive)",
          (y: any) =>
            y
              .positional("session_id", { type: "string" })
              .option("interval", {
                type: "number",
                default: 10,
                description: "Poll interval in seconds",
              })
              .option("new-only", {
                type: "boolean",
                default: false,
                description: "Skip existing comments, only show new",
              }),
          handler(async (argv: any) => {
            const config = getConfig();
            const sessionId = String(argv.session_id);
            const interval = argv.interval * 1000;
            const seen = new Set<string>();

            // Initial fetch
            const initial = await callTool(config, "comment-list", {
              session_id: sessionId,
            });
            const initialComments = parseComments(initial);

            if (!argv.newOnly) {
              for (const c of initialComments) {
                console.log(
                  `[COMMENT ${c.id}] ${c.author} (${c.intent}): ${c.text}`
                );
                seen.add(c.id);
              }
              if (initialComments.length > 0) {
                console.log(
                  `--- ${initialComments.length} existing comment(s) loaded ---`
                );
              } else {
                console.log(
                  "--- No existing comments. Watching for new... ---"
                );
              }
            } else {
              for (const c of initialComments) seen.add(c.id);
              console.log(
                `--- Watching for new comments (${initialComments.length} existing skipped) ---`
              );
            }

            // Poll loop
            const cleanup = () => {
              console.log("\n--- Comment watch stopped ---");
              process.exit(0);
            };
            process.on("SIGINT", cleanup);
            process.on("SIGTERM", cleanup);

            while (true) {
              await new Promise((r) => setTimeout(r, interval));
              try {
                const result = await callTool(config, "comment-list", {
                  session_id: sessionId,
                });
                const comments = parseComments(result);
                for (const c of comments) {
                  if (!seen.has(c.id)) {
                    console.log(
                      `[NEW] [COMMENT ${c.id}] ${c.author} (${c.intent}): ${c.text}`
                    );
                    seen.add(c.id);
                  }
                }
              } catch {
                // Silently retry on next interval
              }
            }
          })
        )
        .demandCommand(1, "Please specify a comments subcommand: watch")
        .strict();
    })
    .command(
      "get-skill",
      "Print the embedded agent skill to stdout",
      (y: any) =>
        y.option("json", {
          type: "boolean",
          description: "Wrap in JSON { skill: string }",
        }),
      (argv: any) => {
        if (argv.json) {
          process.stdout.write(
            JSON.stringify({ skill: SKILL_CONTENT }, null, 2) + "\n"
          );
        } else {
          process.stdout.write(SKILL_CONTENT + "\n");
        }
      }
    );
}
