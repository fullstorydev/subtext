import fs from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_OUT_DIR = fileURLToPath(new URL("./tmp/appium-poc", import.meta.url));
export const MOBILE_FAST = process.env.MOBILE_FAST === "1";
export const TAP_PAUSE_MS = MOBILE_FAST ? 250 : 1000;
export const SCROLL_PAUSE_MS = MOBILE_FAST ? 250 : 800;
const LOCAL_CAPABILITIES_URL = new URL("./capabilities.local.json", import.meta.url);

function formatSimulatorLogDate(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-") + " " + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join(":");
}

function simulatorLogProcessName(capabilities) {
  return (
    process.env.MOBILE_LOG_PROCESS_NAME ??
    capabilities["appium:processName"] ??
    capabilities["appium:bundleId"]?.split(".").at(-1) ??
    "App"
  );
}

function execFileText(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { maxBuffer: 25 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        err.stdout = stdout;
        err.stderr = stderr;
        reject(err);
        return;
      }
      resolve(`${stdout}${stderr}`);
    });
  });
}

function withoutEmptyValues(caps) {
  return Object.fromEntries(
    Object.entries(caps).filter(([, value]) => value !== undefined && value !== ""),
  );
}

export function defaultIosCapabilities() {
  return withoutEmptyValues({
    platformName: "iOS",
    "appium:automationName": "XCUITest",
    "appium:deviceName": process.env.MOBILE_DEVICE_NAME ?? "iPhone",
    "appium:udid": process.env.MOBILE_UDID,
    "appium:platformVersion": process.env.MOBILE_PLATFORM_VERSION,
    "appium:bundleId": process.env.MOBILE_BUNDLE_ID,
    "appium:xcodeOrgId": process.env.MOBILE_XCODE_ORG_ID,
    "appium:xcodeSigningId": process.env.MOBILE_XCODE_SIGNING_ID ?? "Apple Development",
    "appium:updatedWDABundleId": process.env.MOBILE_WDA_BUNDLE_ID,
    "appium:useNewWDA": false,
    "appium:newCommandTimeout": 120,
    "appium:noReset": true,
    "appium:fullReset": false,
    "appium:autoLaunch": true,
    "appium:autoAcceptAlerts": process.env.MOBILE_AUTO_ACCEPT_ALERTS === "1",
    "appium:autoDismissAlerts": process.env.MOBILE_AUTO_DISMISS_ALERTS !== "0",
    "appium:showXcodeLog": true,
    "appium:wdaLaunchTimeout": 180000,
    "appium:wdaConnectionTimeout": 180000,
    "appium:wdaStartupRetries": 3,
    "appium:wdaStartupRetryInterval": 20000,
  });
}

export async function mobileCapabilities() {
  const capsPath = process.env.MOBILE_CAPABILITIES_PATH;
  const capsJson = process.env.MOBILE_CAPABILITIES_JSON;

  if (capsPath && capsJson) {
    throw new Error("Set MOBILE_CAPABILITIES_PATH or MOBILE_CAPABILITIES_JSON, not both");
  }

  if (capsPath) {
    return JSON.parse(await fs.readFile(capsPath, "utf8"));
  }

  if (capsJson) {
    return JSON.parse(capsJson);
  }

  try {
    await fs.access(LOCAL_CAPABILITIES_URL);
    return JSON.parse(await fs.readFile(LOCAL_CAPABILITIES_URL, "utf8"));
  } catch (err) {
    if (err.code !== "ENOENT") {
      throw err;
    }
  }

  return defaultIosCapabilities();
}

export const FULLSTORY_SESSION_URL_REGEX =
  /https:\/\/app(?:\.staging)?\.fullstory\.com\/ui\/[^/]+\/(?:client-)?session\/[0-9a-zA-Z%:-]+/;

export async function mobileStatus(appiumUrl = "http://127.0.0.1:4723") {
  const response = await fetch(`${appiumUrl}/status`);
  if (!response.ok) {
    throw new Error(`Appium status failed: HTTP ${response.status}`);
  }
  return response.json();
}

