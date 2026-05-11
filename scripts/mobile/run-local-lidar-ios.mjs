import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DEFAULT_OUT_DIR } from "./appium-layer.mjs";
import { loadLocalEnv, timestampSlug } from "./device-e2e-common.mjs";
import { extractSessionUrl } from "./extract-session-url.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const localEnvPath = new URL(".env.local", import.meta.url);

function env(name, fallback = "") {
  return process.env[name] ?? fallback;
}

function requireEnv(name, hint) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Set ${name}${hint ? ` (${hint})` : ""}.`);
  }
  return value;
}

function requireAnyEnv(names, hint) {
  if (names.some((name) => process.env[name])) {
    return;
  }
  throw new Error(`Set one of ${names.join(", ")}${hint ? ` (${hint})` : ""}.`);
}

function splitCommandArgs(value) {
  const args = [];
  let current = "";
  let quote = "";
  let escaped = false;
  for (const char of value.trim()) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = "";
      } else {
        current += char;
      }
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        args.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (escaped) {
    current += "\\";
  }
  if (quote) {
    throw new Error(`Unclosed quote in command args: ${value}`);
  }
  if (current) {
    args.push(current);
  }
  return args;
}

function defaultMnHome() {
  return path.resolve(here, "../../../mn");
}

function fsHome() {
  return env("FS_HOME", path.join(env("MN_HOME", defaultMnHome()), "projects/fullstory"));
}

function goSrc() {
  return path.join(fsHome(), "go/src");
}

async function isPortOpen(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

async function findFreePortGroup(startPort) {
  for (let port = startPort; port < startPort + 200; port += 10) {
    const appPort = port;
    const grpcPort = port - 1;
    const internalPort = port + 1;
    if (
      !(await isPortOpen(appPort)) &&
      !(await isPortOpen(grpcPort)) &&
      !(await isPortOpen(internalPort))
    ) {
      return { appPort, grpcPort };
    }
  }
  throw new Error(`Could not find free Lidar ports near ${startPort}`);
}

function spawnLogged(command, args, { cwd, env: childEnv, logPath }) {
  const log = createWriteStream(logPath);
  const proc = spawn(command, args, {
    cwd,
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const write = (chunk) => {
    process.stdout.write(chunk);
    log.write(chunk);
  };
  proc.stdout.on("data", write);
  proc.stderr.on("data", write);
  const closed = new Promise((resolve, reject) => {
    proc.once("error", reject);
    proc.once("close", (code, signal) => resolve({ code, signal }));
  });
  return {
    proc,
    closed,
    async stop() {
      if (proc.exitCode === null && proc.signalCode === null) {
        proc.kill("SIGTERM");
      }
      const timeout = new Promise((resolve) => {
        setTimeout(() => {
          if (proc.exitCode === null && proc.signalCode === null) {
            proc.kill("SIGKILL");
          }
          resolve();
        }, 5000);
      });
      await Promise.race([closed, timeout]);
      await closed.catch(() => {});
      await new Promise((resolve) => log.end(resolve));
    },
  };
}

async function waitForLog(logPath, regex, timeoutMs, child) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (child && (child.proc.exitCode !== null || child.proc.signalCode !== null)) {
      throw new Error(`Process exited before ${regex} appeared in ${logPath}`);
    }
    let text = "";
    try {
      text = await fs.readFile(logPath, "utf8");
    } catch (err) {
      if (err.code !== "ENOENT") {
        throw err;
      }
    }
    if (regex.test(text)) {
      return text;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${regex} in ${logPath}`);
}

async function checkLocalGoEnvironment() {
  await fs.access(goSrc()).catch(() => {
    throw new Error(`Cannot find FullStory Go source at ${goSrc()}. Set MN_HOME or FS_HOME.`);
  });
  await fs.access(path.join(goSrc(), "fs/services/lidar/main/lidar")).catch(() => {
    throw new Error(`Cannot find Lidar source under ${goSrc()}. Set FS_HOME to the FullStory checkout.`);
  });
  await runCapture("go", ["env", "GOROOT"], { cwd: goSrc() }).catch((err) => {
    throw new Error(`Go environment is not ready for Lidar builds from ${goSrc()}.\n${err.message}`);
  });
}

