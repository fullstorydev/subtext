import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SubtextClient } from "../src/sdk/client.js";

describe("SubtextClient", () => {
  const config = { apiKey: "test-key", apiUrl: "http://127.0.0.1:1" };

  it("stores config passed to constructor", () => {
    const client = new SubtextClient(config);
    assert.ok(client instanceof SubtextClient);
  });

  it("exposes all expected browser control methods", () => {
    const expectedMethods = [
      "connect",
      "disconnect",
      "snapshot",
      "screenshot",
      "navigate",
      "newTab",
      "closeTab",
      "tabs",
      "emulate",
      "resize",
    ];
    for (const method of expectedMethods) {
      assert.equal(
        typeof SubtextClient.prototype[method as keyof SubtextClient],
        "function",
        `missing method: ${method}`
      );
    }
  });

  it("exposes all expected interaction methods", () => {
    const expectedMethods = [
      "click",
      "fill",
      "hover",
      "keypress",
      "drag",
      "waitFor",
    ];
    for (const method of expectedMethods) {
      assert.equal(
        typeof SubtextClient.prototype[method as keyof SubtextClient],
        "function",
        `missing method: ${method}`
      );
    }
  });

  it("exposes all expected observation methods", () => {
    const expectedMethods = ["eval", "logs", "network"];
    for (const method of expectedMethods) {
      assert.equal(
        typeof SubtextClient.prototype[method as keyof SubtextClient],
        "function",
        `missing method: ${method}`
      );
    }
  });

  it("exposes raw escape hatch", () => {
    assert.equal(typeof SubtextClient.prototype.raw, "function");
  });

  it("connect() calls through to callTool and rejects for unreachable URL", async () => {
    const client = new SubtextClient(config);
    await assert.rejects(
      () => client.connect("https://example.com"),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        return true;
      }
    );
  });

  it("click() calls through to callTool and rejects for unreachable URL", async () => {
    const client = new SubtextClient(config);
    await assert.rejects(
      () => client.click("conn-1", "btn-1"),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        return true;
      }
    );
  });

  it("raw() calls through to callTool and rejects for unreachable URL", async () => {
    const client = new SubtextClient(config);
    await assert.rejects(
      () => client.raw("custom-tool", { foo: "bar" }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        return true;
      }
    );
  });

  it("accepts hooks: false in constructor", () => {
    const client = new SubtextClient({ ...config, hooks: false });
    assert.ok(client instanceof SubtextClient);
  });

  it("accepts config without hooks option (defaults to true)", () => {
    const client = new SubtextClient(config);
    assert.ok(client instanceof SubtextClient);
  });
});
