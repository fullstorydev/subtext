import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DEFAULT_OUT_DIR } from "./appium-layer.mjs";
import { loadLocalEnv } from "./device-e2e-common.mjs";

await loadLocalEnv(new URL(".env.local", import.meta.url));

const outDir = process.env.MOBILE_OUT_DIR ?? DEFAULT_OUT_DIR;
const bundleId = process.env.MOBILE_BUNDLE_ID;
const orgId = process.env.LOCAL_MCP_ORG_ID ?? process.env.MOBILE_FULLSTORY_ORG;
const appHost = process.env.MOBILE_FULLSTORY_APP_HOST ?? "https://app.fullstory.com";
const appiumUrl =
  process.env.LIDAR_IOS_APPIUM_URL ?? process.env.MOBILE_APPIUM_URL ?? "http://127.0.0.1:4723";
const udid = process.env.MOBILE_UDID;
const deviceName = process.env.MOBILE_DEVICE_NAME;

async function appiumRequest(requestPath, { method = "GET", body } = {}) {
  const response = await fetch(new URL(requestPath, appiumUrl), {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Appium ${method} ${requestPath} failed: HTTP ${response.status}\n${text}`);
  }
  return text ? JSON.parse(text).value : undefined;
}

async function plistToJson(base64) {
  const tmp = path.join(os.tmpdir(), `fs-defaults-${process.pid}-${Date.now()}.plist`);
  await fs.writeFile(tmp, Buffer.from(base64, "base64"));
  try {
    return await new Promise((resolve, reject) => {
      const proc = spawn("plutil", ["-convert", "json", "-o", "-", tmp]);
      let stdout = "";
      let stderr = "";
      proc.stdout.on("data", (chunk) => (stdout += chunk.toString()));
      proc.stderr.on("data", (chunk) => (stderr += chunk.toString()));
      proc.on("error", reject);
      proc.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`plutil exit ${code}: ${stderr}`));
          return;
        }
        try {
          resolve(JSON.parse(stdout));
        } catch (err) {
          reject(err);
        }
      });
    });
  } finally {
    await fs.rm(tmp, { force: true });
  }
}

function buildSessionUrl({ host, org, userId, sessionId }) {
  const segment = userId.includes("-") ? "client-session" : "session";
  return `${host}/ui/${org}/${segment}/${userId}:${sessionId}`;
}

export async function extractSessionUrl({ outDir: outDirArg = outDir } = {}) {
  if (!bundleId) {
    throw new Error("Set MOBILE_BUNDLE_ID.");
  }
  if (!orgId) {
    throw new Error("Set LOCAL_MCP_ORG_ID or MOBILE_FULLSTORY_ORG.");
  }
  if (!udid) {
    throw new Error("Set MOBILE_UDID.");
  }

  const session = await appiumRequest("/session", {
    method: "POST",
    body: {
      capabilities: {
        alwaysMatch: {
          platformName: "iOS",
          "appium:automationName": "XCUITest",
          "appium:udid": udid,
          "appium:deviceName": deviceName,
          "appium:bundleId": bundleId,
          "appium:autoLaunch": false,
          "appium:noReset": true,
        },
      },
    },
  });
  const sessionId = session.sessionId;

  let plist;
  try {
    const remotePath = `@${bundleId}/Library/Preferences/${bundleId}.plist`;
    const base64 = await appiumRequest(`/session/${sessionId}/execute/sync`, {
      method: "POST",
      body: { script: "mobile: pullFile", args: [{ remotePath }] },
    });
    plist = await plistToJson(base64);
  } finally {
    await appiumRequest(`/session/${sessionId}`, { method: "DELETE" }).catch(() => {});
  }

  const fsSessionId = plist["FullStory.PreviousSessionId"];
  const fsUserId = plist["FullStory.PreviousUserId"];
  if (!fsSessionId || !fsUserId) {
    const fsKeys = Object.keys(plist)
      .filter((k) => k.startsWith("FullStory."))
      .join(", ");
    throw new Error(
      `FullStory session IDs not found in NSUserDefaults. FullStory.* keys present: [${fsKeys || "none"}]`,
    );
  }

  const url = buildSessionUrl({ host: appHost, org: orgId, userId: fsUserId, sessionId: fsSessionId });
  const file = path.join(outDirArg, "fullstory-session-url.txt");
  await fs.mkdir(outDirArg, { recursive: true });
  await fs.writeFile(file, `${url}\n`);
  console.log(`wrote ${file}`);
  console.log(url);
  return url;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  extractSessionUrl().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
