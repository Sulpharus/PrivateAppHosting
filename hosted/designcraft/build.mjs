// Builds dist/ from a "Craft" browser release (WordCraft, PdfCraft, DesignCraft, FilmCraft,
// PhotoCraft, LightCraft by storytold). The same file sits in every one of these apps (each app
// stays exportable on its own); only release.json and patches/ differ.
//
//   1. The release zip: with patches/ (release.json `patches`), built from the upstream source at
//      tag v<version> with the patches applied, by the app's own packaging/web/package.sh (needs
//      Rust, see README); otherwise the official release zip, its SHA-256 checked.
//   2. Move every inline script into its own file: the gate's CSP allows no inline scripts.
//      mn-boot.js starts them once the person is signed in, the app's settings are back in
//      localStorage from their account and the page language is set (the patches read it).
//   3. German page language, language packages for the title and the loading text; with
//      release.json `files`, the kit's MiniNode files dialog for opening and saving.
//   4. A MiniNode strip ("← Alle Apps") above the app; its canvas moves below it (mn-bar.css).
//   5. Every .wasm with a hash in its name is named after its final content (the gate lets
//      browsers keep such a module for a year), and the references to it follow.
//   6. A .wasm above the 25 MiB Cloudflare asset limit is stored as <name>.wasm.br (Brotli); the
//      gate serves it under its own name. An upstream .wasm.br is kept, other .br/.gz copies go.
//
// Usage: node build.mjs            build dist/ (needs curl, unzip and git)
//        node build.mjs --source   only make sure the patched release zip exists (CI build job)
//        node build.mjs --key      print the cache key of the patched release zip

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
const {
  name,
  version,
  sha256: SHA256,
  loadingText,
  readyEvent,
  patches = [],
  files: useFiles,
} = release;
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

// Bump when the way the patched zip is made changes, so caches built the old way are not reused.
// 2: built without a wasm-opt on PATH (1 used Ubuntu's, which broke the apps).
const SOURCE_BUILDER = 2;
const sourceKey = () =>
  createHash('sha256')
    .update(`${name}@${version}#${SOURCE_BUILDER}`)
    .update(patches.map((patch) => readFileSync(join(here, patch), 'utf8')).join('\0'))
    .digest('hex')
    .slice(0, 16);

const escapeHtml = (text) =>
  String(text).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );

const has = (command) => spawnSync(command, ['--version'], { stdio: 'ignore' }).status === 0;

/** The official release zip, downloaded once and checked against release.json. */
function officialZip() {
  if (!existsSync(zip) || sha256(zip) !== SHA256) {
    run('curl', ['-fsSL', '--retry', '3', '-o', zip, URL]);
    const actual = sha256(zip);
    if (actual !== SHA256) throw new Error(`unexpected hash ${actual} for ${URL}`);
  }
  return zip;
}

/** The release zip built from the patched upstream source; cached under its key. */
function patchedZip() {
  const built = join(cache, `source-${sourceKey()}.zip`);
  if (existsSync(built)) return built;
  if (!has('cargo') || !has('git')) {
    if (process.env.CI) throw new Error(`${name}: no patched build ${built} and no Rust toolchain`);
    console.warn(`${name}: Rust is not installed; using the unpatched official release instead`);
    return officialZip();
  }
  // Trunk takes a wasm-opt from PATH instead of downloading the current one, and FilmCraft's and
  // LightCraft's builds run any they find; an old one breaks the app (FilmCraft: "failed to grow
  // table"). The official releases are built without one.
  if (has('wasm-opt'))
    throw new Error(
      `${name}: a wasm-opt is on PATH (binaryen); the official releases build without one, take it off PATH`,
    );
  const src = join(cache, `src-${version}`);
  if (!existsSync(join(src, '.git'))) {
    rmSync(src, { recursive: true, force: true });
    run('git', [
      'clone',
      '--quiet',
      '--depth',
      '1',
      '--branch',
      `v${version}`,
      `https://github.com/storytold/${name}`,
      src,
    ]);
  }
  run('git', ['-C', src, 'reset', '--quiet', '--hard']);
  run('git', ['-C', src, 'clean', '--quiet', '-fd']);
  for (const patch of patches) run('git', ['-C', src, 'apply', join(here, patch)]);
  const out = join(cache, 'source-out');
  rmSync(out, { recursive: true, force: true });
  const result = spawnSync('bash', [join(src, 'packaging', 'web', 'package.sh')], {
    stdio: 'inherit',
    env: { ...process.env, DIST: out, CARGO_TARGET_DIR: join(cache, 'target') },
  });
  if (result.status !== 0) throw new Error(`${name}: packaging/web/package.sh failed`);
  // Only the newest patched build is kept.
  for (const old of readdirSync(cache)) {
    if (old.startsWith('source-') && old.endsWith('.zip')) rmSync(join(cache, old));
  }
  renameSync(join(out, `${name}-web-${version}.zip`), built);
  return built;
}

