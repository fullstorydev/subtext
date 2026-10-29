import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { attrsOf, cssId, floatingOnly, logBoxToast, normalize } from './normalize.mjs';
import { emptyTreeMessage } from './errors.mjs';
import { compareValue, matches, matchKind } from './selector.mjs';
import { loadCorpus } from './corpus.mjs';

export class BridgeError extends Error {
  constructor(code, message, candidates = []) {
    super(message);
    this.code = code;
    this.candidates = candidates;
  }
}

const quote = (s) => JSON.stringify(String(s));

function* descendants(node) {
  for (const child of node.children) {
    yield child;
    yield* descendants(child);
  }
}

function firstDescendant(node, componentName) {
  for (const d of descendants(node)) if (d.component === componentName) return d;
  return null;
}

function allDescendants(node, componentName) {
  return [...descendants(node)].filter((d) => d.component === componentName);
}

function matchedNodes(nodes, def) {
  return nodes.filter((n) => def.selectors.some((sel) => matches(n, sel)));
}

/** Each node the definition matches, with whether its best match needed an absent ancestor skipped. */
function matchedWithKind(nodes, def) {
  const out = [];
  for (const n of nodes) {
    let kind = null;
    for (const sel of def.selectors) {
      const k = matchKind(n, sel);
      if (k === 'full') { kind = k; break; }
      kind ??= k;
    }
    if (kind) out.push({ node: n, skipped: kind === 'skipped' });
  }
  return out;
}

function inferView(nodes, corpus) {
  const globalNames = new Set(corpus.globals.map((c) => c.name));
  let best = null;
  let bestScore = 0;
  for (const view of corpus.views) {
    const own = view.components.filter((c) => !globalNames.has(c.name));
    const hit = new Set(own.flatMap((def) => matchedNodes(nodes, def)));
    if (hit.size > bestScore) {
      best = view;
      bestScore = hit.size;
    }
  }
  return best;
}

function extractProps(node, memo) {
  if (memo.has(node)) return memo.get(node);
  const props = {};
  memo.set(node, props);
  for (const { name, extract } of node.componentDef.properties) {
    const value = extractOne(node, extract ?? { from: 'dom.text' }, memo);
    if (value !== undefined && value !== null && value !== '') props[name] = String(value);
  }
  return props;
}

/** Follows `Child.Grandchild` (a `Name[]` step takes every match) from a node to the components it names. */
function componentsAt(node, names) {
  let current = [node];
  for (const step of names) {
    const every = step.endsWith('[]');
    const name = every ? step.slice(0, -2) : step;
    current = current.flatMap((n) => (every ? allDescendants(n, name) : [firstDescendant(n, name)].filter(Boolean)));
  }
  return current;
}

const SWITCH_STATE = { 1: 'true', 0: 'false' };

function stateOf(node, state) {
  switch (state) {
    case 'disabled': return node.enabled ? 'false' : 'true';
    case 'selected': return node.traits.includes('Selected') ? 'true' : 'false';
    case 'checked': return ['switch', 'checkbox'].includes(node.tag) ? SWITCH_STATE[node.value] : undefined;
    default: return undefined;
  }
}

function readSource(node, { from, path, join }, memo) {
  switch (from) {
    case 'dom.text':
    case 'dom.raw_text':
      return node.label ?? node.text;
    case 'dom.attr':
      return path ? attrsOf(node)[path.toLowerCase()] : undefined;
    case 'dom.state':
      return stateOf(node, path);
    case 'component.exists':
      return path && componentsAt(node, path.split('.')).length ? 'true' : undefined;
    case 'component': {
      if (!path) return undefined;
      const names = path.split('.');
      const prop = names.pop();
      const values = componentsAt(node, names).map((n) => extractProps(n, memo)[prop]).filter((v) => v !== undefined && v !== '');
      if (join !== undefined) return values.length ? values.join(join) : undefined;
      return values[0];
    }
    default:
      return undefined;
  }
}

function extractOne(node, extract, memo) {
  const value = readSource(node, extract, memo);
  if (value === undefined || value === null || !extract.pattern) return value;
  const m = new RegExp(extract.pattern).exec(String(value));
  return m ? (m[1] ?? m[0]) : undefined;
}

