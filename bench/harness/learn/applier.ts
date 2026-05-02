// Stage 3 of the autoresearch loop: take a list of ProposedEdits and apply
// them to the on-disk sightmap files. Each application loads the YAML,
// mutates the in-memory object, and writes it back. Comments do not survive
// (js-yaml limitation) but the structural content does.
//
// Each apply attempt is a no-op if it would produce a malformed result —
// we re-load and re-validate before writing.

import { readFileSync, writeFileSync } from 'node:fs';
import yaml from 'js-yaml';
import type { ProposedEdit, AddComponentPayload, AddMemoryPayload, FixSelectorPayload, AddComponentMemoryPayload } from './proposer.js';

export interface ApplyOutcome {
  edit: ProposedEdit;
  applied: boolean;
  /** Human-readable reason for skipped edits or success messages. */
  detail: string;
}

export interface ApplySummary {
  outcomes: ApplyOutcome[];
  /** Files that were actually modified. Useful for the loop's git step. */
  filesChanged: string[];
}

/**
 * Apply a list of proposed edits in order. Edits that target the same file
 * are batched into a single load/save cycle so they don't churn each other.
 *
 * Returns per-edit outcomes plus the unique list of files modified. Does
 * NOT touch git — the caller (the loop) decides when/how to commit.
 */
export function applyEdits(edits: ProposedEdit[], repoRoot: string): ApplySummary {
  const outcomes: ApplyOutcome[] = [];
  const filesChanged: string[] = [];

  // Group by file path.
  const byFile = new Map<string, ProposedEdit[]>();
  for (const e of edits) {
    const list = byFile.get(e.file) ?? [];
    list.push(e);
    byFile.set(e.file, list);
  }

  for (const [relPath, fileEdits] of byFile) {
    const absPath = absolutize(relPath, repoRoot);
    let content: string;
    try {
      content = readFileSync(absPath, 'utf-8');
    } catch (err) {
      for (const e of fileEdits) {
        outcomes.push({ edit: e, applied: false, detail: `Could not read ${absPath}: ${(err as Error).message}` });
      }
      continue;
    }

    let doc: SightmapDoc;
    try {
      doc = (yaml.load(content) as SightmapDoc) ?? {};
    } catch (err) {
      for (const e of fileEdits) {
        outcomes.push({ edit: e, applied: false, detail: `YAML parse failed on ${relPath}: ${(err as Error).message}` });
      }
      continue;
    }

    let mutated = false;
    for (const edit of fileEdits) {
      const r = applySingle(doc, edit);
      outcomes.push(r);
      if (r.applied) mutated = true;
    }

    if (!mutated) continue;
    try {
      const newYaml = yaml.dump(doc, { lineWidth: 100, noRefs: true });
      writeFileSync(absPath, newYaml);
      filesChanged.push(relPath);
    } catch (err) {
      // Mark all of this file's outcomes as not applied.
      for (let i = outcomes.length - fileEdits.length; i < outcomes.length; i++) {
        if (outcomes[i].applied) {
          outcomes[i] = { ...outcomes[i], applied: false, detail: `Dump failed: ${(err as Error).message}` };
        }
      }
    }
  }

  return { outcomes, filesChanged };
}

interface SightmapDoc {
  version?: number;
  memory?: string[];
  components?: SightmapComponent[];
  views?: SightmapView[];
  requests?: unknown[];
}

interface SightmapComponent {
  name: string;
  selector?: string | string[];
  description?: string;
  memory?: string[];
  children?: SightmapComponent[];
}

interface SightmapView {
  name: string;
  route?: string;
  description?: string;
  memory?: string[];
  components?: SightmapComponent[];
}

export function applySingle(doc: SightmapDoc, edit: ProposedEdit): ApplyOutcome {
  switch (edit.kind) {
    case 'add-component':
      return applyAddComponent(doc, edit, edit.payload as AddComponentPayload);
    case 'add-memory':
      return applyAddMemory(doc, edit, edit.payload as AddMemoryPayload);
    case 'add-component-memory':
      return applyAddComponentMemory(doc, edit, edit.payload as AddComponentMemoryPayload);
    case 'fix-selector':
      return applyFixSelector(doc, edit, edit.payload as FixSelectorPayload);
    case 'other':
      return { edit, applied: false, detail: `Skipped 'other' edit (no automatic application path)` };
    default:
      return { edit, applied: false, detail: `Unknown edit kind: ${edit.kind}` };
  }
}