mkdirSync(cache, { recursive: true });
if (process.argv.includes('--key')) {
  console.log(sourceKey());
  process.exit(0);
}
const releaseZip = patches.length ? patchedZip() : officialZip();
if (process.argv.includes('--source')) process.exit(0);

const unpacked = join(cache, 'unpacked');
rmSync(unpacked, { recursive: true, force: true });
run('unzip', ['-q', releaseZip, '-d', unpacked]);
const site = join(unpacked, `${name}-web-${version}`);

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist);
for (const entry of readdirSync(site)) {
  if (!SKIP.has(entry)) cpSync(join(site, entry), join(dist, entry), { recursive: true });
}
cpSync(join(here, 'i18n'), join(dist, 'i18n'), { recursive: true });
// The logo also becomes the icon for "add to home screen" (the gate looks for these names).
for (const [source, target] of [
  ['icon.png', 'icon-512.png'],
  ['icon-192.png', 'icon-192.png'],
]) {
  if (existsSync(join(here, source))) cpSync(join(here, source), join(dist, target));
}
// Pre-compressed copies the gate never asks for (it only serves <name>.wasm.br).
for (const file of files(dist)) {
  if (file.endsWith('.gz') || (file.endsWith('.br') && !file.endsWith('.wasm.br'))) rmSync(file);
}

