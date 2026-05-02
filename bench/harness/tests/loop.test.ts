import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isImprovement, relevantSightmapFiles } from '../learn/loop.js';
import type { RunResult, Scenario } from '../types.js';

function mk(overrides: Partial<RunResult>): RunResult {
  return {
    spec_id: 's-p',
    scenario_id: 's',
    profile_id: 'p',
    model: 'sonnet',
    timestamp: '',
    git_sha: '',
    score: 0,
    turns: 0,
    total_input_tokens: 0,
    total_output_tokens: 0,
    total_tokens: 0,
    wall_time_ms: 0,
    action_time_ms: 0,
    llm_time_ms: 0,
    error_count: 0,
    recovery_turns: 0,
    steps: [],
    judge_reasoning: '',
    agent_log_path: '',
    agent_cost_usd: 0,
    judge_cost_usd: 0,
    timed_out: false,
    ...overrides,
  };
}

describe('isImprovement', () => {
  it('strict score increase counts as improvement', () => {
    assert.strictEqual(isImprovement(mk({ score: 0.85 }), mk({ score: 0.90 })), true);
  });

  it('score decrease is NOT an improvement even if cheaper', () => {
    assert.strictEqual(
      isImprovement(
        mk({ score: 0.85, agent_cost_usd: 0.50 }),
        mk({ score: 0.80, agent_cost_usd: 0.20 }),
      ),
      false,
    );
  });

  it('same score with lower cost IS an improvement', () => {
    assert.strictEqual(
      isImprovement(
        mk({ score: 0.85, agent_cost_usd: 0.50 }),
        mk({ score: 0.85, agent_cost_usd: 0.40 }),
      ),
      true,
    );
  });

  it('same score with same cost is NOT an improvement', () => {
    assert.strictEqual(
      isImprovement(
        mk({ score: 0.85, agent_cost_usd: 0.50 }),
        mk({ score: 0.85, agent_cost_usd: 0.50 }),
      ),
      false,
    );
  });

  it('treats tiny score differences within epsilon as equal', () => {
    // Score 0.8500001 vs 0.85 — judge LLM returns floats with noise; we
    // shouldn't treat this as an improvement on score alone.
    assert.strictEqual(
      isImprovement(
        mk({ score: 0.85, agent_cost_usd: 0.50 }),
        mk({ score: 0.8500001, agent_cost_usd: 0.50 }),
      ),
      false,
    );
  });
});

describe('relevantSightmapFiles', () => {
  function mkScenario(app: string): Scenario {
    return {
      id: 'x', description: '', app, tags: [], task: '', acceptance_criteria: '', profiles: [],
    };
  }

  it('selects only files whose path contains the scenario app name', () => {
    const all = [
      'bench/apps/.sightmap/todo.yaml',
      'bench/apps/.sightmap/topwork.yaml',
      'bench/apps/apps/medcart/.sightmap/medcart.yaml',
    ];
    assert.deepStrictEqual(
      relevantSightmapFiles(mkScenario('todo'), all),
      ['bench/apps/.sightmap/todo.yaml'],
    );
    assert.deepStrictEqual(
      relevantSightmapFiles(mkScenario('topwork'), all),
      ['bench/apps/.sightmap/topwork.yaml'],
    );
    assert.deepStrictEqual(
      relevantSightmapFiles(mkScenario('medcart'), all),
      ['bench/apps/apps/medcart/.sightmap/medcart.yaml'],
    );
  });

  it('returns empty when no file matches the app', () => {
    assert.deepStrictEqual(
      relevantSightmapFiles(mkScenario('nonesuch'), ['bench/apps/.sightmap/todo.yaml']),
      [],
    );
  });

  it('is case-insensitive', () => {
    assert.deepStrictEqual(
      relevantSightmapFiles(mkScenario('TODO'), ['bench/apps/.sightmap/todo.yaml']),
      ['bench/apps/.sightmap/todo.yaml'],
    );
  });
});
