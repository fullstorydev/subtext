import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeFriction, extractToolUseRecords } from '../learn/friction.js';

function tu(id: string, name: string, input: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: 'assistant',
    message: {
      content: [{ type: 'tool_use', id, name, input }],
    },
  });
}

function tr(id: string, isError: boolean, text: string): string {
  return JSON.stringify({
    type: 'user',
    message: {
      content: [{ type: 'tool_result', tool_use_id: id, is_error: isError, content: text }],
    },
  });
}

describe('extractToolUseRecords', () => {
  it('counts tool_use blocks across assistant messages', () => {
    const log = [
      tu('a', 'mcp__sightmap__sightmap_match', { url: 'http://x.test' }),
      tu('b', 'mcp__sightmap__sightmap_act', { componentName: 'Submit', action: 'click' }),
      tu('c', 'mcp__sightmap__browser_navigate', { url: 'http://x.test' }),
    ].join('\n');
    const r = extractToolUseRecords(log);
    assert.strictEqual(r.toolCalls.length, 3);
    assert.strictEqual(r.toolCalls[0].name, 'mcp__sightmap__sightmap_match');
  });

  it('counts errored tool_results and pairs them with their tool name via id', () => {
    const log = [
      tu('act-1', 'mcp__sightmap__sightmap_act', { componentName: 'Mystery' }),
      tr('act-1', true, 'sightmap_act: Component "Mystery" not found.'),
      tu('act-2', 'mcp__sightmap__sightmap_act', { componentName: 'Submit' }),
      tr('act-2', false, 'OK'),
    ].join('\n');
    const r = extractToolUseRecords(log);
    assert.strictEqual(r.errorCount, 1);
    assert.strictEqual(r.toolErrorTexts.length, 1);
    assert.strictEqual(r.toolErrorTexts[0].tool, 'mcp__sightmap__sightmap_act');
    assert.match(r.toolErrorTexts[0].text, /Mystery/);
  });

  it('ignores malformed lines', () => {
    const log = [tu('a', 'X'), 'this is not json', tu('b', 'Y')].join('\n');
    const r = extractToolUseRecords(log);
    assert.strictEqual(r.toolCalls.length, 2);
  });
});

describe('analyzeFriction', () => {
  it('flags low-sightmap-adoption when most calls bypass the surface', () => {
    const log: string[] = [];
    log.push(tu('s1', 'mcp__sightmap__sightmap_match', { url: '/' }));
    for (let i = 0; i < 9; i++) {
      log.push(tu(`b${i}`, 'mcp__sightmap__browser_navigate', { url: '/' }));
    }
    const r = analyzeFriction(log.join('\n'));
    assert.ok(r.ratios.sightmapAware < 0.15, `expected low ratio, got ${r.ratios.sightmapAware}`);
    assert.ok(r.signals.some((s) => s.kind === 'low-sightmap-adoption'));
  });

  it('flags high-bypass when run_code_unsafe is over-used', () => {
    const log: string[] = [];
    for (let i = 0; i < 5; i++) {
      log.push(tu(`r${i}`, 'mcp__sightmap__browser_run_code_unsafe', { code: '1' }));
    }
    log.push(tu('a1', 'mcp__sightmap__sightmap_act', { componentName: 'X', action: 'click' }));
    log.push(tu('a2', 'mcp__sightmap__sightmap_act', { componentName: 'Y', action: 'click' }));
    const r = analyzeFriction(log.join('\n'));
    assert.ok(r.signals.some((s) => s.kind === 'high-bypass'));
  });

  it('flags repeated snapshots as a memory candidate', () => {
    const log: string[] = [];
    for (let i = 0; i < 6; i++) {
      log.push(tu(`s${i}`, 'mcp__sightmap__sightmap_snapshot', {}));
    }
    const r = analyzeFriction(log.join('\n'));
    const sig = r.signals.find((s) => s.kind === 'repeated-snapshot');
    assert.ok(sig);
    if (sig?.kind === 'repeated-snapshot') assert.strictEqual(sig.count, 6);
  });

  it('proposes promoting a raw selector to a component when used repeatedly', () => {
    const log = [
      tu('1', 'mcp__sightmap__sightmap_act', { selector: 'a.skip', action: 'click' }),
      tu('2', 'mcp__sightmap__sightmap_act', { selector: 'a.skip', action: 'click' }),
      tu('3', 'mcp__sightmap__sightmap_act', { selector: 'a.skip', action: 'click' }),
    ].join('\n');
    const r = analyzeFriction(log);
    const sig = r.signals.find((s) => s.kind === 'raw-selector-promotion-candidate');
    assert.ok(sig);
    if (sig?.kind === 'raw-selector-promotion-candidate') {
      assert.strictEqual(sig.selector, 'a.skip');
      assert.strictEqual(sig.uses, 3);
    }
  });

  it('flags sightmap_act repeated failures', () => {
    const log = [
      tu('e1', 'mcp__sightmap__sightmap_act', { componentName: 'Missing1' }),
      tr('e1', true, 'Component not found'),
      tu('e2', 'mcp__sightmap__sightmap_act', { componentName: 'Missing2' }),
      tr('e2', true, 'Component not found'),
    ].join('\n');
    const r = analyzeFriction(log);
    assert.ok(r.signals.some((s) => s.kind === 'sightmap-act-failures'));
  });

  it('records successfully-acted-on components', () => {
    const log = [
      tu('1', 'mcp__sightmap__sightmap_act', { componentName: 'Submit', action: 'click' }),
      tu('2', 'mcp__sightmap__sightmap_act', { componentName: 'EmailInput', action: 'type', text: 'a@b' }),
    ].join('\n');
    const r = analyzeFriction(log);
    assert.deepStrictEqual(r.successfulComponents, ['EmailInput', 'Submit']);
  });

  it('produces no signals for a clean run', () => {
    const log = [
      tu('1', 'mcp__sightmap__sightmap_match', { url: '/' }),
      tu('2', 'mcp__sightmap__sightmap_snapshot', {}),
      tu('3', 'mcp__sightmap__sightmap_act', { componentName: 'A', action: 'click' }),
      tu('4', 'mcp__sightmap__sightmap_act', { componentName: 'B', action: 'click' }),
      tu('5', 'mcp__sightmap__browser_navigate', { url: '/done' }),
    ].join('\n');
    const r = analyzeFriction(log);
    // sightmapAware ratio = 4/5 = 80% — not flagged.
    assert.strictEqual(r.signals.length, 0);
  });
});
