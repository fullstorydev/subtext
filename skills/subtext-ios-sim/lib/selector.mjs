import { attrsOf } from './normalize.mjs';

export class SelectorError extends Error {
  constructor(message, selector) {
    super(`${message} in selector ${JSON.stringify(selector)}`);
    this.code = 'bad_selector';
  }
}

const IDENT_CHAR = /[A-Za-z0-9_\-\u0080-￿]/;
const LOGICAL_PSEUDOS = new Set(['not', 'is', 'where', 'has']);

class Parser {
  constructor(source) {
    this.s = source;
    this.i = 0;
  }

  fail(message) {
    throw new SelectorError(`${message} at offset ${this.i}`, this.s);
  }

  peek() {
    return this.s[this.i];
  }

  eof() {
    return this.i >= this.s.length;
  }

  skipWs() {
    const start = this.i;
    while (!this.eof() && /\s/.test(this.peek())) this.i++;
    return this.i > start;
  }

  expect(ch) {
    if (this.peek() !== ch) this.fail(`expected "${ch}"`);
    this.i++;
  }

  ident() {
    let out = '';
    while (!this.eof()) {
      const ch = this.peek();
      if (ch === '\\') {
        out += this.s[this.i + 1] ?? '';
        this.i += 2;
      } else if (IDENT_CHAR.test(ch)) {
        out += ch;
        this.i++;
      } else break;
    }
    if (!out) this.fail('expected an identifier');
    return out;
  }

  quoted() {
    const quote = this.peek();
    this.i++;
    let out = '';
    while (!this.eof() && this.peek() !== quote) {
      if (this.peek() === '\\') this.i++;
      out += this.s[this.i++];
    }
    this.expect(quote);
    return out;
  }

  list(relative) {
    const items = [];
    for (;;) {
      this.skipWs();
      items.push(this.complex(relative));
      this.skipWs();
      if (this.peek() !== ',') return items;
      this.i++;
    }
  }

  complex(relative) {
    const parts = [];
    let combinator = null;
    if (relative) {
      combinator = ' ';
      if (this.peek() === '>') {
        combinator = '>';
        this.i++;
        this.skipWs();
      }
    }
    for (;;) {
      parts.push({ combinator, compound: this.compound() });
      const sawWs = this.skipWs();
      const ch = this.peek();
      if (this.eof() || ch === ',' || ch === ')') return { parts };
      if (ch === '+' || ch === '~') this.fail(`sibling combinator "${ch}" is not supported`);
      if (ch === '>') {
        combinator = '>';
        this.i++;
        this.skipWs();
      } else if (sawWs) {
        combinator = ' ';
      } else this.fail(`unexpected "${ch}"`);
    }
  }

  compound() {
    const c = { tag: null, ids: [], classes: [], attrs: [], pseudos: [] };
    if (this.peek() === '*') {
      this.i++;
      c.tag = '*';
    } else if (!this.eof() && IDENT_CHAR.test(this.peek())) {
      c.tag = this.ident().toLowerCase();
    }
    for (;;) {
      const ch = this.peek();
      if (ch === '#') {
        this.i++;
        c.ids.push(this.ident());
      } else if (ch === '.') {
        this.i++;
        c.classes.push(this.ident());
      } else if (ch === '[') {
        c.attrs.push(this.attr());
      } else if (ch === ':') {
        c.pseudos.push(this.pseudo());
      } else break;
    }
    if (!c.tag && !c.ids.length && !c.classes.length && !c.attrs.length && !c.pseudos.length) {
      this.fail('empty compound selector');
    }
    return c;
  }

  attr() {
    this.expect('[');
    this.skipWs();
    const name = this.ident().toLowerCase();
    this.skipWs();
    if (this.peek() === ']') {
      this.i++;
      return { name, op: null };
    }
    const op = ['^=', '$=', '*=', '~=', '|='].find((o) => this.s.startsWith(o, this.i)) ?? (this.peek() === '=' ? '=' : null);
    if (!op) this.fail('expected an attribute operator');
    this.i += op.length;
    this.skipWs();
    const value = this.peek() === '"' || this.peek() === "'" ? this.quoted() : this.ident();
    this.skipWs();
    let ci = false;
    if (/[iIsS]/.test(this.peek() ?? '') && !IDENT_CHAR.test(this.s[this.i + 1] ?? '')) {
      ci = this.peek().toLowerCase() === 'i';
      this.i++;
      this.skipWs();
    }
    this.expect(']');
    return { name, op, value, ci };
  }

  pseudo() {
    this.expect(':');
    const name = this.ident().toLowerCase();
    if (!LOGICAL_PSEUDOS.has(name)) this.fail(`pseudo-class ":${name}" is not supported`);
    this.expect('(');
    const list = this.list(name === 'has');
    this.skipWs();
    this.expect(')');
    return { name, list };
  }
}

