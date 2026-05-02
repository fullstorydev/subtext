// Stage 4 of the autoresearch loop: orchestrate friction-analysis →
// propose-edits → apply → re-run → measure across iterations, with git
// checkpointing so unsuccessful iterations can be reverted.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { analyzeFriction } from './friction.js';
import { proposeEdits, type ProposedEdit, type ProposalResult } from './proposer.js';
import { applyEdits, type ApplySummary } from './applier.js';
import { runSingle } from '../orchestrator.js';
import { loadConfig, loadScenario, loadProfile } from '../config.js';
import type { RunResult, BenchConfig, Scenario } from '../types.js';

export interface LoopOpts {
  scenarioId: string;
  profileId: string;
  /** Maximum iterations (after the baseline). */
  maxIters: number;
  /** Hard ceiling on cumulative agent + judge + proposer spend, USD. */
  maxSpendUsd: number;
  /** Stop after this many consecutive non-improving iterations. */
  patience: number;
  /** Repo root (parent of bench/). Used to resolve file paths for git ops. */
  repoRoot: string;
  /** Where to write the journal. */
  journalPath?: string;
  /** Pricing model for the proposer. Default 'sonnet'. */
  proposerModel?: string;
  /** If true, skip the "press enter to apply" gate (used in CI/auto runs). */
  auto?: boolean;
}

export type IterationStatus =
  | 'baseline'
  | 'kept'
  | 'reverted'
  | 'no-edits-proposed'
  | 'no-edits-applied'
  | 'budget-exceeded'
  | 'patience-exhausted';

export interface IterationRecord {
  iter: number;
  status: IterationStatus;
  /** Score / cost / turns at the END of this iteration (after re-run if any). */
  result?: RunResult;
  proposal?: ProposalResult;
  apply?: ApplySummary;
  /** Cumulative spend after this iteration (agent + judge + proposer). */
  cumulativeSpendUsd: number;
  /** Reasoning summary printed in the journal. */
  note: string;
}

export interface LoopSummary {
  scenarioId: string;
  profileId: string;
  iterations: IterationRecord[];
  baseline: RunResult;
  final: RunResult;
  /** Edits accepted (kept) across the run, in iteration order. */
  acceptedEdits: ProposedEdit[];
  totalSpendUsd: number;
  /** ISO 8601 timestamp at start. */
  startedAt: string;
  /** ISO 8601 timestamp at end. */
  endedAt: string;
}

/**
 * Decision rule for whether an iteration's run improved on the previous one.
 * Improved = strictly better score, OR same score with lower cost.
 *
 * Tolerance on score (epsilon 0.001) handles floating-point noise from the
 * judge response.
 */
export function isImprovement(prev: RunResult, next: RunResult): boolean {
  const eps = 0.001;
  if (next.score > prev.score + eps) return true;
  if (Math.abs(next.score - prev.score) <= eps) {
    const prevCost = prev.agent_cost_usd + prev.judge_cost_usd;
    const nextCost = next.agent_cost_usd + next.judge_cost_usd;
    if (nextCost < prevCost) return true;
  }
  return false;
}

/**
 * Identify the sightmap files relevant to a scenario by simple substring
 * match on the scenario's app name. Brittle but works for the bench layout
 * where each app has its own .sightmap/ directory.
 */
export function relevantSightmapFiles(scenario: Scenario, allFiles: string[]): string[] {
  const app = scenario.app.toLowerCase();
  return allFiles.filter((p) => p.toLowerCase().includes(app));
}

function sh(args: string[], cwd: string): string {
  return execFileSync(args[0]!, args.slice(1), { cwd, encoding: 'utf-8' }).trim();
}

