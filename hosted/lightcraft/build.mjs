// Builds dist/ from an official "Craft" browser release (WordCraft, PdfCraft, DesignCraft,
// FilmCraft, PhotoCraft, LightCraft by storytold); no Rust toolchain needed. The same file sits in
// every one of these apps (each app stays exportable on its own); only release.json differs.
//
//   1. Download the pinned release zip and check its SHA-256.
//   2. Move every inline script into its own file: the gate's CSP allows no inline scripts.
//   3. German page language, language packages for the title and the loading text.
//   4. A .wasm above the 25 MiB Cloudflare asset limit is stored as <name>.wasm.br (Brotli); the
//      gate serves it under its own name. An upstream .wasm.br is kept, other .br/.gz copies go.
//
// Usage: node build.mjs   (needs curl and unzip, both on the GitHub runners)

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const release = JSON.parse(readFileSync(join(here, 'release.json'), 'utf8'));
const { name, version, sha256: SHA256, loadingText, readyEvent } = release;
const URL = `https://github.com/storytold/${name}/releases/download/v${version}/${name}-web-${version}.zip`;
const MAX_ASSET = 25 * 1024 * 1024;
// Hosting notes for other servers, not part of the app.
const SKIP = new Set(['README.md', 'HOSTING.md', '_headers', '.htaccess']);

const cache = join(here, '.cache');
const zip = join(cache, `${name}-web-${version}.zip`);
const dist = join(here, 'dist');
const german = JSON.parse(readFileSync(join(here, 'i18n', 'de.json'), 'utf8'));

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${command} failed (exit ${result.status})`);
}

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const files = (dir) =>
  readdirSync(dir, { recursive: true })
    .map((entry) => join(dir, String(entry)))
    .filter((file) => statSync(file).isFile());

mkdirSync(cache, { recursive: true });
if (!existsSync(zip) || sha256(zip) !== SHA256) {
  run('curl', ['-fsSL', '--retry', '3', '-o', zip, URL]);
  const actual = sha256(zip);
  if (actual !== SHA256) throw new Error(`unexpected hash ${actual} for ${URL}`);
}

const unpacked = join(cache, 'unpacked');
rmSync(unpacked, { recursive: true, force: true });
run('unzip', ['-q', zip, '-d', unpacked]);
const site = join(unpacked, `${name}-web-${version}`);

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist);
for (const entry of readdirSync(site)) {
  if (!SKIP.has(entry)) cpSync(join(site, entry), join(dist, entry), { recursive: true });
}
cpSync(join(here, 'i18n'), join(dist, 'i18n'), { recursive: true });
// Pre-compressed copies the gate never asks for (it only serves <name>.wasm.br).
for (const file of files(dist)) {
  if (file.endsWith('.gz') || (file.endsWith('.br') && !file.endsWith('.wasm.br'))) rmSync(file);
}

// Inline scripts become boot-1.js, boot-2.js, … in the same place and with the same type.
let count = 0;
let page = readFileSync(join(dist, 'index.html'), 'utf8').replace(
  /<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi,
  (tag, attributes = '', body) => {
    if (/\ssrc\s*=/i.test(attributes)) return tag;
    count += 1;
    writeFileSync(join(dist, `boot-${count}.js`), `${body.trim()}\n`);
    return `<script${attributes} src="./boot-${count}.js"></script>`;
  },
);
// The gate checked the login before serving the page, so the start screen may go once the app
// shows something: right away when the page has its own loading text, otherwise when the app
// reports that it runs (release.json `readyEvent`, e.g. Trunk's "TrunkApplicationStarted").
const signal = "window.__mnReady = true;\ndispatchEvent(new Event('mn:ready'));";
writeFileSync(
  join(dist, 'mn-ready.js'),
  readyEvent
    ? `addEventListener(${JSON.stringify(readyEvent)}, () => {\n${signal}\n}, { once: true });\n`
    : `${signal}\n`,
);
page = page
  .replace(/<html lang="en"/, '<html lang="de"')
  .replace(/<title>([^<]*)<\/title>/, '<title data-i18n="app.title">$1</title>')
  .replace('</title>', '</title>\n  <script src="/_mininode/i18n.js"></script>')
  .replace('</body>', '  <script src="./mn-ready.js"></script>\n</body>');
if (loadingText) {
  page = page.replace(
    `>${loadingText}<`,
    `><span data-i18n="app.loading">${german['app.loading']}</span><`,
  );
}
const markers = ['<html lang="de"', 'data-i18n="app.title"', '/_mininode/i18n.js', 'mn-ready.js'];
if (loadingText) markers.push('data-i18n="app.loading"');
for (const marker of markers) {
  if (!page.includes(marker)) throw new Error(`index.html: the release markup changed (${marker})`);
}
if (
  /<script\b(?![^>]*\ssrc\s*=)[^>]*>/i.test(page) ||
  /<[^>]+\son[a-z]+\s*=/i.test(page) ||
  /\shref\s*=\s*["']?\s*javascript:/i.test(page)
)
  throw new Error('index.html: an inline script or handler is left; the CSP would block it');
writeFileSync(join(dist, 'index.html'), page);

for (const file of files(dist)) {
  if (!file.endsWith('.wasm')) continue;
  // The gate always prefers <name>.wasm.br, so the plain file would never be served.
  if (existsSync(`${file}.br`)) {
    rmSync(file);
    console.log(`${file.slice(dist.length + 1)}: served from the release's own .br`);
    continue;
  }
  if (statSync(file).size <= MAX_ASSET) continue;
  // The name carries a content hash or the version, so a cached copy is the same file.
  const cached = join(cache, `${version}-${file.slice(dist.length + 1).replaceAll('/', '_')}.br`);
  if (!existsSync(cached)) {
    const packed = brotliCompressSync(readFileSync(file), {
      params: {
        // 9 takes under a minute (11 takes three for 1.5 MiB less); CI and deploy build it fresh.
        [constants.BROTLI_PARAM_QUALITY]: 9,
        [constants.BROTLI_PARAM_LGWIN]: 24,
        [constants.BROTLI_PARAM_SIZE_HINT]: statSync(file).size,
      },
    });
    // Written under a temporary name first: a cut-off run must not leave a broken cache.
    writeFileSync(`${cached}.part`, packed);
    renameSync(`${cached}.part`, cached);
  }
  cpSync(cached, `${file}.br`);
  rmSync(file);
  console.log(`${file.slice(dist.length + 1)}: served from .br`);
}

for (const file of files(dist)) {
  if (statSync(file).size > MAX_ASSET)
    throw new Error(`${file} is larger than the 25 MiB Cloudflare asset limit`);
}
console.log(`wrote ${dist}`);
