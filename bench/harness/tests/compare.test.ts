import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildComparison } from '../compare.js';
import { formatComparison, formatSingleRun } from '../format.js';
import type { RunResult } from '../types.js';

function makeResult(overrides: Partial<RunResult> = {}): RunResult {
  return {
    spec_id: 'todo-001-playwright-mcp',
    scenario_id: 'todo-001',
    profile_id: 'playwright-mcp',
    model: 'sonnet',
    timestamp: '2026-04-13T00:00:00Z',
    git_sha: 'abc123',
    score: 0.9,
    turns: 15,
    total_input_tokens: 20000,
    total_output_tokens: 5000,
    total_tokens: 25000,
    wall_time_ms: 60000,
    action_time_ms: 5000,
    llm_time_ms: 55000,
    error_count: 0,
    recovery_turns: 0,
    steps: [],
    judge_reasoning: 'Good',
    agent_log_path: '/tmp/test.log',
    ...overrides,
  };
}

describe('buildComparison', () => {
  it('builds comparison rows from results', () => {
    const results = [makeResult()];
    const comparison = buildComparison(results, 'test-suite');
    assert.strictEqual(comparison.rows.length, 1);
    assert.strictEqual(comparison.rows[0].scenario_id, 'todo-001');
    assert.strictEqual(comparison.rows[0].profile_id, 'playwright-mcp');
    // efficiency = 0.9 / (25000 / 1000) = 0.9 / 25 = 0.036
    assert.ok(Math.abs(comparison.rows[0].efficiency - 0.036) < 0.001);
  });

  it('handles multiple results across scenarios and profiles', () => {
    const results = [
      makeResult(),
      makeResult({ spec_id: 'todo-001-subtext-local', profile_id: 'subtext-local', score: 0.95, turns: 8, total_tokens: 12000 }),
      makeResult({ spec_id: 'topwork-001-playwright-mcp', scenario_id: 'topwork-001', score: 0.85, turns: 20, total_tokens: 40000 }),
    ];
    const comparison = buildComparison(results, 'trained');
    assert.strictEqual(comparison.rows.length, 3);
    assert.strictEqual(comparison.suite_id, 'trained');
  });

  it('handles zero tokens without NaN', () => {
    const results = [makeResult({ total_tokens: 0 })];
    const comparison = buildComparison(results, 'test');
    assert.strictEqual(comparison.rows[0].efficiency, 0);
  });
});

describe('formatComparison', () => {
  it('produces formatted table with scenario and profile', () => {
    const comparison = {
      suite_id: 'test',
      timestamp: '2026-04-13T00:00:00Z',
      rows: [{
        scenario_id: 'todo-001',
        profile_id: 'playwright-mcp',
        score: 0.9,
        turns: 15,
        total_tokens: 25000,
        wall_time_ms: 60000,
        efficiency: 36,
      }],
    };
    const output = formatComparison(comparison);
    assert.ok(output.includes('todo-001'));
    assert.ok(output.includes('playwright-mcp'));
    assert.ok(output.includes('0.90'));
    assert.ok(output.includes('25.0K'));
  });

  it('groups rows by scenario', () => {
    const comparison = {
      suite_id: 'trained',
      timestamp: '2026-04-13T00:00:00Z',
      rows: [
        { scenario_id: 'todo-001', profile_id: 'playwright-mcp', score: 0.9, turns: 15, total_tokens: 25000, wall_time_ms: 60000, efficiency: 36 },
        { scenario_id: 'todo-001', profile_id: 'subtext-local', score: 0.95, turns: 8, total_tokens: 12000, wall_time_ms: 34000, efficiency: 79.2 },
      ],
    };
    const output = formatComparison(comparison);
    // The subtext-local row should come first (higher efficiency)
    const subtextIndex = output.indexOf('subtext-local');
    const playwrightIndex = output.indexOf('playwright-mcp');
    assert.ok(subtextIndex < playwrightIndex, 'Higher efficiency profile should appear first');
  });

  it('shows baseline delta when baseline exists', () => {
    const comparison = {
      suite_id: 'trained',
      timestamp: '2026-04-13T00:00:00Z',
      rows: [
        { scenario_id: 'todo-001', profile_id: 'subtext-local', score: 0.95, turns: 8, total_tokens: 12000, wall_time_ms: 34000, efficiency: 79.2 },
      ],
      baseline: [
        { scenario_id: 'todo-001', profile_id: 'subtext-local', score: 0.90, turns: 10, total_tokens: 15000, wall_time_ms: 40000, efficiency: 60 },
      ],
    };
    const output = formatComparison(comparison);
    assert.ok(output.includes('vs baseline'));
    assert.ok(output.includes('subtext-local avg'));
  });
});

describe('formatSingleRun', () => {
  it('formats a single run summary', () => {
    const output = formatSingleRun('todo-001', 'playwright-mcp', 0.9, 15, 25000, 60000, 1);
    assert.ok(output.includes('todo-001'));
    assert.ok(output.includes('playwright-mcp'));
    assert.ok(output.includes('0.90'));
    assert.ok(output.includes('15'));
    assert.ok(output.includes('1.0m'));
    assert.ok(output.includes('1'));
  });
});