function tryGit(args: string[], cwd: string): { ok: true; output: string } | { ok: false; error: string } {
  try {
    return { ok: true, output: sh(['git', ...args], cwd) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function runLearnLoop(opts: LoopOpts): Promise<LoopSummary> {
  const startedAt = new Date().toISOString();
  const config = loadConfig();
  const scenario = loadScenario(opts.scenarioId);
  loadProfile(opts.profileId); // validate profile exists, throws if missing
  const iterations: IterationRecord[] = [];
  const acceptedEdits: ProposedEdit[] = [];
  let totalSpend = 0;

  // 1. Baseline run.
  log(`[learn] iter 0 (baseline): running ${opts.scenarioId} × ${opts.profileId}`);
  const baseline = await runSingle(opts.scenarioId, opts.profileId, config);
  totalSpend += baseline.agent_cost_usd + baseline.judge_cost_usd;
  iterations.push({
    iter: 0,
    status: 'baseline',
    result: baseline,
    cumulativeSpendUsd: totalSpend,
    note: `Baseline: score ${baseline.score.toFixed(2)}, cost $${(baseline.agent_cost_usd + baseline.judge_cost_usd).toFixed(2)}`,
  });

  let prev = baseline;
  let consecutiveNonImproving = 0;

  // 2. Loop.
  for (let iter = 1; iter <= opts.maxIters; iter++) {
    if (totalSpend >= opts.maxSpendUsd) {
      iterations.push({
        iter,
        status: 'budget-exceeded',
        cumulativeSpendUsd: totalSpend,
        note: `Stopped: cumulative spend $${totalSpend.toFixed(2)} ≥ cap $${opts.maxSpendUsd.toFixed(2)}`,
      });
      break;
    }

    log(`[learn] iter ${iter}: analyzing friction…`);
    const agentLog = readSafe(prev.agent_log_path);
    const friction = analyzeFriction(agentLog);

    // Pick sightmap files for the scenario's app.
    const profile = loadProfile(opts.profileId);
    const allFiles = profile.sightmap_files ?? [];
    const relevantFiles = relevantSightmapFiles(scenario, allFiles);
    if (relevantFiles.length === 0) {
      iterations.push({
        iter,
        status: 'no-edits-proposed',
        cumulativeSpendUsd: totalSpend,
        note: `No sightmap files match scenario.app="${scenario.app}".`,
      });
      break;
    }
    const sightmapFiles: Record<string, string> = {};
    for (const p of relevantFiles) {
      const abs = resolve(opts.repoRoot, p);
      sightmapFiles[p] = readFileSync(abs, 'utf-8');
    }

    log(`[learn] iter ${iter}: calling proposer…`);
    const proposal = await proposeEdits({
      scenarioId: opts.scenarioId,
      scenarioTask: scenario.task,
      score: prev.score,
      turns: prev.turns,
      agentCostUsd: prev.agent_cost_usd,
      frictionReport: friction,
      sightmapFiles,
      model: opts.proposerModel,
    });
    totalSpend += proposal.costUsd;

    if (proposal.edits.length === 0) {
      iterations.push({
        iter,
        status: 'no-edits-proposed',
        proposal,
        cumulativeSpendUsd: totalSpend,
        note: `Proposer returned no edits. Plan: ${proposal.plan.slice(0, 200)}`,
      });
      break;
    }

    log(`[learn] iter ${iter}: applying ${proposal.edits.length} proposed edit(s)…`);
    const apply = applyEdits(proposal.edits, opts.repoRoot);
    const appliedCount = apply.outcomes.filter((o) => o.applied).length;
    if (appliedCount === 0) {
      iterations.push({
        iter,
        status: 'no-edits-applied',
        proposal,
        apply,
        cumulativeSpendUsd: totalSpend,
        note: `${proposal.edits.length} proposed but 0 applied (skipped due to duplicates / target-not-found).`,
      });
      break;
    }

    log(`[learn] iter ${iter}: re-running ${opts.scenarioId} × ${opts.profileId}…`);
    const next = await runSingle(opts.scenarioId, opts.profileId, config);
    totalSpend += next.agent_cost_usd + next.judge_cost_usd;

    if (isImprovement(prev, next)) {
      acceptedEdits.push(...proposal.edits.filter((e) => apply.outcomes.find((o) => o.edit === e)?.applied));
      // Optional git commit. Best-effort — bench runs without git auth/setup
      // shouldn't block the loop.
      const commitMsg = `autoresearch iter ${iter} on ${opts.scenarioId}: ${proposal.plan.slice(0, 60)}`;
      tryGit(['add', ...apply.filesChanged], opts.repoRoot);
      tryGit(['commit', '-m', commitMsg], opts.repoRoot);
      iterations.push({
        iter,
        status: 'kept',
        proposal,
        apply,
        result: next,
        cumulativeSpendUsd: totalSpend,
        note: `Improvement: score ${prev.score.toFixed(2)} → ${next.score.toFixed(2)}, cost $${(prev.agent_cost_usd + prev.judge_cost_usd).toFixed(2)} → $${(next.agent_cost_usd + next.judge_cost_usd).toFixed(2)}`,
      });
      prev = next;
      consecutiveNonImproving = 0;
    } else {
      // Revert: best-effort git restore. If git isn't tracking, we lose
      // the rollback — surface that in the note rather than failing.
      const restored = apply.filesChanged.map((p) =>
        tryGit(['checkout', 'HEAD', '--', p], opts.repoRoot),
      );
      const reverted = restored.every((r) => r.ok);
      iterations.push({
        iter,
        status: 'reverted',
        proposal,
        apply,
        result: next,
        cumulativeSpendUsd: totalSpend,
        note:
          `No improvement: score ${prev.score.toFixed(2)} → ${next.score.toFixed(2)}, cost $${(prev.agent_cost_usd + prev.judge_cost_usd).toFixed(2)} → $${(next.agent_cost_usd + next.judge_cost_usd).toFixed(2)}. ` +
          (reverted ? 'Reverted via git.' : 'Revert FAILED — files left modified.'),
      });
      consecutiveNonImproving++;
      if (consecutiveNonImproving >= opts.patience) {
        iterations.push({
          iter: iter + 1,
          status: 'patience-exhausted',
          cumulativeSpendUsd: totalSpend,
          note: `${consecutiveNonImproving} consecutive non-improving iterations. Stopping.`,
        });
        break;
      }
    }
  }

  const endedAt = new Date().toISOString();
  const summary: LoopSummary = {
    scenarioId: opts.scenarioId,
    profileId: opts.profileId,
    iterations,
    baseline,
    final: prev,
    acceptedEdits,
    totalSpendUsd: totalSpend,
    startedAt,
    endedAt,
  };

  if (opts.journalPath) {
    writeJournal(opts.journalPath, summary);
  }
  return summary;
}

function readSafe(path: string): string {
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return '';
  }
}

function log(s: string): void {
  process.stdout.write(s + '\n');
}

function writeJournal(path: string, s: LoopSummary): void {
  const lines: string[] = [];
  lines.push(`# Autoresearch journal — ${s.scenarioId} × ${s.profileId}`);
  lines.push('');
  lines.push(`Started: ${s.startedAt}  •  Ended: ${s.endedAt}`);
  lines.push(`Total spend: $${s.totalSpendUsd.toFixed(2)}`);
  lines.push('');
  lines.push(`## Baseline → final`);
  lines.push('');
  lines.push(`- Score: ${s.baseline.score.toFixed(2)} → ${s.final.score.toFixed(2)} (Δ ${(s.final.score - s.baseline.score).toFixed(2)})`);
  lines.push(`- Turns: ${s.baseline.turns} → ${s.final.turns} (Δ ${s.final.turns - s.baseline.turns})`);
  lines.push(`- Tokens: ${s.baseline.total_tokens.toLocaleString()} → ${s.final.total_tokens.toLocaleString()}`);
  const baseCost = s.baseline.agent_cost_usd + s.baseline.judge_cost_usd;
  const finalCost = s.final.agent_cost_usd + s.final.judge_cost_usd;
  lines.push(`- Per-run cost: $${baseCost.toFixed(2)} → $${finalCost.toFixed(2)} (Δ $${(finalCost - baseCost).toFixed(2)})`);
  lines.push('');
  lines.push(`## Accepted edits (${s.acceptedEdits.length})`);
  lines.push('');
  for (const [i, e] of s.acceptedEdits.entries()) {
    lines.push(`${i + 1}. **[${e.kind}]** ${e.file}`);
    lines.push(`   - Why: ${e.rationale}`);
    lines.push(`   - Payload: \`${JSON.stringify(e.payload).slice(0, 160)}\``);
    lines.push('');
  }
  lines.push('## Iterations');
  lines.push('');
  for (const it of s.iterations) {
    lines.push(`### Iter ${it.iter} — ${it.status}`);
    lines.push('');
    lines.push(it.note);
    if (it.proposal) {
      lines.push('');
      lines.push(`Plan: ${it.proposal.plan}`);
      lines.push('');
      lines.push(`Proposed ${it.proposal.edits.length} edit(s):`);
      for (const e of it.proposal.edits) {
        lines.push(`- [${e.kind}] ${e.file}: ${e.rationale.slice(0, 200)}`);
      }
    }
    lines.push('');
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, lines.join('\n'));
}

// Re-export utility for tests.
export { resolve as _resolve, join as _join };
