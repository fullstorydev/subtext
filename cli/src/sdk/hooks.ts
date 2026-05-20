import { autoUploadSightmap } from "./sightmap.js";

// ── Types ──────────────────────────────────────────────────────────────

export interface HookContext {
  connectionId: string;
  url: string;
  sightmapUploadUrl: string | null;
}

export type PostConnectHook = (ctx: HookContext) => void | Promise<void>;

export interface HooksConfig {
  enabled?: boolean;
  postConnect?: PostConnectHook;
}

export interface Hooks {
  runPostConnect(params: {
    connectionId: string;
    url: string;
    responseText: string;
  }): Promise<void>;
}

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Extract `sightmap_upload_url: <url>` from response text.
 * Returns the URL string or null if not found.
 */
export function extractSightmapUploadUrl(text: string): string | null {
  const match = text.match(/sightmap_upload_url:\s*(\S+)/);
  return match ? match[1] : null;
}

// ── Default hook ────────────────────────────────────────────────────────

const defaultPostConnect: PostConnectHook = async (ctx) => {
  if (ctx.sightmapUploadUrl) {
    await autoUploadSightmap(ctx.sightmapUploadUrl);
  }
};

// ── Factory ─────────────────────────────────────────────────────────────

export function createHooks(config?: HooksConfig): Hooks {
  const enabled = config?.enabled ?? true;
  const postConnect = config?.postConnect ?? defaultPostConnect;

  return {
    async runPostConnect({ connectionId, url, responseText }) {
      if (!enabled) return;

      const sightmapUploadUrl = extractSightmapUploadUrl(responseText);
      const ctx: HookContext = { connectionId, url, sightmapUploadUrl };

      try {
        await postConnect(ctx);
      } catch {
        // Hook failures are silently swallowed — connect should still succeed.
      }
    },
  };
}
