# FilmCraft

A video editor (editing, colour and sound), a clean-room take on the Adobe Premiere Pro workflow. Written in Rust and compiled to WebAssembly by the ArtCraft team.
MiniNode serves the upstream browser build behind the gate at `filmcraft.mininode.app`, with the
changes listed in `hosted/wordcraft/README.md`.

## Origin

[storytold/filmcraft](https://github.com/storytold/filmcraft), MIT OR Apache-2.0. The license texts
ship with the app in `dist/`. `build.mjs` takes the official web release `filmcraft-web-0.9.0.zip`
from the project's GitHub release and checks its SHA-256.

## How it is built

`build.mjs` is the same file in every Craft app (`wordcraft`, `pdfcraft`, `designcraft`, `filmcraft`,
`photocraft`, `lightcraft`), so each app stays exportable on its own. Only `release.json` differs.
`hosted/wordcraft/README.md` explains each step: inline scripts move into `boot-*.js` for the CSP,
the language packages, and the Brotli `.wasm.br` for modules above the 25 MiB asset limit.
`"wasm": true` in `mininode.json` allows WebAssembly in the app's CSP.

## Data

`data.mode: none`. Media and projects are opened from the device and exported with the browser's save dialog or a download. Unsaved changes are kept every few seconds in the browser's private file storage (OPFS), so a reload brings them back; preferences stay in `localStorage`. Both live on that device only.

## Updating

Set `version` and `sha256` in `release.json` to the new release (`sha256sum filmcraft-web-<v>.zip`),
delete `.cache/`, run `node build.mjs` and check the app with `pnpm mininode dev hosted/filmcraft`.
