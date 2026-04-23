// Parses the canonical Subtext trace URL:
//   https://app.fullstory.com/subtext/:orgId/trace/:traceId
// Returns the components the SDK needs to construct the embed iframe src.

export interface TraceUrlParts {
  appHost: string; // e.g. https://app.fullstory.com
  orgId: string;
  traceId: string;
}

export class InvalidTraceUrlError extends Error {
  constructor(input: string, reason: string) {
    super(`Invalid trace URL "${input}": ${reason}`);
    this.name = 'InvalidTraceUrlError';
  }
}

export function parseTraceUrl(raw: string): TraceUrlParts {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new InvalidTraceUrlError(raw, 'not a valid absolute URL');
  }
  const parts = url.pathname.split('/').filter(Boolean);
  const traceIdx = parts.indexOf('trace');
  if (traceIdx < 1 || traceIdx >= parts.length - 1) {
    throw new InvalidTraceUrlError(
      raw,
      'expected path of the form /subtext/:orgId/trace/:traceId',
    );
  }
  const orgId = parts[traceIdx - 1]!;
  const traceId = parts[traceIdx + 1]!;
  // app.X → app host. Strip pathname/search/hash.
  const appHost = `${url.protocol}//${url.host}`;
  return { appHost, orgId, traceId };
}

// Build the iframe src for the embed route. The initial token, when
// provided, rides the URL fragment (never sent to the server, not in
// Referer, not in logs). Subsequent refreshes come via postMessage.
export function buildEmbedSrc(parts: TraceUrlParts, initialToken: string | null): string {
  const { appHost, orgId, traceId } = parts;
  const base = `${appHost}/subtext/${encodeURIComponent(orgId)}/trace/${encodeURIComponent(traceId)}/embed?embed=true`;
  if (!initialToken) return base;
  // The token is base64ish (may contain `+`, `/`, `:`, `!`). Don't
  // URL-encode: the iframe parses the fragment raw and treats `+` as
  // literal plus. See useEmbedAuth.parseTokenFromFragment in mn.
  return `${base}#token=${initialToken}`;
}
