import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, "../src/cli/index.js");

// Helper to run CLI
async function run(args: string[], env?: Record<string, string>) {
  try {
    const result = await exec("node", [CLI, ...args], {
      env: { ...process.env, ...env },
    });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (err: any) {
    return {
      code: err.code ?? 1,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
    };
  }
}

describe("CLI smoke tests", () => {
  it("--help exits 0 and shows commands", async () => {
    const { code, stdout } = await run(["--help"]);
    assert.equal(code, 0);
    assert.ok(stdout.includes("connect"), "stdout should mention 'connect'");
    assert.ok(
      stdout.includes("disconnect"),
      "stdout should mention 'disconnect'"
    );
  });

  it("--version exits 0", async () => {
    const { code } = await run(["--version"]);
    assert.equal(code, 0);
  });

  it("connect without url shows error", async () => {
    const { code, stderr } = await run(["connect"]);
    assert.notEqual(code, 0, "should exit non-zero");
    assert.ok(stderr.length > 0, "stderr should contain an error message");
  });

  it("unknown command shows error", async () => {
    const { code, stderr } = await run(["bogus"]);
    assert.notEqual(code, 0, "should exit non-zero");
    assert.ok(stderr.length > 0, "stderr should contain an error message");
  });

  it("missing API key shows clear error", async () => {
    const { code, stderr } = await run(["connect", "https://example.com"], {
      SECRET_SUBTEXT_API_KEY: "",
    });
    assert.notEqual(code, 0, "should exit non-zero");
    assert.ok(
      stderr.includes("SECRET_SUBTEXT_API_KEY"),
      "stderr should mention SECRET_SUBTEXT_API_KEY"
    );
  });

  it("connect --no-hooks flag is accepted", async () => {
    const { stderr } = await run(
      ["connect", "--no-hooks", "https://example.com"],
      { SECRET_SUBTEXT_API_KEY: "" }
    );
    // Should fail for missing API key, NOT for unknown argument
    assert.ok(
      !stderr.includes("Unknown argument"),
      "stderr should not contain 'Unknown argument'"
    );
  });

  it("click with numeric component_id passes as string", async () => {
    // Just verify the flag is accepted (will fail on connect, but shouldn't error on arg parsing)
    const { stderr } = await run(["click", "fake-conn", "15"], { SECRET_SUBTEXT_API_KEY: "test" });
    assert.ok(!stderr.includes("expected string"), "should not reject numeric component_id");
  });

  it("SUBTEXT_API_KEY is accepted as fallback", async () => {
    const { stderr } = await run(["connect", "https://example.com"], {
      SECRET_SUBTEXT_API_KEY: "",
      SUBTEXT_API_KEY: "",
    });
    assert.ok(
      stderr.includes("SUBTEXT_API_KEY"),
      "stderr should mention SUBTEXT_API_KEY"
    );
  });

  it("--version prints package version", async () => {
    const { code, stdout } = await run(["--version"]);
    assert.equal(code, 0);
    assert.match(stdout.trim(), /^\d+\.\d+\.\d+/, "should print semver version");
  });

  it("sightmap upload without url shows error", async () => {
    const { code, stderr } = await run(["sightmap", "upload"]);
    assert.notEqual(code, 0, "should exit non-zero");
    assert.ok(stderr.length > 0, "stderr should contain an error message");
  });

  it("sightmap show --help exits 0", async () => {
    const { code } = await run(["sightmap", "show", "--help"]);
    assert.equal(code, 0);
  });

  it("comments watch --help exits 0", async () => {
    const { code, stdout } = await run(["comments", "watch", "--help"]);
    assert.equal(code, 0);
    assert.ok(stdout.includes("session_id"));
  });

  it("get-skill prints skill content", async () => {
    const { code, stdout } = await run(["get-skill"]);
    assert.equal(code, 0);
    assert.ok(stdout.includes("Subtext CLI"), "should contain skill content");
  });

  it("get-skill --json wraps in JSON", async () => {
    const { code, stdout } = await run(["get-skill", "--json"]);
    assert.equal(code, 0);
    const parsed = JSON.parse(stdout);
    assert.ok(parsed.skill, "should have skill key");
  });
});
