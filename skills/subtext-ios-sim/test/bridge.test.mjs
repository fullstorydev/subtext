import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalize } from '../lib/normalize.mjs';
import { annotate, BridgeError, resolve, snapshot, toComponentTree, writeSnap } from '../lib/sightmap-bridge.mjs';
import { loadCorpus, loadCorpusFile, parseCorpus } from '../lib/corpus.mjs';
import { matches, parseSelector } from '../lib/selector.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => JSON.parse(readFileSync(join(here, 'fixtures', `describe-${name}.json`), 'utf8'));
const corpus = loadCorpusFile(join(here, 'fixtures', 'corpus.json'));
const parityCorpus = loadCorpusFile(join(here, 'fixtures', 'parity-corpus.json'));
const benchSample = join(here, '..', 'helper', 'testdata', 'describe-bench.json');

const sightmapBin = (() => {
  const bin = process.env.SIGHTMAP_BIN || 'sightmap';
  return spawnSync(bin, ['version'], { encoding: 'utf8' }).status === 0 ? bin : null;
})();
const needsSightmap = sightmapBin ? {} : { skip: 'sightmap CLI not found (set SIGHTMAP_BIN)' };

const byIdentifier = (snap, identifier) => snap.nodes.find((n) => n.identifier === identifier);

test('normalize collapses wrappers and maps roles to short tags', () => {
  const { root, nodes, screen } = normalize(fixture('simple'));
  assert.deepEqual(screen, { w: 402, h: 874 });
  assert.equal(root.tag, 'application');
  assert.equal(root.label, 'Bench');
  assert.ok(nodes.length < 25, `expected wrappers collapsed, got ${nodes.length} nodes`);
  for (const n of nodes) {
    if (n.tag === 'other' && n.ignored) assert.ok(n.children.length > 1, `wrapper ${n.id} should have been collapsed`);
  }
  const tags = Object.fromEntries(nodes.filter((n) => n.identifier).map((n) => [n.identifier, n.tag]));
  assert.equal(tags['simple.primary'], 'button');
  assert.equal(tags['simple.email'], 'textfield');
  assert.equal(tags['simple.toggle'], 'switch');
  assert.equal(tags['1.circle'], 'tab');
  assert.equal(tags.lastTapped, 'text');
  assert.deepEqual(nodes.map((n) => n.id), nodes.map((_, i) => i + 1));
});

test('normalize computes visibility against the screen', () => {
  const { nodes } = normalize(fixture('eager'));
  const buttons = nodes.filter((n) => n.identifier?.startsWith('eager.'));
  assert.equal(buttons.length, 300);
  assert.ok(byIdentifier({ nodes }, 'eager.0').visible);
  assert.ok(byIdentifier({ nodes }, 'eager.0').onScreen);
  assert.equal(byIdentifier({ nodes }, 'eager.299').visible, false);
  assert.ok(buttons.filter((b) => !b.visible).length > 200);
});

test('normalize keeps identified groups in deep trees', () => {
  const { nodes } = normalize(fixture('deep'));
  const groups = nodes.filter((n) => n.identifier?.startsWith('deepc.'));
  assert.equal(groups.length, 40);
  assert.ok(groups.every((g) => g.tag === 'other' && !g.ignored));
  assert.ok(byIdentifier({ nodes }, 'deep.leaf'));
});

test('annotate infers the view and names components by identifier and text', () => {
  const snap = snapshot(fixture('simple'), corpus);
  assert.equal(snap.view, 'Simple');
  assert.equal(snap.viewInferred, true);
  assert.equal(byIdentifier(snap, 'simple.primary').component, 'PrimaryButton');
  assert.equal(byIdentifier(snap, 'simple.secondary').component, 'SecondaryButton');
  assert.deepEqual(byIdentifier(snap, 'simple.toggle').props, { on: '1' });
  assert.equal(byIdentifier(snap, 'lastTapped').component, 'LastTapped');
  const tabs = snap.nodes.filter((n) => n.component === 'Tab').map((n) => n.props.title);
  assert.deepEqual(tabs, ['Simple', 'Heavy', 'Deep', 'Eager']);
  assert.match(snap.text, /^\[View: Simple\] \(inferred\)/);
  assert.match(snap.text, /\n {2}\d+ \[PrimaryButton "Primary"\]\n/);
  assert.match(snap.text, /\[NotificationsToggle on="1" "Notifications"\]/);
  assert.match(snap.text, /- The tab bar is present on every screen\./);
  assert.match(snap.text, /9 interactive · 8 direct T1 \(89%\) · 1 scoped T2 \(11%\) · 0 orphaned T3 ✓/);
});