function computeCoverage(nodes) {
  const counts = { interactive: 0, t1: 0, t2: 0, t3: 0 };
  for (const n of nodes) {
    if (!n.interactive || !n.visible || n.system) continue;
    counts.interactive++;
    if (n.component) counts.t1++;
    else {
      let scoped = false;
      for (let a = n.parent; a && !scoped; a = a.parent) scoped = !!a.component;
      counts[scoped ? 't2' : 't3']++;
    }
  }
  return counts;
}

/**
 * Layers a sightmap corpus onto a normalized tree. `sightmap` is a `.sightmap/`
 * directory (exported through the sightmap CLI) or an already loaded corpus.
 * `view` names the view whose components apply; without it the view is inferred
 * as the one whose own components match the most nodes.
 */
export function annotate(normalized, sightmap, { view, sightmapBin, url } = {}) {
  const corpus = typeof sightmap === 'string' ? loadCorpus(sightmap, { bin: sightmapBin }) : sightmap;
  const { nodes } = normalized;
  const matchable = nodes.filter((n) => !n.system);
  let activeView = null;
  if (view) {
    activeView = corpus.views.find((v) => v.name === view);
    if (!activeView) throw new BridgeError('unknown_view', `no view named ${quote(view)} in the corpus`);
  } else {
    activeView = inferView(matchable, corpus);
  }

  const defs = [...(activeView?.components ?? []), ...corpus.globals];
  const candidates = new Map();
  for (const def of defs) {
    for (const { node, skipped } of matchedWithKind(matchable, def)) {
      const list = candidates.get(node) ?? [];
      const seen = list.find((c) => c.def.name === def.name);
      if (!seen) list.push({ def, skipped });
      else if (seen.skipped && !skipped) seen.skipped = false;
      candidates.set(node, list);
    }
  }

  // A component whose whole chain matched beats one that needed an absent
  // ancestor skipped; among equals, view components and then corpus order win.
  const conflicts = [];
  for (const node of nodes) {
    const list = candidates.get(node)?.sort((a, b) => a.skipped - b.skipped);
    node.component = list ? list[0].def.name : null;
    Object.defineProperty(node, 'componentDef', { value: list ? list[0].def : null, enumerable: false, writable: true });
    const full = list?.filter((c) => !c.skipped).length ?? 0;
    if (list && list.length > 1 && full !== 1) {
      conflicts.push({ id: node.id, names: list.map((c) => c.def.name), skipped: list.filter((c) => c.skipped).map((c) => c.def.name) });
    }
  }

  const memo = new Map();
  const guide = new Map();
  for (const node of nodes) {
    node.props = node.component ? extractProps(node, memo) : null;
    if (node.component) guide.set(node.component, (guide.get(node.component) ?? 0) + 1);
  }

  const memory = [
    ...corpus.memory.map((m) => ({ scope: null, text: m })),
    ...(activeView?.memory ?? []).map((m) => ({ scope: activeView.name, text: m })),
    ...defs.filter((d) => guide.has(d.name) && d.memory.length)
      .filter((d, i, all) => all.findIndex((o) => o.name === d.name) === i)
      .flatMap((d) => d.memory.map((m) => ({ scope: d.name, text: m }))),
  ];

  const annotated = {
    ...normalized,
    view: activeView?.name ?? null,
    viewInferred: !view && !!activeView,
    url: url ?? null,
    conflicts,
    guide,
    memory,
    coverage: computeCoverage(nodes),
  };
  annotated.text = render(annotated);
  return annotated;
}

export function snapshot(describeResult, sightmap, options) {
  return annotate(normalize(describeResult), sightmap, options);
}

/**
 * Why a tree offers (next to) nothing to act on, as lines naming the likely
 * causes, or null when it looks healthy. Shared by `snapshot` and by the
 * not-found errors of `click`, `fill` and `scroll`.
 */
