import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalize } from '../lib/normalize.mjs';
import { annotate, resolve } from '../lib/sightmap-bridge.mjs';
import { parseCorpus } from '../lib/corpus.mjs';
import { assertActionable } from '../lib/daemon.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const describeRN = () => JSON.parse(readFileSync(join(here, 'fixtures', 'describe-rn.json'), 'utf8'));

const corpus = parseCorpus({
  globals: [{ name: 'TabBarItem', selectors: ['tab'], properties: [{ name: 'title', extract: 'text' }] }],
  views: [{ name: 'Products', components: [{ name: 'ProductRow', selectors: ['[identifier^="product-row-"]'] }] }],
});

const byIdentifier = (snap, identifier) => snap.nodes.find((n) => n.identifier === identifier);

test('React Navigation tab buttons normalize to tabs titled without the VoiceOver suffix', () => {
  const snap = annotate(normalize(describeRN()), corpus);
  const tab = byIdentifier(snap, 'tab-network');
  assert.equal(tab.tag, 'tab');
  assert.equal(tab.label, 'Network');
  assert.equal(resolve(snap, 'TabBarItem[title="Network"]'), tab);
});

test('identified React Native GenericElements are interactive, unidentified ones are not', () => {
  const { nodes } = normalize(describeRN());
  const row = nodes.find((n) => n.identifier === 'product-row-1');
  assert.equal(row.tag, 'other');
  assert.equal(row.interactive, true);
  assert.equal(nodes.find((n) => n.label === 'Unidentified text').interactive, false);
});

test('a row under a JS tab bar is refused as covered; rows above it and the tabs are not', () => {
  const snap = annotate(normalize(describeRN()), corpus);
  assert.throws(() => assertActionable(snap, byIdentifier(snap, 'product-row-15'), 'product-row-15'),
    (err) => err.code === 'covered' && /tabbar/.test(err.message));
  assert.doesNotThrow(() => assertActionable(snap, byIdentifier(snap, 'product-row-14'), 'product-row-14'));
  assert.doesNotThrow(() => assertActionable(snap, byIdentifier(snap, 'tab-account'), 'tab-account'));
});

test('a system sheet from another process renders as an overlay with a way out', () => {
  const sheet = {
    screen: { w: 402, h: 874 },
    overlay: true,
    root: {
      type: 'Application', role: 'AXApplication', label: 'Safari', frame: { x: 0, y: 0, w: 402, h: 874 },
      children: [
        { type: 'StaticText', role: 'AXStaticText', label: 'Save Password?', frame: { x: 71, y: 417, w: 260, h: 20 } },
        { type: 'Button', role: 'AXButton', label: 'Not Now', frame: { x: 57, y: 523, w: 140, h: 48 } },
      ],
    },
  };
  const snap = annotate(normalize(sheet), corpus);
  assert.match(snap.text, /\[Overlay\]\nA system sheet from another process \("Safari"\)/);
  assert.equal(resolve(snap, 'button[text="Not Now"]').label, 'Not Now');
  assert.doesNotMatch(annotate(normalize(describeRN()), corpus).text, /\[Overlay\]/);
});

test('a LogBox toast is reported with its ✕ and refuses taps underneath', () => {
  const describe = describeRN();
  describe.root.children.push({
    type: 'GenericElement', role: 'AXGenericElement', label: '!, sign-in rejected', identifier: null,
    frame: { x: 10, y: 788, w: 382, h: 48 },
  });
  const snap = annotate(normalize(describe), corpus);
  assert.match(snap.text, /\[LogBox\]\n.*\nDismiss it with `tap-xy 368 812`/);
  assert.throws(() => assertActionable(snap, byIdentifier(snap, 'product-row-15'), 'product-row-15'),
    (err) => err.code === 'covered' && /LogBox/.test(err.message) && /tap-xy 368 812/.test(err.hint));
});
