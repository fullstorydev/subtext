import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseProposerResponse, buildUserMessage } from '../learn/proposer.js';
import type { FrictionReport } from '../learn/friction.js';

const emptyFriction: FrictionReport = {
  totalToolCalls: 0,
  toolCounts: [],
  errorCount: 0,
  ratios: { sightmapAware: 0, runCodeBypass: 0, evaluateInspection: 0 },
  signals: [],
  successfulComponents: [],
  rawSelectorUses: [],
  sightmapToolErrors: [],
};

describe('parseProposerResponse', () => {
  it('parses a clean JSON object', () => {
    const text = JSON.stringify({
      plan: 'Add NewTodoInput component since the agent kept reaching for .new-todo',
      edits: [
        {
          file: 'bench/apps/.sightmap/todo.yaml',
          kind: 'add-component',
          rationale: 'Agent used .new-todo selector 3 times.',
          payload: {
            kind: 'add-component',
            scope: 'global',
            component: { name: 'NewTodoInput', selector: '.new-todo' },
          },
        },
      ],
    });
    const r = parseProposerResponse(text);
    assert.strictEqual(r.edits.length, 1);
    assert.strictEqual(r.edits[0].kind, 'add-component');
    assert.match(r.plan, /NewTodoInput/);
  });

  it('strips markdown code fences if present', () => {
    const text = '```json\n{"plan":"x","edits":[]}\n```';
    const r = parseProposerResponse(text);
    assert.strictEqual(r.plan, 'x');
    assert.strictEqual(r.edits.length, 0);
  });

  it('returns empty edits on malformed JSON rather than throwing', () => {
    const r = parseProposerResponse('not json at all { broken');
    assert.strictEqual(r.edits.length, 0);
    assert.strictEqual(r.plan, '');
  });

  it('drops edits missing required fields', () => {
    const text = JSON.stringify({
      plan: 'p',
      edits: [
        { file: 'x.yaml', kind: 'add-memory', rationale: 'r', payload: { kind: 'add-memory', scope: 'file', text: 'note' } },
        { file: 'x.yaml' /* missing kind/rationale/payload */ },
        { kind: 'add-memory' /* missing file/rationale/payload */ },
      ],
    });
    const r = parseProposerResponse(text);
    assert.strictEqual(r.edits.length, 1);
  });
});

describe('buildUserMessage', () => {
  it('includes scenario, metrics, friction signals, and the sightmap content', () => {
    const msg = buildUserMessage({
      scenarioId: 'todo-001',
      scenarioTask: 'Click the add button',
      score: 0.85,
      turns: 30,
      agentCostUsd: 0.42,
      frictionReport: {
        ...emptyFriction,
        totalToolCalls: 10,
        rawSelectorUses: ['.new-todo', '.add-btn'],
        signals: [
          { kind: 'high-bypass', ratio: 0.4, message: 'Agent used run_code 40% of calls.' } as const,
        ],
      },
      sightmapFiles: {
        'bench/apps/.sightmap/todo.yaml': 'version: 1\ncomponents:\n  - name: TodoApp\n    selector: ".todo-app"',
      },
    });
    assert.match(msg, /todo-001/);
    assert.match(msg, /Score: 0\.85/);
    assert.match(msg, /\.new-todo/);
    assert.match(msg, /high-bypass/);
    assert.match(msg, /TodoApp/);
  });
});
