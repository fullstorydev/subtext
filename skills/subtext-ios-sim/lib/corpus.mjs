import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

export function sightmapBin(explicit) {
  return explicit || process.env.SIGHTMAP_BIN || 'sightmap';
}

// `sightmap export` emits the canonical Corpus wire: children are flattened into
// components whose selectors already carry their ancestors' selectors, `$ref`s
// are expanded, and view components are listed separately from globals.
export function loadCorpus(sightmapDir, { bin } = {}) {
  if (!existsSync(sightmapDir)) return { globals: [], views: [], memory: [] };
  let out;
  try {
    out = execFileSync(sightmapBin(bin), ['export', '--sightmap-dir', sightmapDir], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (err) {
    const detail = err.code === 'ENOENT'
      ? `sightmap CLI not found (${sightmapBin(bin)}); install it with: npm install -g @sightmap/sightmap`
      : (err.stderr || err.message).toString().trim();
    const wrapped = new Error(`could not load .sightmap corpus from ${sightmapDir}: ${detail}`);
    wrapped.code = 'corpus_unavailable';
    throw wrapped;
  }
  return parseCorpus(JSON.parse(out));
}

export function loadCorpusFile(path) {
  return parseCorpus(JSON.parse(readFileSync(path, 'utf8')));
}

const EXTRACT_KEYS = ['from', 'path', 'pattern', 'join'];

/**
 * sightmap 0.34+ exports every `extract` as `{from, path, pattern, join}`;
 * older releases (and legacy YAML) use the strings `text`, `attr=NAME`,
 * `Child.prop` and `exists:Child`. Both become the object form.
 */
export function normalizeExtract(extract) {
  if (extract == null || extract === '') return { from: 'dom.text' };
  if (typeof extract === 'object') {
    return Object.fromEntries(EXTRACT_KEYS.filter((k) => extract[k] !== undefined && extract[k] !== null).map((k) => [k, extract[k]]));
  }
  const s = String(extract);
  if (s === 'text') return { from: 'dom.text' };
  if (s === 'raw_text') return { from: 'dom.raw_text' };
  if (s.startsWith('attr=')) return { from: 'dom.attr', path: s.slice(5) };
  if (s.startsWith('exists:')) return { from: 'component.exists', path: s.slice(7) };
  return { from: 'component', path: s };
}

export function parseCorpus(wire) {
  const component = (c) => ({
    name: c.name,
    selectors: c.selectors ?? [],
    properties: (c.properties ?? []).map((p) => ({ ...p, extract: normalizeExtract(p.extract) })),
    parentChain: c.parentChain ?? [],
    memory: c.memory ?? [],
  });
  return {
    globals: (wire.globals ?? []).map(component),
    views: (wire.views ?? []).map((v) => ({
      name: v.name,
      route: v.route ?? null,
      memory: v.memory ?? [],
      components: (v.components ?? []).map(component),
    })),
    memory: wire.memory ?? [],
  };
}
