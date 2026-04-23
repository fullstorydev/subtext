// Tiny reverse proxy for the embed preview harness.
//
// Serves embed-harness.html at / and proxies everything else to the configured
// upstream Subtext app. Same-origin keeps the iframe (which loads
// /subtext/:orgId/trace/:traceId/embed#token=...) and all its downstream
// fetches/WS flowing through one hostname — useful when you want to expose the
// harness behind a single tunnel.
//
// Configure via env vars:
//   PORT             default 9876
//   UPSTREAM_HOST    default app.fullstory.com
//   UPSTREAM_PORT    default 443
//   UPSTREAM_PROTO   http | https (default https)
//   ALLOW_INSECURE   1 to accept self-signed upstream certs (mkcert dev)
//
// Run:
//   node demo/proxy.mjs
//   UPSTREAM_HOST=app.staging.fullstory.com node demo/proxy.mjs
//   UPSTREAM_HOST=app.fullstory.test UPSTREAM_PORT=8043 ALLOW_INSECURE=1 node demo/proxy.mjs

import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import { URL } from "node:url";

const HARNESS_PATH = new URL("./embed-harness.html", import.meta.url).pathname;
const UPSTREAM_HOST = process.env.UPSTREAM_HOST ?? "app.fullstory.com";
const UPSTREAM_PORT = Number(process.env.UPSTREAM_PORT ?? 443);
const UPSTREAM_PROTO = process.env.UPSTREAM_PROTO ?? "https";
const ALLOW_INSECURE = process.env.ALLOW_INSECURE === "1";
const LISTEN_PORT = Number(process.env.PORT ?? 9876);

const harness = fs.readFileSync(HARNESS_PATH, "utf8");
const upstreamMod = UPSTREAM_PROTO === "http" ? http : https;
const upstreamHostHeader =
  (UPSTREAM_PROTO === "https" && UPSTREAM_PORT === 443) ||
  (UPSTREAM_PROTO === "http" && UPSTREAM_PORT === 80)
    ? UPSTREAM_HOST
    : `${UPSTREAM_HOST}:${UPSTREAM_PORT}`;

function proxy(req, res) {
  const upstreamOpts = {
    host: UPSTREAM_HOST,
    port: UPSTREAM_PORT,
    method: req.method,
    path: req.url,
    headers: { ...req.headers, host: upstreamHostHeader },
    rejectUnauthorized: !ALLOW_INSECURE,
  };
  const up = upstreamMod.request(upstreamOpts, (upRes) => {
    res.writeHead(upRes.statusCode ?? 502, upRes.headers);
    upRes.pipe(res);
  });
  up.on("error", (err) => {
    res.writeHead(502, { "content-type": "text/plain" });
    res.end(`upstream error: ${err.message}`);
  });
  req.pipe(up);
}

const server = http.createServer((req, res) => {
  // Match on pathname so ?src=... query strings still serve the harness.
  const url = new URL(req.url ?? "/", `http://localhost:${LISTEN_PORT}`);
  if (url.pathname === "/" || url.pathname === "/index.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(harness);
    return;
  }
  proxy(req, res);
});

// WebSocket upgrade — live mode replay streams over WS.
server.on("upgrade", (req, socket, head) => {
  const up = upstreamMod.request({
    host: UPSTREAM_HOST,
    port: UPSTREAM_PORT,
    method: req.method,
    path: req.url,
    headers: { ...req.headers, host: upstreamHostHeader },
    rejectUnauthorized: !ALLOW_INSECURE,
  });
  up.on("upgrade", (upRes, upSocket, upHead) => {
    socket.write(
      `HTTP/1.1 ${upRes.statusCode} ${upRes.statusMessage}\r\n` +
        Object.entries(upRes.headers)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
          .join("\r\n") +
        "\r\n\r\n",
    );
    if (upHead && upHead.length) socket.write(upHead);
    upSocket.pipe(socket);
    socket.pipe(upSocket);
  });
  up.on("error", () => socket.destroy());
  up.end();
});

server.listen(LISTEN_PORT, () => {
  const upstreamUrl = `${UPSTREAM_PROTO}://${upstreamHostHeader}`;
  console.log(`embed-preview proxy listening on http://localhost:${LISTEN_PORT}`);
  console.log(`  /           → embed-harness.html`);
  console.log(`  /*          → ${upstreamUrl}/*`);
  console.log(`  WS /*       → ${upstreamUrl.replace(/^http/, "ws")}/*`);
});
