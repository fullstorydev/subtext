#!/usr/bin/env node
// Converts AXe `describe-ui` JSON into the helper's `describe` result shape, to
// build fixtures from recordings made before the helper existed. `subrole` is
// kept because AXe reports it; the helper may omit it.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

function node(n) {
  const f = n.frame ?? {};
  const out = {
    role: n.role ?? null,
    type: n.type ?? null,
    label: n.AXLabel ?? null,
    identifier: n.AXUniqueId ?? null,
    value: n.AXValue ?? null,
    frame: { x: f.x ?? 0, y: f.y ?? 0, w: f.width ?? 0, h: f.height ?? 0 },
    enabled: n.enabled !== false,
    children: (n.children ?? []).map(node),
  };
  if (n.subrole) out.subrole = n.subrole;
  return out;
}

export function axeToHelper(axe) {
  const roots = Array.isArray(axe) ? axe : [axe];
  const root = roots.length === 1
    ? node(roots[0])
    : { role: 'AXGroup', type: 'Group', label: null, identifier: null, value: null, frame: { x: 0, y: 0, w: 0, h: 0 }, enabled: true, children: roots.map(node) };
  return { screen: { w: root.frame.w, h: root.frame.h }, root };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) {
    console.error('usage: axe-to-helper.mjs AXE.json OUT.json');
    process.exit(2);
  }
  writeFileSync(output, `${JSON.stringify(axeToHelper(JSON.parse(readFileSync(input, 'utf8'))))}\n`);
}
