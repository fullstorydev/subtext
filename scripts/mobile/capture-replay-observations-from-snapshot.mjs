import fs from "node:fs/promises";
import path from "node:path";
import { DEFAULT_OUT_DIR } from "./appium-layer.mjs";

const outDir = process.env.MOBILE_OUT_DIR ?? DEFAULT_OUT_DIR;
const sessionUrlPath = process.env.MOBILE_SESSION_URL_PATH ?? path.join(outDir, "fullstory-session-url.txt");
const expectationsPath = process.env.MOBILE_GOAL_EXPECTATIONS;
if (!expectationsPath) {
  throw new Error("Set MOBILE_GOAL_EXPECTATIONS to a goal JSON file.");
}

function includesAny(text, values) {
  return values.some((value) => text.toLowerCase().includes(value.toLowerCase()));
}

function eventIfPresent(snapshot, text, normalized = text) {
  return snapshot.includes(text) ? [normalized] : [];
}

function defaultUnmaskedTerms(region) {
  return [region.deviceContains, region.label, region.id].filter(Boolean);
}

function defaultMaskedTerms(region) {
  return [`MASKED_STATE_OBSERVED:${region.id}`, `masked:${region.id}`];
}

async function readReplaySnapshots() {
  if (process.env.MOBILE_REPLAY_SNAPSHOT_PATH) {
    const file = process.env.MOBILE_REPLAY_SNAPSHOT_PATH;
    return [{ file, text: await fs.readFile(file, "utf8") }];
  }

  const files = (await fs.readdir(outDir))
    .filter((file) => /^replay-snapshot.*\.txt$/.test(file))
    .sort();

  if (files.length === 0) {
    throw new Error(`No replay snapshot files found in ${outDir}`);
  }

  return Promise.all(
    files.map(async (file) => ({
      file: path.join(outDir, file),
      text: await fs.readFile(path.join(outDir, file), "utf8"),
    })),
  );
}

function privacyEvidenceForRegions(snapshots, regions = []) {
  return regions.map((region) => {
    const unmaskedTerms = region.replayEvidence?.unmaskedContains ?? defaultUnmaskedTerms(region);
    const maskedTerms = region.replayEvidence?.maskedContains ?? defaultMaskedTerms(region);
    const unmaskedSnapshots = snapshots
      .filter(({ text }) => includesAny(text, unmaskedTerms))
      .map(({ file }) => file);
    const maskedSnapshots = snapshots
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
        evidenceSource: "browser replay snapshot text",
      },
      engine: {
        state: "not_available",
        maskedFlagObserved: null,
        blockedFlagObserved: null,
        evidenceSource: "not collected",
      },
      sources: ["goal manifest", "browser replay snapshot text"],
    };
  });
}

async function main() {
  const snapshots = await readReplaySnapshots();
  const snapshot = snapshots.map(({ text }) => text).join("\n\n--- replay snapshot boundary ---\n\n");
  const sessionUrl = (await fs.readFile(sessionUrlPath, "utf8")).trim();
  const expectations = JSON.parse(await fs.readFile(expectationsPath, "utf8"));
  const screen = expectations.replayChecks?.screen ?? expectations.name;

  const heuristics = expectations.replayChecks?.observationHeuristics ?? {};

  const eventHeuristics = heuristics.events ?? [
    { terms: [`Set Page Properties: ${screen}`], normalized: `Set Page Properties: ${screen}` },
  ];
  const eventStream = [];
  for (const rule of eventHeuristics) {
    for (const term of rule.terms) {
      if (snapshot.includes(term)) {
        eventStream.push(rule.normalized);
        break;
      }
    }
  }

  const screenTerms = heuristics.reachedScreen ?? [screen, `Set Page Properties: ${screen}`];
  const reachedScreen = includesAny(snapshot, screenTerms);

  const imageTerms = heuristics.imageContent ?? [
    "VISUAL_IMAGE_CONTENT_OBSERVED",
    `Set Page Properties: ${screen}`,
  ];

  const scrollTerms = heuristics.scrollPlayback ?? [
    "SCROLL_PLAYBACK_OBSERVED",
  ];

  const privacyEvidence = privacyEvidenceForRegions(snapshots, expectations.sensitiveRegions);
  const observations = {
    sessionUrl,
    snapshotFiles: snapshots.map(({ file }) => file),
    replayScreen: reachedScreen ? screen : "unknown",
    visibleText: [
      ...(snapshot.includes(screen) ? [screen] : []),
      ...(snapshot.includes("iPhone") ? ["iPhone"] : []),
      ...(snapshot.includes("Mobile · iOS") ? ["Mobile · iOS"] : []),
    ],
    eventStream,
    imageContentVisible: includesAny(snapshot, imageTerms),
    privacyScreenVisible: reachedScreen,
    privacyEvidence,
    scrollPlaybackLooksCorrect: includesAny(snapshot, scrollTerms),
    notes: [
      "Generated from browser replay snapshot text.",
      "This is semantic replay evidence, not pixel-perfect image comparison.",
      "Privacy checks compare declared expectations against available replay evidence. Native flags are not collected yet.",
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
