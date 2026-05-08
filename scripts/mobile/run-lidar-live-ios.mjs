import fs from "node:fs/promises";
import path from "node:path";
import { loadLocalEnv } from "./device-e2e-common.mjs";

const localEnvPath = new URL(".env.local", import.meta.url);

function config() {
  const outDir = process.env.MOBILE_OUT_DIR;
  if (!outDir) {
    throw new Error("Set MOBILE_OUT_DIR to the output directory for this run.");
  }
  const expectationsPath = process.env.MOBILE_GOAL_EXPECTATIONS;
  if (!expectationsPath) {
    throw new Error("Set MOBILE_GOAL_EXPECTATIONS to a goal JSON file.");
  }
  return {
    outDir,
    expectationsPath,
    mcpUrl: process.env.LIDAR_IOS_MCP_URL ?? process.env.SUBTEXT_API_URL,
    bundleId: process.env.MOBILE_BUNDLE_ID,
    udid: process.env.MOBILE_UDID,
    simulator: process.env.MOBILE_DEVICE_NAME ?? process.env.LIDAR_IOS_SIMULATOR,
  };
}

function apiKey() {
  return process.env.FULLSTORY_API_KEY ?? process.env.SUBTEXT_API_KEY;
}

function localCaps() {
  return process.env.LOCAL_MCP_CAPS;
}

