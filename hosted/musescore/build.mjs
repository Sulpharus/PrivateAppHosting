// Builds dist/ for MuseScore Studio: the desktop editor compiled to WebAssembly, behind the gate.
//
//   1. The program (source.json): MuseScore Studio at the pinned tag and commit, with
//      patches/mininode.patch, built by toolchain/ (Qt for WebAssembly from source, Emscripten) in
//      the "app-mininode" configuration, plus its shared files, translations and SoundFont. Kept
//      as .cache/source-<key>.zip; the key covers the version, the patches and the toolchain.
//   2. The page: web/ (start, MiniNode files, audio worklet, user data, export/import) and i18n/.
//   3. The module is named after its content and stored Brotli-compressed (<name>.wasm.br; the gate
//      serves it with Content-Encoding: br and lets browsers keep it for a year).
//   4. The shared files become one gzip archive, the SoundFont parts below the 25 MiB asset limit.
//
// Usage: node build.mjs            build dist/ (needs unzip; the program zip must exist or be buildable)
//        node build.mjs --source   only make sure the program zip exists (CI build job; hours)
//        node build.mjs --key      print the cache key of the program zip

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
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const source = JSON.parse(readFileSync(join(here, 'source.json'), 'utf8'));
const MAX_ASSET = 25 * 1024 * 1024;
const PART_SIZE = 24 * 1024 * 1024;
const cache = join(here, '.cache');
const dist = join(here, 'dist');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.status !== 0)
    throw new Error(`${command} ${args.join(' ')} failed (exit ${result.status})`);
}
const has = (command) => spawnSync(command, ['--version'], { stdio: 'ignore' }).status === 0;
const hash = (data) => createHash('sha256').update(data).digest('hex');
const files = (dir) =>
  readdirSync(dir, { recursive: true })
    .map((entry) => join(dir, String(entry)))
    .filter((file) => statSync(file).isFile())
    .sort();

// Bump when the way the program zip is made changes, so caches built the old way are not reused.
const SOURCE_BUILDER = 1;
const toolchainFiles = () => files(join(here, 'toolchain'));
const sourceKey = () => {
  const digest = createHash('sha256').update(
    `${source.version}@${source.commit}#${SOURCE_BUILDER}`,
  );
  digest.update(JSON.stringify([source.languages, source.share, source.soundFont]));
  for (const file of [...source.patches.map((p) => join(here, p)), ...toolchainFiles()]) {
    digest.update(`\0${relative(here, file)}\0`).update(readFileSync(file));
  }
  return digest.digest('hex').slice(0, 16);
};

/** lrelease from Qt's tools; without one, PySide6's copy from PyPI in .cache/lrelease. */
function lrelease() {
  if (has('lrelease')) return 'lrelease';
  const venv = join(cache, 'lrelease');
  const tool = join(venv, 'bin', 'pyside6-lrelease');
  if (!existsSync(tool)) {
    run('python3', ['-m', 'venv', venv]);
    run(join(venv, 'bin', 'pip'), ['install', '--quiet', 'PySide6-Essentials==6.10.2']);
  }
  return tool;
}

