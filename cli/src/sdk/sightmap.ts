import * as fs from "node:fs";
import * as path from "node:path";
import yaml from "js-yaml";

// ── Types ──────────────────────────────────────────────────────────────

export interface SightmapComponent {
  name: string;
  selector?: string | string[];
  source?: string;
  description?: string;
  memory?: string[];
  children?: SightmapComponent[];
}

export interface SightmapView {
  name?: string;
  route?: string;
  source?: string;
  components?: SightmapComponent[];
}

export interface SightmapConfig {
  version: number;
  memory?: string[];
  components?: SightmapComponent[];
  views?: SightmapView[];
}

export interface FlatComponent {
  name: string;
  selectors: string[];
  source: string;
  memory: string[];
}

export interface UploadResult {
  ok: boolean;
  components?: number;
}

// ── Discovery ──────────────────────────────────────────────────────────

/**
 * Walk up from cwd (max 5 levels) looking for a `.sightmap/` directory
 * that contains at least one `.yaml` or `.yml` file.
 */
export function findSightmapRoot(cwd: string): string | null {
  let dir = path.resolve(cwd);
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, ".sightmap");
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      // Check for at least one YAML file (recursively)
      if (hasYamlFiles(candidate)) {
        return candidate;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break; // filesystem root
    dir = parent;
  }
  return null;
}

function hasYamlFiles(dir: string): boolean {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && /\.ya?ml$/i.test(entry.name)) return true;
    if (entry.isDirectory()) {
      if (hasYamlFiles(path.join(dir, entry.name))) return true;
    }
  }
  return false;
}

// ── Parsing ────────────────────────────────────────────────────────────

/**
 * Parse a YAML file into SightmapConfig.
 * Empty files return `{ version: 0 }`.
 */
export function parseSightmapFile(filePath: string): SightmapConfig {
  const content = fs.readFileSync(filePath, "utf-8");
  const doc = yaml.load(content);
  if (!doc || typeof doc !== "object") {
    return { version: 0 };
  }
  return doc as SightmapConfig;
}

// ── Flattening ─────────────────────────────────────────────────────────

/**
 * Recursively flatten hierarchical components into FlatComponent[].
 * Children get compound selectors (parent + child joined with space).
 * Children inherit parent source.
 */
export function flattenComponents(
  components: SightmapComponent[] | undefined,
  parentSelectors: string[] = [],
  parentSource: string = "",
): FlatComponent[] {
  if (!components) return [];

  const result: FlatComponent[] = [];
  for (const comp of components) {
    if (!comp.name || !comp.selector) {
      // Still recurse children even if this component is skipped
      if (comp.children) {
        result.push(
          ...flattenComponents(comp.children, parentSelectors, parentSource),
        );
      }
      continue;
    }

    const ownSelectors = Array.isArray(comp.selector)
      ? comp.selector
      : [comp.selector];
    const source = comp.source || parentSource;
    const memory = comp.memory || [];

    // Build compound selectors
    let compoundSelectors: string[];
    if (parentSelectors.length === 0) {
      compoundSelectors = ownSelectors;
    } else {
      compoundSelectors = [];
      for (const ps of parentSelectors) {
        for (const cs of ownSelectors) {
          compoundSelectors.push(`${ps} ${cs}`);
        }
      }
    }

    result.push({
      name: comp.name,
      selectors: compoundSelectors,
      source,
      memory,
    });

    // Recurse children
    if (comp.children) {
      result.push(
        ...flattenComponents(comp.children, compoundSelectors, source),
      );
    }
  }
  return result;
}

// ── Collection ─────────────────────────────────────────────────────────

function findYamlFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isFile() && /\.ya?ml$/i.test(entry.name)) {
      results.push(fullPath);
    } else if (entry.isDirectory()) {
      results.push(...findYamlFiles(fullPath));
    }
  }
  return results;
}

/**
 * Find all YAML files in sightmapDir, parse each,
 * flatten all components (global + view-scoped).
 */
export function collectComponents(sightmapDir: string): FlatComponent[] {
  const files = findYamlFiles(sightmapDir);
  const result: FlatComponent[] = [];
  for (const file of files) {
    const config = parseSightmapFile(file);
    result.push(...flattenComponents(config.components));
    if (config.views) {
      for (const view of config.views) {
        result.push(...flattenComponents(view.components));
      }
    }
  }
  return result;
}

/**
 * Collect all top-level `memory` entries from all YAML files.
 */
export function collectMemory(sightmapDir: string): string[] {
  const files = findYamlFiles(sightmapDir);
  const result: string[] = [];
  for (const file of files) {
    const config = parseSightmapFile(file);
    if (config.memory) {
      result.push(...config.memory);
    }
  }
  return result;
}

// ── Upload ─────────────────────────────────────────────────────────────

/**
 * POST components and memory as JSON. No auth header (token is in URL).
 * Returns { ok: true, components: N } on success, { ok: false } on error.
 * Never throws.
 */
export async function uploadSightmap(
  uploadUrl: string,
  components: FlatComponent[],
  memory: string[],
): Promise<UploadResult> {
  try {
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ components, memory }),
    });
    if (!response.ok) {
      return { ok: false };
    }
    return { ok: true, components: components.length };
  } catch {
    return { ok: false };
  }
}

/**
 * Orchestrator: find root, collect, upload.
 * Silently no-ops if no `.sightmap/` found or upload fails.
 * Logs component count on success to stderr.
 */
export async function autoUploadSightmap(
  sightmapUploadUrl: string,
  cwd?: string,
): Promise<void> {
  const dir = findSightmapRoot(cwd || process.cwd());
  if (!dir) return;

  const components = collectComponents(dir);
  const memory = collectMemory(dir);
  const result = await uploadSightmap(sightmapUploadUrl, components, memory);
  if (result.ok) {
    process.stderr.write(
      `sightmap: uploaded ${result.components} component(s)\n`,
    );
  }
}
