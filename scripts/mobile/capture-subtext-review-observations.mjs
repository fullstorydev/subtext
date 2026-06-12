import fs from "node:fs/promises";
import path from "node:path";
import { DEFAULT_OUT_DIR } from "./appium-layer.mjs";
import { loadLocalEnv } from "./device-e2e-common.mjs";

await loadLocalEnv(new URL(".env.local", import.meta.url));

const outDir = process.env.MOBILE_OUT_DIR ?? DEFAULT_OUT_DIR;
const sessionUrlPath =
  process.env.MOBILE_SESSION_URL_PATH ??
  path.join(outDir, "fullstory-session-url.txt");
const expectationsPath = process.env.MOBILE_GOAL_EXPECTATIONS;
if (!expectationsPath) {
  throw new Error("Set MOBILE_GOAL_EXPECTATIONS to a goal JSON file.");
}

function includesAny(text, values) {
  return values.some((value) => text.toLowerCase().includes(value.toLowerCase()));
}

function eventIfPresent(text, terms, normalized) {
  return includesAny(text, terms) ? [normalized] : [];
}

function hasMultipleViewTimestamps(evidenceFiles) {
  const timestamps = new Set();
  for (const { text } of evidenceFiles) {
    const match = text.match(/^View timestamp:\s*(\d+)ms/m);
    if (match) {
      timestamps.add(match[1]);
    }
  }
  return timestamps.size >= 2;
}

function defaultUnmaskedTerms(region) {
  return [region.deviceContains, region.label, region.id].filter(Boolean);
}

function defaultMaskedTerms(region) {
  return [`MASKED_STATE_OBSERVED:${region.id}`, `masked:${region.id}`];
}

async function readSubtextReviewEvidence() {
  if (process.env.MOBILE_SUBTEXT_REVIEW_EVIDENCE_PATH) {
    const file = process.env.MOBILE_SUBTEXT_REVIEW_EVIDENCE_PATH;
    return [{ file, text: await fs.readFile(file, "utf8") }];
  }

  const files = (await fs.readdir(outDir))
    .filter((file) => /^replay-view-subtext.*\.txt$/.test(file) || /^review-(open|view).*\.txt$/.test(file))
    .sort();

  if (files.length === 0) {
    throw new Error(
      `No Subtext review evidence files found in ${outDir}. Save review-open/review-view output as replay-view-subtext-*.txt or set MOBILE_SUBTEXT_REVIEW_EVIDENCE_PATH.`,
    );
  }

  return Promise.all(
    files.map(async (file) => ({
      file: path.join(outDir, file),
      text: await fs.readFile(path.join(outDir, file), "utf8"),
    })),
  );
}

function privacyEvidenceForRegions(evidenceFiles, regions = []) {
  return regions.map((region) => {
    const unmaskedTerms = region.replayEvidence?.unmaskedContains ?? defaultUnmaskedTerms(region);
    const maskedTerms = region.replayEvidence?.maskedContains ?? defaultMaskedTerms(region);
    const unmaskedSnapshots = evidenceFiles
      .filter(({ text }) => includesAny(text, unmaskedTerms))
      .map(({ file }) => file);
    const maskedSnapshots = evidenceFiles
      .filter(({ text }) => includesAny(text, maskedTerms))
      .map(({ file }) => file);
    const replayState =
      unmaskedSnapshots.length > 0 && maskedSnapshots.length > 0
        ? "mixed"
        : unmaskedSnapshots.length > 0
          ? "unmasked"
          : maskedSnapshots.length > 0
            ? "masked"
            : "not_observed";

    return {
      regionId: region.id,
      label: region.label,
      expectedPrivacyState: region.expectedPrivacyState ?? "config_dependent",
      expectedPrivacySource: region.expectedPrivacySource ?? "goal manifest",
      bounds: region.bounds,
      replay: {
        state: replayState,
        unmaskedStateObserved: unmaskedSnapshots.length > 0,
        maskedStateObserved: maskedSnapshots.length > 0,
        unmaskedSnapshots,
        maskedSnapshots,
        evidenceSource: "Subtext review evidence",
      },
      engine: {
        state: "not_available",
        maskedFlagObserved: null,
        blockedFlagObserved: null,
        evidenceSource: "not collected",
      },
      sources: ["goal manifest", "Subtext review evidence"],
    };
  });
}

async function main() {
  const evidenceFiles = await readSubtextReviewEvidence();
  const evidence = evidenceFiles.map(({ text }) => text).join("\n\n--- subtext review boundary ---\n\n");
  const sessionUrl = (await fs.readFile(sessionUrlPath, "utf8")).trim();
  const expectations = JSON.parse(await fs.readFile(expectationsPath, "utf8"));
  const screen = expectations.replayChecks?.screen ?? expectations.name;

  const heuristics = expectations.replayChecks?.observationHeuristics ?? {};

  const eventHeuristics = heuristics.events ?? [
    { terms: [`Set Page Properties: ${screen}`, "page-properties", "page-view"], normalized: `Set Page Properties: ${screen}` },
  ];
  const eventStream = [];
  for (const rule of eventHeuristics) {
    eventStream.push(...eventIfPresent(evidence, rule.terms, rule.normalized));
  }

  const screenTerms = heuristics.reachedScreen ?? [screen, `navigation text "${screen}"`];
  const reachedScreen = includesAny(evidence, screenTerms);

  const imageTerms = heuristics.imageContent ?? [
    "VISUAL_IMAGE_CONTENT_OBSERVED",
    "fsvisualtestview",
    " img",
  ];
  const imageContentVisible = includesAny(evidence, imageTerms);

  const scrollTerms = heuristics.scrollPlayback ?? [
    "SCROLL_PLAYBACK_OBSERVED",
    "lower scrolled",
  ];
  const scrollPlaybackLooksCorrect = includesAny(evidence, scrollTerms)
    || (hasMultipleViewTimestamps(evidenceFiles) && imageContentVisible && reachedScreen);

  const observations = {
    sessionUrl,
    snapshotFiles: evidenceFiles.map(({ file }) => file),
    replayScreen: reachedScreen ? screen : "unknown",
    visibleText: [
      ...(reachedScreen ? [screen] : []),
      ...(evidence.includes("iPhone") ? ["iPhone"] : []),
      ...(evidence.includes("Mobile · iOS") ? ["Mobile · iOS"] : []),
    ],
    eventStream,
    imageContentVisible,
    privacyScreenVisible: reachedScreen,
    privacyEvidence: privacyEvidenceForRegions(evidenceFiles, expectations.sensitiveRegions),
    scrollPlaybackLooksCorrect,
    notes: [
      "Generated from Subtext review-open/review-view evidence.",
      "This is semantic replay evidence, not pixel-perfect image comparison.",
      "Native privacy flags are not collected yet.",
    ],
  };

  const observationsPath = path.join(outDir, "replay-observations.json");
  await fs.writeFile(observationsPath, `${JSON.stringify(observations, null, 2)}\n`);
  console.log(`wrote ${observationsPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
