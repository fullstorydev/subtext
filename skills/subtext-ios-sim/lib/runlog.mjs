import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const RUNS_DIR = '.sim-runs';

export const LOGGED_ACTIONS = new Set(['start', 'snapshot', 'click', 'fill', 'scroll', 'swipe', 'tap-xy', 'button', 'key', 'type', 'openurl', 'launch']);

const stamp = (d = new Date()) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

export function newRunId(label) {
  const slug = label ? `-${String(label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}` : '';
  return `${stamp()}-${Math.random().toString(36).slice(2, 6)}${slug}`;
}

export function targetOf(node) {
  if (!node) return null;
  return { id: node.id, component: node.component ?? null, identifier: node.identifier ?? null, text: node.label ?? null, role: node.tag };
}

/** Appends one JSON line per producer step to `.sightmap/.sim-runs/<run>.jsonl`. */
export class RunLog {
  constructor(sightmapDir) {
    this.dir = join(sightmapDir, RUNS_DIR);
    this.run = null;
    this.seq = 0;
    this.label = null;
  }

  get path() {
    return this.run ? join(this.dir, `${this.run}.jsonl`) : null;
  }

  begin(label) {
    mkdirSync(this.dir, { recursive: true });
    this.run = newRunId(label);
    this.label = label ?? null;
    this.seq = 0;
    return { run: this.run, path: this.path, label: this.label };
  }

  append(entry) {
    if (!this.run) this.begin();
    const line = { ts: new Date().toISOString(), run: this.run, seq: ++this.seq, ...entry };
    appendFileSync(this.path, `${JSON.stringify(line)}\n`);
    return line;
  }
}

export function latestRunPath(sightmapDir) {
  const dir = join(sightmapDir, RUNS_DIR);
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith('.jsonl')).map((f) => join(dir, f));
  if (!files.length) return null;
  return files.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
}

export function readRun(path, { since = 0 } = {}) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter(Boolean).flatMap((line) => {
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  }).filter((e) => e.seq > since);
}
