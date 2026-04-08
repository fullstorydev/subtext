# Subtext CLI Convergence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add sightmap auto-upload and localhost tunnel orchestration to `@fullstorydev/subtext-cli`, converging features from the StoryArc Python CLI into the canonical Node.js package.

**Architecture:** Three new modules (sightmap, hooks, tunnel) added to the SDK layer. The `connect()` method gains smart routing (public vs localhost) and runs a post-connect hook that auto-uploads sightmap definitions. All new code is TDD — tests first.

**Tech Stack:** TypeScript, Node.js built-in test runner (`node:test`), `js-yaml` for YAML parsing, existing `fetch`-based MCP transport.

---

### Task 1: Add js-yaml dependency

**Files:**
- Modify: `package.json`

**Step 1: Install js-yaml**

```bash
cd /Users/chip/src/subtext/cli
npm install js-yaml
npm install --save-dev @types/js-yaml
```

**Step 2: Verify build still passes**

```bash
npm run build
```
Expected: Clean compile, no errors.

**Step 3: Verify tests still pass**

```bash
npm test
```
Expected: All 16 tests pass.

**Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add js-yaml dependency for sightmap YAML parsing"
```

---

### Task 2: Sightmap — Discovery and YAML Parsing (tests)

**Files:**
- Create: `tests/sightmap.test.ts`

**Step 1: Write failing tests for sightmap discovery and parsing**

```typescript
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Will import from the module once it exists
// import { findSightmapRoot, parseSightmapFile } from "../src/sdk/sightmap.js";

describe("findSightmapRoot", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sightmap-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns path when .sightmap/ exists in cwd with YAML files", () => {
    const sightmapDir = path.join(tmpDir, ".sightmap");
    fs.mkdirSync(sightmapDir);
    fs.writeFileSync(path.join(sightmapDir, "components.yaml"), "version: 1\ncomponents: []\n");

    const { findSightmapRoot } = require("../src/sdk/sightmap.js");
    const result = findSightmapRoot(tmpDir);
    assert.equal(result, sightmapDir);
  });

  it("walks up directory tree to find .sightmap/", () => {
    const sightmapDir = path.join(tmpDir, ".sightmap");
    fs.mkdirSync(sightmapDir);
    fs.writeFileSync(path.join(sightmapDir, "test.yaml"), "version: 1\n");

    const nested = path.join(tmpDir, "a", "b", "c");
    fs.mkdirSync(nested, { recursive: true });

    const { findSightmapRoot } = require("../src/sdk/sightmap.js");
    const result = findSightmapRoot(nested);
    assert.equal(result, sightmapDir);
  });

  it("returns null when no .sightmap/ found within 5 levels", () => {
    const { findSightmapRoot } = require("../src/sdk/sightmap.js");
    const result = findSightmapRoot(tmpDir);
    assert.equal(result, null);
  });

  it("returns null for empty .sightmap/ directory", () => {
    fs.mkdirSync(path.join(tmpDir, ".sightmap"));

    const { findSightmapRoot } = require("../src/sdk/sightmap.js");
    const result = findSightmapRoot(tmpDir);
    assert.equal(result, null);
  });
});

