import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseJudgeResponse } from '../judge.js';

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
