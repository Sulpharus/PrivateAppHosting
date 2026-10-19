// Builds dist/ from WordCraft's official browser release (no Rust toolchain needed):
// downloads the pinned zip, checks its hash, moves the inline boot script into boot.js (the
// gate's CSP allows no inline scripts) and stores the 42 MB .wasm as .wasm.br, because one
// Cloudflare asset may be at most 25 MiB. The gate serves it Brotli-encoded under its own name.
// Usage: node build.mjs   (needs curl and unzip, both on the GitHub runners)

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants } from 'node:zlib';

const VERSION = '0.8.0';
const URL = `https://github.com/storytold/wordcraft/releases/download/v${VERSION}/wordcraft-web-${VERSION}.zip`;
const SHA256 = '37a5369cd66606e0c4e019e0f273f905a9b2e9101f68a191a6f40b8724225ecd';
const MAX_ASSET = 25 * 1024 * 1024;
// Files of the release that are hosting notes for other servers, not part of the app.
const SKIP = new Set(['README.md', 'HOSTING.md', '_headers', '.htaccess']);

const here = dirname(fileURLToPath(import.meta.url));
const cache = join(here, '.cache');
const zip = join(cache, `wordcraft-web-${VERSION}.zip`);
const dist = join(here, 'dist');

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${command} failed (exit ${result.status})`);
}

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

mkdirSync(cache, { recursive: true });
if (!existsSync(zip) || sha256(zip) !== SHA256) {
  run('curl', ['-fsSL', '--retry', '3', '-o', zip, URL]);
  const actual = sha256(zip);
  if (actual !== SHA256) throw new Error(`unexpected hash ${actual} for ${URL}`);
}

const unpacked = join(cache, 'unpacked');
rmSync(unpacked, { recursive: true, force: true });
run('unzip', ['-q', zip, '-d', unpacked]);
const site = join(unpacked, `wordcraft-web-${VERSION}`);

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist);
for (const name of readdirSync(site)) {
  if (!SKIP.has(name)) cpSync(join(site, name), join(dist, name), { recursive: true });
}
cpSync(join(here, 'i18n'), join(dist, 'i18n'), { recursive: true });

// The inline module that starts the app becomes boot.js; the loading text gets a language key.
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const inline = /<script type="module">([\s\S]*?)<\/script>/.exec(html);
if (!inline?.[1]) throw new Error('index.html: inline boot script not found');
// The gate checked the login before serving the page; once the app runs, the start screen may go.
const ready = "window.__mnReady = true;\ndispatchEvent(new Event('mn:ready'));";
writeFileSync(join(dist, 'boot.js'), `${inline[1].trim()}\n${ready}\n`);
const page = html
  .replace(inline[0], '<script type="module" src="./boot.js"></script>')
  .replace('<html lang="en">', '<html lang="de">')
  .replace('</title>', '</title>\n  <script src="/_mininode/i18n.js"></script>')
  .replace(
    '<div id="wordcraft_loading">Loading WordCraft&hellip;</div>',
    '<div id="wordcraft_loading" data-i18n="app.loading">WordCraft wird geladen …</div>',
  );
if (!page.includes('data-i18n="app.loading"'))
  throw new Error('index.html: loading text not found');
writeFileSync(join(dist, 'index.html'), page);

for (const name of readdirSync(dist)) {
  if (!name.endsWith('.wasm')) continue;
  const file = join(dist, name);
  // The name carries a content hash, so a cached copy is the same file (compressing takes minutes).
  const cached = join(cache, `${name}.br`);
  if (!existsSync(cached)) {
    const packed = brotliCompressSync(readFileSync(file), {
      params: {
        [constants.BROTLI_PARAM_QUALITY]: 11,
        [constants.BROTLI_PARAM_LGWIN]: 24,
        [constants.BROTLI_PARAM_SIZE_HINT]: statSync(file).size,
      },
    });
    writeFileSync(cached, packed);
  }
  const packed = readFileSync(cached);
  writeFileSync(`${file}.br`, packed);
  rmSync(file);
  console.log(`${name}: ${(packed.length / 1048576).toFixed(1)} MiB as Brotli`);
}

for (const name of readdirSync(dist, { recursive: true })) {
  const file = join(dist, String(name));
  if (statSync(file).isFile() && statSync(file).size > MAX_ASSET)
    throw new Error(`${name} is larger than the 25 MiB Cloudflare asset limit`);
}
console.log(`wrote ${dist}`);