test('annotate extracts child-component and exists: properties', () => {
  const snap = snapshot(fixture('heavy'), corpus);
  assert.equal(snap.view, 'Heavy');
  const rows = snap.nodes.filter((n) => n.component === 'ProductRow');
  assert.equal(rows.length, 10);
  assert.deepEqual(rows[3].props, { title: 'Row 3', price: '$3.00', favoritable: 'true' });
  assert.match(snap.text, /\[ProductRow favoritable="true" price="\$0\.00" title="Row 0" "Row 0, Subtitle 0, \$0\.00"\]/);
  assert.match(snap.text, /- Heavy: Rows lazy-load/);
});

test('annotate honors an explicit view and rejects unknown views', () => {
  const snap = snapshot(fixture('heavy'), corpus, { view: 'Simple' });
  assert.equal(snap.view, 'Simple');
  assert.equal(snap.viewInferred, false);
  assert.ok(!snap.nodes.some((n) => n.component === 'ProductRow'));
  assert.ok(snap.nodes.some((n) => n.component === 'Tab'));
  assert.throws(() => snapshot(fixture('heavy'), corpus, { view: 'Nope' }), { code: 'unknown_view' });
});

test('first match wins and conflicts are reported, view components before globals', () => {
  const conflicting = parseCorpus({
    globals: [
      { name: 'AnyButton', selectors: ['button'] },
      { name: 'Primary', selectors: ['[identifier="simple.primary"]'] },
    ],
    views: [{ name: 'Simple', route: '/simple', components: [{ name: 'ViewPrimary', selectors: ['[text="Primary"]'] }] }],
  });
  const snap = snapshot(fixture('simple'), conflicting);
  const primary = byIdentifier(snap, 'simple.primary');
  assert.equal(primary.component, 'ViewPrimary');
  assert.deepEqual(snap.conflicts.find((c) => c.id === primary.id).names, ['ViewPrimary', 'AnyButton', 'Primary']);
  assert.match(snap.text, /matched by 3 components \(ViewPrimary, AnyButton, Primary\) — only ViewPrimary applied/);
});

test('render hides off-screen nodes and says so', () => {
  const snap = snapshot(fixture('eager'), corpus);
  assert.equal(snap.view, 'Eager');
  assert.ok(!snap.text.includes('key="eager.299"'));
  assert.match(snap.text, /\[Off-screen\]\n264 off-screen node\(s\) not shown \(264 interactive\)/);
});

test('resolve accepts snapshot ids', () => {
  const snap = snapshot(fixture('simple'), corpus);
  const primary = byIdentifier(snap, 'simple.primary');
  assert.equal(resolve(snap, String(primary.id)), primary);
  assert.equal(resolve(snap, primary.id), primary);
  assert.throws(() => resolve(snap, '9999'), { code: 'not_found' });
});

test('resolve accepts component queries with predicates, descendants and #N', () => {
  const snap = snapshot(fixture('heavy'), corpus);
  assert.equal(resolve(snap, 'ProductRow[title="Row 3"]').identifier, 'row.3.buy-row.3.fav');
  assert.equal(resolve(snap, 'ProductRow[title^="row 7" i] BuyButton').identifier, 'row.7.buy');
  assert.equal(resolve(snap, "ProductRow[price*='5.'] FavoriteButton").identifier, 'row.5.fav');
  assert.equal(resolve(snap, 'BuyButton#2').identifier, 'row.2.buy');
  assert.equal(resolve(snap, 'Tab[title="Eager"]').label, 'Eager');
  assert.equal(resolve(snap, 'button[identifier="row.4.buy"]').label, 'Buy');
  assert.equal(resolve(snap, 'ProductRow[identifier$="row.1.fav"]').props.title, 'Row 1');
});

