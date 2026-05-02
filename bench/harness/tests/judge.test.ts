import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseJudgeResponse, digestAgentOutput, computeJudgeCost } from '../judge.js';

describe('parseJudgeResponse', () => {
  it('parses valid JSON response', () => {
    const text = JSON.stringify({
      score: 0.85,
      criteria: [
        { criterion: 'Added todos', passed: true, reason: 'All 3 added' },
        { criterion: 'Filtered', passed: false, reason: 'Skipped filter step' },
      ],
      reasoning: 'Good overall but missed the filter step',
    });

    const result = parseJudgeResponse(text);
    assert.strictEqual(result.score, 0.85);
    assert.strictEqual(result.reasoning, 'Good overall but missed the filter step');
    assert.strictEqual(result.criteria!.length, 2);
    assert.strictEqual(result.criteria![0].passed, true);
    assert.strictEqual(result.criteria![1].passed, false);
  });

  it('parses JSON wrapped in markdown code fences', () => {
    const text = '```json\n{"score": 0.95, "reasoning": "Excellent"}\n```';
    const result = parseJudgeResponse(text);
    assert.strictEqual(result.score, 0.95);
    assert.strictEqual(result.reasoning, 'Excellent');
  });

  it('extracts score from malformed JSON', () => {
    const text = 'Here is the result: "score": 0.7, and some extra text';
    const result = parseJudgeResponse(text);
    assert.strictEqual(result.score, 0.7);
  });

  it('returns 0 for completely unparseable text', () => {
    const text = 'This is just plain text with no score';
    const result = parseJudgeResponse(text);
    assert.strictEqual(result.score, 0);
    assert.strictEqual(result.reasoning, text);
  });

  it('clamps score to 0-1 range', () => {
    const text = JSON.stringify({ score: 1.5, reasoning: 'over' });
    const result = parseJudgeResponse(text);
    assert.strictEqual(result.score, 1);
  });

  it('clamps negative score to 0', () => {
    const text = JSON.stringify({ score: -0.5, reasoning: 'negative' });
    const result = parseJudgeResponse(text);
    assert.strictEqual(result.score, 0);
  });
});

describe('judgeRun', () => {
  it('module exports judgeRun function', async () => {
    const { judgeRun } = await import('../judge.js');
    assert.ok(typeof judgeRun === 'function');
  });
});

describe('digestAgentOutput', () => {
  it('extracts the final result text and tool counts', () => {
    const log = [
      JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'Step 1: navigating' },
            { type: 'tool_use', name: 'mcp__sightmap__sightmap_match', input: {} },
          ],
        },
      }),
      JSON.stringify({
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', name: 'mcp__sightmap__browser_click', input: {} }],
        },
      }),
      JSON.stringify({
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', name: 'mcp__sightmap__browser_click', input: {} }],
        },
      }),
      JSON.stringify({
        type: 'result',
        result: 'Final state: 5 active items, no completed items. Done!',
      }),
    ].join('\n');

    const digest = digestAgentOutput(log, 50_000);
    assert.match(digest, /Final state: 5 active items/);
    assert.match(digest, /sightmap_match: 1/);
    assert.match(digest, /browser_click: 2/);
    assert.match(digest, /Tool errors: 0/);
    assert.match(digest, /Step 1: navigating/);
  });

  it('counts tool errors from user/tool_result events', () => {
    const log = [
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'X', input: {} }] } }),
      JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', is_error: true, content: 'oops' }] } }),
      JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', is_error: true, content: 'oops' }] } }),
      JSON.stringify({ type: 'result', result: 'done' }),
    ].join('\n');
    const digest = digestAgentOutput(log, 50_000);
    assert.match(digest, /Tool errors: 2/);
  });

  it('returns empty string when no JSON parses (caller falls back)', () => {
    const log = 'not valid json\nmore garbage\n';
    assert.strictEqual(digestAgentOutput(log, 50_000), '');
  });

  it('keeps the final result in full even when narration is huge', () => {
    const giantText = 'x'.repeat(40_000);
    const log = [
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: giantText }] } }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: giantText }] } }),
      JSON.stringify({ type: 'result', result: 'FINAL_MARKER_TEXT' }),
    ].join('\n');
    const digest = digestAgentOutput(log, 50_000);
    assert.match(digest, /FINAL_MARKER_TEXT/);
    assert.ok(digest.length <= 50_000, `digest must respect maxLen, got ${digest.length}`);
  });
});

describe('computeJudgeCost', () => {
  it('prices a haiku call from input + output tokens', () => {
    // Haiku 4.5: $1 / $5 per Mtok
    const cost = computeJudgeCost('claude-haiku-4-5-20251001', {
      input_tokens: 1_000,
      output_tokens: 1_000,
    });
    // 1000 * (1 + 5) / 1e6 = 0.006
    assert.strictEqual(Number(cost.toFixed(4)), 0.006);
  });

  it('prices cache reads/writes at the discounted rate', () => {
    // Haiku: cache_read 0.10, cache_write 1.25 per Mtok
    const cost = computeJudgeCost('claude-haiku-4-5-20251001', {
      cache_read_input_tokens: 100_000,
      cache_creation_input_tokens: 100_000,
    });
    // 100k * 0.10 / 1e6 + 100k * 1.25 / 1e6 = 0.01 + 0.125 = 0.135
    assert.strictEqual(Number(cost.toFixed(4)), 0.135);
  });

  it('returns 0 for an unknown model rather than guessing', () => {
    const cost = computeJudgeCost('claude-some-future-model', {
      input_tokens: 999_999_999,
    });
    assert.strictEqual(cost, 0);
  });

  it('handles missing fields gracefully', () => {
    assert.strictEqual(computeJudgeCost('claude-haiku-4-5-20251001', {}), 0);
  });
});
