#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { loadConfig, loadScenario, loadSuite, listScenarios, listProfiles } from './config.js';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    profile: { type: 'string', short: 'p' },
    model: { type: 'string', short: 'm' },
    iterations: { type: 'string', short: 'n', default: '1' },
    help: { type: 'boolean', short: 'h' },
  },
});

const [command, ...args] = positionals;

async function main() {
  const config = loadConfig();

  if (values.help || command === undefined) {
    console.log(`
Subtext Bench — Browser Automation Benchmark Harness

Usage:
  bench list                          List scenarios and profiles
  bench run <scenario> [--profile p]  Run a single scenario
  bench suite <suite-id>              Run all scenarios in a suite
  bench compare                       Compare latest run against baseline
  bench baseline pin|show             Pin or show baseline
  bench optimize [--iterations N]     Auto-optimize loop

Options:
  -p, --profile <id>    Run against a specific profile
  -m, --model <name>    Override the default model
  -n, --iterations <n>  Number of optimize iterations (default: 1)
  -h, --help            Show this help
    `);
    return;
  }

  switch (command) {
    case 'list': {
      const scenarios = listScenarios();
      const profiles = listProfiles();
      console.log('Scenarios:');
      for (const s of scenarios) {
        console.log(`  ${s}`);
      }
      console.log('');
      console.log('Profiles:');
      for (const p of profiles) {
        console.log(`  ${p}`);
      }
      break;
    }

    case 'run': {
      const scenarioId = args[0];
      if (!scenarioId) { console.error('Usage: bench run <scenario-id> [--profile <id>]'); process.exit(1); }
      const scenario = loadScenario(scenarioId);
      const profileId = values.profile;
      const profiles = profileId ? [profileId] : scenario.profiles;
      console.log(`Running ${scenarioId} against profiles: ${profiles.join(', ')}`);
      // Delegate to orchestrator (wired in Task 8)
      const { runScenario } = await import('./orchestrator.js');
      await runScenario(scenarioId, profileId ? [profileId] : undefined, config);
      break;
    }

    case 'suite': {
      const suiteId = args[0];
      if (!suiteId) { console.error('Usage: bench suite <suite-id>'); process.exit(1); }
      const suite = loadSuite(suiteId);
      console.log(`Running suite "${suiteId}": ${suite.scenarios.length} scenarios`);
      const { runSuite } = await import('./orchestrator.js');
      await runSuite(suiteId, config);
      break;
    }

    case 'compare':
      console.log('TODO: compare latest run against baseline');
      break;

    case 'baseline':
      console.log('TODO: baseline pin/show');
      break;

    case 'optimize':
      console.log('TODO: auto-optimize loop');
      break;

    default:
      console.error(`Unknown command: ${command}. Run with --help for usage.`);
      process.exit(1);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