test('resolve reports ambiguity, absence and bad queries', () => {
  const snap = snapshot(fixture('heavy'), corpus);
  assert.throws(() => resolve(snap, 'BuyButton'), (err) => {
    assert.ok(err instanceof BridgeError);
    assert.equal(err.code, 'ambiguous');
    assert.equal(err.candidates.length, 10);
    return true;
  });
  assert.throws(() => resolve(snap, 'ProductRow[title="Row 42"]'), { code: 'not_found' });
  assert.throws(() => resolve(snap, 'Checkout'), /no Checkout component in this snapshot/);
  assert.throws(() => resolve(snap, 'BuyButton#99'), { code: 'not_found' });
  assert.throws(() => resolve(snap, 'ProductRow > BuyButton'), { code: 'bad_query' });
  assert.throws(() => resolve(snap, 'ProductRow[title~="x"]'), { code: 'bad_query' });
});

test('resolve finds off-screen nodes so callers can refuse or scroll', () => {
  const snap = snapshot(fixture('eager'), corpus);
  const node = resolve(snap, 'EagerButton[key="eager.250"]');
  assert.equal(node.label, 'Eager 250');
  assert.equal(node.visible, false);
  assert.equal(node.onScreen, false);
});

test('selector parser covers the sightmap subset and rejects the rest', () => {
  const { nodes } = normalize(fixture('heavy'));
  const count = (sel) => nodes.filter((n) => matches(n, sel)).length;
  assert.equal(count('button:has(> button[identifier$=".buy"])'), 10);
  assert.equal(count('other[text="Tab Bar"] tab'), 4);
  assert.equal(count('other[text="Tab Bar"] > tab'), 0);
  assert.equal(count('text:not([text^="Row"]):not([text^="$"])'), count('text') - 20);
  assert.equal(count(':is(heading, slider)'), 3);
  assert.equal(count('[identifier^="ROW.1." i]'), 3);
  assert.equal(count('#lastTapped'), 1);
  assert.equal(count('.anything'), 0);
  assert.throws(() => parseSelector('button + text'), { code: 'bad_selector' });
  assert.throws(() => parseSelector('button:first-child'), { code: 'bad_selector' });
  assert.throws(() => parseSelector('button['), { code: 'bad_selector' });
});

test('toComponentTree emits sightmap ComponentNode shape', () => {
  const snap = snapshot(fixture('simple'), corpus);
  const tree = toComponentTree(snap);
  assert.equal(tree.id, '1');
  assert.equal(tree.element.tag, 'application');
  const walk = (n, out = []) => {
    out.push(n);
    (n.children ?? []).forEach((c) => walk(c, out));
    return out;
  };
  const all = walk(tree);
  assert.equal(all.length, snap.nodes.length);
  for (const n of all) {
    for (const k of ['x', 'y', 'width', 'height']) assert.ok(Number.isInteger(n.bounds[k]));
    for (const k of ['isVisible', 'isInteractive', 'inViewport', 'isIgnored']) assert.equal(typeof n[k], 'boolean');
    assert.equal(n.component, undefined);
  }
  const email = all.find((n) => n.element.attrs?.identifier === 'simple.email');
  assert.deepEqual(email.element, { tag: 'textfield', attrs: { identifier: 'simple.email', testid: 'simple.email', value: 'Email' } });
  const last = all.find((n) => n.element.attrs?.identifier === 'lastTapped');
  assert.equal(last.element.id, 'lastTapped');
  const annotated = toComponentTree(snap, { annotations: true });
  assert.equal(walk(annotated).find((n) => n.element.attrs?.identifier === 'simple.toggle').props.on, '1');
});

test('writeSnap writes the text snap and tree companion', () => {
  const dir = mkdtempSync(join(tmpdir(), 'subtext-sim-'));
  const snap = snapshot(fixture('simple'), corpus, { url: 'ios-sim://bench' });
  const path = join(dir, 'simple.snap');
  writeSnap(snap, path, { annotationsPath: join(dir, 'simple.annotated.json') });
  assert.match(readFileSync(path, 'utf8'), /^\[View: Simple\] \(inferred\) ios-sim:\/\/bench\n/);
  assert.equal(JSON.parse(readFileSync(`${path}.tree.json`, 'utf8')).element.tag, 'application');
  assert.ok(JSON.parse(readFileSync(join(dir, 'simple.annotated.json'), 'utf8')).tree);
});

