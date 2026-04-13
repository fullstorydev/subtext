import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getRunner } from '../runner.js';
import { parseClaudeOutput, parseTimeout } from '../runners/claude-mcp.js';

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
