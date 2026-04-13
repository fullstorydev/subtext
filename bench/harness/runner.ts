// Runner interface and dispatch

import type { Profile, Scenario, RunResult, BenchConfig } from './types.js';

export interface Runner {
  run(scenario: Scenario, profile: Profile, config: BenchConfig): Promise<RunResult>;
}

export async function getRunner(profile: Profile): Promise<Runner> {
  switch (profile.runner) {
    case 'claude-mcp': {
      const { ClaudeMcpRunner } = await import('./runners/claude-mcp.js');
      return new ClaudeMcpRunner();
    }
    case 'stagehand': {
      // Stagehand runner is out of scope for this implementation phase.
      throw new Error('Stagehand runner not yet implemented');
    }
    case 'agent-browser': {
      // Agent-browser runner is out of scope for this implementation phase.
      throw new Error('Agent-browser runner not yet implemented');
    }
    default:
      throw new Error(`Unknown runner: ${profile.runner}`);
  }
}
