import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalize } from '../lib/normalize.mjs';
import { annotate, resolve } from '../lib/sightmap-bridge.mjs';
import { parseCorpus } from '../lib/corpus.mjs';
import { assertActionable } from '../lib/daemon.mjs';
import { ConsoleBuffer, parseLogLine, sessionUrlIn } from '../lib/logs.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const describeRN = () => JSON.parse(readFileSync(join(here, 'fixtures', 'describe-rn.json'), 'utf8'));
const describeKeyboard = () => JSON.parse(readFileSync(join(here, 'fixtures', 'describe-rn-keyboard.json'), 'utf8'));

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

const URL_NA = 'https://app.fullstory.com/ui/o-TEST01-na1/session/5d3f1a2b-0c4e-4f6a-9b8d-7e6f5a4b3c2d%3A1234567890123456789';
const URL_EU = 'https://app.eu1.fullstory.com/ui/o-TEST02-eu1/client-session/6105678901234567890%3A5432109876543210987';

test('session URLs are found anywhere in React Native console lines', () => {
  const cases = [
    [`Fullstory session URL: ${URL_NA}`, URL_NA],
    [`'[fullstory]', 'session ready', '${URL_NA}'`, URL_NA],
    [`{ sessionUrl: '${URL_EU}', isNew: true }`, URL_EU],
    [`{"sessionUrl":"${URL_EU}"}`, URL_EU],
    [`onReady (${URL_NA}).`, URL_NA],
    [`FULLSTORY_SESSION_URL ${URL_EU}`, URL_EU],
    ['FULLSTORY_SESSION_URL https://app.example/s/1', 'https://app.example/s/1'],
    ['Loaded https://app.fullstory.com/ui/o-TEST01-na1/home', null],
    ['nothing here', null],
  ];
  for (const [message, expected] of cases) assert.equal(sessionUrlIn(message), expected, message);
});

test('the newest session URL wins, from any console source or level', () => {
  const buf = new ConsoleBuffer();
  const seen = [];
  buf.onSessionUrl = (url) => seen.push(url);
  const rnLine = JSON.stringify({
    eventType: 'logEvent', messageType: 'Info', subsystem: 'com.facebook.react.log', category: 'javascript',
    eventMessage: `'FullStory.onReady', { replayStartUrl: '${URL_NA}', replayNowUrl: '${URL_NA}?playerState=x' }`, timestamp: 't',
  });
  buf.push(parseLogLine(rnLine));
  assert.equal(buf.sessionUrl, URL_NA);
  buf.push({ level: 'stderr', source: 'stderr', message: `relaunch: ${URL_EU}` });
  buf.push({ level: 'debug', source: 'os_log', message: 'unrelated' });
  assert.equal(buf.sessionUrl, URL_EU);
  assert.deepEqual(seen, [URL_NA, URL_EU]);
});

test('labelled or identified `other` elements with a tappable trait count as interactive', () => {
  const { nodes } = normalize(describeKeyboard());
  const byLabel = (label) => nodes.find((n) => n.label === label);
  assert.equal(byLabel('Spring Meetup, 64 members').tag, 'other');
  assert.equal(byLabel('Spring Meetup, 64 members').interactive, true, 'Button trait and a label');
  assert.equal(byLabel('Season ends in 3 days').interactive, false, 'no tappable trait');
  assert.ok(!nodes.some((n) => n.tag === 'other' && !n.label && !n.identifier && n.interactive), 'no label or identifier');
});

test('system keyboard keys are left out of coverage and component matching', () => {
  const keyCorpus = parseCorpus({
    globals: [{ name: 'AnyButton', selectors: ['button'] }, { name: 'Key', selectors: ['key'] }, { name: 'Card', selectors: ['other[text*="members"]'] }],
  });
  const snap = annotate(normalize(describeKeyboard()), keyCorpus);
  const keys = snap.nodes.filter((n) => n.tag === 'key');
  assert.equal(keys.length, 10);
  assert.ok(keys.every((k) => k.system && k.component === null));
  const ret = snap.nodes.find((n) => n.label === 'return');
  assert.equal(ret.system, true);
  assert.equal(ret.component, null, 'a button inside the keyboard is not an app component');
  assert.equal(snap.nodes.find((n) => n.identifier === 'join-button').component, 'AnyButton');
  assert.deepEqual(snap.coverage, { interactive: 5, t1: 4, t2: 0, t3: 1 });
  assert.equal(snap.guide.get('Card'), 2);
});

function withoutKeyboard() {
  const d = describeKeyboard();
  d.root.children = d.root.children.filter((c) => c.type !== 'Keyboard');
  const join = d.root.children.find((c) => c.identifier === 'join-button');
  join.frame = { x: 240, y: 760, w: 150, h: 44 };
  return d;
}

test('a tap within 24 pt of a floating dev-menu button is refused with a spot to tap instead', () => {
  const snap = annotate(normalize(withoutKeyboard()), corpus);
  const join = byIdentifier(snap, 'join-button');
  assert.throws(() => assertActionable(snap, join, 'join-button'), (err) => {
    assert.equal(err.code, 'covered');
    assert.match(err.message, /within 24 pt of \d+ button, which looks like the React Native \/ Expo dev-menu button/);
    const [, x, y] = /tap-xy (\d+) (\d+)/.exec(err.hint);
    assert.ok(Number(x) < 300 && Number(x) >= 240, `suggested x ${x} is on the target and clear of the button`);
    assert.ok(Number(y) >= 760 && Number(y) <= 804);
    assert.match(err.hint, /Show floating action button/);
    return true;
  });
  const fab = snap.nodes.find((n) => n.tag === 'button' && !n.label);
  assert.doesNotThrow(() => assertActionable(snap, fab, String(fab.id)), 'the floating button itself can be tapped');
  assert.doesNotThrow(() => assertActionable(snap, snap.nodes.find((n) => n.label === 'Spring Meetup, 64 members'), 'card'));
});

test('an element labelled like the dev menu covers wherever it is in the tree', () => {
  const d = withoutKeyboard();
  d.root.children.pop();
  d.root.children.unshift({ type: 'Button', role: 'AXButton', label: 'Open dev menu', frame: { x: 330, y: 70, w: 120, h: 30 }, traits: ['Button'], children: [] });
  d.root.children.push({ type: 'Image', role: 'AXImage', label: 'Avatar', identifier: 'profile-avatar', frame: { x: 340, y: 100, w: 40, h: 40 }, traits: ['Button'], children: [] });
  const snap = annotate(normalize(d), corpus);
  assert.throws(() => assertActionable(snap, byIdentifier(snap, 'profile-avatar'), 'profile-avatar'), { code: 'covered' });
  assert.doesNotThrow(() => assertActionable(snap, byIdentifier(snap, 'join-button'), 'join-button'), 'far from it');
});

test('a small last element with an identifier is the app\'s own, not a floating window', () => {
  const d = withoutKeyboard();
  d.root.children.at(-1).identifier = 'chat-fab';
  const snap = annotate(normalize(d), corpus);
  assert.doesNotThrow(() => assertActionable(snap, byIdentifier(snap, 'join-button'), 'join-button'));
});
