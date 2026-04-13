import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import yaml from 'js-yaml';
import type { BenchConfig, Profile, Scenario, Suite } from './types.js';

// At runtime, this file lives at build/harness/config.js, so go up two levels.
const BENCH_ROOT = resolve(import.meta.dirname, '..', '..');

export function loadConfig(): BenchConfig {
  const configPath = join(BENCH_ROOT, 'bench.config.yaml');
  if (!existsSync(configPath)) {
    return {
      model: 'sonnet',
      judge_model: 'haiku',
      timeout: '10m',
      max_budget: 3,
      app_port: 5173,
      app_base_url: 'http://localhost:5173',
    };
  }
  return yaml.load(readFileSync(configPath, 'utf-8')) as BenchConfig;
}

export function loadProfile(id: string): Profile {
  const profilePath = join(BENCH_ROOT, 'profiles', `${id}.yaml`);
  if (!existsSync(profilePath)) {
    throw new Error(`Profile not found: ${id} (looked at ${profilePath})`);
  }
  const raw = yaml.load(readFileSync(profilePath, 'utf-8')) as Profile;
  return { ...raw, id };
}

export function loadScenario(id: string): Scenario {
  const scenarioPath = join(BENCH_ROOT, 'scenarios', `${id}.yaml`);
  if (!existsSync(scenarioPath)) {
    throw new Error(`Scenario not found: ${id} (looked at ${scenarioPath})`);
  }
  const raw = yaml.load(readFileSync(scenarioPath, 'utf-8')) as Scenario;
  return { ...raw, id };
}

export function loadSuite(id: string): Suite {
  const suitesPath = join(BENCH_ROOT, 'scenarios', '_suites.yaml');
  const suites = yaml.load(readFileSync(suitesPath, 'utf-8')) as Record<string, Suite>;
  if (!suites[id]) {
    throw new Error(`Suite not found: ${id}`);
  }
  return { ...suites[id], id };
}

export function listScenarios(): string[] {
  const scenariosDir = join(BENCH_ROOT, 'scenarios');
  if (!existsSync(scenariosDir)) return [];
  return readdirSync(scenariosDir)
    .filter(f => f.endsWith('.yaml') && !f.startsWith('_'))
    .map(f => f.replace('.yaml', ''));
}

export function listProfiles(): string[] {
  const profilesDir = join(BENCH_ROOT, 'profiles');
  if (!existsSync(profilesDir)) return [];
  return readdirSync(profilesDir)
    .filter(f => f.endsWith('.yaml'))
    .map(f => f.replace('.yaml', ''));
}