describe("parseSightmapFile", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sightmap-parse-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("parses valid v1 YAML with components", () => {
    const yaml = `
version: 1
components:
  - name: NavBar
    selector: "nav.main-nav"
    source: src/NavBar.tsx
    memory:
      - "Click Jobs link to navigate"
`;
    const filePath = path.join(tmpDir, "test.yaml");
    fs.writeFileSync(filePath, yaml);

    const { parseSightmapFile } = require("../src/sdk/sightmap.js");
    const config = parseSightmapFile(filePath);
    assert.equal(config.version, 1);
    assert.equal(config.components!.length, 1);
    assert.equal(config.components![0].name, "NavBar");
    assert.deepEqual(config.components![0].memory, ["Click Jobs link to navigate"]);
  });

  it("parses views with route and scoped components", () => {
    const yaml = `
version: 1
views:
  - name: Login
    route: "/login"
    source: app/login.tsx
    components:
      - name: LoginForm
        selector: "[data-testid='login-form']"
`;
    const filePath = path.join(tmpDir, "views.yaml");
    fs.writeFileSync(filePath, yaml);

    const { parseSightmapFile } = require("../src/sdk/sightmap.js");
    const config = parseSightmapFile(filePath);
    assert.equal(config.views!.length, 1);
    assert.equal(config.views![0].name, "Login");
    assert.equal(config.views![0].route, "/login");
    assert.equal(config.views![0].components!.length, 1);
  });

  it("parses top-level memory", () => {
    const yaml = `
version: 1
memory:
  - "Test environment"
  - "Default creds: admin@test.com"
`;
    const filePath = path.join(tmpDir, "mem.yaml");
    fs.writeFileSync(filePath, yaml);

    const { parseSightmapFile } = require("../src/sdk/sightmap.js");
    const config = parseSightmapFile(filePath);
    assert.deepEqual(config.memory, ["Test environment", "Default creds: admin@test.com"]);
  });

  it("handles empty file gracefully", () => {
    const filePath = path.join(tmpDir, "empty.yaml");
    fs.writeFileSync(filePath, "");

    const { parseSightmapFile } = require("../src/sdk/sightmap.js");
    const config = parseSightmapFile(filePath);
    assert.equal(config.version, 0);
    assert.deepEqual(config.components, undefined);
  });
});
```

**Step 2: Create stub sightmap module so TypeScript compiles**

Create `src/sdk/sightmap.ts`:

```typescript
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

export function findSightmapRoot(_cwd: string): string | null {
  throw new Error("Not implemented");
}

export function parseSightmapFile(_filePath: string): SightmapConfig {
  throw new Error("Not implemented");
}
```

**Step 3: Build and run tests to verify they fail**

```bash
cd /Users/chip/src/subtext/cli && npm run build && npm test
```
Expected: New sightmap tests FAIL with "Not implemented". Existing 16 tests still pass.

**Step 4: Commit**

```bash
git add tests/sightmap.test.ts src/sdk/sightmap.ts
git commit -m "test: add failing tests for sightmap discovery and parsing"
```

---

### Task 3: Sightmap — Implement discovery and parsing

**Files:**
- Modify: `src/sdk/sightmap.ts`

**Step 1: Implement findSightmapRoot**

```typescript
import fs from "node:fs";
import path from "node:path";
import YAML from "js-yaml";