test('helper describe sample annotates when present', { skip: !existsSync(benchSample) && 'no helper sample yet' }, () => {
  const snap = snapshot(JSON.parse(readFileSync(benchSample, 'utf8')), corpus);
  assert.ok(snap.nodes.length > 1);
  assert.match(snap.text, /--- component tree ---/);
});

test('sightmap export of the fixture corpus matches the committed wire', needsSightmap, () => {
  const live = loadCorpus(join(here, 'fixtures', 'sightmap'), { bin: sightmapBin });
  assert.deepEqual(live, corpus);
});

const parseExplain = (out) => {
  const owners = new Map();
  let id = null;
  for (const line of out.split('\n')) {
    const head = /\s#(\d+)$/.exec(line);
    if (head && !line.startsWith(' ')) id = Number(head[1]);
    const cov = /coverage: T1 \(direct\)\s+← \[([^\]]+)\]/.exec(line);
    if (cov && id !== null) owners.set(id, cov[1]);
  }
  return owners;
};

for (const name of ['simple', 'heavy', 'eager', 'deep']) {
  test(`matcher agrees with sightmap explain on ${name}`, needsSightmap, () => {
    const snap = snapshot(fixture(name), parityCorpus);
    const dir = mkdtempSync(join(tmpdir(), 'subtext-sim-'));
    const path = join(dir, `${name}.snap`);
    writeSnap(snap, path);
    const run = spawnSync(sightmapBin, [
      'explain', '--sightmap-dir', join(here, 'fixtures', 'sightmap-parity'), '--snap', `${path}.tree.json`, '--max', '100000', '*',
    ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    assert.equal(run.status, 0, run.stderr);
    const theirs = parseExplain(run.stdout);
    const ours = new Map(snap.nodes.filter((n) => n.component).map((n) => [n.id, n.component]));
    assert.ok(ours.size > 0);
    assert.deepEqual(ours, theirs);
  });
}

test('sightmap coverage reads an iOS snap', needsSightmap, () => {
  const dir = mkdtempSync(join(tmpdir(), 'subtext-sim-'));
  const path = join(dir, 'simple.snap');
  writeSnap(snapshot(fixture('simple'), parityCorpus), path);
  const run = spawnSync(sightmapBin, ['coverage', '--sightmap-dir', join(here, 'fixtures', 'sightmap-parity'), path], { encoding: 'utf8' });
  assert.match(run.stdout, /9 interactive · \d+ direct T1/);
  assert.doesNotMatch(run.stdout + run.stderr, /parse tree JSON/);
});

const LEGACY_TO_OBJECT = {
  text: { from: 'dom.text' },
  'attr=value': { from: 'dom.attr', path: 'value' },
  'attr=identifier': { from: 'dom.attr', path: 'identifier' },
  'Title.text': { from: 'component', path: 'Title.text' },
  'Price.text': { from: 'component', path: 'Price.text' },
  'exists:FavoriteButton': { from: 'component.exists', path: 'FavoriteButton' },
};

test('extract objects (sightmap 0.34+) resolve like the legacy strings', () => {
  const wire = JSON.parse(readFileSync(join(here, 'fixtures', 'corpus.json'), 'utf8'));
  const asObjects = JSON.parse(JSON.stringify(wire, (key, value) => (key === 'extract' ? LEGACY_TO_OBJECT[value] : value)));
  assert.deepEqual(parseCorpus(asObjects), corpus);
  for (const name of ['simple', 'heavy', 'eager']) {
    const legacy = snapshot(fixture(name), corpus);
    const objects = snapshot(fixture(name), parseCorpus(asObjects));
    assert.deepEqual(objects.nodes.map((n) => n.props), legacy.nodes.map((n) => n.props));
  }
});

test('extract objects support pattern, join over Name[], and dom.state', () => {
  const row = 'button:has(> button[identifier$=".buy"])';
  const objectCorpus = parseCorpus({
    globals: [
      {
        name: 'ProductRow', selectors: [row], properties: [
          { name: 'cents', extract: { from: 'component', path: 'Price.text', pattern: '\\.(\\d+)$' } },
          { name: 'buttons', extract: { from: 'component', path: 'RowButton[].text', join: '|' } },
          { name: 'number', extract: { from: 'dom.attr', path: 'identifier', pattern: 'row\\.(\\d+)\\.buy' } },
        ],
      },
      { name: 'Price', selectors: [`${row} text[text^="$"]`], parentChain: ['ProductRow'], properties: [{ name: 'text', extract: { from: 'dom.text' } }] },
      { name: 'RowButton', selectors: [`${row} button`], parentChain: ['ProductRow'], properties: [{ name: 'text', extract: { from: 'dom.text' } }] },
    ],
    views: [],
  });
  const snap = snapshot(fixture('heavy'), objectCorpus);
  const row3 = snap.nodes.filter((n) => n.component === 'ProductRow')[3];
  assert.deepEqual(row3.props, { cents: '00', buttons: 'Buy|Favorite 3', number: '3' });

  const toggleCorpus = parseCorpus({
    globals: [{
      name: 'Toggle', selectors: ['switch'], properties: [
        { name: 'on', extract: { from: 'dom.state', path: 'checked' } },
        { name: 'disabled', extract: { from: 'dom.state', path: 'disabled' } },
      ],
    }],
  });
  assert.deepEqual(byIdentifier(snapshot(fixture('simple'), toggleCorpus), 'simple.toggle').props, { on: 'true', disabled: 'false' });
});

const node = (type, frame, extra = {}) => ({ role: `AX${type}`, type, label: null, identifier: null, value: null, frame, enabled: true, children: [], ...extra });

/** A React Native screen whose testID'd wrapper views never reach the accessibility tree. */
const rnScreen = () => normalize({
  screen: { w: 390, h: 844 },
  root: node('Application', { x: 0, y: 0, w: 390, h: 844 }, {
    label: 'App',
    children: [
      node('Group', { x: 0, y: 0, w: 390, h: 844 }, {
        children: [
          node('Button', { x: 20, y: 100, w: 200, h: 44 }, { label: 'Sign In', identifier: 'login-submit' }),
          node('Button', { x: 20, y: 160, w: 200, h: 44 }, { label: 'Help' }),
          node('GenericElement', { x: 20, y: 220, w: 200, h: 44 }, { label: 'Card', identifier: 'promo-card',
            children: [node('Button', { x: 30, y: 230, w: 60, h: 20 }, { label: 'Close', identifier: 'promo-close' })] }),
        ],
      }),
    ],
  }),
});

test('selectors treat testid as the accessibility identifier', () => {
  const { nodes } = rnScreen();
  const count = (sel) => nodes.filter((n) => matches(n, sel)).length;
  assert.equal(count('[testid="login-submit"]'), 1);
  assert.equal(count('button[testid^="login-"]'), 1);
  assert.equal(count('[testid="nope"]'), 0);
});

test('descendant selectors skip ancestors whose exact identifier is absent from the tree', () => {
  const { nodes } = rnScreen();
  const count = (sel) => nodes.filter((n) => matches(n, sel)).length;
  assert.equal(count('[testid="login-form"] [testid="login-submit"]'), 1, 'absent wrapper is skipped');
  assert.equal(count('[testid="screen"] [testid="login-form"] [testid="login-submit"]'), 1, 'several absent wrappers are skipped');
  assert.equal(count('[testid="promo-card"] [testid="promo-close"]'), 1, 'present ancestors still match');
  assert.equal(count('[testid="promo-card"] [testid="login-submit"]'), 0, 'a present identifier is never skipped');
  assert.equal(count('[testid="login-form"] button'), 0, 'a subject without its own attribute is not widened');
  assert.equal(count('[testid^="login-form"] [testid="login-submit"]'), 0, 'only exact identifiers are skippable');
  assert.equal(count('[testid="login-form"] > [testid="login-submit"]'), 0, 'the child combinator is never skipped');
});
