import fs from "node:fs/promises";
import {
  mobileCapabilities,
  mobileConnect,
  mobileDismissSystemAlert,
  mobileScreenshot,
  mobileScroll,
  mobileSource,
  mobileTapByName,
  mobileTapIfVisible,
  startFullStorySessionLogCapture,
} from "./appium-layer.mjs";
import { loadLocalEnv } from "./device-e2e-common.mjs";

await loadLocalEnv(new URL(".env.local", import.meta.url));

const expectationsPath = process.env.MOBILE_GOAL_EXPECTATIONS;
if (!expectationsPath) {
  throw new Error("Set MOBILE_GOAL_EXPECTATIONS to a goal JSON file.");
}
const outDir = process.env.MOBILE_OUT_DIR;
if (!outDir) {
  throw new Error("Set MOBILE_OUT_DIR to the output directory.");
}
const captureEveryScrollSource = process.env.MOBILE_CAPTURE_EACH_SCROLL_SOURCE !== "0";
const captureEveryScrollScreenshot = process.env.MOBILE_CAPTURE_EACH_SCROLL_SCREENSHOT !== "0";

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function captureScrollArtifact(driver, prefix, index) {
  if (captureEveryScrollScreenshot) {
    await mobileScreenshot(driver, outDir, `${prefix}-${index}.png`);
  }
  if (captureEveryScrollSource) {
    await mobileSource(driver, outDir, `${prefix}-${index}.xml`);
  }
}

async function runNavStep(driver, step) {
  switch (step.action) {
    case "tap":
      if (step.ifVisible) {
        await mobileTapIfVisible(driver, step.label);
      } else {
        await mobileTapByName(driver, step.label, { maxScrolls: step.maxScrolls ?? 5 });
      }
      break;
    case "screenshot":
      await mobileScreenshot(driver, outDir, step.filename ?? "nav-screenshot.png");
      break;
    case "source":
      await mobileSource(driver, outDir, step.filename ?? "nav-source.xml");
      break;
    case "dismissAlert":
      await mobileDismissSystemAlert(driver);
      break;
    default:
      throw new Error(`Unknown navigation action: ${step.action}`);
  }
}

async function runGoal(driver, goal) {
  const run = goal.run;
  if (!run) {
    throw new Error(`Goal ${goal.name} is missing the "run" section.`);
  }
  const slug = run.slug ?? goal.name.toLowerCase().replace(/\s+/g, "-");

  await mobileScreenshot(driver, outDir, "01-initial.png");
  await mobileSource(driver, outDir, "01-source.xml");
  await mobileDismissSystemAlert(driver);

  if (Array.isArray(run.navigation)) {
    for (const step of run.navigation) {
      await runNavStep(driver, step);
    }
  }

  if (run.targetScreen) {
    await mobileScreenshot(driver, outDir, `04-${slug}-initial.png`);
    await mobileSource(driver, outDir, `04-${slug}-source.xml`);
  }

  if (run.waitAfterOpenMs) {
    console.log(`waiting ${run.waitAfterOpenMs}ms`);
    await driver.pause(run.waitAfterOpenMs);
    await mobileScreenshot(driver, outDir, `05-${slug}-after-wait.png`);
    await mobileSource(driver, outDir, `05-${slug}-after-wait.xml`);
  }

  for (let i = 1; i <= (run.scrollDownCount ?? 0); i += 1) {
    console.log(`scrolling down ${i}`);
    await mobileScroll(driver, { fromY: 720, toY: 180 });
    await captureScrollArtifact(driver, `05-${slug}-down`, i);
  }

  for (let i = 1; i <= (run.scrollUpCount ?? 0); i += 1) {
    console.log(`scrolling up ${i}`);
    await mobileScroll(driver, { fromY: 180, toY: 720 });
    await captureScrollArtifact(driver, `06-${slug}-up`, i);
  }
}

async function main() {
  const goal = await readJson(expectationsPath);
  await fs.mkdir(outDir, { recursive: true });
  const capabilities = await mobileCapabilities();

  const logCapture = startFullStorySessionLogCapture({
    capabilities,
    outDir,
  });

  const driver = await mobileConnect({
    capabilities,
  });

  try {
    await runGoal(driver, goal);
  } finally {
    await driver.deleteSession();
  }

  await logCapture.stop();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