export function findSightmapRoot(cwd: string): string | null {
  let dir = cwd;
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(dir, ".sightmap");
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      // Check for at least one YAML file
      const files = fs.readdirSync(candidate);
      if (files.some(f => f.endsWith(".yaml") || f.endsWith(".yml"))) {
        return candidate;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function parseSightmapFile(filePath: string): SightmapConfig {
  const content = fs.readFileSync(filePath, "utf-8");
  if (!content.trim()) {
    return { version: 0 };
  }
  const doc = YAML.load(content) as Record<string, unknown> | null;
  if (!doc) {
    return { version: 0 };
  }
  return {
    version: (doc.version as number) ?? 0,
    memory: doc.memory as string[] | undefined,
    components: doc.components as SightmapComponent[] | undefined,
    views: doc.views as SightmapView[] | undefined,
  };
}
```

**Step 2: Build and run tests**

```bash
cd /Users/chip/src/subtext/cli && npm run build && npm test
```
Expected: All sightmap discovery/parsing tests PASS. All existing tests still pass.

**Step 3: Commit**

```bash
git add src/sdk/sightmap.ts
git commit -m "feat: implement sightmap discovery and YAML parsing"
```

---

### Task 4: Sightmap — Component Flattening (tests + implementation)

**Files:**
- Modify: `tests/sightmap.test.ts` (append)
- Modify: `src/sdk/sightmap.ts` (add flattenComponents)

**Step 1: Append flattening tests to `tests/sightmap.test.ts`**

```typescript
describe("flattenComponents", () => {
  it("converts single component to flat format", () => {
    const { flattenComponents } = require("../src/sdk/sightmap.js");
    const components = [{ name: "NavBar", selector: "nav.main-nav", source: "src/NavBar.tsx", memory: ["hint"] }];
    const flat = flattenComponents(components, [], "");
    assert.equal(flat.length, 1);
    assert.deepEqual(flat[0], { name: "NavBar", selectors: ["nav.main-nav"], source: "src/NavBar.tsx", memory: ["hint"] });
  });

  it("handles array selector", () => {
    const { flattenComponents } = require("../src/sdk/sightmap.js");
    const components = [{ name: "Btn", selector: [".btn-primary", ".btn-default"], source: "" }];
    const flat = flattenComponents(components, [], "");
    assert.deepEqual(flat[0].selectors, [".btn-primary", ".btn-default"]);
  });

  it("flattens children with compound selectors", () => {
    const { flattenComponents } = require("../src/sdk/sightmap.js");
    const components = [{
      name: "NavBar", selector: "nav.main-nav", source: "src/NavBar.tsx",
      children: [{ name: "NavLink", selector: "a.nav-link" }]
    }];
    const flat = flattenComponents(components, [], "");
    assert.equal(flat.length, 2);
    assert.equal(flat[1].name, "NavLink");
    assert.deepEqual(flat[1].selectors, ["nav.main-nav a.nav-link"]);
    assert.equal(flat[1].source, "src/NavBar.tsx"); // inherited
  });

  it("handles 3-level nesting", () => {
    const { flattenComponents } = require("../src/sdk/sightmap.js");
    const components = [{
      name: "A", selector: ".a", source: "a.ts",
      children: [{ name: "B", selector: ".b", children: [{ name: "C", selector: ".c" }] }]
    }];
    const flat = flattenComponents(components, [], "");
    assert.equal(flat.length, 3);
    assert.deepEqual(flat[2].selectors, [".a .b .c"]);
  });

  it("skips components with no selector", () => {
    const { flattenComponents } = require("../src/sdk/sightmap.js");
    const components = [{ name: "Ghost", source: "x.ts" }];
    const flat = flattenComponents(components, [], "");
    assert.equal(flat.length, 0);
  });

  it("defaults memory to empty array", () => {
    const { flattenComponents } = require("../src/sdk/sightmap.js");
    const components = [{ name: "X", selector: ".x", source: "" }];
    const flat = flattenComponents(components, [], "");
    assert.deepEqual(flat[0].memory, []);
  });
});
```

**Step 2: Implement flattenComponents in `src/sdk/sightmap.ts`**

```typescript
export function flattenComponents(
  components: SightmapComponent[],
  parentSelectors: string[],
  parentSource: string
): FlatComponent[] {
  const out: FlatComponent[] = [];
  for (const comp of components) {
    const source = comp.source ?? parentSource;

    let selectors: string[];
    if (Array.isArray(comp.selector)) {
      selectors = comp.selector.filter(Boolean);
    } else if (comp.selector) {
      selectors = [comp.selector];
    } else {
      selectors = [];
    }

    let fullSelectors: string[];
    if (parentSelectors.length > 0 && selectors.length > 0) {
      fullSelectors = [];
      for (const p of parentSelectors) {
        for (const s of selectors) {
          fullSelectors.push(`${p} ${s}`);
        }
      }
    } else if (parentSelectors.length > 0) {
      fullSelectors = [...parentSelectors];
    } else {
      fullSelectors = selectors;
    }

    if (comp.name && fullSelectors.length > 0) {
      const memory = Array.isArray(comp.memory) ? comp.memory : [];
      out.push({ name: comp.name, selectors: fullSelectors, source: source ?? "", memory });
    }

    if (comp.children) {
      out.push(...flattenComponents(comp.children, fullSelectors, source ?? ""));
    }
  }
  return out;
}
```

**Step 3: Build and run tests**

```bash
cd /Users/chip/src/subtext/cli && npm run build && npm test
```
Expected: All flattening tests PASS.

**Step 4: Commit**

```bash
git add tests/sightmap.test.ts src/sdk/sightmap.ts
git commit -m "feat: implement sightmap component flattening"
```

---

### Task 5: Sightmap — Collection and Upload (tests + implementation)

**Files:**
- Modify: `tests/sightmap.test.ts` (append)
- Modify: `src/sdk/sightmap.ts` (add collectComponents, collectMemory, uploadSightmap, autoUploadSightmap)

**Step 1: Append collection and upload tests**

```typescript
describe("collectComponents", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sightmap-collect-"));
    fs.mkdirSync(path.join(tmpDir, ".sightmap"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("merges components from multiple YAML files", () => {
    fs.writeFileSync(path.join(tmpDir, ".sightmap", "a.yaml"),
      'version: 1\ncomponents:\n  - name: A\n    selector: ".a"\n    source: a.ts\n');
    fs.writeFileSync(path.join(tmpDir, ".sightmap", "b.yaml"),
      'version: 1\ncomponents:\n  - name: B\n    selector: ".b"\n    source: b.ts\n');

    const { collectComponents } = require("../src/sdk/sightmap.js");
    const flat = collectComponents(path.join(tmpDir, ".sightmap"));
    assert.equal(flat.length, 2);
    const names = flat.map((c: any) => c.name).sort();
    assert.deepEqual(names, ["A", "B"]);
  });

  it("includes view-scoped components", () => {
    fs.writeFileSync(path.join(tmpDir, ".sightmap", "views.yaml"),
      'version: 1\nviews:\n  - name: Login\n    route: "/login"\n    components:\n      - name: LoginForm\n        selector: "[data-testid=\\"login\\"]"\n        source: login.tsx\n');

    const { collectComponents } = require("../src/sdk/sightmap.js");
    const flat = collectComponents(path.join(tmpDir, ".sightmap"));
    assert.equal(flat.length, 1);
    assert.equal(flat[0].name, "LoginForm");
  });

  it("finds files in subdirectories", () => {
    const sub = path.join(tmpDir, ".sightmap", "pages");
    fs.mkdirSync(sub);
    fs.writeFileSync(path.join(sub, "home.yaml"),
      'version: 1\ncomponents:\n  - name: Hero\n    selector: ".hero"\n    source: hero.ts\n');

    const { collectComponents } = require("../src/sdk/sightmap.js");
    const flat = collectComponents(path.join(tmpDir, ".sightmap"));
    assert.equal(flat.length, 1);
    assert.equal(flat[0].name, "Hero");
  });
});

describe("collectMemory", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sightmap-mem-"));
    fs.mkdirSync(path.join(tmpDir, ".sightmap"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("collects top-level memory from all files", () => {
    fs.writeFileSync(path.join(tmpDir, ".sightmap", "a.yaml"),
      'version: 1\nmemory:\n  - "Note A"\n');
    fs.writeFileSync(path.join(tmpDir, ".sightmap", "b.yaml"),
      'version: 1\nmemory:\n  - "Note B"\n');

    const { collectMemory } = require("../src/sdk/sightmap.js");
    const memory = collectMemory(path.join(tmpDir, ".sightmap"));
    assert.deepEqual(memory.sort(), ["Note A", "Note B"]);
  });
});

describe("uploadSightmap", () => {
  it("sends correct JSON payload", async () => {
    // Mock fetch by replacing global
    const calls: { url: string; body: string }[] = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = async (url: any, init: any) => {
      calls.push({ url: url.toString(), body: init.body });
      return new Response(JSON.stringify({ components: 2 }), { status: 200 });
    };

    try {
      const { uploadSightmap } = require("../src/sdk/sightmap.js");
      const components = [
        { name: "A", selectors: [".a"], source: "a.ts", memory: [] },
        { name: "B", selectors: [".b"], source: "b.ts", memory: ["hint"] },
      ];
      const result = await uploadSightmap("https://example.com/sightmap?token=abc", components, ["global note"]);

      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, "https://example.com/sightmap?token=abc");
      const body = JSON.parse(calls[0].body);
      assert.equal(body.components.length, 2);
      assert.deepEqual(body.memory, ["global note"]);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("handles HTTP error gracefully", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response("error", { status: 500 });

    try {
      const { uploadSightmap } = require("../src/sdk/sightmap.js");
      // Should not throw
      const result = await uploadSightmap("https://example.com/sightmap?token=abc", [], []);
      assert.equal(result.ok, false);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("sends no auth header", async () => {
    let capturedHeaders: Record<string, string> = {};
    const origFetch = globalThis.fetch;
    globalThis.fetch = async (_url: any, init: any) => {
      capturedHeaders = Object.fromEntries(new Headers(init.headers).entries());
      return new Response(JSON.stringify({ components: 0 }), { status: 200 });
    };

    try {
      const { uploadSightmap } = require("../src/sdk/sightmap.js");
      await uploadSightmap("https://example.com/sightmap?token=abc", [], []);
      assert.equal(capturedHeaders["authorization"], undefined);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

describe("autoUploadSightmap", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sightmap-auto-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("silently no-ops when no .sightmap/ found", async () => {
    const { autoUploadSightmap } = require("../src/sdk/sightmap.js");
    // Should not throw
    await autoUploadSightmap("https://example.com/sightmap?token=abc", tmpDir);
  });

  it("uploads when .sightmap/ exists", async () => {
    fs.mkdirSync(path.join(tmpDir, ".sightmap"));
    fs.writeFileSync(path.join(tmpDir, ".sightmap", "test.yaml"),
      'version: 1\ncomponents:\n  - name: X\n    selector: ".x"\n    source: x.ts\n');

    let uploaded = false;
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      uploaded = true;
      return new Response(JSON.stringify({ components: 1 }), { status: 200 });
    };

    try {
      const { autoUploadSightmap } = require("../src/sdk/sightmap.js");
      await autoUploadSightmap("https://example.com/sightmap?token=abc", tmpDir);
      assert.ok(uploaded, "should have called fetch to upload");
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
```

**Step 2: Implement collection and upload in `src/sdk/sightmap.ts`**

Add to the existing file:

```typescript
function findYamlFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      files.push(...findYamlFiles(path.join(dir, entry.name)));
    } else if (entry.name.endsWith(".yaml") || entry.name.endsWith(".yml")) {
      files.push(path.join(dir, entry.name));
    }
  }
  return files.sort();
}

export function collectComponents(sightmapDir: string): FlatComponent[] {
  const allComponents: FlatComponent[] = [];
  for (const file of findYamlFiles(sightmapDir)) {
    const config = parseSightmapFile(file);
    if (config.components) {
      allComponents.push(...flattenComponents(config.components, [], ""));
    }
    if (config.views) {
      for (const view of config.views) {
        if (view.components) {
          allComponents.push(...flattenComponents(view.components, [], ""));
        }
      }
    }
  }
  return allComponents;
}

export function collectMemory(sightmapDir: string): string[] {
  const allMemory: string[] = [];
  for (const file of findYamlFiles(sightmapDir)) {
    const config = parseSightmapFile(file);
    if (config.memory) {
      allMemory.push(...config.memory);
    }
  }
  return allMemory;
}

export interface UploadResult {
  ok: boolean;
  components?: number;
}

export async function uploadSightmap(
  uploadUrl: string,
  components: FlatComponent[],
  memory: string[]
): Promise<UploadResult> {
  try {
    const res = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ components, memory }),
    });
    if (!res.ok) {
      return { ok: false };
    }
    const body = await res.json() as Record<string, unknown>;
    return { ok: true, components: body.components as number };
  } catch {
    return { ok: false };
  }
}

export async function autoUploadSightmap(
  sightmapUploadUrl: string,
  cwd?: string
): Promise<void> {
  const root = findSightmapRoot(cwd ?? process.cwd());
  if (!root) return;

  const components = collectComponents(root);
  const memory = collectMemory(root);
  const result = await uploadSightmap(sightmapUploadUrl, components, memory);
  if (result.ok) {
    console.error(`sightmap: uploaded ${result.components ?? components.length} components`);
  }
}
```

**Step 3: Build and run tests**

```bash
cd /Users/chip/src/subtext/cli && npm run build && npm test
```
Expected: All sightmap tests PASS.

**Step 4: Commit**

```bash
git add tests/sightmap.test.ts src/sdk/sightmap.ts
git commit -m "feat: implement sightmap collection and upload"
```

---

### Task 6: Tunnel — Localhost Detection (tests + implementation)

**Files:**
- Create: `tests/tunnel.test.ts`
- Create: `src/sdk/tunnel.ts`

**Step 1: Write tests**

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("isLocalUrl", () => {
  it("returns true for http://localhost:3000", () => {
    const { isLocalUrl } = require("../src/sdk/tunnel.js");
    assert.equal(isLocalUrl("http://localhost:3000"), true);
  });

  it("returns true for http://127.0.0.1:8080", () => {
    const { isLocalUrl } = require("../src/sdk/tunnel.js");
    assert.equal(isLocalUrl("http://127.0.0.1:8080"), true);
  });

  it("returns true for http://0.0.0.0:3000", () => {
    const { isLocalUrl } = require("../src/sdk/tunnel.js");
    assert.equal(isLocalUrl("http://0.0.0.0:3000"), true);
  });

  it("returns true for http://[::1]:3000", () => {
    const { isLocalUrl } = require("../src/sdk/tunnel.js");
    assert.equal(isLocalUrl("http://[::1]:3000"), true);
  });

  it("returns true for http://myapp.local:3000", () => {
    const { isLocalUrl } = require("../src/sdk/tunnel.js");
    assert.equal(isLocalUrl("http://myapp.local:3000"), true);
  });

  it("returns false for https://example.com", () => {
    const { isLocalUrl } = require("../src/sdk/tunnel.js");
    assert.equal(isLocalUrl("https://example.com"), false);
  });

  it("returns false for https://storyarc-app.netlify.app", () => {
    const { isLocalUrl } = require("../src/sdk/tunnel.js");
    assert.equal(isLocalUrl("https://storyarc-app.netlify.app"), false);
  });

  it("returns false for http://192.168.1.100:3000", () => {
    const { isLocalUrl } = require("../src/sdk/tunnel.js");
    assert.equal(isLocalUrl("http://192.168.1.100:3000"), false);
  });
});
```

**Step 2: Implement tunnel module**

Create `src/sdk/tunnel.ts`:

```typescript
export function isLocalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname === "::1" ||
      hostname === "[::1]" ||
      hostname.endsWith(".local")
    );
  } catch {
    return false;
  }
}
```

**Step 3: Build and run tests**

```bash
cd /Users/chip/src/subtext/cli && npm run build && npm test
```
Expected: All tunnel tests PASS.

**Step 4: Commit**

```bash
git add tests/tunnel.test.ts src/sdk/tunnel.ts
git commit -m "feat: add localhost URL detection for tunnel routing"
```

---

### Task 7: Hooks — System and Post-Connect Hook (tests + implementation)

**Files:**
- Create: `tests/hooks.test.ts`
- Create: `src/sdk/hooks.ts`

**Step 1: Write tests**

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Hooks", () => {
  it("runs postConnect hook with correct context", async () => {
    const { createHooks } = require("../src/sdk/hooks.js");
    let receivedCtx: any = null;
    const hooks = createHooks({
      postConnect: async (ctx: any) => { receivedCtx = ctx; }
    });

    await hooks.runPostConnect({
      connectionId: "abc",
      url: "https://example.com",
      responseText: "sightmap_upload_url: https://upload.example.com/sightmap?token=xyz",
    });

    assert.equal(receivedCtx.connectionId, "abc");
    assert.equal(receivedCtx.url, "https://example.com");
    assert.equal(receivedCtx.sightmapUploadUrl, "https://upload.example.com/sightmap?token=xyz");
  });

  it("does NOT run hook when disabled", async () => {
    const { createHooks } = require("../src/sdk/hooks.js");
    let ran = false;
    const hooks = createHooks({
      postConnect: async () => { ran = true; },
      enabled: false,
    });

    await hooks.runPostConnect({
      connectionId: "abc",
      url: "https://example.com",
      responseText: "",
    });

    assert.equal(ran, false);
  });

  it("hook failure does not throw", async () => {
    const { createHooks } = require("../src/sdk/hooks.js");
    const hooks = createHooks({
      postConnect: async () => { throw new Error("boom"); },
    });

    // Should not throw
    await hooks.runPostConnect({
      connectionId: "abc",
      url: "https://example.com",
      responseText: "",
    });
  });

  it("extracts sightmap_upload_url from response text", async () => {
    const { extractSightmapUploadUrl } = require("../src/sdk/hooks.js");
    const text = `connection_id: abc
sightmap_upload_url: https://st.fullstory.com/subtext/sightmap?token=123&affinity_key=abc
viewer_url: https://example.com`;
    const url = extractSightmapUploadUrl(text);
    assert.equal(url, "https://st.fullstory.com/subtext/sightmap?token=123&affinity_key=abc");
  });

  it("returns null when no sightmap_upload_url in response", () => {
    const { extractSightmapUploadUrl } = require("../src/sdk/hooks.js");
    const url = extractSightmapUploadUrl("connection_id: abc\nviewer_url: https://x.com");
    assert.equal(url, null);
  });
});
```

**Step 2: Implement hooks module**

Create `src/sdk/hooks.ts`:

```typescript
import { autoUploadSightmap } from "./sightmap.js";

export interface HookContext {
  connectionId: string;
  url: string;
  sightmapUploadUrl: string | null;
}

interface RunPostConnectInput {
  connectionId: string;
  url: string;
  responseText: string;
}

interface HooksConfig {
  postConnect?: (ctx: HookContext) => Promise<void>;
  enabled?: boolean;
}

interface Hooks {
  runPostConnect: (input: RunPostConnectInput) => Promise<void>;
}

export function extractSightmapUploadUrl(text: string): string | null {
  const match = text.match(/sightmap_upload_url:\s*(\S+)/);
  return match ? match[1] : null;
}

export function createHooks(config: HooksConfig = {}): Hooks {
  const enabled = config.enabled !== false;

  return {
    async runPostConnect(input: RunPostConnectInput): Promise<void> {
      if (!enabled) return;

      const sightmapUploadUrl = extractSightmapUploadUrl(input.responseText);
      const ctx: HookContext = {
        connectionId: input.connectionId,
        url: input.url,
        sightmapUploadUrl,
      };

      const hook = config.postConnect ?? defaultPostConnect;
      try {
        await hook(ctx);
      } catch {
        // Hook failures are silent — connect should still succeed
      }
    },
  };
}

async function defaultPostConnect(ctx: HookContext): Promise<void> {
  if (ctx.sightmapUploadUrl) {
    await autoUploadSightmap(ctx.sightmapUploadUrl);
  }
}
```

**Step 3: Build and run tests**

```bash
cd /Users/chip/src/subtext/cli && npm run build && npm test
```
Expected: All hook tests PASS.

**Step 4: Commit**

```bash
git add tests/hooks.test.ts src/sdk/hooks.ts
git commit -m "feat: add hook system with post-connect sightmap upload"
```

---

### Task 8: Enhance SubtextClient — Smart Connect with Hooks

**Files:**
- Modify: `src/sdk/client.ts`
- Modify: `tests/client.test.ts` (append)

**Step 1: Append new client tests**

Add to `tests/client.test.ts`:

```typescript
describe("SubtextClient enhanced connect", () => {
  it("accepts hooks option in constructor", () => {
    const client = new SubtextClient({ apiKey: "key", apiUrl: "http://127.0.0.1:1", hooks: false });
    assert.ok(client instanceof SubtextClient);
  });

  it("accepts hooks option in constructor defaulting to true", () => {
    const client = new SubtextClient({ apiKey: "key", apiUrl: "http://127.0.0.1:1" });
    assert.ok(client instanceof SubtextClient);
  });
});
```

**Step 2: Update SubtextClient to accept hooks option**

Modify `src/sdk/client.ts`:

```typescript
import { callTool, SubtextConfig, ToolResult } from "./transport.js";
import { createHooks } from "./hooks.js";
import { isLocalUrl } from "./tunnel.js";

export interface SubtextClientConfig extends SubtextConfig {
  hooks?: boolean;
}

export class SubtextClient {
  private config: SubtextConfig;
  private hooks;

  constructor(config: SubtextClientConfig) {
    this.config = { apiKey: config.apiKey, apiUrl: config.apiUrl };
    const hooksEnabled = config.hooks !== false &&
      process.env.SUBTEXT_NO_HOOKS !== "1";
    this.hooks = createHooks({ enabled: hooksEnabled });
  }

  async connect(url: string): Promise<ToolResult> {
    const result = await callTool(this.config, "live-connect", { url });

    // Run post-connect hook (sightmap upload)
    const responseText = result.content
      .filter(c => c.type === "text" && c.text)
      .map(c => c.text!)
      .join("\n");
    const connectionId = responseText.match(/connection_id:\s*(\S+)/)?.[1] ?? "";
    await this.hooks.runPostConnect({ connectionId, url, responseText });

    return result;
  }

  // ... rest of methods unchanged
```

**Step 3: Update SDK exports**

Modify `src/sdk/index.ts`:

```typescript
export { SubtextClient } from "./client.js";
export type { SubtextClientConfig } from "./client.js";
export { callTool } from "./transport.js";
export type { SubtextConfig, ContentItem, ToolResult } from "./transport.js";
export { findSightmapRoot, collectComponents, collectMemory, uploadSightmap, autoUploadSightmap, flattenComponents, parseSightmapFile } from "./sightmap.js";
export type { SightmapConfig, SightmapComponent, SightmapView, FlatComponent, UploadResult } from "./sightmap.js";
export { isLocalUrl } from "./tunnel.js";
export { createHooks, extractSightmapUploadUrl } from "./hooks.js";
export type { HookContext } from "./hooks.js";
```

**Step 4: Build and run tests**

```bash
cd /Users/chip/src/subtext/cli && npm run build && npm test
```
Expected: All tests PASS including new client tests.

**Step 5: Commit**

```bash
git add src/sdk/client.ts src/sdk/index.ts tests/client.test.ts
git commit -m "feat: enhance SubtextClient with hooks and sightmap auto-upload on connect"
```

---

### Task 9: CLI — Add --no-hooks flag and sightmap commands

**Files:**
- Modify: `src/cli/commands.ts`
- Modify: `tests/cli-smoke.test.ts` (append)

**Step 1: Append CLI smoke tests**

Add to `tests/cli-smoke.test.ts`:

```typescript
it("connect --no-hooks flag is accepted", async () => {
  const { code, stderr } = await run(["connect", "https://example.com", "--no-hooks"], {
    SECRET_SUBTEXT_API_KEY: "test-key",
  });
  // Will fail on connect (unreachable), but flag should be parsed without error about unknown flag
  assert.ok(!stderr.includes("Unknown argument: no-hooks"), "should accept --no-hooks flag");
});

it("sightmap upload shows error without url", async () => {
  const { code, stderr } = await run(["sightmap", "upload"]);
  assert.notEqual(code, 0);
});

it("sightmap show command exists", async () => {
  const { code } = await run(["sightmap", "show", "--help"]);
  assert.equal(code, 0);
});
```

**Step 2: Add --no-hooks to connect and sightmap subcommands to CLI**

In `src/cli/commands.ts`, add `--no-hooks` as a global option to the connect command, and add `sightmap upload` and `sightmap show` commands. Update `getClient()` to respect the flag.

The connect command handler should pass `hooks: !argv.noHooks` when constructing the client.

Add sightmap commands:
- `sightmap upload <url>` — calls `autoUploadSightmap(url, process.cwd())`
- `sightmap show` — finds `.sightmap/`, parses, prints summary

**Step 3: Build and run tests**

```bash
cd /Users/chip/src/subtext/cli && npm run build && npm test
```
Expected: All CLI smoke tests PASS.

**Step 4: Commit**

```bash
git add src/cli/commands.ts tests/cli-smoke.test.ts
git commit -m "feat: add --no-hooks flag and sightmap CLI commands"
```

---

### Task 10: Final integration check and version bump

**Files:**
- Modify: `package.json` (version bump)

**Step 1: Run full build + test suite**

```bash
cd /Users/chip/src/subtext/cli && npm run build && npm test
```
Expected: All tests pass (original 16 + new ~30 = ~46 total).

**Step 2: Bump version**

```bash
npm version minor --no-git-tag-version
```
This bumps `0.1.0` → `0.2.0`.

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: bump version to 0.2.0 for sightmap + hooks release"
```

---

Plan complete and saved to `docs/plans/2026-04-08-cli-convergence-plan.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session in the subtext/cli directory with executing-plans, batch execution with checkpoints

Which approach?