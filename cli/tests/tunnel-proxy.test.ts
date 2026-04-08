import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { startTunnelProxy } from "../src/sdk/tunnel-proxy.js";
import type { TunnelProxy, TunnelProxyOptions } from "../src/sdk/tunnel-proxy.js";

describe("startTunnelProxy", () => {
  it("is a function", () => {
    assert.equal(typeof startTunnelProxy, "function");
  });

  it("returns an object with the correct shape", () => {
    // Use a dummy URL — connection will fail, but we can inspect the shape
    // We use wss:// to avoid Node complaining about non-TLS in some setups
    const proxy: TunnelProxy = startTunnelProxy({
      relayUrl: "wss://127.0.0.1:1/__test_no_connect__",
      target: "http://localhost:3000",
    });

    assert.equal(typeof proxy.close, "function");
    assert.equal(typeof proxy.state, "string");
    assert.ok(
      proxy.state === "connecting" || proxy.state === "closed",
      `state should be connecting or closed, got ${proxy.state}`,
    );
    assert.equal(proxy.connectionId, null);

    // Clean up
    proxy.close();
  });

  it("accepts optional connectionId", () => {
    const proxy = startTunnelProxy({
      relayUrl: "wss://127.0.0.1:1/__test_no_connect__",
      target: "http://localhost:3000",
      connectionId: "test-conn-123",
    });

    // connectionId on the proxy is null until relay sends ready
    assert.equal(proxy.connectionId, null);
    proxy.close();
  });

  it("state transitions to closed after close()", () => {
    const proxy = startTunnelProxy({
      relayUrl: "wss://127.0.0.1:1/__test_no_connect__",
      target: "http://localhost:3000",
    });

    proxy.close();
    assert.equal(proxy.state, "closed");
  });
});
