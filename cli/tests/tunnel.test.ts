import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isLocalUrl } from "../src/sdk/tunnel.js";

describe("isLocalUrl", () => {
  it("returns true for localhost", () => {
    assert.equal(isLocalUrl("http://localhost:3000"), true);
  });

  it("returns true for 127.0.0.1", () => {
    assert.equal(isLocalUrl("http://127.0.0.1:8080"), true);
  });

  it("returns true for 0.0.0.0", () => {
    assert.equal(isLocalUrl("http://0.0.0.0:4000"), true);
  });

  it("returns true for ::1", () => {
    assert.equal(isLocalUrl("http://[::1]:3000"), true);
  });

  it("returns true for hostname ending in .local", () => {
    assert.equal(isLocalUrl("http://my-machine.local:8080"), true);
  });

  it("returns false for a public hostname", () => {
    assert.equal(isLocalUrl("https://example.com"), false);
  });

  it("returns false for LAN IP 192.168.x.x", () => {
    assert.equal(isLocalUrl("http://192.168.1.100:3000"), false);
  });

  it("returns false for an invalid URL", () => {
    assert.equal(isLocalUrl("not-a-url"), false);
  });
});
