// Comparison module — stores results and builds comparison tables.

import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { RunResult, ComparisonRow, Comparison } from './types.js';

// At runtime this file is at build/harness/compare.js, so go up two levels.
const RESULTS_DIR = resolve(import.meta.dirname, '..', '..', 'results');

export function loadLatestResult(specId: string): RunResult | null {
  const specDir = join(RESULTS_DIR, 'runs', specId);
  if (!existsSync(specDir)) return null;
  const runs = readdirSync(specDir).sort().reverse();
  if (runs.length === 0) return null;
  const resultPath = join(specDir, runs[0], 'result.json');
  if (!existsSync(resultPath)) return null;
  return JSON.parse(readFileSync(resultPath, 'utf-8'));
}

export function saveResult(result: RunResult): void {
  const runDir = join(RESULTS_DIR, 'runs', result.spec_id, result.timestamp.replace(/[:.]/g, '-'));
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, 'result.json'), JSON.stringify(result, null, 2));
}

export function buildComparison(results: RunResult[], suiteId: string): Comparison {
  const rows: ComparisonRow[] = results.map(r => ({
    scenario_id: r.scenario_id,
    profile_id: r.profile_id,
    score: r.score,
    turns: r.turns,
    total_tokens: r.total_tokens,
    wall_time_ms: r.wall_time_ms,
    efficiency: r.total_tokens > 0 ? r.score / (r.total_tokens / 1000) : 0,
  }));

  // Load baseline if it exists
  const baselinePath = join(RESULTS_DIR, 'baselines', `${suiteId}.json`);
  const baseline = existsSync(baselinePath)
    ? JSON.parse(readFileSync(baselinePath, 'utf-8'))
    : undefined;

  return {
    suite_id: suiteId,
    timestamp: new Date().toISOString(),
    rows,
    baseline,
  };
}

export function pinBaseline(suiteId: string, rows: ComparisonRow[]): void {
  const baselineDir = join(RESULTS_DIR, 'baselines');
  mkdirSync(baselineDir, { recursive: true });
  writeFileSync(join(baselineDir, `${suiteId}.json`), JSON.stringify(rows, null, 2));
}
