import { describe, it, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  findSightmapRoot,
  parseSightmapFile,
  flattenComponents,
  collectComponents,
  collectMemory,
  uploadSightmap,
  autoUploadSightmap,
} from "../src/sdk/sightmap.js";
import type { SightmapComponent } from "../src/sdk/sightmap.js";

// ── Helpers ────────────────────────────────────────────────────────────

let tmpDirs: string[] = [];

function makeTmp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sightmap-test-"));
  tmpDirs.push(dir);
  return dir;
}

function writeYaml(dir: string, name: string, content: string): string {
  const filePath = path.join(dir, name);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
  return filePath;
}

afterEach(() => {
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tmpDirs = [];
});

// ── Discovery ──────────────────────────────────────────────────────────

describe("findSightmapRoot", () => {
  it("finds .sightmap in cwd", () => {
    const tmp = makeTmp();
    const sm = path.join(tmp, ".sightmap");
    fs.mkdirSync(sm);
    writeYaml(sm, "app.yaml", "version: 1\n");
    assert.equal(findSightmapRoot(tmp), sm);
  });

  it("walks up the tree to find .sightmap", () => {
    const tmp = makeTmp();
    const sm = path.join(tmp, ".sightmap");
    fs.mkdirSync(sm);
    writeYaml(sm, "app.yaml", "version: 1\n");
    const nested = path.join(tmp, "a", "b");
    fs.mkdirSync(nested, { recursive: true });
    assert.equal(findSightmapRoot(nested), sm);
  });

  it("returns null when no .sightmap exists", () => {
    const tmp = makeTmp();
    assert.equal(findSightmapRoot(tmp), null);
  });

  it("returns null for empty .sightmap dir (no YAML files)", () => {
    const tmp = makeTmp();
    fs.mkdirSync(path.join(tmp, ".sightmap"));
    assert.equal(findSightmapRoot(tmp), null);
  });

  it("finds .sightmap with .yml extension", () => {
    const tmp = makeTmp();
    const sm = path.join(tmp, ".sightmap");
    fs.mkdirSync(sm);
    writeYaml(sm, "app.yml", "version: 1\n");
    assert.equal(findSightmapRoot(tmp), sm);
  });
});

// ── Parsing ────────────────────────────────────────────────────────────

describe("parseSightmapFile", () => {
  it("parses a valid v1 YAML", () => {
    const tmp = makeTmp();
    const filePath = writeYaml(
      tmp,
      "app.yaml",
      `version: 1
components:
  - name: Header
    selector: header
    source: src/Header.tsx
`,
    );
    const config = parseSightmapFile(filePath);
    assert.equal(config.version, 1);
    assert.equal(config.components?.length, 1);
    assert.equal(config.components![0].name, "Header");
  });

  it("parses views with routes", () => {
    const tmp = makeTmp();
    const filePath = writeYaml(
      tmp,
      "views.yaml",
      `version: 1
views:
  - name: Home
    route: /
    components:
      - name: Hero
        selector: ".hero"
  - name: About
    route: /about
`,
    );
    const config = parseSightmapFile(filePath);
    assert.equal(config.views?.length, 2);
    assert.equal(config.views![0].route, "/");
    assert.equal(config.views![0].components?.length, 1);
  });

  it("parses top-level memory", () => {
    const tmp = makeTmp();
    const filePath = writeYaml(
      tmp,
      "mem.yaml",
      `version: 1
memory:
  - "App uses dark theme by default"
  - "Login requires 2FA"
`,
    );
    const config = parseSightmapFile(filePath);
    assert.deepEqual(config.memory, [
      "App uses dark theme by default",
      "Login requires 2FA",
    ]);
  });

  it("returns { version: 0 } for empty file", () => {
    const tmp = makeTmp();
    const filePath = writeYaml(tmp, "empty.yaml", "");
    const config = parseSightmapFile(filePath);
    assert.deepEqual(config, { version: 0 });
  });
});

// ── Flattening ─────────────────────────────────────────────────────────

