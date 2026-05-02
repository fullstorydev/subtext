// Output formatting for comparison tables.

import type { ComparisonRow, Comparison } from './types.js';

export function formatComparison(comparison: Comparison): string {
  const { rows, baseline } = comparison;
  const lines: string[] = [];

  lines.push(`━━━ ${comparison.suite_id} ━━━`);
  lines.push('');

  // Group by scenario
  const byScenario = new Map<string, ComparisonRow[]>();
  for (const row of rows) {
    const existing = byScenario.get(row.scenario_id) ?? [];
    existing.push(row);
    byScenario.set(row.scenario_id, existing);
  }

  // Header
  lines.push(
    pad('Scenario', 20) +
    pad('Profile', 20) +
    pad('Score', 8) +
    pad('Turns', 8) +
    pad('Tokens', 10) +
    pad('Wall', 10) +
    pad('Efficiency', 12)
  );
  lines.push('\u2500'.repeat(88));

  for (const [scenario, profileRows] of byScenario) {
    let first = true;
    for (const row of profileRows.sort((a, b) => b.efficiency - a.efficiency)) {
      lines.push(
        pad(first ? scenario : '', 20) +
        pad(row.profile_id, 20) +
        pad(row.score.toFixed(2), 8) +
        pad(String(row.turns), 8) +
        pad(formatTokens(row.total_tokens), 10) +
        pad(formatTime(row.wall_time_ms), 10) +
        pad(row.efficiency.toFixed(1), 12)
      );
      first = false;
    }
    lines.push('');
  }

  // Delta vs baseline
  if (baseline && baseline.length > 0) {
    lines.push('\u2501\u2501\u2501 vs baseline \u2501\u2501\u2501');
    const subtextRows = rows.filter(r => r.profile_id === 'subtext-local');
    const subtextBaseline = baseline.filter((r: ComparisonRow) => r.profile_id === 'subtext-local');
    if (subtextRows.length > 0 && subtextBaseline.length > 0) {
      const avgScore = avg(subtextRows.map(r => r.score));
      const baseAvgScore = avg(subtextBaseline.map(r => r.score));
      const avgTurns = avg(subtextRows.map(r => r.turns));
      const baseAvgTurns = avg(subtextBaseline.map(r => r.turns));
      const avgTokens = avg(subtextRows.map(r => r.total_tokens));
      const baseAvgTokens = avg(subtextBaseline.map(r => r.total_tokens));

      lines.push(
        `subtext-local avg:  Score ${delta(avgScore, baseAvgScore)}  ` +
        `Turns ${delta(avgTurns, baseAvgTurns)}  ` +
        `Tokens ${pctDelta(avgTokens, baseAvgTokens)}`
      );
    }
  }

  return lines.join('\n');
}

export interface SingleRunSummary {
  scenarioId: string;
  profileId: string;
  score: number;
  turns: number;
  totalTokens: number;
  wallTimeMs: number;
  errorCount: number;
  agentCostUsd: number;
  judgeCostUsd: number;
  timedOut: boolean;
}

export function formatSingleRun(s: SingleRunSummary): string {
  const lines: string[] = [];
  const tag = s.timedOut ? ' [TIMED OUT]' : '';
  lines.push(`\u2501\u2501\u2501 ${s.scenarioId} \u00d7 ${s.profileId}${tag} \u2501\u2501\u2501`);
  lines.push(`Score:      ${s.score.toFixed(2)}`);
  lines.push(`Turns:      ${s.turns}`);
  lines.push(`Tokens:     ${s.totalTokens.toLocaleString()}`);
  lines.push(`Wall time:  ${formatTime(s.wallTimeMs)}`);
  lines.push(`Errors:     ${s.errorCount}`);
  const totalCost = s.agentCostUsd + s.judgeCostUsd;
  lines.push(`Cost:       ${formatCost(totalCost)} (agent ${formatCost(s.agentCostUsd)} + judge ${formatCost(s.judgeCostUsd)})`);
  lines.push('\u2501'.repeat(32));
  return lines.join('\n');
}

function formatCost(usd: number): string {
  if (usd === 0) return '$0';
  if (usd < 0.01) return `<$0.01`;
  return `$${usd.toFixed(2)}`;
}

function pad(s: string, width: number): string {
  return s.padEnd(width);
}

function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
}

function formatTime(ms: number): string {
  return ms >= 60_000 ? `${(ms / 60_000).toFixed(1)}m` : `${(ms / 1000).toFixed(1)}s`;
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function delta(current: number, baseline: number): string {
  const diff = current - baseline;
  const sign = diff >= 0 ? '+' : '';
  return `${sign}${diff.toFixed(2)}`;
}

function pctDelta(current: number, baseline: number): string {
  if (baseline === 0) return 'N/A';
  const pct = ((current - baseline) / baseline) * 100;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(0)}%`;
}
