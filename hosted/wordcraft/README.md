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

- **Boot script:** the release starts the app from an inline module script, and the gate's CSP
  allows no inline scripts. The build moves it into `boot.js`. When the app runs, `boot.js` also
  sends `mn:ready`, so the start screen goes away. The gate checked the login before serving the
  page.
- **Size:** the `.wasm` is 42 MB, and one Cloudflare asset may be at most 25 MiB. The build stores
  it Brotli-compressed as `<name>.wasm.br` (10.5 MB). The gate serves it under its own name with
  `Content-Encoding: br`, so the browser unpacks it and checks the integrity hash in `index.html`.
  Compression (Brotli quality 9) takes under a minute, and `.cache/` keeps the result between
  local builds. Upstream `HOSTING.md` says the wasm is about 13 MB; this release's is 42 MB. If a
  later release fits under 25 MiB, the `.br` step can go.
- **WebAssembly:** `"wasm": true` in `mininode.json` adds `'wasm-unsafe-eval'` to the app's CSP.
  This allows compiling WebAssembly, not JavaScript `eval`.
- **Language:** the page is German by default and the loading text has language packages
  (`i18n/`). WordCraft's own interface is English; it has no German translation upstream.
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

Set `VERSION` and `SHA256` in `build.mjs` to the new release (`sha256sum wordcraft-web-<v>.zip`).
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
