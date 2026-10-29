import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareVersions, SIGHTMAP_EXTRACT_OBJECT, SIGHTMAP_VERSION, sightmapVersion, sightmapVersionWarning } from '../lib/sightmap-cli.mjs';
import { sightmapDetail } from '../lib/doctor.mjs';

const skill = join(dirname(fileURLToPath(import.meta.url)), '..');
const bin = process.env.SIGHTMAP_BIN || 'sightmap';
const version = sightmapVersion(bin);
const canValidate = version && version !== 'unknown' && compareVersions(version, SIGHTMAP_EXTRACT_OBJECT) >= 0
  ? {}
  : { skip: `needs a sightmap ${SIGHTMAP_EXTRACT_OBJECT}+ CLI (set SIGHTMAP_BIN); found ${version ?? 'none'}` };

function validate(dir) {
  const r = spawnSync(bin, ['validate', '--sightmap-dir', dir], { encoding: 'utf8' });
  return { ok: r.status === 0, out: `${r.stdout}${r.stderr}`.trim() };
}

test('sightmap versions outside the tested range warn', () => {
  assert.equal(sightmapVersionWarning('0.36.1'), null);
  assert.equal(sightmapVersionWarning('0.34.0'), null);
  assert.match(sightmapVersionWarning('0.33.0'), /extract: \{ from/);
  assert.match(sightmapVersionWarning('0.31.2'), /outside the range/);
  assert.match(sightmapVersionWarning('0.37.0'), /outside the range/);
  assert.match(sightmapVersionWarning('unknown'), /could not read/);
});

test('doctor says which sightmap is used and what the pinned fallback is', () => {
  assert.equal(sightmapDetail({ version: '0.36.0', source: 'on PATH: /opt/bin/sightmap' }), `using PATH sightmap 0.36.0 (/opt/bin/sightmap; pinned fallback is ${SIGHTMAP_VERSION})`);
  assert.equal(sightmapDetail({ version: '0.35.2', source: 'SIGHTMAP_BIN=/x/sightmap' }), `using SIGHTMAP_BIN sightmap 0.35.2 (/x/sightmap; pinned fallback is ${SIGHTMAP_VERSION})`);
  assert.match(sightmapDetail({ version: SIGHTMAP_VERSION, source: `npx @sightmap/sightmap@${SIGHTMAP_VERSION}` }), /^using the pinned sightmap/);
  assert.equal(sightmapVersionWarning('0.36.0'), null, 'a PATH sightmap inside the range is not a warning');
});

for (const app of ['SampleApp', 'RNSampleApp']) {
  test(`fixtures/${app}/.sightmap passes sightmap validate`, canValidate, () => {
    const { ok, out } = validate(join(skill, 'fixtures', app, '.sightmap'));
    assert.ok(ok, out);
    assert.doesNotMatch(out, /deprecated/);
  });
}

test('every YAML example in SKILL.md and README.md passes sightmap validate', canValidate, () => {
  const blocks = ['SKILL.md', 'README.md'].flatMap((doc) =>
    [...readFileSync(join(skill, doc), 'utf8').matchAll(/```ya?ml\n([\s\S]*?)```/g)].map((m, i) => ({ doc, i, yaml: m[1] })));
  assert.ok(blocks.length > 0);
  assert.ok(blocks.some((b) => /properties:/.test(b.yaml)), 'at least one example declares a property');
  for (const { doc, i, yaml } of blocks) {
    const dir = mkdtempSync(join(tmpdir(), 'subtext-sim-yaml-'));
    mkdirSync(join(dir, 'views'));
    writeFileSync(join(dir, 'views', 'example.yaml'), yaml);
    const { ok, out } = validate(dir);
    assert.ok(ok, `${doc} YAML example #${i + 1}:\n${out}`);
    assert.doesNotMatch(out, /deprecated/, `${doc} YAML example #${i + 1}`);
  }
});
