// Orchestrator — wires CLI commands to runner, judge, and comparison modules.
// Stubbed here; fully implemented in Task 8.

import type { BenchConfig, RunResult } from './types.js';

export async function runSingle(
  scenarioId: string,
  profileId: string,
  config: BenchConfig,
): Promise<RunResult> {
  throw new Error(`Not yet implemented: runSingle(${scenarioId}, ${profileId})`);
}

export async function runScenario(
  scenarioId: string,
  profileIds: string[] | undefined,
  config: BenchConfig,
): Promise<RunResult[]> {
  throw new Error(`Not yet implemented: runScenario(${scenarioId})`);
}

export async function runSuite(
  suiteId: string,
  config: BenchConfig,
): Promise<void> {
  throw new Error(`Not yet implemented: runSuite(${suiteId})`);
}
