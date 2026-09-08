#!/usr/bin/env node
// Sync the per-harness manifest versions to package.json's version.
//
// Changesets only bumps `package.json`; the per-harness plugin.json files
// (.claude-plugin/, .codex-plugin/, .cursor-plugin/), the Gemini extension
// manifest (gemini-extension.json), the marketplace listing, and
// package-lock.json all carry their own `version` fields that changesets
// leaves untouched.
// This script reads the post-`changeset version` package.json and writes
// that version into every manifest (and the lockfile), so a future Version PR
// opens with all version metadata already synced.
//
// Wired into `npm run version-packages`, which `release.yml` invokes via
// `changesets/action`'s `version:` input.
//
// Pure Node.js (no deps). Idempotent.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));

const PER_HARNESS_MANIFESTS = [
  '.claude-plugin/plugin.json',
  '.codex-plugin/plugin.json',
  '.cursor-plugin/plugin.json',
  'gemini-extension.json',
];

let touched = 0;

for (const rel of PER_HARNESS_MANIFESTS) {
  const path = join(REPO_ROOT, rel);
  if (!existsSync(path)) continue;
  const json = JSON.parse(readFileSync(path, 'utf8'));
  if (json.version === version) continue;
  json.version = version;
  writeFileSync(path, JSON.stringify(json, null, 2) + '\n');
  console.log(`sync: ${rel} → ${version}`);
  touched++;
}

// marketplace listings: version lives under plugins[0].
const MARKETPLACE_MANIFESTS = [
  '.claude-plugin/marketplace.json',
  '.cursor-plugin/marketplace.json',
];

for (const rel of MARKETPLACE_MANIFESTS) {
  const marketplacePath = join(REPO_ROOT, rel);
  if (!existsSync(marketplacePath)) continue;
  const marketplace = JSON.parse(readFileSync(marketplacePath, 'utf8'));
  if (marketplace.plugins[0].version !== version) {
    marketplace.plugins[0].version = version;
    writeFileSync(marketplacePath, JSON.stringify(marketplace, null, 2) + '\n');
    console.log(`sync: ${rel} (plugins[0]) → ${version}`);
    touched++;
  }
}

// package-lock.json records the package's own version in two places (the
// top-level `version` and the root package entry `packages[""]`). Changesets
// bumps package.json but not the lockfile, so sync both here — otherwise a
// later `npm install` rewrites the committed lockfile and the release's version
// metadata no longer matches (flagged on the v0.10.3 Version PR).
const lockPath = join(REPO_ROOT, 'package-lock.json');
if (existsSync(lockPath)) {
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  let lockChanged = false;
  if (lock.version !== version) {
    lock.version = version;
    lockChanged = true;
  }
  if (lock.packages?.['']?.version !== undefined && lock.packages[''].version !== version) {
    lock.packages[''].version = version;
    lockChanged = true;
  }
  if (lockChanged) {
    writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
    console.log(`sync: package-lock.json → ${version}`);
    touched++;
  }
}

if (touched === 0) {
  console.log(`sync: all version metadata already at ${version}`);
}
