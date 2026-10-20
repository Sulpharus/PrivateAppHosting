# DesignCraft

A desktop publishing and page layout studio. Written in Rust and compiled to WebAssembly by the ArtCraft team.
MiniNode serves the upstream browser build behind the gate at `designcraft.mininode.app`, with the
changes listed in `hosted/wordcraft/README.md`.

## Origin

[storytold/designcraft](https://github.com/storytold/designcraft), MIT OR Apache-2.0. The license texts
ship with the app in `dist/`. The app is built from the upstream source at its release tag with
`patches/mininode.patch` applied (no ArtCraft advertising); see `hosted/wordcraft/README.md`.

## How it is built

`build.mjs` is the same file in every Craft app (`wordcraft`, `pdfcraft`, `designcraft`, `filmcraft`,
`photocraft`, `lightcraft`), so each app stays exportable on its own. Only `release.json` and `patches/` differ.
`hosted/wordcraft/README.md` explains each step: inline scripts move into `boot-*.js` for the CSP,
the language packages, the Brotli `.wasm.br` for modules above the 25 MiB asset limit, the
patched source build and the MiniNode files dialog (`files: true`).
`"wasm": true` in `mininode.json` allows WebAssembly in the app's CSP.

## Data

`data.mode: private`. Documents are opened from MiniNode or the device and saved to MiniNode (`mn.files`, the person's own folder) or the device. Settings follow the account: the patch keeps the desktop's `ui.json` and `prefs.json` (theme, language, units, workspaces, shortcuts, presets, recent files) in `localStorage` under `designcraft.preferences`, which MiniNode syncs. Until the person picks it in the app, the language follows MiniNode; the brightness keeps the app's own default (Medium Dark). The patch also gives date variables the real time (upstream's web build reported 1970) and asks before leaving the page with unsaved documents.

## Updating

Set `version` and `sha256` in `release.json` to the new release (`sha256sum designcraft-web-<v>.zip`),
check that `patches/mininode.patch` still applies (`node build.mjs` stops if not) and check the app
with `pnpm mininode dev hosted/designcraft`.
