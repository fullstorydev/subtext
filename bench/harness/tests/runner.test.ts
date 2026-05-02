import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getRunner } from '../runner.js';
import { parseClaudeOutput, parseTimeout, buildPrompt, applyTemplate } from '../runners/claude-mcp.js';
import type { Scenario, Profile, BenchConfig } from '../types.js';

describe('getRunner', () => {
  it('returns ClaudeMcpRunner for claude-mcp profile', async () => {
    const runner = await getRunner({ id: 'test', runner: 'claude-mcp', prompt_insert: '', tags: [] });
    assert.ok(runner);
    assert.ok(typeof runner.run === 'function');
  });

  it('throws for stagehand runner (not implemented)', async () => {
    await assert.rejects(
      () => getRunner({ id: 'test', runner: 'stagehand', prompt_insert: '', tags: [] }),
      /not yet implemented/
    );
  });

  it('throws for agent-browser runner (not implemented)', async () => {
    await assert.rejects(
      () => getRunner({ id: 'test', runner: 'agent-browser', prompt_insert: '', tags: [] }),
      /not yet implemented/
    );
  });

  it('throws for unknown runner', async () => {
    await assert.rejects(
      () => getRunner({ id: 'test', runner: 'nonexistent', prompt_insert: '', tags: [] }),
      /Unknown runner/
    );
  });
});

describe('parseClaudeOutput', () => {
  it('parses stream-json output for turns and tokens', () => {
    const output = [
      '{"type":"assistant","content":"Hello"}',
      '{"type":"tool_use","name":"snapshot"}',
      '{"type":"tool_result","content":"ok"}',
      '{"type":"assistant","content":"Done"}',
      '{"type":"result","input_tokens":5000,"output_tokens":1200}',
    ].join('\n');

    const result = parseClaudeOutput(output);
    assert.strictEqual(result.turns, 2);
    assert.strictEqual(result.inputTokens, 5000);
    assert.strictEqual(result.outputTokens, 1200);
    assert.strictEqual(result.errorCount, 0);
  });

  it('counts error tool results', () => {
    const output = [
      '{"type":"assistant","content":"trying"}',
      '{"type":"tool_result","content":"failed","is_error":true}',
      '{"type":"assistant","content":"retrying"}',
      '{"type":"tool_result","content":"ok"}',
      '{"type":"result","input_tokens":3000,"output_tokens":800}',
    ].join('\n');

    const result = parseClaudeOutput(output);
    assert.strictEqual(result.turns, 2);
    assert.strictEqual(result.errorCount, 1);
  });

  it('handles empty output', () => {
    const result = parseClaudeOutput('');
    assert.strictEqual(result.turns, 0);
    assert.strictEqual(result.inputTokens, 0);
    assert.strictEqual(result.outputTokens, 0);
  });

  it('skips non-JSON lines', () => {
    const output = 'some text\n{"type":"assistant","content":"ok"}\nmore text\n';
    const result = parseClaudeOutput(output);
    assert.strictEqual(result.turns, 1);
  });

  it('sums tokens across assistant events (per-turn schema)', () => {
    const output = [
      JSON.stringify({ type: 'assistant', message: { content: [], usage: { input_tokens: 50, output_tokens: 200 } } }),
      JSON.stringify({ type: 'assistant', message: { content: [], usage: { input_tokens: 30, output_tokens: 150 } } }),
      JSON.stringify({ type: 'assistant', message: { content: [], usage: { input_tokens: 20, output_tokens: 100 } } }),
      JSON.stringify({ type: 'result', usage: { input_tokens: 20, output_tokens: 100 } }),
    ].join('\n');
    const result = parseClaudeOutput(output);
    assert.strictEqual(result.turns, 3);
    // Per-turn sum: 50+30+20=100 input, 200+150+100=450 output. NOT 20/100
    // (which is what reading result.usage alone would give — that's just
    // the LAST turn's input_tokens, not the session total).
    assert.strictEqual(result.inputTokens, 100);
    assert.strictEqual(result.outputTokens, 450);
  });

  it('also sums cache_read and cache_creation tokens per turn', () => {
    const output = [
      JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 5, output_tokens: 100, cache_read_input_tokens: 1000, cache_creation_input_tokens: 500 } } }),
      JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 5, output_tokens: 200, cache_read_input_tokens: 2000, cache_creation_input_tokens: 0 } } }),
    ].join('\n');
    const result = parseClaudeOutput(output);
    assert.strictEqual(result.cacheReadTokens, 3000);
    assert.strictEqual(result.cacheCreationTokens, 500);
  });

  it('falls back to result.usage when no assistant usage is present (legacy)', () => {
    const output = '{"type":"result","usage":{"input_tokens":100,"output_tokens":200,"cache_read_input_tokens":50}}';
    const result = parseClaudeOutput(output);
    assert.strictEqual(result.inputTokens, 100);
    assert.strictEqual(result.outputTokens, 200);
    assert.strictEqual(result.cacheReadTokens, 50);
  });

  it('falls back to top-level input_tokens for very old result events', () => {
    const output = '{"type":"result","input_tokens":100,"output_tokens":200}';
    const result = parseClaudeOutput(output);
    assert.strictEqual(result.inputTokens, 100);
    assert.strictEqual(result.outputTokens, 200);
  });

  it('extracts total_cost_usd from the result event', () => {
    const output = '{"type":"result","total_cost_usd":0.4267,"usage":{"input_tokens":100,"output_tokens":2000}}';
    const result = parseClaudeOutput(output);
    assert.strictEqual(result.costUsd, 0.4267);
  });

  it('returns 0 cost when result event has no total_cost_usd', () => {
    const output = '{"type":"result","usage":{"input_tokens":100,"output_tokens":2000}}';
    const result = parseClaudeOutput(output);
    assert.strictEqual(result.costUsd, 0);
  });
});