/** The program zip built from the patched source; cached under its key. */
function programZip() {
  const built = join(cache, `source-${sourceKey()}.zip`);
  if (existsSync(built)) return built;
  // In CI only the MuseScore workflow builds the program (hours); a deploy job without its
  // artifact stops here for this app alone.
  if (process.env.CI && !process.env.MUSESCORE_BUILD)
    throw new Error(
      `musescore: no program build ${basename(built)} (see .github/workflows/musescore.yml)`,
    );
  // MUSESCORE_PREBUILT=<source dir>: package a tree that is already patched and built (local
  // work on the patch: build there with toolchain/build-musescore.sh, then package it here).
  const prebuilt = process.env.MUSESCORE_PREBUILT;
  const tools = prebuilt ? ['python3', 'zip'] : ['git', 'cmake', 'ninja', 'python3', 'zip'];
  for (const tool of tools) {
    if (!has(tool))
      throw new Error(`musescore: ${tool} is needed to build the program (see README)`);
  }
  const src = prebuilt ?? join(cache, `src-${source.version}`);
  const stage = join(cache, 'stage');
  rmSync(stage, { recursive: true, force: true });
  if (prebuilt) {
    mkdirSync(join(stage, 'bin'), { recursive: true });
    for (const name of ['MuseScoreStudio.js', 'MuseScoreStudio.wasm', 'MuseAudio.js'])
      cpSync(join(src, 'build.artifacts', name), join(stage, 'bin', name));
    cpSync(
      join(src, 'src', 'web', 'appjs', 'distr', 'qtloader.js'),
      join(stage, 'bin', 'qtloader.js'),
    );
  } else {
    if (!existsSync(join(src, '.git'))) {
      rmSync(src, { recursive: true, force: true });
      run('git', [
        'clone',
        '--quiet',
        '--depth',
        '1',
        '--branch',
        `v${source.version}`,
        `${source.repository}.git`,
        src,
      ]);
    }
    const head = spawnSync('git', ['-C', src, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).stdout.trim();
    if (head !== source.commit)
      throw new Error(`musescore: v${source.version} is ${head}, expected ${source.commit}`);
    run('git', ['-C', src, 'reset', '--quiet', '--hard']);
    // The build folders stay: ninja then compiles only what the patches changed.
    run('git', [
      '-C',
      src,
      'clean',
      '--quiet',
      '-fdx',
      '-e',
      'build.web',
      '-e',
      'build.audio',
      '-e',
      'build.artifacts',
    ]);
    for (const patch of source.patches) run('git', ['-C', src, 'apply', join(here, patch)]);

    const qt = process.env.MUSESCORE_QT_PREFIX ?? join(cache, 'qt');
    run('bash', [join(here, 'toolchain', 'build-qt.sh'), qt]);
    run('bash', [join(here, 'toolchain', 'build-musescore.sh'), qt, src, join(stage, 'bin')]);
  }

  // Shared program files the editor reads from /files/share.
  for (const dir of source.share) {
    cpSync(join(src, 'share', dir), join(stage, 'share', dir), {
      recursive: true,
      filter: (path) => basename(path) !== 'CMakeLists.txt',
    });
  }
  // Translations: English is the program's own language; the others are compiled here.
  const locale = join(stage, 'share', 'locale');
  mkdirSync(locale, { recursive: true });
  const all = JSON.parse(readFileSync(join(src, 'share', 'locale', 'languages.json'), 'utf8'));
  const offered = Object.fromEntries(
    Object.entries(all).filter(
      ([code]) => code.startsWith('en') || source.languages.includes(code),
    ),
  );
  writeFileSync(join(locale, 'languages.json'), `${JSON.stringify(offered, null, 2)}\n`);
  const tool = lrelease();
  for (const code of source.languages) {
    for (const resource of ['musescore', 'instruments']) {
      const ts = join(src, 'share', 'locale', `${resource}_${code}.ts`);
      if (existsSync(ts)) run(tool, ['-silent', ts, '-qm', join(locale, `${resource}_${code}.qm`)]);
    }
  }
  // Playback SoundFont and the licences that ship with the program.
  mkdirSync(join(stage, 'sound'), { recursive: true });
  const sound = join(src, 'share', 'sound');
  const fontBase = source.soundFont.replace(/\.sf[23]$/, '');
  for (const name of readdirSync(sound)) {
    if (name === source.soundFont || name.startsWith(`${fontBase}_`))
      cpSync(join(sound, name), join(stage, 'sound', name));
  }
  cpSync(join(src, 'LICENSE.txt'), join(stage, 'LICENSE.txt'));
  cpSync(
    join(src, 'src', 'web', 'appjs', 'distr', 'audio_worklet_processor.js'),
    join(stage, 'bin', 'audio_worklet_processor.js'),
  );

  for (const old of readdirSync(cache)) {
    if (old.startsWith('source-') && old.endsWith('.zip')) rmSync(join(cache, old));
  }
  run('zip', ['-q', '-r', '-X', `${built}.part`, '.'], { cwd: stage });
  renameSync(`${built}.part`, built);
  return built;
}

mkdirSync(cache, { recursive: true });
if (process.argv.includes('--key')) {
  console.log(sourceKey());
  process.exit(0);
}
const zip = programZip();
if (process.argv.includes('--source')) process.exit(0);

const unpacked = join(cache, 'unpacked');
rmSync(unpacked, { recursive: true, force: true });
run('unzip', ['-q', zip, '-d', unpacked]);
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist);

// The page and its language packages.
cpSync(join(here, 'web'), dist, { recursive: true });
cpSync(join(here, 'i18n'), join(dist, 'i18n'), { recursive: true });
for (const [from, to] of [
  ['icon.png', 'icon-512.png'],
  ['icon-192.png', 'icon-192.png'],
]) {
  if (existsSync(join(here, from))) cpSync(join(here, from), join(dist, to));
}

