import fs from "node:fs/promises";
import path from "node:path";
import { DEFAULT_OUT_DIR } from "./appium-layer.mjs";
import { loadLocalEnv } from "./device-e2e-common.mjs";

await loadLocalEnv(new URL(".env.local", import.meta.url));

const outDir = process.env.MOBILE_OUT_DIR ?? DEFAULT_OUT_DIR;
const expectationsPath = process.env.MOBILE_GOAL_EXPECTATIONS;
if (!expectationsPath) {
  throw new Error("Set MOBILE_GOAL_EXPECTATIONS to a goal JSON file.");
}

async function readArtifact(name) {
  return fs.readFile(path.join(outDir, name), "utf8");
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

function assertIncludes(text, value, label) {
  if (!text.includes(value)) {
    throw new Error(`Missing ${label}: ${value}`);
  }
  console.log(`ok: ${label}`);
}

function assertMatches(text, value, label) {
  const regex = new RegExp(value);
  if (!regex.test(text)) {
    throw new Error(`Missing ${label}: ${value}`);
  }
  console.log(`ok: ${label}`);
}

async function main() {
  const expectations = await readJson(expectationsPath);

  for (const file of expectations.requiredArtifacts) {
    await fs.access(path.join(outDir, file));
    console.log(`ok: artifact exists: ${file}`);
  }

  const sessionUrl = (await readArtifact("fullstory-session-url.txt")).trim();

  for (const check of expectations.deviceChecks) {
    const artifact = await readArtifact(check.artifact);
    if (check.matches) {
      assertMatches(artifact, check.matches, check.label);
    } else {
      assertIncludes(artifact, check.contains, check.label);
    }
  }

  const report = `# ${expectations.name} Goal Validation

## Local Artifact Checks

${expectations.deviceChecks.map((check) => `- ${check.label}.`).join("\n")}

## Replay Checks

These are semantic checks, not pixel-perfect checks:

${expectations.semanticReplayChecks.map((check) => `- ${check}`).join("\n")}

## Session

${sessionUrl}
`;

  const reportPath = path.join(outDir, expectations.artifactReportName);
  await fs.writeFile(reportPath, report);
  console.log(`wrote ${reportPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