export function sparseTreeNote(annotated, { udid = annotated.udid, accessibilityEnabled = annotated.accessibilityEnabled } = {}) {
  if (annotated.overlay) return null;
  const causes = emptyTreeMessage({ udid: udid ?? '<udid>', accessibilityEnabled: accessibilityEnabled ?? null }).split('\n').slice(1);
  const floating = floatingOnly(annotated);
  if (floating) {
    const desc = floating.slice(0, 3).map((n) => `${n.tag}${n.label ? ` ${quote(n.label)}` : ''}`).join(', ');
    return [`Only a small floating element is exposed (${desc}). It is probably a separate window, such as the React Native / Expo dev-menu button, and the app's own window shows nothing to accessibility.`, ...causes];
  }
  if (!annotated.coverage.interactive) {
    return ['The app exposes no interactive elements. If it is still loading, snapshot again in a moment; otherwise, likely causes:', ...causes];
  }
  return null;
}

function nodeLabel(node, { showIdentifiers = true } = {}) {
  let body;
  if (node.component) {
    const props = Object.entries(node.props).sort(([a], [b]) => a.localeCompare(b));
    const parts = [node.component, ...props.map(([k, v]) => `${k}=${quote(v)}`)];
    if (node.label && !props.some(([, v]) => v === node.label)) parts.push(quote(node.label));
    body = `[${parts.join(' ')}]`;
  } else {
    body = node.tag;
    if (showIdentifiers && node.identifier) body += `[identifier=${quote(node.identifier)}]`;
    if (node.label) body += ` ${quote(node.label)}`;
    if (node.value) body += ` value=${quote(node.value)}`;
  }
  if (!node.enabled) body += ' (disabled)';
  if (!node.visible) body += ' (off-screen)';
  else if (!node.onScreen) body += ' (partly off-screen)';
  return `${node.id} ${body}`;
}

function coverageLine({ interactive, t1, t2, t3 }) {
  if (!interactive) return '0 interactive ∅';
  const pct = (n) => Math.round((100 * n) / interactive);
  return `${interactive} interactive · ${t1} direct T1 (${pct(t1)}%) · ${t2} scoped T2 (${pct(t2)}%) · ${t3} orphaned T3 ${t3 ? '✗' : '✓'}`;
}

/** Text rendering in the shape of `sightmap snapshot` output. */
export function render(annotated, { includeOffscreen = false, showIdentifiers = true } = {}) {
  const lines = [];
  const where = annotated.url ? ` ${annotated.url}` : '';
  if (annotated.view) lines.push(`[View: ${annotated.view}]${annotated.viewInferred ? ' (inferred)' : ''}${where}`);
  else lines.push(`[No view matched]${where}`);
  lines.push('');
  if (annotated.overlay) {
    const owner = annotated.root.label ? ` (${quote(annotated.root.label)})` : '';
    lines.push('[Overlay]', `A system sheet from another process${owner} is in front of the app; the tree below is that sheet.`,
      'Dismiss it with one of its buttons, e.g. `click \'button[text="Not Now"]\'`, then snapshot again.', '');
  }

  const sparse = sparseTreeNote(annotated);
  if (sparse) lines.push('[Mostly empty]', ...sparse, '');

  const logBox = logBoxToast(annotated);
  if (logBox) {
    lines.push('[LogBox]', `A React Native LogBox toast (#${logBox.node.id}) covers the bottom of the screen; tapping it opens the LogBox inspector.`,
      `Dismiss it with \`tap-xy ${logBox.dismiss.x} ${logBox.dismiss.y}\` (its ✕), or call LogBox.ignoreAllLogs() in the app.`, '');
  }
  if (annotated.guide.size) {
    lines.push('[Guide]');
    const entries = [...annotated.guide].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const width = Math.max(...entries.map(([name]) => name.length));
    for (const [name, count] of entries) lines.push(`${name.padEnd(width)}  ${count}`);
    lines.push('');
  }
  if (annotated.memory.length) {
    lines.push('[Memory]');
    for (const m of annotated.memory) lines.push(`- ${m.scope ? `${m.scope}: ` : ''}${m.text}`);
    lines.push('');
  }

  lines.push('--- component tree ---', '');
  const hidden = { nodes: 0, interactive: 0 };
  const walk = (node, depth) => {
    let childDepth = depth;
    const skipped = node.ignored && !node.component;
    if (!node.visible && !includeOffscreen) {
      hidden.nodes++;
      if (node.interactive) hidden.interactive++;
    } else if (!skipped) {
      lines.push(`${'  '.repeat(depth)}${nodeLabel(node, { showIdentifiers })}`);
      childDepth = depth + 1;
    }
    for (const child of node.children) walk(child, childDepth);
  };
  walk(annotated.root, 0);

  if (annotated.conflicts.length) {
    lines.push('', '[Conflicts]');
    for (const { id, names, skipped = [] } of annotated.conflicts) {
      const node = annotated.byId.get(id);
      const desc = `${node.tag}${node.label ? ` ${quote(node.label)}` : ''}`;
      const why = !skipped.length ? '' : skipped.length === names.length ? ' (ancestor skipped)' : ` (ancestor skipped for ${skipped.join(', ')})`;
      lines.push(`⚠ #${id} ${desc} matched by ${names.length} components (${names.join(', ')}) — only ${names[0]} applied${why}`);
    }
    if (annotated.conflicts.some((c) => c.skipped?.length)) {
      lines.push('  (ancestor skipped: the selector matched only because an identifier in its chain is on no element here; give the ancestor an accessible testID or make the leaf selector more specific)');
    }
  }
  if (hidden.nodes) {
    lines.push('', '[Off-screen]', `${hidden.nodes} off-screen node(s) not shown (${hidden.interactive} interactive); scroll to reveal them. Queries still resolve them.`);
  }
  lines.push('', '[Coverage] (visible only)', coverageLine(annotated.coverage));
  return lines.join('\n');
}