describe("flattenComponents", () => {
  it("flattens a single component", () => {
    const components: SightmapComponent[] = [
      { name: "Header", selector: "header", source: "src/Header.tsx" },
    ];
    const flat = flattenComponents(components);
    assert.equal(flat.length, 1);
    assert.equal(flat[0].name, "Header");
    assert.deepEqual(flat[0].selectors, ["header"]);
    assert.equal(flat[0].source, "src/Header.tsx");
    assert.deepEqual(flat[0].memory, []);
  });

  it("wraps string selector in array", () => {
    const flat = flattenComponents([
      { name: "Btn", selector: ".btn" },
    ]);
    assert.deepEqual(flat[0].selectors, [".btn"]);
  });

  it("preserves array selectors", () => {
    const flat = flattenComponents([
      { name: "Btn", selector: [".btn", "button.primary"] },
    ]);
    assert.deepEqual(flat[0].selectors, [".btn", "button.primary"]);
  });

  it("builds compound selectors for children", () => {
    const components: SightmapComponent[] = [
      {
        name: "Nav",
        selector: "nav",
        source: "src/Nav.tsx",
        children: [
          { name: "NavLink", selector: "a.nav-link" },
        ],
      },
    ];
    const flat = flattenComponents(components);
    assert.equal(flat.length, 2);
    assert.equal(flat[0].name, "Nav");
    assert.deepEqual(flat[0].selectors, ["nav"]);
    assert.equal(flat[1].name, "NavLink");
    assert.deepEqual(flat[1].selectors, ["nav a.nav-link"]);
    assert.equal(flat[1].source, "src/Nav.tsx"); // inherited
  });

  it("handles 3-level nesting with cross-product selectors", () => {
    const components: SightmapComponent[] = [
      {
        name: "Root",
        selector: [".root1", ".root2"],
        children: [
          {
            name: "Mid",
            selector: ".mid",
            children: [{ name: "Leaf", selector: ".leaf" }],
          },
        ],
      },
    ];
    const flat = flattenComponents(components);
    assert.equal(flat.length, 3);
    // Root
    assert.deepEqual(flat[0].selectors, [".root1", ".root2"]);
    // Mid: cross product with root
    assert.deepEqual(flat[1].selectors, [".root1 .mid", ".root2 .mid"]);
    // Leaf: cross product with mid
    assert.deepEqual(flat[2].selectors, [
      ".root1 .mid .leaf",
      ".root2 .mid .leaf",
    ]);
  });

  it("skips components with no selector", () => {
    const flat = flattenComponents([
      { name: "NoSelector" },
      { name: "HasSelector", selector: ".ok" },
    ]);
    assert.equal(flat.length, 1);
    assert.equal(flat[0].name, "HasSelector");
  });

  it("skips components with no name", () => {
    const flat = flattenComponents([
      { name: "", selector: ".x" },
      { name: "Valid", selector: ".v" },
    ]);
    assert.equal(flat.length, 1);
    assert.equal(flat[0].name, "Valid");
  });

  it("defaults memory to empty array", () => {
    const flat = flattenComponents([
      { name: "A", selector: ".a" },
    ]);
    assert.deepEqual(flat[0].memory, []);
  });

  it("preserves memory when set", () => {
    const flat = flattenComponents([
      { name: "A", selector: ".a", memory: ["note1"] },
    ]);
    assert.deepEqual(flat[0].memory, ["note1"]);
  });
});

// ── Collection ─────────────────────────────────────────────────────────

