import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { parseCorpus } from './corpus.mjs';
import { SimError } from './errors.mjs';

export const SIGHTMAP_PACKAGE = '@sightmap/sightmap@0.32.0';
export const CACHE_ROOT = process.env.SUBTEXT_SIM_CACHE || join(homedir(), 'Library', 'Caches', 'subtext-sim');
const NPX_PATH_CACHE = join(CACHE_ROOT, `sightmap-${SIGHTMAP_PACKAGE.split('@').at(-1)}.path`);

const works = (bin) => spawnSync(bin, ['version'], { encoding: 'utf8', timeout: 30_000 }).status === 0;

/** SIGHTMAP_BIN, then `sightmap` on PATH, then the pinned package through npx (its resolved path is cached). */
export function resolveSightmapBin() {
  if (process.env.SIGHTMAP_BIN) return process.env.SIGHTMAP_BIN;
  if (works('sightmap')) return 'sightmap';
  if (existsSync(NPX_PATH_CACHE)) {
    const cached = readFileSync(NPX_PATH_CACHE, 'utf8').trim();
    if (cached && existsSync(cached)) return cached;
  }
  const r = spawnSync('npx', ['-y', '-p', SIGHTMAP_PACKAGE, 'sh', '-c', 'command -v sightmap'], { encoding: 'utf8', timeout: 180_000 });
  const path = r.status === 0 ? r.stdout.trim().split('\n').at(-1) : '';
  if (!path || !works(path)) {
    throw new SimError('corpus_unavailable', `sightmap CLI not found (no SIGHTMAP_BIN, not on PATH, and npx ${SIGHTMAP_PACKAGE} failed)`);
  }
  mkdirSync(dirname(NPX_PATH_CACHE), { recursive: true });
  writeFileSync(NPX_PATH_CACHE, `${path}\n`);
  return path;
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
    this.bin = null;
  }

  get() {
    const files = yamlFiles(this.dir);
    const signature = files.map((f) => `${f}:${statSync(f).mtimeMs}`).join('|');
    if (signature === this.signature) return this.corpus;
    if (!files.length) {
      this.corpus = EMPTY;
    } else {
      this.bin ??= resolveSightmapBin();
      let out;
      try {
        out = execFileSync(this.bin, ['export', '--sightmap-dir', this.dir], {
          encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024,
        });
      } catch (err) {
        const detail = String(err.stderr || err.message).trim().split('\n').at(-1);
        throw new SimError('corpus_invalid', `could not load ${this.dir}: ${detail}`, 'fix the YAML under .sightmap/, then retry');
      }
      this.corpus = parseCorpus(JSON.parse(out));
    }
    this.signature = signature;
    return this.corpus;
  }
}