/**
 * The tree in sightmap's ComponentNode shape, so `sightmap coverage`,
 * `explain --snap` and `sel-check` work on iOS snapshots. With `annotations`,
 * nodes also carry `component` and `props`, like `sightmap snapshot --json`.
 */
export function toComponentTree(annotated, { annotations = false } = {}) {
  const convert = (node) => {
    const id = cssId(node);
    const element = { tag: node.tag };
    if (id) element.id = id;
    const attrs = attrsOf(node);
    if (Object.keys(attrs).length) element.attrs = attrs;
    const out = {
      id: String(node.id),
      role: node.tag,
      name: node.label ?? '',
      text: node.text,
      value: node.value ?? '',
      element,
      bounds: {
        x: Math.round(node.frame.x),
        y: Math.round(node.frame.y),
        width: Math.round(node.frame.w),
        height: Math.round(node.frame.h),
      },
      isVisible: node.visible,
      isInteractive: node.interactive,
      inViewport: node.onScreen,
      isIgnored: node.ignored,
      nthChild: node.nthChild,
    };
    if (annotations && node.component) {
      out.component = node.component;
      if (Object.keys(node.props).length) out.props = node.props;
    }
    if (node.children.length) out.children = node.children.map(convert);
    return out;
  };
  return convert(annotated.root);
}

/** Writes `<snapPath>` (the text rendering) and its `<snapPath>.tree.json` companion. */
export function writeSnap(annotated, snapPath, { annotationsPath } = {}) {
  mkdirSync(dirname(snapPath), { recursive: true });
  writeFileSync(snapPath, `${annotated.text}\n`);
  writeFileSync(`${snapPath}.tree.json`, JSON.stringify(toComponentTree(annotated)));
  if (annotationsPath) {
    writeFileSync(annotationsPath, JSON.stringify({ tree: toComponentTree(annotated, { annotations: true }) }));
  }
}

const QUERY_STEP = /^([A-Za-z_][A-Za-z0-9_-]*)((?:\[[^\]]*\])*)(?:#(\d+))?$/;
const QUERY_PRED = /\[\s*([A-Za-z_][A-Za-z0-9_-]*)\s*(\^=|\*=|\$=|=)\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^\s\]]+))\s*(i)?\s*\]/g;