describe("collectComponents", () => {
  it("merges components from multiple files", () => {
    const tmp = makeTmp();
    writeYaml(
      tmp,
      "a.yaml",
      `version: 1
components:
  - name: Header
    selector: header
`,
    );
    writeYaml(
      tmp,
      "b.yaml",
      `version: 1
components:
  - name: Footer
    selector: footer
`,
    );
    const flat = collectComponents(tmp);
    const names = flat.map((c) => c.name);
    assert.ok(names.includes("Header"));
    assert.ok(names.includes("Footer"));
    assert.equal(flat.length, 2);
  });

  it("includes view-scoped components", () => {
    const tmp = makeTmp();
    writeYaml(
      tmp,
      "views.yaml",
      `version: 1
views:
  - name: Home
    route: /
    components:
      - name: Hero
        selector: ".hero"
`,
    );
    const flat = collectComponents(tmp);
    assert.equal(flat.length, 1);
    assert.equal(flat[0].name, "Hero");
  });

  it("finds YAML files in subdirectories", () => {
    const tmp = makeTmp();
    fs.mkdirSync(path.join(tmp, "sub"), { recursive: true });
    writeYaml(
      tmp,
      "sub/nested.yaml",
      `version: 1
components:
  - name: Deep
    selector: ".deep"
`,
    );
    const flat = collectComponents(tmp);
    assert.equal(flat.length, 1);
    assert.equal(flat[0].name, "Deep");
  });
});

// ── Memory ─────────────────────────────────────────────────────────────

describe("collectMemory", () => {
  it("collects memory from all files", () => {
    const tmp = makeTmp();
    writeYaml(
      tmp,
      "a.yaml",
      `version: 1
memory:
  - "Fact A"
`,
    );
    writeYaml(
      tmp,
      "b.yaml",
      `version: 1
memory:
  - "Fact B"
  - "Fact C"
`,
    );
    const memory = collectMemory(tmp);
    assert.deepEqual(memory.sort(), ["Fact A", "Fact B", "Fact C"]);
  });

  it("returns empty array when no memory entries", () => {
    const tmp = makeTmp();
    writeYaml(tmp, "a.yaml", "version: 1\n");
    assert.deepEqual(collectMemory(tmp), []);
  });
});

// ── Upload ─────────────────────────────────────────────────────────────

describe("uploadSightmap", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends correct JSON payload with no auth header", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    const components = [
      { name: "Btn", selectors: [".btn"], source: "src/Btn.tsx", memory: [] },
    ];
    const result = await uploadSightmap(
      "https://example.com/upload?token=abc",
      components,
      ["note1"],
    );

    assert.equal(result.ok, true);
    assert.equal(result.components, 1);
    assert.equal(capturedUrl, "https://example.com/upload?token=abc");
    assert.equal(capturedInit?.method, "POST");

    const headers = capturedInit?.headers as Record<string, string>;
    assert.equal(headers["Content-Type"], "application/json");
    // No Authorization header
    assert.equal(headers["Authorization"], undefined);

    const body = JSON.parse(capturedInit?.body as string);
    assert.deepEqual(body.components, components);
    assert.deepEqual(body.memory, ["note1"]);
  });

  it("returns ok: false on HTTP error", async () => {
    globalThis.fetch = async () => {
      return new Response("error", { status: 500 });
    };

    const result = await uploadSightmap("https://example.com/upload", [], []);
    assert.equal(result.ok, false);
  });

  it("returns ok: false on network error", async () => {
    globalThis.fetch = async () => {
      throw new Error("network failure");
    };

    const result = await uploadSightmap("https://example.com/upload", [], []);
    assert.equal(result.ok, false);
  });
});

// ── Auto-upload ────────────────────────────────────────────────────────

describe("autoUploadSightmap", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("no-ops when no .sightmap found", async () => {
    let fetchCalled = false;
    globalThis.fetch = async () => {
      fetchCalled = true;
      return new Response("", { status: 200 });
    };

    const tmp = makeTmp();
    await autoUploadSightmap("https://example.com/upload", tmp);
    assert.equal(fetchCalled, false);
  });

  it("uploads when .sightmap found", async () => {
    let capturedBody: string | undefined;
    globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    const tmp = makeTmp();
    const sm = path.join(tmp, ".sightmap");
    fs.mkdirSync(sm);
    writeYaml(
      sm,
      "app.yaml",
      `version: 1
components:
  - name: Header
    selector: header
memory:
  - "Dark theme"
`,
    );

    await autoUploadSightmap("https://example.com/upload", tmp);
    assert.ok(capturedBody);
    const body = JSON.parse(capturedBody!);
    assert.equal(body.components.length, 1);
    assert.equal(body.components[0].name, "Header");
    assert.deepEqual(body.memory, ["Dark theme"]);
  });
});
