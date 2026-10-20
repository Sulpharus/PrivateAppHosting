# PdfCraft

A PDF reader and editor ("the PDF workbench"), a clean-room implementation built on the ISO 32000 specification. Written in Rust and compiled to WebAssembly by the ArtCraft team.
MiniNode serves the upstream browser build behind the gate at `pdfcraft.mininode.app`, with the
changes listed in `hosted/wordcraft/README.md`.

## Origin

[storytold/pdfcraft](https://github.com/storytold/pdfcraft), MIT OR Apache-2.0. The license texts
ship with the app in `dist/`. The app is built from the upstream source at its release tag with
`patches/mininode.patch` applied (no ArtCraft advertising); see `hosted/wordcraft/README.md`.

## How it is built

`build.mjs` is the same file in every Craft app (`wordcraft`, `pdfcraft`, `designcraft`, `filmcraft`,
`photocraft`, `lightcraft`), so each app stays exportable on its own. Only `release.json` and `patches/` differ.
`hosted/wordcraft/README.md` explains each step: inline scripts move into `boot-*.js` for the CSP,
the language packages, the Brotli `.wasm.br` for modules above the 25 MiB asset limit, the
patched source build and the MiniNode files dialog (`files: true`).
`"wasm": true` in `mininode.json` allows WebAssembly in the app's CSP.

PdfCraft has no loading text of its own, so `release.json` sets `readyEvent`: the platform's start
screen stays until the app reports `TrunkApplicationStarted`.

## Data

`data.mode: private`. PDFs are opened from MiniNode or the device and saved to MiniNode (`mn.files`, the person's own folder) or the device. Settings follow the account: PdfCraft keeps them (layout, theme, language, comment author and styles, signatures, stamps, digital-ID details) in `localStorage` under `pdfcraft`, which MiniNode syncs; the patch writes only when they changed, at most once a second, and keeps images (custom stamps, image signatures) in them only up to 512 KB in all, the rest last until the page closes. On "Auto" the interface follows the MiniNode language, the theme follows the system, and comments are signed with the name from the account until the person sets one. The patch also gives the web build a clock: upstream dated Fill & Sign entries 1 January 1970 and wrote no modification date.

## Updating

Set `version` and `sha256` in `release.json` to the new release (`sha256sum pdfcraft-web-<v>.zip`),
check that `patches/mininode.patch` still applies (`node build.mjs` stops if not) and check the app
with `pnpm mininode dev hosted/pdfcraft`.
