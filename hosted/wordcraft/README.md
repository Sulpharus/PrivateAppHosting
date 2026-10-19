# WordCraft

A word processor in the browser: an open-source, clean-room reimplementation of Microsoft Word in
Rust, compiled to WebAssembly. It has the ribbon, styles, tables, track changes, references and
mail merge, and it opens and saves `.docx`. MiniNode serves the upstream browser build unchanged
behind the gate at `wordcraft.mininode.app`.

## Origin

[storytold/wordcraft](https://github.com/storytold/wordcraft) by the ArtCraft team, MIT OR
Apache-2.0. Both license texts ship with the app (`LICENSE-MIT`, `LICENSE-APACHE` in `dist/`).
`build.mjs` takes the official web release `wordcraft-web-0.8.0.zip` from the project's GitHub
release and checks its SHA-256. No Rust toolchain is needed.

## What the build changes

`build.mjs` is shared by all Craft apps (`wordcraft`, `pdfcraft`, `designcraft`, `filmcraft`,
`photocraft`, `lightcraft`): the file is identical in each, so every app stays exportable on its
own. `release.json` names the release (`name`, `version`, `sha256`) and the app's loading text.

- **Inline scripts:** the gate's CSP allows none, so every inline `<script>` moves into
  `boot-1.js`, `boot-2.js`, … in the same place and with the same type. The build stops when an
  inline script or an `on…=` handler is left.
- **Start screen:** `mn-ready.js` sends `mn:ready`. The gate checked the login before serving the
  page, so the platform's start screen goes as soon as the canvas is there, and the app's own
  loading text takes over.
- **Size:** one Cloudflare asset may be at most 25 MiB. A larger `.wasm` (WordCraft's is 42 MB) is
  stored Brotli-compressed as `<name>.wasm.br`; an upstream `.wasm.br` is kept instead. The gate
  serves it under its own name with `Content-Encoding: br`, so the browser unpacks it and checks
  the integrity hash in `index.html`. Compression (Brotli quality 9) takes under a minute, and
  `.cache/` keeps the result between local builds. Other `.br`/`.gz` copies are dropped.
- **WebAssembly:** `"wasm": true` in `mininode.json` adds `'wasm-unsafe-eval'` to the app's CSP.
  This allows compiling WebAssembly, not JavaScript `eval`.
- **Language:** the page is German by default; the title and the loading text have language
  packages (`i18n/`). The apps' own interfaces are English; upstream has no German translation.
- Upstream hosting notes (`README.md`, `HOSTING.md`, `_headers`, `.htaccess`) are left out.

## Data

`data.mode: none`. Documents never reach MiniNode:

- **Open** reads a file from the device.
- **Save** and **Export** use the browser's save dialog, or a download where the dialog is
  missing.

WordCraft keeps its own preferences in the browser's `localStorage`, and fonts you add in
IndexedDB, on that device only. This is the upstream app's behaviour, and it holds no documents.

## Requirements

WebGPU, or WebGL2 as the fallback (every current browser). `?webgl` forces WebGL2 when a WebGPU
driver misbehaves. The first start loads about 11 MB; after that the service worker keeps the
files.

## Updating

Set `version` and `sha256` in `release.json` to the new release (`sha256sum wordcraft-web-<v>.zip`).
Delete `.cache/`, run `node build.mjs`, then check the app locally with
`pnpm mininode dev hosted/wordcraft`.

## Open points

- **Saving to MiniNode:** documents in `mn.files`, so they are on every device, would need a
  change in WordCraft's Rust code. Not planned.
- **No e2e test:** CI builds the app, in the dry-run deploy whenever the app or the platform
  changes, but no browser test opens it there. The gate's pre-compressed `.wasm` path has unit
  tests in `packages/gate`. The app was checked locally: sign in, start, open the sample document.
- **After the first deploy,** check that production sends the module compressed:
  `curl -sI https://wordcraft.mininode.app/wordcraft-web-dac7e7b375acbaf2_bg.wasm -H 'Accept-Encoding: br'`
  should show `content-encoding: br` and `content-type: application/wasm`.
