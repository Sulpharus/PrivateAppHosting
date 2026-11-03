// Serves hosted/musescore/dist like the gate: CSP (wasm-unsafe-eval), COOP, .wasm.br with
// Content-Encoding: br, and /_mininode/ from the kit (sdk.js is a stand-in).

import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const [dist, kit, port = '8791'] = process.argv.slice(2);
const here = new URL('.', import.meta.url).pathname;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.pdf': 'application/pdf',
};
const csp = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "media-src 'self' blob: https:",
  "connect-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let file;
  if (url.pathname === '/_mininode/sdk.js') file = join(here, 'sdk-stub.js');
  else if (url.pathname.startsWith('/_mininode/')) file = join(kit, url.pathname.slice(11));
  else file = join(dist, normalize(url.pathname === '/' ? '/index.html' : url.pathname));
  const headers = {
    'Content-Security-Policy': csp,
    'Cross-Origin-Opener-Policy': 'same-origin',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-cache',
  };
  if (file.endsWith('.wasm') && existsSync(`${file}.br`)) {
    res.writeHead(200, {
      ...headers,
      'Content-Type': 'application/wasm',
      'Content-Encoding': 'br',
    });
    return res.end(readFileSync(`${file}.br`));
  }
  if (!existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, headers);
    return res.end('not found');
  }
  res.writeHead(200, {
    ...headers,
    'Content-Type': types[extname(file)] ?? 'application/octet-stream',
  });
  res.end(readFileSync(file));
}).listen(Number(port), () => console.log(`http://localhost:${port}/`));
