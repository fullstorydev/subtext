/**
 * Test server for reproducing ERR_INCOMPLETE_CHUNKED_ENCODING through the tunnel.
 *
 * Serves an HTML page that loads a large JS "bundle" as chunked transfer-encoding.
 * The page reports success/failure via console.log, which the live browser can observe.
 *
 * Usage:
 *   node tests/chunked-server.mjs [--port PORT] [--key KEY_FILE] [--cert CERT_FILE]
 *
 * Default port: 9443
 * Default certs: /tmp/chunked-test.key / /tmp/chunked-test.crt
 *
 * Generate certs:
 *   openssl req -x509 -newkey rsa:2048 -keyout /tmp/chunked-test.key \
 *     -out /tmp/chunked-test.crt -days 365 -nodes \
 *     -subj "/CN=chunked.fullstory.test" \
 *     -addext "subjectAltName=DNS:chunked.fullstory.test"
 */

import https from 'node:https';
import fs from 'node:fs';
// --- CLI args ---
const args = process.argv.slice(2);
function getArg(name, def) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 ? args[idx + 1] : def;
}
const PORT = parseInt(getArg('port', '9443'), 10);
const KEY_FILE = getArg('key', '/tmp/chunked-test.key');
const CERT_FILE = getArg('cert', '/tmp/chunked-test.crt');

const CHUNK_SIZE = 16 * 1024; // 16 KB — matches Node TCP default

// Parse a size string like "1mb", "50kb", "200mb" → bytes
function parseSize(str) {
  const m = str.match(/^(\d+(?:\.\d+)?)(kb|mb|gb|b)?$/i);
  if (!m) return parseInt(str, 10);
  const n = parseFloat(m[1]);
  switch ((m[2] || 'b').toLowerCase()) {
    case 'kb': return Math.floor(n * 1024);
    case 'mb': return Math.floor(n * 1024 * 1024);
    case 'gb': return Math.floor(n * 1024 * 1024 * 1024);
    default:   return Math.floor(n);
  }
}

function buildHTML(size) {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Chunked Encoding Test (${size})</title>
  <script>
    window.__BUNDLE_LOADED = false;
    window.onerror = function(msg, src, line, col, err) {
      console.error('BUNDLE_ERROR: ' + msg);
    };
  </script>
</head>
<body>
  <h1 id="status">Loading ${size} bundle…</h1>
  <script src="/bundle.js?size=${size}"></script>
  <script>
    document.getElementById('status').textContent =
      window.__BUNDLE_LOADED ? 'Bundle loaded OK ✓' : 'Bundle NOT loaded ✗';
  </script>
</body>
</html>`;
}

function serveChunked(req, res) {
  const url = new URL(req.url, 'https://localhost');
  const sizeParam = url.searchParams.get('size') || '1mb';
  const delayMs = parseInt(url.searchParams.get('delay') || '0', 10);
  const totalBytes = parseSize(sizeParam);

  console.log(`[server] GET /bundle.js size=${sizeParam} (${totalBytes} bytes) delay=${delayMs}ms`);

  // Use chunked TE — Node's default when Content-Length is omitted.
  res.writeHead(200, {
    'Content-Type': 'application/javascript',
    'Cache-Control': 'no-store',
  });

  // Fill with semicolons — valid JS empty statements that execute without error.
  // Last bytes set window.__BUNDLE_LOADED = true so the page knows it arrived.
  const sentinel = `window.__BUNDLE_LOADED = true;\n`;
  const fillBytes = totalBytes - sentinel.length;
  const fillChunk = Buffer.alloc(CHUNK_SIZE, ';'.charCodeAt(0)); // empty statements

  let sent = 0;
  const startTime = Date.now();

  function writeChunks() {
    while (sent < fillBytes) {
      const remaining = fillBytes - sent;
      const chunk = remaining >= CHUNK_SIZE ? fillChunk : fillChunk.subarray(0, remaining);
      const ok = res.write(chunk);
      sent += chunk.length;
      if (!ok) {
        // Backpressure from Node's writable — wait for drain
        res.once('drain', writeChunks);
        return;
      }
      if (delayMs > 0 && sent % (CHUNK_SIZE * 4) === 0) {
        // Inject a small delay periodically to hold the connection open longer
        setTimeout(writeChunks, delayMs);
        return;
      }
    }
    res.end(sentinel);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[server] Finished /bundle.js: sent ${sent + sentinel.length} bytes in ${elapsed}s`);
  }

  writeChunks();
}

const server = https.createServer(
  {
    key: fs.readFileSync(KEY_FILE),
    cert: fs.readFileSync(CERT_FILE),
  },
  (req, res) => {
    console.log(`[server] ${req.method} ${req.url}`);
    const reqUrl = new URL(req.url, 'https://localhost');
    if (reqUrl.pathname === '/') {
      const size = reqUrl.searchParams.get('size') || '1mb';
      res.writeHead(200, {'Content-Type': 'text/html'});
      res.end(buildHTML(size));
    } else if (reqUrl.pathname === '/bundle.js') {
      serveChunked(req, res);
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  },
);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] Listening on https://0.0.0.0:${PORT}`);
  console.log(`[server] Test URLs:`);
  console.log(`  https://chunked.fullstory.test:${PORT}/bundle.js?size=1mb`);
  console.log(`  https://chunked.fullstory.test:${PORT}/bundle.js?size=50mb`);
  console.log(`  https://chunked.fullstory.test:${PORT}/bundle.js?size=200mb`);
  console.log(`[server] Chunk size: ${CHUNK_SIZE} bytes`);
});

server.on('error', err => {
  console.error('[server] Error:', err.message);
  process.exit(1);
});
