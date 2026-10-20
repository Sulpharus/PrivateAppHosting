# FilmCraft

A video editor (editing, colour and sound), a clean-room take on the Adobe Premiere Pro workflow. Written in Rust and compiled to WebAssembly by the ArtCraft team.
MiniNode serves the upstream browser build behind the gate at `filmcraft.mininode.app`, with the
changes listed in `hosted/wordcraft/README.md`.

## Origin

[storytold/filmcraft](https://github.com/storytold/filmcraft), MIT OR Apache-2.0. The license texts
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

`data.mode: private`. Media and projects are opened from MiniNode or the device, and exports are saved to MiniNode (`mn.files`, the person's own folder, at most 50 MB per file) or the device. Unsaved changes are kept every few seconds in the browser's private file storage (OPFS), so a reload brings them back; that copy lives on that device only. Settings follow the account: the patch keeps them, with the workspaces and the person's effect and export presets, in `localStorage` under `filmcraft.preferences`, which MiniNode syncs (keyboard shortcut sets, label presets and graphics templates stay on the device). The patch also lets the interface follow the MiniNode language (German is partial upstream; missing texts are English), starts in the system's light or dark appearance and asks before leaving the page with unsaved changes.

## Updating

Set `version` and `sha256` in `release.json` to the new release (`sha256sum filmcraft-web-<v>.zip`),
check that `patches/mininode.patch` still applies (`node build.mjs` stops if not) and check the app
with `pnpm mininode dev hosted/filmcraft`.
