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
const sessionUrlPath =
  process.env.MOBILE_SESSION_URL_PATH ??
  path.join(outDir, "fullstory-session-url.txt");

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function existingArtifacts(files) {
  const present = [];

  for (const file of files) {
    try {
      await fs.access(path.join(outDir, file));
      present.push(file);
    } catch (err) {
      if (err.code !== "ENOENT") {
        throw err;
      }
    }
  }

  return present;
}

function replayCheckList(goal) {
  const requiredEvents = goal.replayChecks?.requiredEvents ?? [];
  const booleans = goal.replayChecks?.booleans ?? [];
  return [
    `Replay reaches the ${goal.replayChecks?.screen ?? goal.name} screen.`,
    ...requiredEvents.map((check) => check.label),
    ...booleans.map((check) => check.label),
  ];
}

async function main() {
  const goal = await readJson(expectationsPath);
  const sessionUrl = (await fs.readFile(sessionUrlPath, "utf8")).trim();
  const requiredArtifacts = goal.requiredArtifacts ?? [];
  const artifacts = await existingArtifacts(requiredArtifacts);

  const request = `# Subtext Mobile Replay Review Request

Use the Subtext review MCP tools to validate this session replay.

## Session

${sessionUrl}

## Goal

- Name: ${goal.name}
- Goal path: ${expectationsPath}
- Mobile output directory: ${outDir}
- Target screen: ${goal.replayChecks?.screen ?? goal.run?.targetScreen ?? goal.name}

## Device Evidence

The Appium run already produced these artifacts:

${artifacts.map((artifact) => `- ${path.join(outDir, artifact)}`).join("\n")}

## Replay Rubric

${replayCheckList(goal).map((check) => `- ${check}`).join("\n")}

## Expected Output

Write \`${path.join(outDir, "replay-observations.json")}\`, save raw review evidence under \`${outDir}\`, then run:

\`\`\`bash
MOBILE_GOAL_EXPECTATIONS="${expectationsPath}" \\
MOBILE_OUT_DIR="${outDir}" \\
node scripts/mobile/validate-replay-observations.mjs
\`\`\`
`;

  const requestPath = path.join(outDir, "subtext-review-request.md");
  await fs.writeFile(requestPath, request);
  console.log(`wrote ${requestPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