const bin = join(unpacked, 'bin');
cpSync(join(bin, 'qtloader.js'), join(dist, 'qtloader.js'));
cpSync(join(bin, 'MuseScoreStudio.js'), join(dist, 'MuseScoreStudio.js'));

// The editor's module, named after its content and Brotli-compressed (kept in .cache by content).
const wasm = readFileSync(join(bin, 'MuseScoreStudio.wasm'));
const wasmName = `MuseScoreStudio-${hash(wasm).slice(0, 16)}.wasm`;
const packed = join(cache, `${wasmName}.br`);
if (!existsSync(packed)) {
  const compressed = brotliCompressSync(wasm, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: 11,
      [constants.BROTLI_PARAM_LGWIN]: 24,
      [constants.BROTLI_PARAM_SIZE_HINT]: wasm.length,
    },
  });
  writeFileSync(`${packed}.part`, compressed);
  renameSync(`${packed}.part`, packed);
}
cpSync(packed, join(dist, `${wasmName}.br`));
console.log(
  `${wasmName}: ${(wasm.length / 2 ** 20).toFixed(1)} MiB, ${(statSync(packed).size / 2 ** 20).toFixed(1)} MiB as .br`,
);

// The audio engine and its worklet glue in one file (the CSP allows no blob: scripts).
const worklet = Buffer.concat([
  readFileSync(join(bin, 'MuseAudio.js')),
  Buffer.from('\n'),
  readFileSync(join(bin, 'audio_worklet_processor.js')),
]);
const workletName = `muse-audio-${hash(worklet).slice(0, 16)}.js`;
writeFileSync(join(dist, workletName), worklet);

// The shared files as one archive: [index length][index][files] (web/mn-share.js reads it).
const shareRoot = join(unpacked, 'share');
const shareFiles = files(shareRoot).map((file) => [relative(shareRoot, file), readFileSync(file)]);
const index = Buffer.from(JSON.stringify(shareFiles.map(([path, data]) => [path, data.length])));
const header = Buffer.alloc(4);
header.writeUInt32LE(index.length);
const archive = Buffer.concat([header, index, ...shareFiles.map(([, data]) => data)]);
const shareName = `share-${hash(archive).slice(0, 16)}.pack.gz`;
writeFileSync(join(dist, shareName), gzipSync(archive, { level: 9 }));

// The SoundFont in parts below the asset limit.
const font = readFileSync(join(unpacked, 'sound', source.soundFont));
const fontId = `${source.soundFont
  .replace(/\.sf[23]$/, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')}-${hash(font).slice(0, 16)}`;
const parts = [];
for (let offset = 0, n = 0; offset < font.length; offset += PART_SIZE, n++) {
  const name = `${fontId}.sf3.${n}`;
  writeFileSync(join(dist, name), font.subarray(offset, offset + PART_SIZE));
  parts.push(name);
}

// Licences and the source of this build (GPL-3.0: the program's source and our changes).
mkdirSync(join(dist, 'licenses'), { recursive: true });
cpSync(join(unpacked, 'LICENSE.txt'), join(dist, 'licenses', 'MuseScore-LICENSE.txt'));
for (const name of readdirSync(join(unpacked, 'sound'))) {
  if (name.endsWith('.md')) cpSync(join(unpacked, 'sound', name), join(dist, 'licenses', name));
}
for (const patch of source.patches)
  cpSync(join(here, patch), join(dist, 'licenses', basename(patch)));
writeFileSync(
  join(dist, 'licenses', 'SOURCE.md'),
  `# Source\n\n${source.name} ${source.version} (GPL-3.0), built from ${source.repository} at commit ${source.commit}\nwith the changes in ${source.patches.map((p) => basename(p)).join(', ')} (in this folder).\nThe SoundFont "${source.soundFont}" ships with MuseScore under its own licence (in this folder).\n`,
);

writeFileSync(
  join(dist, 'mn-build.js'),
  `// Written by build.mjs: this build's file names.\nexport default ${JSON.stringify(
    {
      version: source.version,
      wasm: wasmName,
      audio: { worklet: `./${workletName}` },
      share: { file: `./${shareName}`, size: archive.length },
      soundFont: { parts: parts.map((name) => `./${name}`) },
    },
    null,
    2,
  )};\n`,
);

for (const file of files(dist)) {
  if (statSync(file).size > MAX_ASSET)
    throw new Error(`${relative(dist, file)} is larger than the 25 MiB asset limit`);
}
console.log(`wrote ${dist}`);
