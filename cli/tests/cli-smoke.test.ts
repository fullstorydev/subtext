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

  it("sightmap upload without url shows error", async () => {
    const { code, stderr } = await run(["sightmap", "upload"]);
    assert.notEqual(code, 0, "should exit non-zero");
    assert.ok(stderr.length > 0, "stderr should contain an error message");
  });

  it("sightmap show --help exits 0", async () => {
    const { code } = await run(["sightmap", "show", "--help"]);
    assert.equal(code, 0);
  });
});
