import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { parseCorpus } from './corpus.mjs';
import { SimError } from './errors.mjs';

export const SIGHTMAP_VERSION = '0.36.1';
export const SIGHTMAP_PACKAGE = `@sightmap/sightmap@${SIGHTMAP_VERSION}`;
/** The sightmap releases the bridge is tested with: [min, maxExclusive). */
export const SIGHTMAP_TESTED = ['0.32.0', '0.37.0'];
/** The first release that reads `extract: { from, path }` objects in YAML. */
export const SIGHTMAP_EXTRACT_OBJECT = '0.34.0';
export const CACHE_ROOT = process.env.SUBTEXT_SIM_CACHE || join(homedir(), 'Library', 'Caches', 'subtext-sim');
const NPX_PATH_CACHE = join(CACHE_ROOT, `sightmap-${SIGHTMAP_VERSION}.path`);

/** `sightmap version` → "0.36.1", or null when the binary doesn't run. */
export function sightmapVersion(bin) {
  const r = spawnSync(bin, ['version'], { encoding: 'utf8', timeout: 30_000 });
  if (r.status !== 0) return null;
  return /(\d+\.\d+\.\d+)/.exec(r.stdout)?.[1] ?? 'unknown';
}

export function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

/** Why a sightmap version may not work with the bridge, or null when it is in the tested range. */
export function sightmapVersionWarning(version) {
  if (!version || version === 'unknown') return 'could not read its version';
  const [min, max] = SIGHTMAP_TESTED;
  if (compareVersions(version, min) < 0 || compareVersions(version, max) >= 0) {
    return `outside the range subtext-sim is tested with (${min} to <${max})`;
  }
  if (compareVersions(version, SIGHTMAP_EXTRACT_OBJECT) < 0) {
    return `it can't load \`extract: { from: … }\` objects (sightmap ${SIGHTMAP_EXTRACT_OBJECT}+), which the sample apps' .sightmap/ use`;
  }
  return null;
}

/**
 * SIGHTMAP_BIN, then `sightmap` on PATH, then the pinned package through npx
 * (its resolved path is cached). Returns `{ bin, source, version }`.
 */
export function resolveSightmap() {
  if (process.env.SIGHTMAP_BIN) {
    const bin = process.env.SIGHTMAP_BIN;
    return { bin, source: `SIGHTMAP_BIN=${bin}`, version: sightmapVersion(bin) };
  }
  const onPath = sightmapVersion('sightmap');
  if (onPath) {
    const where = spawnSync('/bin/sh', ['-c', 'command -v sightmap'], { encoding: 'utf8' }).stdout.trim();
    return { bin: 'sightmap', source: `on PATH: ${where || 'sightmap'}`, version: onPath };
  }
  if (existsSync(NPX_PATH_CACHE)) {
    const cached = readFileSync(NPX_PATH_CACHE, 'utf8').trim();
    const version = cached && existsSync(cached) ? sightmapVersion(cached) : null;
    if (version) return { bin: cached, source: `npx ${SIGHTMAP_PACKAGE}`, version };
  }
  const r = spawnSync('npx', ['-y', '-p', SIGHTMAP_PACKAGE, 'sh', '-c', 'command -v sightmap'], { encoding: 'utf8', timeout: 180_000 });
  const path = r.status === 0 ? r.stdout.trim().split('\n').at(-1) : '';
  const version = path ? sightmapVersion(path) : null;
  if (!version) {
    throw new SimError('corpus_unavailable', `sightmap CLI not found (no SIGHTMAP_BIN, not on PATH, and npx ${SIGHTMAP_PACKAGE} failed)`);
  }
  mkdirSync(dirname(NPX_PATH_CACHE), { recursive: true });
  writeFileSync(NPX_PATH_CACHE, `${path}\n`);
  return { bin: path, source: `npx ${SIGHTMAP_PACKAGE}`, version };
}

function yamlFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const p = join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (/\.ya?ml$/.test(entry.name)) out.push(p);
    }
  };
  if (existsSync(dir)) walk(dir);
  return out.sort();
}

const EMPTY = { globals: [], views: [], memory: [] };

/** Loads `.sightmap/` through `sightmap export`, re-exporting only when a YAML file changes. */
export class CorpusCache {
  constructor(sightmapDir) {
    this.dir = sightmapDir;
    this.signature = null;
    this.corpus = EMPTY;
    this.sightmap = null;
  }

  get() {
    const files = yamlFiles(this.dir);
    const signature = files.map((f) => `${f}:${statSync(f).mtimeMs}`).join('|');
    if (signature === this.signature) return this.corpus;
    if (!files.length) {
      this.corpus = EMPTY;
    } else {
      this.sightmap ??= resolveSightmap();
      let out;
      try {
        out = execFileSync(this.sightmap.bin, ['export', '--sightmap-dir', this.dir], {
          encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024,
        });
      } catch (err) {
        const stderr = String(err.stderr || err.message).trim();
        const detail = stderr.split('\n').filter(Boolean).at(-1);
        const { version, source } = this.sightmap;
        if (/cannot unmarshal !!map into string/.test(stderr) && version && version !== 'unknown' && compareVersions(version, SIGHTMAP_EXTRACT_OBJECT) < 0) {
          throw new SimError('corpus_invalid', `could not load ${this.dir}: it uses \`extract: { from: … }\` objects, which need sightmap ${SIGHTMAP_EXTRACT_OBJECT}+, and the sightmap in use is ${version} (${source})`,
            `upgrade it (\`npm install -g ${SIGHTMAP_PACKAGE}\`) or point SIGHTMAP_BIN at a newer one, then retry`);
        }
        throw new SimError('corpus_invalid', `could not load ${this.dir}: ${detail}`, 'fix the YAML under .sightmap/ (`sightmap validate` shows every problem), then retry');
      }
      this.corpus = parseCorpus(JSON.parse(out));
    }
    this.signature = signature;
    return this.corpus;
  }
}
