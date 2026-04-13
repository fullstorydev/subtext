// Orchestrator — wires CLI commands to runner, judge, and comparison modules.

import { readFileSync } from 'node:fs';
import type { BenchConfig, RunResult } from './types.js';
import { loadConfig, loadScenario, loadProfile, loadSuite } from './config.js';
import { getRunner } from './runner.js';
import { judgeRun } from './judge.js';
import { saveResult, buildComparison } from './compare.js';
import { formatComparison, formatSingleRun } from './format.js';

export async function runSingle(
  scenarioId: string,
  profileId: string,
  config: BenchConfig,
): Promise<RunResult> {
  const scenario = loadScenario(scenarioId);
  const profile = loadProfile(profileId);
  const runner = await getRunner(profile);

  console.log(`Running ${scenarioId} x ${profileId}...`);
  const result = await runner.run(scenario, profile, config);

  // Judge the result
  console.log(`Judging ${scenarioId} x ${profileId}...`);
  let agentOutput: string;
  try {
    agentOutput = readFileSync(result.agent_log_path, 'utf-8');
  } catch {
    agentOutput = '[Agent log not available - runner may have timed out]';
  }
  const judgeResult = await judgeRun(result, scenario, agentOutput, config.judge_model);
  result.score = judgeResult.score;
  result.judge_reasoning = judgeResult.reasoning;

  // Save
  saveResult(result);

  // Print summary
  console.log(formatSingleRun(
    scenarioId,
    profileId,
    result.score,
    result.turns,
    result.total_tokens,
    result.wall_time_ms,
    result.error_count,
  ));

  return result;
}

export async function runScenario(
  scenarioId: string,
  profileIds: string[] | undefined,
  config: BenchConfig,
): Promise<RunResult[]> {
  const scenario = loadScenario(scenarioId);
  const profiles = profileIds ?? scenario.profiles;
  const results: RunResult[] = [];

  for (const profileId of profiles) {
    const result = await runSingle(scenarioId, profileId, config);
    results.push(result);
  }

  return results;
}

export async function runSuite(
  suiteId: string,
  config: BenchConfig,
): Promise<void> {
  const suite = loadSuite(suiteId);
  const allResults: RunResult[] = [];

  for (const scenarioId of suite.scenarios) {
    const results = await runScenario(scenarioId, undefined, config);
    allResults.push(...results);
  }

  const comparison = buildComparison(allResults, suiteId);
  console.log('\n' + formatComparison(comparison));
}