export async function mobileConnect({
  appiumUrl = "http://127.0.0.1:4723",
  capabilities = defaultIosCapabilities(),
} = {}) {
  const webdriverioModule = process.env.MOBILE_WEBDRIVERIO_MODULE ?? "webdriverio";
  let remote;
  try {
    ({ remote } = await import(webdriverioModule));
  } catch (err) {
    if (err.code !== "ERR_MODULE_NOT_FOUND") {
      throw err;
    }
    console.warn(`Could not load ${webdriverioModule}; using direct Appium HTTP client`);
  }
  const url = new URL(appiumUrl);
  const status = await mobileStatus(appiumUrl);
  console.log("appium status:", JSON.stringify(status.value ?? status, null, 2));

  if (!remote) {
    const driver = await directAppiumRemote({ appiumUrl, capabilities });
    console.log("session id:", driver.sessionId);
    console.log("contexts:", await driver.getContexts());
    return driver;
  }

  const driver = await remote({
    hostname: url.hostname,
    port: Number(url.port || 4723),
    path: url.pathname === "/" ? "/" : url.pathname,
    logLevel: "warn",
    connectionRetryTimeout: 600000,
    connectionRetryCount: 0,
    capabilities,
  });

  console.log("session id:", driver.sessionId);
  console.log("contexts:", await driver.getContexts());
  return driver;
}

async function directAppiumRemote({ appiumUrl, capabilities }) {
  const session = await appiumRequest(appiumUrl, "/session", {
    method: "POST",
    body: {
      capabilities: {
        alwaysMatch: capabilities,
      },
    },
  });
  const sessionId = session.sessionId;
  if (!sessionId) {
    throw new Error("Appium did not return a session id");
  }

  const elementId = (value = {}) =>
    value["element-6066-11e4-a52e-4f735466cecf"] ?? value.ELEMENT;

  const makeElement = (id) => ({
    id,
    async isExisting() {
      return Boolean(id);
    },
    async isDisplayed() {
      const displayed = await appiumRequest(appiumUrl, `/session/${sessionId}/element/${id}/displayed`);
      return Boolean(displayed);
    },
    async click() {
      await appiumRequest(appiumUrl, `/session/${sessionId}/element/${id}/click`, {
        method: "POST",
        body: {},
      });
    },
  });

  async function findElements(using, value) {
    const elements = await appiumRequest(appiumUrl, `/session/${sessionId}/elements`, {
      method: "POST",
      body: { using, value },
    });
    return elements
      .map((element) => makeElement(elementId(element)))
      .filter((element) => element.id !== null);
  }

  return {
    sessionId,
    async getContexts() {
      return appiumRequest(appiumUrl, `/session/${sessionId}/contexts`).catch(() => ["NATIVE_APP"]);
    },
    async dismissAlert() {
      await appiumRequest(appiumUrl, `/session/${sessionId}/alert/dismiss`, {
        method: "POST",
        body: {},
      });
    },
    async acceptAlert() {
      await appiumRequest(appiumUrl, `/session/${sessionId}/alert/accept`, {
        method: "POST",
        body: {},
      });
    },
    async takeScreenshot() {
      return appiumRequest(appiumUrl, `/session/${sessionId}/screenshot`);
    },
    async getPageSource() {
      return appiumRequest(appiumUrl, `/session/${sessionId}/source?format=xml`);
    },
    async execute(script, args) {
      return appiumRequest(appiumUrl, `/session/${sessionId}/execute/sync`, {
        method: "POST",
        body: {
          script,
          args: [args],
        },
      });
    },
    async pause(ms) {
      await new Promise((resolve) => setTimeout(resolve, ms));
    },
    async deleteSession() {
      await appiumRequest(appiumUrl, `/session/${sessionId}`, {
        method: "DELETE",
      });
    },
    async $(selector) {
      if (selector.startsWith("-ios predicate string:")) {
        const value = selector.slice("-ios predicate string:".length);
        const elements = await findElements("-ios predicate string", value);
        return elements[0] ?? makeElement(null);
      }
      const elements = await findElements("class name", selector);
      return elements[0] ?? makeElement(null);
    },
    async $$(selector) {
      return findElements("class name", selector);
    },
  };
}

async function appiumRequest(appiumUrl, requestPath, { method = "GET", body } = {}) {
  const response = await fetch(new URL(requestPath, appiumUrl), {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`Appium ${method} ${requestPath} failed: HTTP ${response.status}\n${text}`);
  }
  return parsed.value;
}

export async function mobileScreenshot(driver, outDir, name) {
  const pngBase64 = await driver.takeScreenshot();
  const file = path.join(outDir, name);
  await fs.writeFile(file, Buffer.from(pngBase64, "base64"));
  console.log(`wrote ${file}`);
  return file;
}

export async function mobileSource(driver, outDir, name) {
  const source = await driver.getPageSource();
  const file = path.join(outDir, name);
  await fs.writeFile(file, source);
  console.log(`wrote ${file}`);
  return file;
}

export async function mobileScroll(driver, { fromX = 195, fromY, toX = 195, toY, duration = 0.5 }) {
  await driver.execute("mobile: dragFromToForDuration", {
    duration,
    fromX,
    fromY,
    toX,
    toY,
  });
  await driver.pause(SCROLL_PAUSE_MS);
}

