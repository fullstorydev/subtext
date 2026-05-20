#!/usr/bin/env node
// Sync the per-harness manifest versions to package.json's version.
//
// Changesets only bumps `package.json`; the per-harness plugin.json files
// (.claude-plugin/, .codex-plugin/, .cursor-plugin/) and the marketplace
// listing carry their own `version` fields that the harnesses' UIs display.
// This script reads the post-`changeset version` package.json and writes
// that version into every manifest, so a future Version PR opens with all
// manifests already synced.
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

// marketplace.json: version lives under plugins[0].
const marketplacePath = join(REPO_ROOT, '.claude-plugin/marketplace.json');
if (existsSync(marketplacePath)) {
  const marketplace = JSON.parse(readFileSync(marketplacePath, 'utf8'));
  if (marketplace.plugins[0].version !== version) {
    marketplace.plugins[0].version = version;
    writeFileSync(marketplacePath, JSON.stringify(marketplace, null, 2) + '\n');
    console.log(`sync: .claude-plugin/marketplace.json (plugins[0]) → ${version}`);
    touched++;
  }
}

if (touched === 0) {
  console.log(`sync: all manifests already at ${version}`);
}
