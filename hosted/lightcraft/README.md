# LightCraft

A non-destructive photo library and raw developer. Written in Rust and compiled to WebAssembly by the ArtCraft team.
MiniNode serves the upstream browser build behind the gate at `lightcraft.mininode.app`, with the
changes listed in `hosted/wordcraft/README.md`.

## Origin

[storytold/lightcraft](https://github.com/storytold/lightcraft), MIT OR Apache-2.0. The license texts
ship with the app in `dist/`. The app is built from the upstream source at its release tag with
`patches/mininode.patch` applied (no ArtCraft advertising); see `hosted/wordcraft/README.md`.

## How it is built

`build.mjs` is the same file in every Craft app (`wordcraft`, `pdfcraft`, `designcraft`, `filmcraft`,
`photocraft`, `lightcraft`), so each app stays exportable on its own. Only `release.json` and `patches/` differ.
`hosted/wordcraft/README.md` explains each step: inline scripts move into `boot-*.js` for the CSP,
the language packages, the Brotli `.wasm.br` for modules above the 25 MiB asset limit, the
patched source build and the MiniNode files dialog (`files: true`).
`"wasm": true` in `mininode.json` allows WebAssembly in the app's CSP.

The release ships its module also Brotli-compressed (`lightcraft_web_bg.wasm.br`, 5.5 MB). The
build keeps only that copy, and the gate serves it as `lightcraft_web_bg.wasm`.

## Data

`data.mode: private`. Photos are imported from MiniNode or the device, and exports are saved to MiniNode (`mn.files`, the person's own folder) or the device. **The photo library itself lives in the browser's private file storage (OPFS) on that device**, not in MiniNode: another device or another browser has its own library, and clearing the site data deletes it. Settings follow the account: the patch keeps the library's settings files (`ui.json`, `prefs.json` and, up to 512 KB in all, the develop presets `presets.json`) in `localStorage` under `lightcraft.preferences`, which MiniNode syncs; the browser's copy stays the fallback, and a larger preset collection stays on the device. The catalog, the view state, the originals and the thumbnails stay on the device. The patch also lets the interface follow the MiniNode language and start in the system's light or dark appearance. The import field "Creator" stays empty: it is written into every imported photo.

## Updating

Set `version` and `sha256` in `release.json` to the new release (`sha256sum lightcraft-web-<v>.zip`),
check that `patches/mininode.patch` still applies (`node build.mjs` stops if not) and check the app
with `pnpm mininode dev hosted/lightcraft`.

## Open points

- **Chinese font:** upstream loads `lightcraft_zh_hans.otf` separately; the web release does not
  ship it, so the request ends in a 404 and Chinese text shows missing-glyph boxes.