function applyAddComponent(doc: SightmapDoc, edit: ProposedEdit, p: AddComponentPayload): ApplyOutcome {
  const c = p.component;
  if (!c?.name || !c?.selector) {
    return { edit, applied: false, detail: 'Missing component name or selector' };
  }
  if (p.scope === 'global') {
    doc.components ??= [];
    if (doc.components.some((x) => x.name === c.name)) {
      return { edit, applied: false, detail: `Component "${c.name}" already exists at top level` };
    }
    doc.components.push({
      name: c.name,
      selector: c.selector,
      ...(c.description ? { description: c.description } : {}),
      ...(c.memory && c.memory.length > 0 ? { memory: c.memory } : {}),
    });
    return { edit, applied: true, detail: `Added global component "${c.name}"` };
  }
  // view-scoped
  const viewName = p.scope.viewName;
  doc.views ??= [];
  const view = doc.views.find((v) => v.name === viewName);
  if (!view) {
    return { edit, applied: false, detail: `View "${viewName}" not found in file` };
  }
  view.components ??= [];
  if (view.components.some((x) => x.name === c.name)) {
    return { edit, applied: false, detail: `Component "${c.name}" already exists in view "${viewName}"` };
  }
  view.components.push({
    name: c.name,
    selector: c.selector,
    ...(c.description ? { description: c.description } : {}),
    ...(c.memory && c.memory.length > 0 ? { memory: c.memory } : {}),
  });
  return { edit, applied: true, detail: `Added component "${c.name}" to view "${viewName}"` };
}

function applyAddMemory(doc: SightmapDoc, edit: ProposedEdit, p: AddMemoryPayload): ApplyOutcome {
  if (!p.text || p.text.trim().length === 0) {
    return { edit, applied: false, detail: 'Empty memory text' };
  }
  if (p.scope === 'file') {
    doc.memory ??= [];
    if (doc.memory.includes(p.text)) {
      return { edit, applied: false, detail: 'Memory text already present at file level' };
    }
    doc.memory.push(p.text);
    return { edit, applied: true, detail: 'Added file-level memory' };
  }
  const viewName = p.scope.viewName;
  doc.views ??= [];
  const view = doc.views.find((v) => v.name === viewName);
  if (!view) {
    return { edit, applied: false, detail: `View "${viewName}" not found` };
  }
  view.memory ??= [];
  if (view.memory.includes(p.text)) {
    return { edit, applied: false, detail: `Memory already present on view "${viewName}"` };
  }
  view.memory.push(p.text);
  return { edit, applied: true, detail: `Added memory to view "${viewName}"` };
}

function applyAddComponentMemory(doc: SightmapDoc, edit: ProposedEdit, p: AddComponentMemoryPayload): ApplyOutcome {
  if (!p.text || p.text.trim().length === 0) {
    return { edit, applied: false, detail: 'Empty memory text' };
  }
  const target = findComponentByName(doc, p.componentName);
  if (!target) {
    return { edit, applied: false, detail: `Component "${p.componentName}" not found` };
  }
  target.memory ??= [];
  if (target.memory.includes(p.text)) {
    return { edit, applied: false, detail: `Memory already present on "${p.componentName}"` };
  }
  target.memory.push(p.text);
  return { edit, applied: true, detail: `Added memory to component "${p.componentName}"` };
}

function applyFixSelector(doc: SightmapDoc, edit: ProposedEdit, p: FixSelectorPayload): ApplyOutcome {
  const target = findComponentByName(doc, p.componentName);
  if (!target) {
    return { edit, applied: false, detail: `Component "${p.componentName}" not found` };
  }
  const before = JSON.stringify(target.selector);
  target.selector = p.newSelector;
  return { edit, applied: true, detail: `Updated selector for "${p.componentName}" (was ${before})` };
}

function findComponentByName(doc: SightmapDoc, name: string): SightmapComponent | null {
  for (const c of doc.components ?? []) {
    if (c.name === name) return c;
    const child = findInChildren(c.children ?? [], name);
    if (child) return child;
  }
  for (const v of doc.views ?? []) {
    for (const c of v.components ?? []) {
      if (c.name === name) return c;
      const child = findInChildren(c.children ?? [], name);
      if (child) return child;
    }
  }
  return null;
}

function findInChildren(arr: SightmapComponent[], name: string): SightmapComponent | null {
  for (const c of arr) {
    if (c.name === name) return c;
    const sub = findInChildren(c.children ?? [], name);
    if (sub) return sub;
  }
  return null;
}

function absolutize(relPath: string, repoRoot: string): string {
  if (relPath.startsWith('/')) return relPath;
  return `${repoRoot}/${relPath}`;
}
