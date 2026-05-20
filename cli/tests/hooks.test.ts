import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createHooks,
  extractSightmapUploadUrl,
} from "../src/sdk/hooks.js";
import type { HookContext } from "../src/sdk/hooks.js";

describe("extractSightmapUploadUrl", () => {
  it("extracts URL from multi-line response text", () => {
    const text = [
      "connection_id: abc-123",
      "viewer_url: https://app.fullstory.com/viewer/abc",
      "sightmap_upload_url: https://st.fullstory.com/subtext/sightmap?token=aaaa-bbbb&affinity_key=cccc-dddd",
      "status: connected",
    ].join("\n");

    assert.equal(
      extractSightmapUploadUrl(text),
      "https://st.fullstory.com/subtext/sightmap?token=aaaa-bbbb&affinity_key=cccc-dddd",
    );
  });

  it("returns null when sightmap_upload_url is not present", () => {
    const text = "connection_id: abc-123\nstatus: connected\n";
    assert.equal(extractSightmapUploadUrl(text), null);
  });
});

describe("createHooks", () => {
  it("runs post-connect hook with correct context", async () => {
    let captured: HookContext | undefined;

    const hooks = createHooks({
      postConnect: (ctx) => {
        captured = ctx;
      },
    });

    await hooks.runPostConnect({
      connectionId: "conn-1",
      url: "http://localhost:3000",
      responseText:
        "sightmap_upload_url: https://st.fullstory.com/subtext/sightmap?token=t1",
    });

    assert.ok(captured);
    assert.equal(captured.connectionId, "conn-1");
    assert.equal(captured.url, "http://localhost:3000");
    assert.equal(
      captured.sightmapUploadUrl,
      "https://st.fullstory.com/subtext/sightmap?token=t1",
    );
  });

  it("does not run hook when disabled", async () => {
    let called = false;

    const hooks = createHooks({
      enabled: false,
      postConnect: () => {
        called = true;
      },
    });

    await hooks.runPostConnect({
      connectionId: "conn-2",
      url: "http://localhost:3000",
      responseText: "sightmap_upload_url: https://example.com/upload",
    });

    assert.equal(called, false);
  });

  it("swallows hook failures silently", async () => {
    const hooks = createHooks({
      postConnect: () => {
        throw new Error("hook exploded");
      },
    });

    // Should not throw
    await hooks.runPostConnect({
      connectionId: "conn-3",
      url: "http://localhost:3000",
      responseText: "status: connected",
    });
  });
});