function splitQuery(query) {
  const tokens = [];
  let cur = '';
  let depth = 0;
  let inQuote = null;
  for (const ch of query.trim()) {
    if (inQuote) {
      if (ch === inQuote) inQuote = null;
    } else if (ch === '"' || ch === "'") inQuote = ch;
    else if (ch === '[') depth++;
    else if (ch === ']') depth--;
    else if (/\s/.test(ch) && depth === 0) {
      if (cur) tokens.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur) tokens.push(cur);
  return tokens;
}

/**
 * Parses a component query: whitespace-separated steps, each
 * `Name[prop op "value" i]…#N`. Capitalized names are sightmap components;
 * lowercase names match normalized roles (`button[identifier="x"]`), which keeps
 * unmapped apps addressable.
 */
export function parseQuery(query) {
  const tokens = splitQuery(query);
  if (!tokens.length) throw new BridgeError('bad_query', 'empty component query');
  return tokens.map((token, i) => {
    if (token === '>') throw new BridgeError('bad_query', 'there is no ">" child combinator in component queries; use whitespace (descendant)');
    const m = QUERY_STEP.exec(token);
    if (!m) throw new BridgeError('bad_query', `cannot parse ${quote(token)} in component query ${quote(query)}`);
    const preds = [];
    let consumed = '';
    for (const p of m[2].matchAll(QUERY_PRED)) {
      consumed += p[0];
      const raw = p[3] ?? p[4] ?? p[5];
      preds.push({ prop: p[1], op: p[2], value: raw.replace(/\\(.)/g, '$1'), ci: !!p[6] });
    }
    if (consumed.replace(/\s/g, '') !== m[2].replace(/\s/g, '')) {
      throw new BridgeError('bad_query', `cannot parse predicates in ${quote(token)}; supported operators are =, ^=, *=, $=`);
    }
    if (m[3] !== undefined && i !== tokens.length - 1) {
      throw new BridgeError('bad_query', '#N is only allowed on the last step of a component query');
    }
    return { name: m[1], isComponent: /^[A-Z]/.test(m[1]), preds, nth: m[3] === undefined ? null : Number(m[3]) };
  });
}

function stepMatches(node, step) {
  if (step.isComponent ? node.component !== step.name : node.tag !== step.name.toLowerCase()) return false;
  const attrs = attrsOf(node);
  return step.preds.every(({ prop, op, value, ci }) => {
    const actual = node.props?.[prop] ?? attrs[prop];
    return compareValue(actual, op, value, ci);
  });
}

function ancestorsMatch(node, steps) {
  let j = steps.length - 1;
  for (let a = node.parent; a && j >= 0; a = a.parent) if (stepMatches(a, steps[j])) j--;
  return j < 0;
}

/**
 * Resolves a snapshot id (`42`) or a component query
 * (`ProductRow[title^="Row 1"] BuyButton`) to one node. Throws a BridgeError
 * with code `not_found`, `ambiguous` (with `candidates`) or `bad_query`.
 */
export function resolve(annotated, target) {
  const asText = String(target).trim();
  if (/^\d+$/.test(asText)) {
    const node = annotated.byId.get(Number(asText));
    if (!node) throw new BridgeError('not_found', `no element with id ${asText} in this snapshot; take a new snapshot`);
    return node;
  }
  const steps = parseQuery(asText);
  const last = steps[steps.length - 1];
  const found = annotated.nodes.filter((n) => stepMatches(n, last) && ancestorsMatch(n, steps.slice(0, -1)));
  if (last.nth !== null) {
    if (found[last.nth]) return found[last.nth];
    throw new BridgeError('not_found', `${quote(asText)} has ${found.length} match(es); occurrence #${last.nth} does not exist`);
  }
  if (found.length === 1) return found[0];
  if (!found.length) {
    const known = !last.isComponent || annotated.nodes.some((n) => n.component === last.name);
    const hint = known ? '' : ` (no ${last.name} component in this snapshot)`;
    throw new BridgeError('not_found', `no element matches ${quote(asText)}${hint}`);
  }
  const candidates = found.map((n) => nodeLabel(n));
  throw new BridgeError(
    'ambiguous',
    `${quote(asText)} matches ${found.length} elements; add a predicate or append #N:\n  ${candidates.join('\n  ')}`,
    candidates,
  );
}

export function centerOf(node) {
  return { x: node.frame.x + node.frame.w / 2, y: node.frame.y + node.frame.h / 2 };
}