export async function mobileTapByName(driver, name, { maxScrolls = 0 } = {}) {
  const selector = `name == "${name}"`;

  for (let attempt = 0; attempt <= maxScrolls; attempt += 1) {
    const element = await driver.$(`-ios predicate string:${selector}`);
    if (await element.isExisting()) {
      const displayed = await element.isDisplayed().catch(() => false);
      if (displayed) {
        console.log(`tapping "${name}"`);
        await element.click();
        await driver.pause(TAP_PAUSE_MS);
        return true;
      }
    }

    if (attempt < maxScrolls) {
      await mobileScroll(driver, { fromY: 720, toY: 240 });
    }
  }

  throw new Error(`Could not find visible element named "${name}"`);
}

export async function mobileTapIfVisible(driver, name) {
  const element = await driver.$(`-ios predicate string:name == "${name}"`);
  if (!(await element.isExisting())) {
    return false;
  }

  const displayed = await element.isDisplayed().catch(() => false);
  if (!displayed) {
    return false;
  }

  console.log(`tapping "${name}"`);
  await element.click();
  await driver.pause(TAP_PAUSE_MS);
  return true;
}

export async function mobileDismissSystemAlert(driver) {
  if (typeof driver.dismissAlert === "function") {
    try {
      await driver.dismissAlert();
      await driver.pause(TAP_PAUSE_MS);
      console.log("dismissed system alert");
      return true;
    } catch {
      // No native alert is present. Fall through to visible button labels.
    }
  }

  return (
    (await mobileTapIfVisible(driver, "Don’t Allow")) ||
    (await mobileTapIfVisible(driver, "Don't Allow")) ||
    (await mobileTapIfVisible(driver, "Not Now")) ||
    (await mobileTapIfVisible(driver, "Cancel")) ||
    false
  );
}

export function startFullStorySessionLogCapture({ capabilities, outDir }) {
  const udid = capabilities["appium:udid"];
  if (!udid) {
    throw new Error("Missing appium:udid. Set MOBILE_UDID or provide it in capabilities.");
  }

  const isSimulator = capabilities["appium:isSimulator"] === true;
  const processName = simulatorLogProcessName(capabilities);
  const simulatorStart = new Date(Date.now() - 5000);
  const simulatorPredicate = `process == "${processName}"`;
  const lines = [];
  const proc = isSimulator
    ? spawn(
        "xcrun",
        [
          "simctl",
          "spawn",
          udid,
          "log",
          "stream",
          "--style",
          "compact",
          "--info",
          "--debug",
          "--predicate",
          simulatorPredicate,
        ],
        {
          stdio: ["ignore", "pipe", "pipe"],
        },
      )
    : spawn("idevicesyslog", ["-u", udid], {
        stdio: ["ignore", "pipe", "pipe"],
      });
  const closed = new Promise((resolve) => proc.once("close", resolve));

  const collect = (chunk) => {
    lines.push(chunk.toString());
  };

  proc.stdout.on("data", collect);
  proc.stderr.on("data", collect);

  return {
    async stop() {
      if (!proc.killed) {
        proc.kill("SIGTERM");
      }
      await closed;

      const logText = lines.join("");
      const logPath = path.join(outDir, "fullstory-device.log");
      let combinedLogText = logText;

      if (isSimulator) {
        const recentSimulatorLogText = await execFileText("xcrun", [
          "simctl",
          "spawn",
          udid,
          "log",
          "show",
          "--start",
          formatSimulatorLogDate(simulatorStart),
          "--style",
          "compact",
          "--info",
          "--debug",
          "--predicate",
          simulatorPredicate,
        ]).catch((err) => {
          console.warn(`Could not read simulator log history: ${err.message}`);
          return "";
        });

        combinedLogText = `${logText}\n${recentSimulatorLogText}`;
      }

      await fs.writeFile(logPath, combinedLogText);
      console.log(`wrote ${logPath}`);

      const match = combinedLogText.match(FULLSTORY_SESSION_URL_REGEX);
      if (!match) {
        console.log("FullStory session URL not found in device logs");
        return null;
      }

      const sessionUrl = match[0];
      const sessionUrlPath = path.join(outDir, "fullstory-session-url.txt");
      await fs.writeFile(sessionUrlPath, `${sessionUrl}\n`);
      console.log(`FullStory session URL: ${sessionUrl}`);
      console.log(`wrote ${sessionUrlPath}`);
      return sessionUrl;
    },
  };
}