describe('buildPrompt', () => {
  it('replaces {{app_base_url}} template variable', () => {
    const scenario: Scenario = {
      id: 'test-001',
      description: 'test',
      app: 'todo',
      tags: [],
      task: 'Navigate to {{app_base_url}}/apps/todo/ and do stuff at {{app_base_url}}/other',
      acceptance_criteria: 'done',
      profiles: [],
    };
    const profile: Profile = {
      id: 'test-profile',
      runner: 'claude-mcp',
      prompt_insert: '',
      tags: [],
    };
    const config: BenchConfig = {
      model: 'sonnet',
      judge_model: 'haiku',
      timeout: '10m',
      max_budget: 3,
      app_port: 5173,
      app_base_url: 'http://localhost:9999',
    };

    const prompt = buildPrompt(scenario, profile, config);
    assert.ok(prompt.includes('http://localhost:9999/apps/todo/'), 'First occurrence should be replaced');
    assert.ok(prompt.includes('http://localhost:9999/other'), 'Second occurrence should be replaced');
    assert.ok(!prompt.includes('{{app_base_url}}'), 'No template variables should remain');
  });
});

describe('applyTemplate', () => {
  it('replaces single occurrences of named variables', () => {
    const out = applyTemplate('hello {{name}}', { name: 'world' });
    assert.strictEqual(out, 'hello world');
  });

  it('replaces all occurrences of the same variable', () => {
    const out = applyTemplate('{{x}}-{{x}}-{{x}}', { x: 'a' });
    assert.strictEqual(out, 'a-a-a');
  });

  it('replaces REPO_ROOT in mcp_config-style strings', () => {
    const tpl = '{"args":["--dir","{{REPO_ROOT}}/bench/apps/.sightmap"]}';
    const out = applyTemplate(tpl, { REPO_ROOT: '/abs/path/to/repo' });
    assert.strictEqual(out, '{"args":["--dir","/abs/path/to/repo/bench/apps/.sightmap"]}');
    assert.ok(!out.includes('{{REPO_ROOT}}'), 'placeholder should be gone');
  });

  it('leaves unknown placeholders untouched', () => {
    const out = applyTemplate('{{a}} and {{b}}', { a: '1' });
    assert.strictEqual(out, '1 and {{b}}');
  });
});

describe('parseTimeout', () => {
  it('parses seconds', () => {
    assert.strictEqual(parseTimeout('30s'), 30_000);
  });

  it('parses minutes', () => {
    assert.strictEqual(parseTimeout('10m'), 600_000);
  });

  it('parses hours', () => {
    assert.strictEqual(parseTimeout('1h'), 3_600_000);
  });

  it('returns default for invalid format', () => {
    assert.strictEqual(parseTimeout('invalid'), 600_000);
  });
});