const cache = new Map();

export function parseSelector(source) {
  let parsed = cache.get(source);
  if (!parsed) {
    const p = new Parser(source);
    parsed = p.list(false);
    if (!p.eof()) p.fail('trailing input');
    cache.set(source, parsed);
  }
  return parsed;
}

export function compareValue(actual, op, expected, ci) {
  if (actual == null) return false;
  let a = String(actual);
  let e = expected;
  if (ci) {
    a = a.toLowerCase();
    e = e.toLowerCase();
  }
  switch (op) {
    case '=': return a === e;
    case '^=': return e !== '' && a.startsWith(e);
    case '$=': return e !== '' && a.endsWith(e);
    case '*=': return e !== '' && a.includes(e);
    case '~=': return a.split(/\s+/).includes(e);
    case '|=': return a === e || a.startsWith(`${e}-`);
    default: return false;
  }
}

const attrCache = new WeakMap();
function cachedAttrs(node) {
  let attrs = attrCache.get(node);
  if (!attrs) attrCache.set(node, (attrs = attrsOf(node)));
  return attrs;
}

function* descendants(node) {
  for (const child of node.children) {
    yield child;
    yield* descendants(child);
  }
}

function matchCompound(node, c) {
  if (c.tag && c.tag !== '*' && c.tag !== node.tag) return false;
  if (c.classes.length) return false;
  for (const id of c.ids) if (node.identifier !== id) return false;
  const attrs = cachedAttrs(node);
  for (const a of c.attrs) {
    const actual = attrs[a.name];
    if (a.op === null ? actual === undefined : !compareValue(actual, a.op, a.value, a.ci)) return false;
  }
  for (const p of c.pseudos) {
    if (p.name === 'not' && matchesList(node, p.list)) return false;
    if ((p.name === 'is' || p.name === 'where') && !matchesList(node, p.list)) return false;
    if (p.name === 'has' && !hasMatch(node, p.list)) return false;
  }
  return true;
}

function hasMatch(scope, list) {
  for (const d of descendants(scope)) if (matchesList(d, list, scope)) return true;
  return false;
}

const IDENTIFIER_ATTRS = new Set(['identifier', 'testid', 'id']);
const namesIdentifier = (c) => c.ids.length > 0 || c.attrs.some((a) => IDENTIFIER_ATTRS.has(a.name) && a.op === '=');
const discriminates = (c) => c.ids.length > 0 || c.attrs.some((a) => a.op !== null);

function rootOf(node) {
  let r = node;
  while (r.parent) r = r.parent;
  return r;
}

const absentCache = new WeakMap();

/** True when no element of the tree that `node` belongs to matches the compound on its own. */
function absentFromTree(node, compound) {
  const root = rootOf(node);
  let perRoot = absentCache.get(root);
  if (!perRoot) absentCache.set(root, (perRoot = new Map()));
  if (!perRoot.has(compound)) {
    let found = matchCompound(root, compound);
    for (const d of descendants(root)) if (found || (found = matchCompound(d, compound))) break;
    perRoot.set(compound, !found);
  }
  return perRoot.get(compound);
}

/**
 * Ancestor step `k` of a descendant chain may be skipped when it names an exact
 * identifier that no element of the tree carries, and the subject step has an
 * attribute of its own: a testID on a plain wrapper view never reaches the iOS
 * accessibility tree, so its descendants would otherwise never match, while a
 * bare `[testid="list"] button` would match every button.
 */
function skippable(node, parts, k, scope) {
  return !scope && k < parts.length - 1 && parts[k + 1].combinator === ' '
    && discriminates(parts.at(-1).compound)
    && namesIdentifier(parts[k].compound) && absentFromTree(node, parts[k].compound);
}

function matchAncestors(node, parts, k, scope) {
  for (let a = node.parent; a; a = a.parent) {
    if (scope && a === scope) return false;
    if (matchFrom(a, parts, k, scope)) return true;
  }
  if (!skippable(node, parts, k, scope)) return false;
  return k === 0 || matchAncestors(node, parts, k - 1, scope);
}

function matchFrom(node, parts, k, scope) {
  if (!matchCompound(node, parts[k].compound)) return false;
  const { combinator } = parts[k];
  if (k === 0) {
    if (!scope || combinator === null) return true;
    if (combinator === '>') return node.parent === scope;
    for (let a = node.parent; a; a = a.parent) if (a === scope) return true;
    return false;
  }
  if (combinator === '>') return !!node.parent && matchFrom(node.parent, parts, k - 1, scope);
  return matchAncestors(node, parts, k - 1, scope);
}

function matchesList(node, list, scope = null) {
  return list.some((complex) => matchFrom(node, complex.parts, complex.parts.length - 1, scope));
}

export function matches(node, selector) {
  return matchesList(node, parseSelector(selector));
}
