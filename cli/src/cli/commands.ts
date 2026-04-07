import { SubtextClient, ToolResult } from "../sdk/index.js";
import * as fs from "node:fs";
import * as path from "node:path";

function handler(fn: (argv: any) => Promise<void>): (argv: any) => void {
  return (argv) => {
    fn(argv).catch((err: Error) => {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    });
  };
}

function getClient(): SubtextClient {
  const apiKey = process.env.SECRET_SUBTEXT_API_KEY;
  if (!apiKey) {
    console.error("Error: SECRET_SUBTEXT_API_KEY is not set.");
    console.error(
      "Export your Subtext API key: export SECRET_SUBTEXT_API_KEY='your-api-key'"
    );
    process.exit(1);
  }
  return new SubtextClient({
    apiKey,
    apiUrl: process.env.SUBTEXT_API_URL,
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
}

export function registerCommands(yargs: any): void {
  yargs
    .command(
      "connect <url>",
      "Open browser, navigate to URL",
      {},
      handler(async (argv: any) => {
        const result = await getClient().connect(argv.url);
        printResult(result);
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
      {},
      handler(async (argv: any) => {
        const result = await getClient().screenshot(
          argv.connection_id,
          argv.view_id
        );
        printResult(result);
      })
    )
    .command(
      "click <connection_id> <component_id>",
      "Click a component by UID",
      {},
      handler(async (argv: any) => {
        const result = await getClient().click(
          argv.connection_id,
          argv.component_id
        );
        printResult(result);
      })
    )
    .command(
      "fill <connection_id> <component_id> <value>",
      "Fill an input field",
      {},
      handler(async (argv: any) => {
        const result = await getClient().fill(
          argv.connection_id,
          argv.component_id,
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
      {},
      handler(async (argv: any) => {
        const result = await getClient().hover(
          argv.connection_id,
          argv.component_id
        );
        printResult(result);
      })
    )
    .command(
      "keypress <connection_id> <key> [component_id]",
      "Press a key",
      {},
      handler(async (argv: any) => {
        const result = await getClient().keypress(
          argv.connection_id,
          argv.key,
          argv.component_id
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
      {},
      handler(async (argv: any) => {
        const result = await getClient().drag(
          argv.connection_id,
          argv.component_id,
          Number(argv.dx),
          Number(argv.dy)
        );
        printResult(result);
      })
    )
    .command(
      "wait <connection_id> <type> <value>",
      "Wait for condition",
      {},
      handler(async (argv: any) => {
        const result = await getClient().waitFor(
          argv.connection_id,
          argv.type,
          argv.value
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
      const apiKey = process.env.SECRET_SUBTEXT_API_KEY;
      if (!apiKey) {
        console.error("Error: SECRET_SUBTEXT_API_KEY not set");
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
    );
}
