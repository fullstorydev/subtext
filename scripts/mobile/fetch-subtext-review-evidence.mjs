import fs from "node:fs/promises";
import path from "node:path";
import { DEFAULT_OUT_DIR } from "./appium-layer.mjs";
import { loadLocalEnv } from "./device-e2e-common.mjs";

const localEnvPath = new URL(".env.local", import.meta.url);

function config() {
  const outDir = process.env.MOBILE_OUT_DIR ?? DEFAULT_OUT_DIR;
  const expectationsPath = process.env.MOBILE_GOAL_EXPECTATIONS;
  if (!expectationsPath) {
    throw new Error("Set MOBILE_GOAL_EXPECTATIONS to a goal JSON file.");
  }
  return {
    outDir,
    expectationsPath,
    sessionUrlPath: process.env.MOBILE_SESSION_URL_PATH ?? path.join(outDir, "fullstory-session-url.txt"),
  };
}

function apiUrlForSession(sessionUrl) {
  if (process.env.SUBTEXT_API_URL) {
    return process.env.SUBTEXT_API_URL;
  }
  if (sessionUrl.includes("app.staging.fullstory.com")) {
    return "https://api.staging.fullstory.com/mcp/subtext";
  }
  if (sessionUrl.includes("app.eu1.fullstory.com")) {
    return "https://api.eu1.fullstory.com/mcp/subtext";
  }
  return "https://api.fullstory.com/mcp/subtext";
}

function apiKey() {
  return process.env.FULLSTORY_API_KEY ?? process.env.SUBTEXT_API_KEY;
}

function localCaps() {
  return process.env.LOCAL_MCP_CAPS;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

function contentToText(content = []) {
  return content
    .map((item) => {
      if (item.type === "text") {
        return item.text ?? "";
      }
      if (item.type === "image") {
        return `[image: ${item.mimeType ?? "image/png"}, ${item.data?.length ?? 0} bytes base64]`;
      }
      return JSON.stringify(item);
    })
    .join("\n");
}

async function callMcp({ apiUrl, token, toolName, arguments: toolArguments }) {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Basic ${token}`,
  };
  const caps = localCaps();
  if (caps) {
    headers.caps = caps;
  }

  const response = await fetch(apiUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: {
        name: toolName,
        arguments: toolArguments,
      },
    }),
  });

  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`Subtext MCP ${toolName} failed: HTTP ${response.status}\n${bodyText}`);
  }

  const body = JSON.parse(bodyText);
  if (body.error) {
    throw new Error(
      `Subtext MCP ${toolName} failed: ${body.error.message ?? JSON.stringify(body.error)}`,
    );
  }

  return {
    raw: body,
    text: contentToText(body.result?.content),
  };
}

function parseClientId(reviewOpenText) {
  const match = reviewOpenText.match(/Client ID:\s*([^\n]+)/);
  if (!match) {
    throw new Error("Could not parse Client ID from review-open output");
  }
  return match[1].trim();
}

function parsePageId(reviewOpenText) {
  const match = reviewOpenText.match(/^\[\d{2}:\d{2}\]\s+Navigate To Page:.*\[page\s+([^\]\s]+)\]/m);
  if (!match) {
    throw new Error("Could not parse page id from review-open output");
  }
  return match[1].trim();
}

function parseEventTimestamps(reviewOpenText) {
  return [...reviewOpenText.matchAll(/^\s+(\d+)ms\s+(.+)$/gm)].map((match) => ({
    timestamp: Number(match[1]),
    description: match[2],
  }));
}

function parseSessionDurationMs(reviewOpenText) {
  const match = reviewOpenText.match(/^#\s+(\d+)s\s+\|/m);
  if (!match) {
    return null;
  }
  return Number(match[1]) * 1000;
}

function timelineTimestamps(startTimestamp, durationMs) {
  const offsets = [0, 10000, 25000, 40000];
  const candidates = offsets.map((offset) => startTimestamp + offset);
  if (durationMs) {
    candidates.push(Math.max(0, durationMs - 1000));
  }
  return [...new Set(candidates)]
    .filter((timestamp) => Number.isFinite(timestamp) && timestamp >= 0)
    .filter((timestamp) => !durationMs || timestamp <= durationMs)
    .sort((a, b) => a - b);
}

function chooseViewTimestamps(reviewOpenText) {
  if (process.env.MOBILE_SUBTEXT_VIEW_TIMESTAMPS) {
    return process.env.MOBILE_SUBTEXT_VIEW_TIMESTAMPS.split(",")
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value));
  }

  const events = parseEventTimestamps(reviewOpenText);
  const pagePropertyAfterCustom = events.find((event, index) => {
    const sawCustomBefore = events.slice(0, index).some((candidate) =>
      candidate.description.toLowerCase().includes("custom"),
    );
    return sawCustomBefore && event.description.toLowerCase().includes("page-properties");
  });
  const lastEvent = events.at(-1);
  const startTimestamp = pagePropertyAfterCustom?.timestamp ?? lastEvent?.timestamp ?? 0;
  const durationMs = Math.max(parseSessionDurationMs(reviewOpenText) ?? 0, lastEvent?.timestamp ?? 0);

  return timelineTimestamps(startTimestamp, durationMs);
}

async function writeEvidenceFile(name, text) {
  const { outDir } = config();
  const file = path.join(outDir, name);
  await fs.writeFile(file, text);
  console.log(`wrote ${file}`);
  return file;
}

async function main() {
  await loadLocalEnv(localEnvPath);
  const { outDir, expectationsPath, sessionUrlPath } = config();

  const token = apiKey();
  if (!token) {
    throw new Error(
      "Set FULLSTORY_API_KEY or SUBTEXT_API_KEY to call Subtext from Node.",
    );
  }

  const goal = await readJson(expectationsPath);
  const sessionUrl = (await fs.readFile(sessionUrlPath, "utf8")).trim();
  const apiUrl = apiUrlForSession(sessionUrl);

  await fs.mkdir(outDir, { recursive: true });

  const opened = await callMcp({
    apiUrl,
    token,
    toolName: "review-open",
    arguments: { session_url: sessionUrl },
  });
  await writeEvidenceFile("review-open-subtext.txt", opened.text);

  const clientId = parseClientId(opened.text);
  const pageId = parsePageId(opened.text);
  const timestamps = chooseViewTimestamps(opened.text);
  console.log(
    `review-open parsed client_id=${clientId} page_id=${pageId} timestamps=${timestamps.join(",")}`,
  );

  for (const [index, timestamp] of timestamps.entries()) {
    const viewed = await callMcp({
      apiUrl,
      token,
      toolName: "review-view",
      arguments: {
        client_id: clientId,
        page_id: pageId,
        timestamp,
        upload: true,
      },
    });
    await writeEvidenceFile(
      `review-view-subtext-${String(index + 1).padStart(2, "0")}.txt`,
      [
        `Source: Subtext MCP review-view`,
        `Goal: ${goal.name}`,
        `Client ID: ${clientId}`,
        `Page ID: ${pageId}`,
        `View timestamp: ${timestamp}ms`,
        "",
        viewed.text,
      ].join("\n"),
    );
  }

  await callMcp({
    apiUrl,
    token,
    toolName: "review-close",
    arguments: {
      client_id: clientId,
      use_case: "testing",
      was_helpful: true,
    },
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
