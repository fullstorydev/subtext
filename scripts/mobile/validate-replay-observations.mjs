import fs from "node:fs/promises";
import path from "node:path";
import { DEFAULT_OUT_DIR } from "./appium-layer.mjs";
import { loadLocalEnv } from "./device-e2e-common.mjs";

await loadLocalEnv(new URL(".env.local", import.meta.url));

const outDir = process.env.MOBILE_OUT_DIR ?? DEFAULT_OUT_DIR;
const observationsPath = path.join(outDir, "replay-observations.json");
const expectationsPath = process.env.MOBILE_GOAL_EXPECTATIONS;
if (!expectationsPath) {
  throw new Error("Set MOBILE_GOAL_EXPECTATIONS to a goal JSON file.");
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

function pass(condition, message, failures, warnings, { warn = false } = {}) {
  if (condition) {
    return `PASS: ${message}`;
  }

  if (warn) {
    warnings.push(message);
    return `WARN: ${message}`;
  }

  failures.push(message);
  return `FAIL: ${message}`;
}

function includesAny(values, expected) {
  return values.some((value) => value.toLowerCase().includes(expected.toLowerCase()));
}

function validatePrivacyEvidence(observations, expectations, failures, warnings) {
  const observedRegions = observations.privacyEvidence ?? [];
  const expectedRegions = expectations.sensitiveRegions ?? [];
  const checks = [];

  for (const expectedRegion of expectedRegions) {
    const observed = observedRegions.find((region) => region.regionId === expectedRegion.id);
    if (!observed) {
      warnings.push(`No replay observation for sensitive region: ${expectedRegion.label}`);
      checks.push(`WARN: No replay observation for sensitive region: ${expectedRegion.label}`);
      continue;
    }

    const replayState = observed.replay?.state ?? "not_observed";
    const engine = observed.engine ?? {};
    const expectedState = expectedRegion.expectedPrivacyState ?? observed.expectedPrivacyState;

    checks.push(
      validateRegionPrivacyState({
        label: expectedRegion.label,
        expectedState,
        replayState,
        engine,
        failures,
        warnings,
      }),
    );
  }

  return checks;
}

function validateRegionPrivacyState({ label, expectedState, replayState, engine, failures, warnings }) {
  const engineState = engine.state ?? "not_available";
  const engineContradictsUnmasked =
    engine.maskedFlagObserved === true || engine.blockedFlagObserved === true;

  switch (expectedState) {
    case "unmasked":
      if (replayState === "unmasked" && !engineContradictsUnmasked) {
        return `PASS: ${label} was expected unmasked and replay showed unmasked content`;
      }
      if (replayState === "mixed" || replayState === "masked" || engineContradictsUnmasked) {
        failures.push(
          `${label} was expected unmasked, but replay or native evidence indicates ${replayState}`,
        );
        return `FAIL: ${label} was expected unmasked, but replay or native evidence indicates ${replayState}`;
      }
      failures.push(`${label} was expected unmasked, but replay did not show unmasked evidence`);
      return `FAIL: ${label} was expected unmasked, but replay did not show unmasked evidence`;

    case "masked":
      if (replayState === "masked" || engine.maskedFlagObserved === true || engineState === "masked") {
        return `PASS: ${label} was expected masked and masking evidence was observed`;
      }
      if (replayState === "unmasked" || replayState === "mixed") {
        failures.push(`${label} was expected masked, but replay showed unmasked content`);
        return `FAIL: ${label} was expected masked, but replay showed unmasked content`;
      }
      warnings.push(`${label} was expected masked, but masking evidence was not captured`);
      return `WARN: ${label} was expected masked, but masking evidence was not captured`;

    case "excluded":
      if (engine.blockedFlagObserved === true || engineState === "excluded") {
        return `PASS: ${label} was expected excluded and blocked evidence was observed`;
      }
      if (replayState === "unmasked" || replayState === "mixed") {
        failures.push(`${label} was expected excluded, but replay showed unmasked content`);
        return `FAIL: ${label} was expected excluded, but replay showed unmasked content`;
      }
      warnings.push(`${label} was expected excluded, but blocked-frame evidence was not captured`);
      return `WARN: ${label} was expected excluded, but blocked-frame evidence was not captured`;

    case "omitted":
      if (replayState === "not_observed" || engineState === "omitted") {
        return `PASS: ${label} was expected omitted and replay did not show the region`;
      }
      failures.push(`${label} was expected omitted, but replay showed ${replayState} evidence`);
      return `FAIL: ${label} was expected omitted, but replay showed ${replayState} evidence`;

    case "config_dependent":
    case undefined:
      warnings.push(`${label} has no explicit expected privacy state`);
      return `WARN: ${label} has no explicit expected privacy state`;

    default:
      if (expectedState === "toggles_mask_unmask") {
        if (replayState === "mixed") {
          return `PASS: ${label} showed both masked and unmasked states`;
        }
        warnings.push(
          `${label} expects masked/unmasked toggle evidence, but replay only showed ${replayState}`,
        );
        return `WARN: ${label} expects masked/unmasked toggle evidence, but replay only showed ${replayState}`;
      }
      warnings.push(`${label} has unsupported expected privacy state: ${expectedState}`);
      return `WARN: ${label} has unsupported expected privacy state: ${expectedState}`;
  }
}

async function main() {
  const observations = await readJson(observationsPath);
  const expectations = await readJson(expectationsPath);
  const failures = [];
  const warnings = [];
  const checks = [];

  const visibleText = observations.visibleText ?? [];
  const eventStream = observations.eventStream ?? [];

  checks.push(
    pass(
      visibleText.includes(expectations.replayChecks.screen) ||
        observations.replayScreen === expectations.replayChecks.screen,
      `Replay reached the ${expectations.replayChecks.screen} screen`,
      failures,
      warnings,
    ),
  );

  for (const eventCheck of expectations.replayChecks.requiredEvents) {
    checks.push(
      pass(includesAny(eventStream, eventCheck.contains), eventCheck.label, failures, warnings),
    );
  }

  for (const booleanCheck of expectations.replayChecks.booleans) {
    checks.push(
      pass(
        observations[booleanCheck.field] === true,
        booleanCheck.label,
        failures,
        warnings,
        { warn: booleanCheck.severity === "warn" },
      ),
    );
  }

  checks.push(...validatePrivacyEvidence(observations, expectations, failures, warnings));

  const status = failures.length > 0 ? "FAIL" : warnings.length > 0 ? "WARN" : "PASS";
  const report = `# Replay Validation Report

Status: ${status}

Goal: ${expectations.name}

Session: ${observations.sessionUrl}

## Checks

${checks.map((check) => `- ${check}`).join("\n")}

## Notes

${(observations.notes ?? []).map((note) => `- ${note}`).join("\n")}

## Replay Evidence Files

${(observations.snapshotFiles ?? []).map((file) => `- ${file}`).join("\n")}

## Privacy Evidence

${(observations.privacyEvidence ?? [])
  .map(
    (evidence) =>
      `- ${evidence.label}: expected ${evidence.expectedPrivacyState}; replay observed ${evidence.replay?.state}; native flags ${evidence.engine?.state}`,
  )
  .join("\n")}

## Important

This is semantic validation, not pixel-perfect validation. FullStory replay is approximate by design. The goal is to catch wrong screens, missing events, blank/frozen content, bad masking, broken scroll playback, bad dimensions, and other product-visible capture/replay issues.

For privacy goals, replay visibility is only a failure when it contradicts the expected privacy state. Native flags should be added before treating masked, excluded, or omitted checks as fully proven.
`;

  const reportPath = path.join(outDir, expectations.replayReportName);
  await fs.writeFile(reportPath, report);
  console.log(`status: ${status}`);
  console.log(`wrote ${reportPath}`);

  if (failures.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
