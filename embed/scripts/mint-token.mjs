#!/usr/bin/env node
// Standalone token-mint utility for the @subtextdev/subtext-embed harness.
//
// Mirrors POST /auth/v1/subtext:embedToken — see the design doc and
// fs/api/fullstoryapis/auth/v1alpha/auth.proto:GetSubtextEmbedToken for the
// authoritative contract. Kept dependency-free (just node:fetch + node:util)
// so contributors testing the embed flow don't have to install the full
// @subtextdev/subtext-cli package.
//
// Usage:
//   SUBTEXT_API_KEY=sk_... node scripts/mint-token.mjs \
//     --trace-url "https://app.fullstory.com/subtext/o-ABC/trace/tr-xyz12345"
//
//   # or
//   SUBTEXT_API_KEY=sk_... node scripts/mint-token.mjs \
//     --org o-ABC --trace-id tr-xyz12345
//
// Output: a single line with the embed URL (#token=... fragment included).
// Pass --html to get a copy-pasteable <iframe> snippet, or --json for the
// raw {accessToken, expiresAt, embedUrl} object.

import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    "trace-url": { type: "string" },
    org: { type: "string" },
    "trace-id": { type: "string" },
    "api-base": { type: "string" },
    "api-key": { type: "string" },
    html: { type: "boolean" },
    json: { type: "boolean" },
    help: { type: "boolean", short: "h" },
  },
});

if (values.help) {
  console.log(`Mint a Subtext embed token + URL.

Required (one of):
  --trace-url <url>            Canonical trace URL
  --org <id> --trace-id <id>   Org and trace IDs

Optional:
  --api-base <url>             API host (default: $SUBTEXT_API_BASE or https://api.fullstory.com)
  --api-key <key>              Agent API key (default: $SUBTEXT_API_KEY)
  --html                       Print an <iframe> snippet
  --json                       Print {accessToken, expiresAt, embedUrl}
`);
  process.exit(0);
}

const apiKey = values["api-key"] ?? process.env.SUBTEXT_API_KEY;
if (!apiKey) {
  console.error("Error: --api-key or SUBTEXT_API_KEY is required");
  process.exit(2);
}
const apiBase = (
  values["api-base"] ??
  process.env.SUBTEXT_API_BASE ??
  "https://api.fullstory.com"
).replace(/\/$/, "");

let orgId, traceId;
if (values["trace-url"]) {
  // Canonical: .../subtext/:orgId/trace/:traceId
  const parts = new URL(values["trace-url"]).pathname.split("/").filter(Boolean);
  const i = parts.indexOf("trace");
  if (i < 1 || i >= parts.length - 1) {
    console.error("Error: --trace-url must look like .../subtext/:orgId/trace/:traceId");
    process.exit(2);
  }
  orgId = parts[i - 1];
  traceId = parts[i + 1];
} else if (values.org && values["trace-id"]) {
  orgId = values.org;
  traceId = values["trace-id"];
} else {
  console.error("Error: provide --trace-url or both --org and --trace-id");
  process.exit(2);
}

const res = await fetch(`${apiBase}/auth/v1/subtext:embedToken`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ trace_id: traceId }),
});
if (!res.ok) {
  console.error(`Error: HTTP ${res.status} from ${apiBase}/auth/v1/subtext:embedToken`);
  console.error(await res.text());
  process.exit(1);
}
// Gateway emits snake_case JSON for the protobuf response.
const { access_token, expires_at } = await res.json();

const appHost = apiBase.replace(/(^|\/\/)api\./, "$1app.");
const embedUrl = `${appHost}/subtext/${orgId}/trace/${traceId}/embed?embed=true#token=${access_token}`;

if (values.json) {
  console.log(JSON.stringify({ accessToken: access_token, expiresAt: expires_at, embedUrl }, null, 2));
} else if (values.html) {
  console.log(
    `<iframe\n  src="${embedUrl}"\n  width="100%"\n  height="600"\n  style="border: none; border-radius: 8px;"\n  allow="clipboard-write"\n  title="Subtext Session Replay"\n></iframe>`,
  );
} else {
  console.log(embedUrl);
}
