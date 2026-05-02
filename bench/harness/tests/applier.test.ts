import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applySingle } from '../learn/applier.js';
import type { ProposedEdit } from '../learn/proposer.js';

function emptyDoc() {
  return { version: 1 } as Record<string, unknown>;
}

describe('applier.applySingle', () => {
  it('adds a global component when not already present', () => {
    const doc = emptyDoc();
    const edit: ProposedEdit = {
      file: 'x.yaml',
      kind: 'add-component',
      rationale: 'r',
      payload: {
        kind: 'add-component',
        scope: 'global',
        component: { name: 'NewTodoInput', selector: '.new-todo' },
      },
    };
    const r = applySingle(doc as never, edit);
    assert.strictEqual(r.applied, true);
    assert.deepStrictEqual((doc as { components: unknown[] }).components, [
      { name: 'NewTodoInput', selector: '.new-todo' },
    ]);
  });

  it('refuses to duplicate a component that already exists', () => {
    const doc = { version: 1, components: [{ name: 'X', selector: '.x' }] };
    const edit: ProposedEdit = {
      file: 'x.yaml',
      kind: 'add-component',
      rationale: 'r',
      payload: {
        kind: 'add-component',
        scope: 'global',
        component: { name: 'X', selector: '.x-other' },
      },
    };
    const r = applySingle(doc as never, edit);
    assert.strictEqual(r.applied, false);
    assert.match(r.detail, /already exists/);
  });

  it('adds file-level memory', () => {
    const doc = emptyDoc();
    const edit: ProposedEdit = {
      file: 'x.yaml',
      kind: 'add-memory',
      rationale: 'r',
      payload: { kind: 'add-memory', scope: 'file', text: 'PREFER NAMED COMPONENTS' },
    };
    const r = applySingle(doc as never, edit);
    assert.strictEqual(r.applied, true);
    assert.deepStrictEqual((doc as { memory: string[] }).memory, ['PREFER NAMED COMPONENTS']);
  });

  it('adds component-level memory to an existing component', () => {
    const doc = { version: 1, components: [{ name: 'FilterButton', selector: '.filter-btn' }] };
    const edit: ProposedEdit = {
      file: 'x.yaml',
      kind: 'add-component-memory',
      rationale: 'r',
      payload: {
        kind: 'add-component-memory',
        componentName: 'FilterButton',
        text: 'Multiple instances exist (All, Active, Completed). Use containingText.',
      },
    };
    const r = applySingle(doc as never, edit);
    assert.strictEqual(r.applied, true);
    const c = (doc as { components: Array<{ memory?: string[] }> }).components[0];
    assert.deepStrictEqual(c.memory, ['Multiple instances exist (All, Active, Completed). Use containingText.']);
  });

  it('returns not-applied when targeting an unknown component', () => {
    const doc = emptyDoc();
    const edit: ProposedEdit = {
      file: 'x.yaml',
      kind: 'add-component-memory',
      rationale: 'r',
      payload: { kind: 'add-component-memory', componentName: 'Mystery', text: 'note' },
    };
    const r = applySingle(doc as never, edit);
    assert.strictEqual(r.applied, false);
    assert.match(r.detail, /not found/);
  });

  it('updates a selector via fix-selector', () => {
    const doc = { version: 1, components: [{ name: 'NewTodoInput', selector: '.old' }] };
    const edit: ProposedEdit = {
      file: 'x.yaml',
      kind: 'fix-selector',
      rationale: 'r',
      payload: { kind: 'fix-selector', componentName: 'NewTodoInput', newSelector: '.new-todo' },
    };
    const r = applySingle(doc as never, edit);
    assert.strictEqual(r.applied, true);
    const c = (doc as { components: Array<{ selector: string }> }).components[0];
    assert.strictEqual(c.selector, '.new-todo');
  });

  it('looks for components nested in views', () => {
    const doc = {
      version: 1,
      views: [
        { name: 'TodoList', route: '/', components: [{ name: 'NewTodoInput', selector: '.x' }] },
      ],
    };
    const edit: ProposedEdit = {
      file: 'x.yaml',
      kind: 'add-component-memory',
      rationale: 'r',
      payload: { kind: 'add-component-memory', componentName: 'NewTodoInput', text: 'note' },
    };
    const r = applySingle(doc as never, edit);
    assert.strictEqual(r.applied, true);
  });

  it('finds components nested in children:', () => {
    const doc = {
      version: 1,
      components: [
        {
          name: 'TodoApp',
          selector: '.todo-app',
          children: [{ name: 'InputGroup', selector: '.input-group' }],
        },
      ],
    };
    const edit: ProposedEdit = {
      file: 'x.yaml',
      kind: 'add-component-memory',
      rationale: 'r',
      payload: { kind: 'add-component-memory', componentName: 'InputGroup', text: 'note' },
    };
    const r = applySingle(doc as never, edit);
    assert.strictEqual(r.applied, true);
  });

  it('skips edits with kind "other" rather than guessing', () => {
    const doc = emptyDoc();
    const edit: ProposedEdit = {
      file: 'x.yaml',
      kind: 'other',
      rationale: 'r',
      payload: { kind: 'other', description: 'do something vague' },
    };
    const r = applySingle(doc as never, edit);
    assert.strictEqual(r.applied, false);
  });
});
