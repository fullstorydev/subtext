import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { FULLSTORY_SESSION_URL_REGEX } from "./appium-layer.mjs";

export async function loadLocalEnv(localEnvUrl = new URL(".env.local", import.meta.url)) {
  let text;
  try {
    text = await fs.readFile(localEnvUrl, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") {
      return;
    }
    throw err;
  }

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      continue;
    }
    const [, key, rawValue] = match;
    if (process.env[key] === undefined) {
      process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
    }
  }
}

export function requiredEnv(name, context = "device E2E") {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Set ${name} before running ${context}.`);
  }
  return value;
}

export function timestampSlug() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
}

export function run(
  command,
  args,
  { cwd, env = process.env, allowFailure = false, timeoutMs } = {},
) {
  console.log(`$ ${[command, ...args].join(" ")}`);
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd,
      env,
      stdio: "inherit",
    });
    const timeout =
      timeoutMs === undefined
        ? null
        : setTimeout(() => {
            proc.kill("SIGTERM");
            reject(new Error(`${command} timed out after ${timeoutMs}ms`));
          }, timeoutMs);
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (timeout) {
        clearTimeout(timeout);
      }
      if (code === 0 || allowFailure) {
        resolve(code);
        return;
      }
      reject(new Error(`${command} exited with ${code}`));
    });
  });
}

export async function waitForText(readText, regex, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const text = readText();
    if (regex.test(text)) {
      return text;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${regex}`);
}

export async function waitMs(label, ms) {
  if (ms <= 0) {
    return;
  }
  console.log(`waiting ${ms}ms for ${label}`);
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function launchWithConsole({ outDir, fsHome, deviceUdid, bundleId }) {
  await fs.mkdir(outDir, { recursive: true });
  const consolePath = path.join(outDir, "devicectl-console.log");
  const consoleFile = createWriteStream(consolePath);
  let consoleText = "";
  const proc = spawn(
    "xcrun",
    [
      "devicectl",
      "device",
      "process",
      "launch",
      "--device",
      deviceUdid,
      "--terminate-existing",
      "--console",
      bundleId,
    ],
    {
      cwd: fsHome,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  const write = (chunk) => {
    consoleText += chunk.toString();
    process.stdout.write(chunk);
    consoleFile.write(chunk);
  };
  proc.stdout.on("data", write);
  proc.stderr.on("data", write);

  const launchPattern = process.env.MOBILE_CONSOLE_LAUNCH_PATTERN
    ? new RegExp(process.env.MOBILE_CONSOLE_LAUNCH_PATTERN)
    : /Launched application/;
  await waitForText(() => consoleText, launchPattern, 30000);
  return {
    proc,
    consolePath,
    text() {
      return consoleText;
    },
    async stop() {
      proc.kill("SIGKILL");
      await new Promise((resolve) => consoleFile.end(resolve));
    },
  };
}

export async function writeSessionUrlFromConsole({ outDir, consolePath, consoleText, host }) {
  const text = consoleText || (await fs.readFile(consolePath, "utf8"));
  const directUrl = text.match(FULLSTORY_SESSION_URL_REGEX);
  const sessionUrl =
    directUrl?.[0] ??
    (() => {
      const matches = [
        ...text.matchAll(/OrgId=([^&\s]+)&UserId=([^&\s]+)&SessionId=([^&\s]+)/g),
      ];
      const match = matches.at(-1);
      if (!match) {
        throw new Error(`Could not find FullStory session URL or bundle endpoint in ${consolePath}`);
      }
      const [, foundOrg, userId, sessionId] = match;
      const appHost = host === "staging.fullstory.com" ? "app.staging.fullstory.com" : "app.fullstory.com";
      return `https://${appHost}/ui/${foundOrg}/client-session/${userId}:${sessionId}`;
    })();

  const sessionPath = path.join(outDir, "fullstory-session-url.txt");
  await fs.writeFile(sessionPath, `${sessionUrl}\n`);
  console.log(`FullStory session URL: ${sessionUrl}`);
  console.log(`wrote ${sessionPath}`);
  return sessionUrl;
}