async function runCapture(command, args, { cwd, env: childEnv = process.env }) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const proc = spawn(command, args, {
      cwd,
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited with ${code}\n${stderr}`));
    });
  });
}

async function runInherited(command, args, { cwd, env: childEnv }) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd,
      env: childEnv,
      stdio: "inherit",
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

async function generateCaps() {
  if (process.env.LOCAL_MCP_CAPS) {
    return process.env.LOCAL_MCP_CAPS;
  }
  const orgID = process.env.LOCAL_MCP_ORG_ID ?? process.env.MOBILE_FULLSTORY_ORG;
  if (!orgID) {
    throw new Error("Set LOCAL_MCP_ORG_ID or MOBILE_FULLSTORY_ORG for local Lidar MCP auth.");
  }
  const email = requireEnv("LOCAL_MCP_EMAIL", "email for signed session caps");
  const sessionID = env("LOCAL_MCP_SESSION_ID", "local-mobile-e2e");
  const tempPath = path.join(os.tmpdir(), `subtext-mobile-caps-${process.pid}.go`);
  const source = `package main
import (
  "fmt"
  "fs/auth"
  "fs/auth/sessionpb"
)
func main() {
  details := &sessionpb.AppSessionDetails{
    SessionId: ${JSON.stringify(sessionID)},
    Authz: &sessionpb.AuthorizationContext{Entity: sessionpb.OrgAuthzContextEntity(${JSON.stringify(orgID)}, "")},
    AuthnMethod: sessionpb.MakeTokenAuthnMethod(sessionpb.TokenType_INVALID_TOKEN_TYPE),
  }
  ss, err := auth.FakeAppSignedSession(${JSON.stringify(email)}, details)
  if err != nil { panic(err) }
  s, err := ss.String()
  if err != nil { panic(err) }
  fmt.Print(s)
}
`;
  await fs.writeFile(tempPath, source);
  try {
    return (await runCapture("go", ["run", tempPath], { cwd: goSrc() })).trim();
  } finally {
    await fs.rm(tempPath, { force: true });
  }
}

async function ensureAppium(outDir) {
  const appiumURL = env("LIDAR_IOS_APPIUM_URL", env("MOBILE_APPIUM_URL", "http://127.0.0.1:4723"));
  const port = Number(new URL(appiumURL).port || 4723);
  if (await isPortOpen(port)) {
    return { appiumURL, stop: async () => {} };
  }

  const command = env("MOBILE_APPIUM_COMMAND", "pnpm");
  const args = splitCommandArgs(
    env("MOBILE_APPIUM_ARGS", "exec appium --address 127.0.0.1 --port 4723 --base-path /"),
  );
  const logPath = path.join(outDir, "appium.log");
  console.log(`starting Appium: ${command} ${args.join(" ")}`);
  const child = spawnLogged(command, args, { cwd: fsHome(), env: process.env, logPath });
  await waitForLog(
    logPath,
    /Appium REST http interface listener started|Appium server started/i,
    30000,
    child,
  );
  return { appiumURL, stop: child.stop };
}

async function appiumHttp(appiumURL, requestPath, { method = "GET", body } = {}) {
  const response = await fetch(new URL(requestPath, appiumURL), {
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

async function terminateApp(appiumURL) {
  const bundleId = process.env.MOBILE_BUNDLE_ID;
  const udid = process.env.MOBILE_UDID;
  if (!bundleId || !udid) {
    return;
  }
  let sessionId;
  try {
    const session = await appiumHttp(appiumURL, "/session", {
      method: "POST",
      body: {
        capabilities: {
          alwaysMatch: {
            platformName: "iOS",
            "appium:automationName": "XCUITest",
            "appium:udid": udid,
            "appium:bundleId": bundleId,
            "appium:autoLaunch": false,
            "appium:noReset": true,
          },
        },
      },
    });
    sessionId = session.sessionId;
    await appiumHttp(appiumURL, `/session/${sessionId}/execute/sync`, {
      method: "POST",
      body: { script: "mobile: terminateApp", args: [{ bundleId }] },
    });
    console.log(`terminated ${bundleId}`);
  } catch (err) {
    console.warn(`could not terminate ${bundleId}: ${err.message}`);
  } finally {
    if (sessionId) {
      await appiumHttp(appiumURL, `/session/${sessionId}`, { method: "DELETE" }).catch(() => {});
    }
  }
}

async function buildLidar(binaryPath) {
  if (process.env.MOBILE_LIDAR_BUILD === "0") {
    return;
  }
  console.log(`building Lidar: ${binaryPath}`);
  await runInherited("go", ["build", "-o", binaryPath, "fs/services/lidar/main/lidar"], {
    cwd: goSrc(),
    env: process.env,
  });
}

async function startLidar(outDir, appiumURL) {
  if (process.env.MOBILE_LIDAR_START === "0") {
    const existingURL = requireEnv("LIDAR_IOS_MCP_URL", "existing local Lidar MCP URL");
    return { mcpURL: existingURL, stop: async () => {} };
  }

  const binaryPath = env("MOBILE_LIDAR_BIN", path.join(outDir, "lidar-mobile-live"));
  await buildLidar(binaryPath);
  const startPort = Number(env("MOBILE_LIDAR_PORT", "11731"));
  const { appPort, grpcPort } = await findFreePortGroup(startPort);
  const logPath = path.join(outDir, "lidar.log");
  const childEnv = {
    ...process.env,
    LIDAR_IOS_APPIUM_URL: appiumURL,
    LIDAR_IOS_BUNDLE_ID: process.env.MOBILE_BUNDLE_ID,
    LIDAR_IOS_UDID: process.env.MOBILE_UDID ?? "",
    LIDAR_IOS_SIMULATOR: process.env.MOBILE_DEVICE_NAME ?? "",
  };
  const args = ["-port", String(appPort), "-grpcport", String(grpcPort)];
  console.log(`starting Lidar: ${binaryPath} ${args.join(" ")}`);
  const child = spawnLogged(binaryPath, args, { cwd: fsHome(), env: childEnv, logPath });
  await waitForLog(logPath, new RegExp(`listening on 127\\.0\\.0\\.1:${appPort}`), 60000, child);
  return { mcpURL: `http://127.0.0.1:${appPort}/mcp/subtext`, stop: child.stop };
}

async function main() {
  await loadLocalEnv(localEnvPath);
  requireAnyEnv(["FULLSTORY_API_KEY", "SUBTEXT_API_KEY"], "MCP Basic auth");
  requireEnv("MOBILE_BUNDLE_ID", "installed app bundle ID");
  requireEnv("MOBILE_UDID", "physical device UDID");
  requireEnv("MOBILE_GOAL_EXPECTATIONS", "path to goal JSON file");

  const outDir = env(
    "MOBILE_OUT_DIR",
    path.join(DEFAULT_OUT_DIR, `local-lidar-ios-${timestampSlug()}`),
  );
  await fs.mkdir(outDir, { recursive: true });
  console.log(`output: ${outDir}`);

  if (process.env.MOBILE_LIDAR_START !== "0" || !process.env.LOCAL_MCP_CAPS) {
    await checkLocalGoEnvironment();
  }

  const appium = await ensureAppium(outDir);
  await terminateApp(appium.appiumURL);
  const lidar = await startLidar(outDir, appium.appiumURL);
  const caps = await generateCaps();
  const childEnv = {
    ...process.env,
    LOCAL_MCP_CAPS: caps,
    LIDAR_IOS_MCP_URL: lidar.mcpURL,
    MOBILE_OUT_DIR: outDir,
  };

  try {
    await runInherited("node", [path.join(here, "run-lidar-live-ios.mjs")], {
      cwd: path.resolve(here, "../.."),
      env: childEnv,
    });
  } finally {
    await lidar.stop();
    try {
      await extractSessionUrl({ outDir });
    } catch (err) {
      console.warn(`could not extract FullStory session URL: ${err.message}`);
    }
    await appium.stop();
  }

  const lastRunPath = path.join(here, "tmp", ".last-run-dir");
  await fs.mkdir(path.dirname(lastRunPath), { recursive: true });
  await fs.writeFile(lastRunPath, outDir);
  console.log(`wrote ${lastRunPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
