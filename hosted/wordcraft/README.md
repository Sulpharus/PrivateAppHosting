# WordCraft

A word processor in the browser: an open-source, clean-room reimplementation of Microsoft Word in
Rust, compiled to WebAssembly. It has the ribbon, styles, tables, track changes, references and
mail merge, and it opens and saves `.docx`. MiniNode serves the upstream browser build behind the
gate at `wordcraft.mininode.app`, with the changes listed below.

## Origin

[storytold/wordcraft](https://github.com/storytold/wordcraft) by the ArtCraft team, MIT OR
Apache-2.0. Both license texts ship with the app (`LICENSE-MIT`, `LICENSE-APACHE` in `dist/`).
The app is built from the upstream source at tag `v0.8.0` with `patches/mininode.patch` applied
(see below); without a Rust toolchain a local build falls back to the official web release
`wordcraft-web-0.8.0.zip`, its SHA-256 checked against `release.json`.

## What the build changes

`build.mjs` is shared by all Craft apps (`wordcraft`, `pdfcraft`, `designcraft`, `filmcraft`,
`photocraft`, `lightcraft`): the file is identical in each, so every app stays exportable on its
own. `release.json` names the release (`name`, `version`, `sha256`), the app's loading text,
`patches` and `files`.

- **Patched source (`patches/mininode.patch`):** the ArtCraft advertising is removed: the Discord
  buttons, the community cards on the start screens, the ArtCraft website and app-page links in the
  Help menus and About dialogs. The license notice, the credits and the link to the source code
  stay. `build.mjs` clones the upstream tag into `.cache/src-<version>`, applies the patches and
  runs the app's own `packaging/web/package.sh`, which makes the same zip as an official release.
  The result is kept as `.cache/source-<key>.zip`; the key covers the version and the patches.
  - Needs Rust with the `wasm32-unknown-unknown` target, `trunk`, and for FilmCraft and LightCraft
    `wasm-bindgen-cli` (their package script installs it when `CI` is set). A first build takes
    about 20 minutes per app (WordCraft: 8.5 min compiling, 10 min `wasm-opt`). No `wasm-opt`
    (binaryen) may be on PATH: trunk would use it instead of downloading the current one, and
    FilmCraft's and LightCraft's builds run any they find. Ubuntu's old one broke all six apps
    (FilmCraft: "failed to grow table"), so `build.mjs` stops when it finds one.
  - In GitHub Actions the workflow `crafts.yml` builds every patched app on its own runner, caches
    the zip under its key and hands it to CI and the deploy (`scripts/craft-builds.sh`). Rust only
    runs when a version or a patch changes.
  - A patch that no longer applies to a new upstream version stops the build: rebase it with
    `git -C .cache/src-<version> apply --3way` and save the diff again (`git diff >
    patches/mininode.patch`; run `git add -N <file>` first for a file the patch adds, or it is
    left out).
- **MiniNode files (`files: true`):** the page loads the kit's `/_mininode/files.js`
  (`packages/ui/README.md`). Opening a file and saving one offer the person's MiniNode files
  (`mn.files`, data mode `private`) next to the device; the texts are `files.*` in `i18n/`. A
  file opened from or saved to MiniNode is saved back without asking the next time the app
  saves it under the same name (a download or its save picker: the app's Save); the toast offers
  "Speichern unter …". WordCraft's patch makes a document take the name chosen in the save
  dialog (upstream's web build kept "Document1"), so its next Save is recognised.
- **Start after the account (`mn-boot.js`):** the app's own start scripts run once the person is
  signed in, the SDK's `installLocalStorageSync` has put the settings the app keeps in
  `localStorage` back from their account, and `<html lang>` carries their MiniNode language. The
  name from the account is set as `data-mn-user` on `<html>`. Offline or on an error the app
  starts with what the device has.

- **Inline scripts:** the gate's CSP allows none, so every inline `<script>` moves into
  `boot-1.js`, `boot-2.js`, … in the same place and with the same type. The build stops when an
  inline script, an `on…=` handler or a `javascript:` link is left.
- **Start screen:** `mn-ready.js` sends `mn:ready`. The gate checked the login before serving the
  page, so the platform's start screen goes as soon as the canvas is there, and the app's own
  loading text takes over. An app without loading text sets `readyEvent` in `release.json`; the
  signal then waits for that event (PdfCraft: `TrunkApplicationStarted`).
- **Size:** one Cloudflare asset may be at most 25 MiB. A larger `.wasm` (WordCraft's is 42 MB) is
  stored Brotli-compressed as `<name>.wasm.br`. When the release ships its own `.wasm.br`, only that
  copy is kept, whatever the size, because the gate always prefers it. The gate
  serves it under its own name with `Content-Encoding: br`, so the browser unpacks it and checks
  the integrity hash in `index.html`. Compression (Brotli quality 9) takes under a minute, and
  `.cache/` keeps the result between local builds. Other `.br`/`.gz` copies are dropped.
- **WebAssembly:** `"wasm": true` in `mininode.json` adds `'wasm-unsafe-eval'` to the app's CSP.
  This allows compiling WebAssembly, not JavaScript `eval`.
- **Language:** the page is German by default; the title and the loading text have language
  packages (`i18n/`). The apps' own interfaces are English; upstream has no German translation.
- Upstream hosting notes (`README.md`, `HOSTING.md`, `_headers`, `.htaccess`) are left out.

## Data

`data.mode: private`. Documents go where the person chooses:

- **Open** offers the documents stored in MiniNode, or a file from the device.
- **Save** and **Export** save to MiniNode (`mn.files`, the person's own folder) or, as before, to
  the device with the browser's save dialog or a download.

Settings follow the account: upstream's web build keeps none, so the patch stores the app's
settings (the desktop `ui.json`: theme, language, editing preferences, author and initials,
dictionary, shortcuts, ribbon layout, recent names) in `localStorage` under `wordcraft.preferences`,
which MiniNode syncs. On "Auto" the interface follows the MiniNode language, the appearance starts
as System (light or dark like the device), and the author for comments and tracked changes is the
name from the account until the person sets one. Fonts you add stay in the browser's IndexedDB, on
that device only.

## Requirements

WebGPU, or WebGL2 as the fallback (every current browser). `?webgl` forces WebGL2 when a WebGPU
driver misbehaves. The first start loads about 11 MB; after that the service worker keeps the
files.

## Updating

Set `version` and `sha256` in `release.json` to the new release (`sha256sum wordcraft-web-<v>.zip`).
Check that `patches/mininode.patch` still applies (`node build.mjs` stops if not), then check the
app locally with `pnpm mininode dev hosted/wordcraft`: no Discord or ArtCraft links, and saving to
MiniNode and opening from it work.

## Open points

- **No e2e test:** CI builds the app, in the dry-run deploy whenever the app or the platform
  changes, but no browser test opens it there. The gate's pre-compressed `.wasm` path has unit
  tests in `packages/gate`. The app was checked locally: sign in, start, open the sample document.
- **After the first deploy,** check that production sends the module compressed:
  `curl -sI https://wordcraft.mininode.app/wordcraft-web-dac7e7b375acbaf2_bg.wasm -H 'Accept-Encoding: br'`
  should show `content-encoding: br` and `content-type: application/wasm`.