async function callMcp(method, params, { token }) {
  const { mcpUrl } = config();
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Basic ${token}`,
  };
  const caps = localCaps();
  if (caps) {
    headers.caps = caps;
  }

  const response = await fetch(mcpUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      params,
    }),
  });

  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`MCP ${method} failed: HTTP ${response.status}\n${bodyText}`);
  }

  const body = JSON.parse(bodyText);
  if (body.error) {
    throw new Error(`MCP ${method} failed: ${body.error.message ?? JSON.stringify(body.error)}`);
  }
  return body.result;
}

async function callTool(name, args, options) {
  return callMcp("tools/call", { name, arguments: args }, options);
}

function textContents(result) {
  return (result.content ?? []).filter((item) => item.type === "text").map((item) => item.text ?? "");
}

function imageContents(result) {
  return (result.content ?? []).filter((item) => item.type === "image");
}

function parseConnectionId(result) {
  const text = textContents(result).join("\n");
  const match = text.match(/connection_id[:=]\s*([^\s]+)/);
  if (!match) {
    throw new Error(`Could not parse connection_id from: ${text}`);
  }
  return match[1];
}

function unquoteText(text) {
  return text.replace(/\\"/g, "\"").replace(/\\\\/g, "\\");
}

function parseFormattedTree(text) {
  const root = { id: "ios-root", role: "root", children: [] };
  let inGuide = false;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      inGuide = false;
      continue;
    }
    if (trimmed === "[Guide]") {
      inGuide = true;
      continue;
    }
    if (
      inGuide ||
      /^(connection_id|current_view|bundle_id|capture_status|url|fs_session_url|trace_id|trace_url|sightmap_upload_url):/.test(
        trimmed,
      )
    ) {
      continue;
    }
    const match = trimmed.match(/^(\S+)\s+(\S+)(?:\s+"((?:\\.|[^"])*)")?(?:\s+value="((?:\\.|[^"])*)")?/);
    if (!match || match[1] === "root") {
      continue;
    }
    root.children.push({
      id: match[1],
      role: match[2],
      text: match[3] ? unquoteText(match[3]) : "",
      value: match[4] ? unquoteText(match[4]) : "",
    });
  }
  return root;
}

function parseTree(result) {
  const candidates = textContents(result);
  for (const text of candidates) {
    try {
      return JSON.parse(text);
    } catch {
      // not JSON
    }
    const firstObject = text.indexOf("{");
    const lastObject = text.lastIndexOf("}");
    if (firstObject !== -1 && lastObject > firstObject) {
      try {
        return JSON.parse(text.slice(firstObject, lastObject + 1));
      } catch {
        // not embedded JSON
      }
    }
    const tree = parseFormattedTree(text);
    if (tree.children.length > 0) {
      return tree;
    }
  }
  throw new Error("Could not parse component tree from snapshot");
}

function walkTree(root, visit) {
  if (!root) {
    return undefined;
  }
  const result = visit(root);
  if (result) {
    return result;
  }
  for (const child of root.children ?? []) {
    const childResult = walkTree(child, visit);
    if (childResult) {
      return childResult;
    }
  }
  return undefined;
}

function componentLabel(component) {
  return [
    component.text,
    component.value,
    component.properties?.identifier,
    component.properties?.sightmap_name,
  ].filter(Boolean);
}

function findComponent(root, matcher) {
  return walkTree(root, (component) => (matcher(component) ? component : undefined));
}

function byLabel(label) {
  return (component) => componentLabel(component).includes(label);
}

function hasActiveNavigation(root, label) {
  return Boolean(findComponent(root, (c) => c.role === "navigation" && c.text === label));
}

function visibleTextLabels(root) {
  const labels = [];
  walkTree(root, (component) => {
    if (component.role === "text" && component.text) {
      labels.push(component.text);
    }
    return undefined;
  });
  return labels;
}

async function writeSnapshot(prefix, result) {
  const { outDir } = config();
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, `${prefix}.txt`), `${textContents(result).join("\n")}\n`);
  const tree = parseTree(result);
  await fs.writeFile(path.join(outDir, `${prefix}.json`), `${JSON.stringify(tree, null, 2)}\n`);

  const image = imageContents(result)[0];
  if (image?.data) {
    await fs.writeFile(path.join(outDir, `${prefix}.png.base64`), image.data);
  }
  return tree;
}

async function snapshotStep(connectionId, prefix, options) {
  const result = await callTool("live-view-snapshot", { connection_id: connectionId }, options);
  const summary = textContents(result)[0] ?? "";
  console.log(`${prefix}: ${summary}`);
  return writeSnapshot(prefix, result);
}

async function tapByLabel(connectionId, tree, label, options) {
  const component = findComponent(tree, byLabel(label));
  if (!component?.id) {
    throw new Error(`Could not find component labelled ${JSON.stringify(label)}`);
  }
  await callTool("live-act-click", { connection_id: connectionId, component_id: component.id }, options);
  console.log(`tapped ${label} (${component.id})`);
}

async function scrollUntilLabelVisible(connectionId, tree, label, options, prefix) {
  let current = tree;
  for (let i = 1; i <= 12; i += 1) {
    if (findComponent(current, byLabel(label))) {
      return current;
    }
    const scrollTarget = findComponent(current, (c) => c.role === "list") ?? current;
    const firstLabel = visibleTextLabels(current)[0] ?? "";
    const deltaY = firstLabel && label.localeCompare(firstLabel) < 0 ? 120 : -120;
    await callTool(
      "live-act-drag",
      { connection_id: connectionId, component_id: scrollTarget.id, delta_x: 0, delta_y: deltaY },
      options,
    );
    current = await snapshotStep(connectionId, `${prefix}-${i}`, options);
  }
  return current;
}

async function runNavigationSteps(connectionId, tree, steps, options, slug) {
  let current = tree;
  let stepIdx = 0;
  for (const step of steps) {
    stepIdx += 1;
    const prefix = `02-live-ios-nav-${stepIdx}`;
    switch (step.action) {
      case "tap": {
        const component = findComponent(current, byLabel(step.label));
        if (!component?.id) {
          if (step.ifVisible) {
            console.log(`nav: ${step.label} not visible, skipping`);
            break;
          }
          throw new Error(`Could not find component labelled ${JSON.stringify(step.label)}`);
        }
        await callTool("live-act-click", { connection_id: connectionId, component_id: component.id }, options);
        console.log(`tapped ${step.label} (${component.id})`);
        current = await snapshotStep(connectionId, prefix, options);
        break;
      }
      case "scrollToLabel":
        current = await scrollUntilLabelVisible(connectionId, current, step.label, options, prefix);
        break;
      default:
        throw new Error(`Unknown navigation action: ${step.action}`);
    }
  }
  return current;
}

async function assertLiveIosAvailable(options) {
  const { mcpUrl } = config();
  const result = await callMcp("tools/list", {}, options);
  const names = new Set((result.tools ?? []).map((tool) => tool.name));
  const missing = [
    "live-connect",
    "live-view-snapshot",
    "live-act-click",
    "live-act-drag",
    "live-disconnect",
  ].filter((name) => !names.has(name));
  if (missing.length > 0) {
    throw new Error(
      [
        `MCP server ${mcpUrl} does not expose the required live tools.`,
        `Missing: ${missing.join(", ")}`,
        "Use a Lidar server whose live-* tools support iOS connections.",
      ].join("\n"),
    );
  }
}

async function main() {
  await loadLocalEnv(localEnvPath);
  const { outDir, expectationsPath, mcpUrl, bundleId, udid, simulator } = config();
  const token = apiKey();
  if (!token) {
    throw new Error("Set FULLSTORY_API_KEY or SUBTEXT_API_KEY.");
  }
  if (!bundleId) {
    throw new Error("Set MOBILE_BUNDLE_ID to the installed iOS app bundle ID.");
  }
  if (!mcpUrl) {
    throw new Error("Set LIDAR_IOS_MCP_URL or SUBTEXT_API_URL to the MCP endpoint.");
  }

  const options = { token };
  const goal = JSON.parse(await fs.readFile(expectationsPath, "utf8"));
  const run = goal.run;
  if (!run) {
    throw new Error(`Goal ${goal.name} is missing the "run" section.`);
  }
  const slug = run.slug ?? goal.name.toLowerCase().replace(/\s+/g, "-");
  const targetScreen = run.targetScreen;

  await assertLiveIosAvailable(options);

  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(
    path.join(outDir, "live-ios-run-config.json"),
    `${JSON.stringify({ mcpUrl, bundleId, udid, simulator, goal: goal.name }, null, 2)}\n`,
  );

  let connected;
  try {
    connected = await callTool(
      "live-connect",
      { platform: "ios", bundle_id: bundleId, udid, simulator },
      options,
    );
  } catch (err) {
    if (String(err.message).includes("url is required")) {
      throw new Error(
        "This MCP server does not support platform='ios' yet. " +
          "Point LIDAR_IOS_MCP_URL at a Lidar build with iOS routing in live-connect.",
      );
    }
    throw err;
  }
  const connectionId = parseConnectionId(connected);
  console.log(`connected: ${connectionId}`);

  try {
    let tree = await snapshotStep(connectionId, "01-live-ios-initial", options);

    if (Array.isArray(run.navigation) && run.navigation.length > 0) {
      tree = await runNavigationSteps(connectionId, tree, run.navigation, options, slug);
    }

    if (targetScreen) {
      tree = await snapshotStep(connectionId, `03-live-ios-${slug}`, options);
      if (!hasActiveNavigation(tree, targetScreen)) {
        console.warn(`expected active screen ${targetScreen}, but it was not detected`);
      }
    }

    for (let i = 1; i <= (run.scrollDownCount ?? 0); i += 1) {
      await callTool("live-act-drag", { connection_id: connectionId, component_id: tree.id, delta_x: 0, delta_y: -500 }, options);
      tree = await snapshotStep(connectionId, `04-live-ios-down-${i}`, options);
    }
    for (let i = 1; i <= (run.scrollUpCount ?? 0); i += 1) {
      await callTool("live-act-drag", { connection_id: connectionId, component_id: tree.id, delta_x: 0, delta_y: 500 }, options);
      tree = await snapshotStep(connectionId, `05-live-ios-up-${i}`, options);
    }

    const reachedTarget = !targetScreen || hasActiveNavigation(tree, targetScreen);
    const reportName = `live-ios-${slug}-report.md`;
    await fs.writeFile(
      path.join(outDir, reportName),
      [`# ${goal.name}`, "", `Status: ${reachedTarget ? "PASS" : "WARN"}`, "", `Output: ${outDir}`, ""].join("\n"),
    );
    console.log(`status: ${reachedTarget ? "PASS" : "WARN"}`);
    console.log(`done: ${outDir}`);
  } finally {
    await callTool("live-disconnect", { connection_id: connectionId }, options).catch((err) => {
      console.warn(`live-disconnect failed: ${err.message}`);
    });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