// Inline scripts become boot-1.js, boot-2.js, … with the same type. mn-boot.js starts them in
// their order once the account is ready (below).
const boot = [];
let page = readFileSync(join(dist, 'index.html'), 'utf8').replace(
  /<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi,
  (tag, attributes = '', body) => {
    // An app script with its own file would run before the start scripts that wait for mn-boot.js.
    if (/\ssrc\s*=/i.test(attributes))
      throw new Error(`index.html: the release markup changed (a script file: ${tag})`);
    const type = /\stype\s*=\s*["']?([^"'\s>]+)/i.exec(attributes)?.[1] ?? null;
    // Only scripts that load as files: a data block (JSON, an import map) would never fire load.
    if (type && !/^(module|text\/javascript)$/i.test(type))
      throw new Error(`index.html: the release markup changed (a script of type ${type})`);
    const src = `./boot-${boot.length + 1}.js`;
    writeFileSync(join(dist, src), `${body.trim()}\n`);
    boot.push({ src, type });
    return '';
  },
);
if (!boot.length) throw new Error('index.html: the release markup changed (no start script)');
// The app starts once the person is signed in, the settings they keep in the app are back in
// localStorage from their account (the SDK's localStorage sync: they follow the person to every
// device) and the page language is known. The patched apps read <html lang> for their own
// language and data-mn-user as the default author name.
writeFileSync(
  join(dist, 'mn-boot.js'),
  `// Written by build.mjs: the account first, then the app's own start scripts, in order.
(async () => {
  const account = (async () => {
    const mn = await window.mininode.mininode();
    const user = await mn.auth.requireLogin();
    const meta = user.user_metadata ?? {};
    const name = [meta.display_name, meta.name].find((v) => typeof v === 'string' && v.trim());
    if (name) document.documentElement.dataset.mnUser = name.trim();
    await window.mininode.installLocalStorageSync(mn);
  })();
  try {
    // A slow connection must not hold the app back for long. The sync still finishes later; the
    // app's next save of its settings then wins over what came from the account.
    await Promise.race([
      account,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timed out')), 10000)),
    ]);
  } catch (error) {
    // Offline, slow or a failed request: the app starts with what this device has stored.
    console.warn('mininode: the app starts without the account settings', error);
  }
  await window.mnI18n?.ready;
  for (const { src, type } of ${JSON.stringify(boot)}) {
    const loaded = await new Promise((resolve) => {
      const script = document.createElement('script');
      if (type) script.type = type;
      script.src = src;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.append(script);
    });
    if (!loaded) {
      document.body.append(
        Object.assign(document.createElement('p'), {
          role: 'alert',
          textContent: 'Die App ließ sich nicht laden. Bitte lade die Seite neu.',
        }),
      );
      return;
    }
  }
})();
`,
);
// The gate checked the login before serving the page, so the start screen may go once the app
// shows something: right away when the page has its own loading text, otherwise when the app
// reports that it runs (release.json `readyEvent`, e.g. Trunk's "TrunkApplicationStarted").
// A slim MiniNode strip above the app ("← Alle Apps", like the other apps' headers); the app's
// full-window canvas starts below it. The kit's tokens give it the platform's look in light and dark.
writeFileSync(
  join(dist, 'mn-bar.css'),
  `/* Written by build.mjs: the MiniNode strip above the app. */
:root { --mn-bar-height: 44px; }
.mn-bar {
  position: fixed;
  inset: 0 0 auto 0;
  /* Above the app's own overlays, below the kit's dialogs (50) and toast (80). */
  z-index: 40;
  display: flex;
  align-items: center;
  gap: var(--mn-s3, 12px);
  height: var(--mn-bar-height);
  padding: 0 var(--mn-s3, 12px);
  box-sizing: border-box;
  background: var(--mn-surface, #fff);
  border-bottom: 1px solid var(--mn-line, #dde1db);
  font-family: var(--mn-font-text, system-ui, sans-serif);
}
.mn-bar .mn-home { padding: 0 var(--mn-s2, 8px); border-radius: var(--mn-r-sm, 8px); }
.mn-bar .mn-home:focus-visible { outline: 2px solid var(--mn-accent, #1c6a4f); outline-offset: -2px; }
.mn-bar-name { color: var(--mn-ink, #15191c); font-size: var(--mn-fs-sm, 14px); font-weight: 600; }
body > canvas {
  position: fixed !important;
  inset: var(--mn-bar-height) 0 0 0 !important;
  width: 100% !important;
  height: calc(100% - var(--mn-bar-height)) !important;
}
`,
);
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
  .replace(
    '</title>',
    [
      '</title>',
      // The kit's styles: the MiniNode strip (and the files dialog) use them.
      '<link rel="stylesheet" href="/_mininode/ui.css">',
      '<script src="/_mininode/i18n.js"></script>',
      // MiniNode files next to the device when the app opens or saves (kit/files.js).
      ...(useFiles ? ['<script src="/_mininode/ui.js"></script>'] : []),
      '<script src="/_mininode/sdk.js" defer></script>',
      ...(useFiles ? ['<script src="/_mininode/files.js" defer></script>'] : []),
      '<script src="./mn-boot.js" defer></script>',
    ].join('\n  '),
  )
  .replace('</head>', '  <link rel="stylesheet" href="./mn-bar.css">\n</head>')
  .replace(
    /<body([^>]*)>/i,
    `<body$1>\n  <nav class="mn-bar" aria-label="MiniNode"><a class="mn-home" href="https://mininode.app" data-i18n="nav.allAppsBack">← Alle Apps</a><span class="mn-bar-name" data-i18n="app.title">${escapeHtml(german['app.title'])}</span></nav>`,
  )
  .replace('</body>', '  <script src="./mn-ready.js"></script>\n</body>');
if (loadingText) {
  page = page.replace(
    `>${loadingText}<`,
    `><span data-i18n="app.loading">${german['app.loading']}</span><`,
  );
}
const markers = [
  '<html lang="de"',
  'class="mn-bar"',
  'mn-bar.css',
  'data-i18n="app.title"',
  '/_mininode/i18n.js',
  'mn-boot.js',
  'mn-ready.js',
];
if (useFiles) markers.push('/_mininode/files.js');
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

// Trunk names a module after a hash taken before wasm-opt, so two builds that differ only there
// share a name, and the gate lets browsers keep a hashed module for a year: a broken build stayed
// in their cache after the fix. Each hashed module is named after its final content instead.
const texts = files(dist).filter((file) => /\.(html|js|json|txt|css)$/i.test(file));
const oldNames = [];
for (const file of files(dist)) {
  // A release's own <name>.wasm.br moves with its .wasm (below); one without a .wasm on its own.
  if (!existsSync(file) || (file.endsWith('.wasm.br') && existsSync(file.slice(0, -3)))) continue;
  const brotli = file.endsWith('.wasm.br');
  const base = file.slice(file.lastIndexOf('/') + 1).replace(/\.br$/, '');
  const named = /^(.*?[-_.])([0-9a-f]{12,})([-_.].*\.wasm)$/i.exec(base);
  if (!named) continue;
  const [, before, hash, after] = named;
  const content = sha256(file).slice(0, hash.length);
  if (content === hash) continue;
  const renamed = `${before}${content}${after}`;
  const dir = dirname(file);
  renameSync(file, join(dir, brotli ? `${renamed}.br` : renamed));
  if (!brotli && existsSync(`${file}.br`)) renameSync(`${file}.br`, join(dir, `${renamed}.br`));
  for (const text of texts) {
    const source = readFileSync(text, 'utf8');
    if (source.includes(base)) writeFileSync(text, source.replaceAll(base, renamed));
  }
  oldNames.push(base);
  console.log(`${base}: named ${renamed}`);
}
for (const text of texts) {
  const left = oldNames.find((name) => readFileSync(text, 'utf8').includes(name));
  if (left) throw new Error(`${text} still names ${left} after the rename`);
}

for (const file of files(dist)) {
  const base = file.slice(file.lastIndexOf('/') + 1);
  const named = /^(.*?[-_.])([0-9a-f]{12,})([-_.].*\.wasm)$/i.exec(base);
  if (!named) continue;
  const [, before, hash, after] = named;
  const content = sha256(file).slice(0, hash.length);
  if (content === hash) continue;
  const renamed = `${before}${content}${after}`;
  renameSync(file, join(dirname(file), renamed));
  for (const text of texts) {
    const source = readFileSync(text, 'utf8');
    if (source.includes(base)) writeFileSync(text, source.replaceAll(base, renamed));
  }
  console.log(`${base}: named ${renamed}`);
}

for (const file of files(dist)) {
  if (!file.endsWith('.wasm')) continue;
  // The gate always prefers <name>.wasm.br, so the plain file would never be served.
  if (existsSync(`${file}.br`)) {
    rmSync(file);
    console.log(`${file.slice(dist.length + 1)}: served from the release's own .br`);
    continue;
  }
  if (statSync(file).size <= MAX_ASSET) continue;
  // Keyed by the content: some names carry no hash (FilmCraft's filmcraft_web_bg.wasm), and a
  // stale copy beside new glue code fails at start ("… is not a function").
  const cached = join(cache, `${sha256(file).slice(0, 16)}.wasm.br`);
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
