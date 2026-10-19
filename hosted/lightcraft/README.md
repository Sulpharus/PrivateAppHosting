# LightCraft

A non-destructive photo library and raw developer. Written in Rust and compiled to WebAssembly by the ArtCraft team.
MiniNode serves the upstream browser build unchanged behind the gate at `lightcraft.mininode.app`.

## Origin

[storytold/lightcraft](https://github.com/storytold/lightcraft), MIT OR Apache-2.0. The license texts
ship with the app in `dist/`. `build.mjs` takes the official web release `lightcraft-web-0.9.1.zip`
from the project's GitHub release and checks its SHA-256.

## How it is built

`build.mjs` is the same file in every Craft app (`wordcraft`, `pdfcraft`, `designcraft`, `filmcraft`,
`photocraft`, `lightcraft`), so each app stays exportable on its own. Only `release.json` differs.
`hosted/wordcraft/README.md` explains each step: inline scripts move into `boot-*.js` for the CSP,
the language packages, and the Brotli `.wasm.br` for modules above the 25 MiB asset limit.
`"wasm": true` in `mininode.json` allows WebAssembly in the app's CSP.

## Data

`data.mode: none`. **The photo library lives in the browser's private file storage (OPFS) on that device**, not in MiniNode: another device or another browser has its own library, and clearing the site data deletes it. Export what you want to keep. Preferences stay in `localStorage`.

## Updating

Set `version` and `sha256` in `release.json` to the new release (`sha256sum lightcraft-web-<v>.zip`),
delete `.cache/`, run `node build.mjs` and check the app with `pnpm mininode dev hosted/lightcraft`.

## Open points

- **Chinese font:** upstream loads `lightcraft_zh_hans.otf` separately; the web release does not
  ship it, so the request ends in a 404 and Chinese text shows missing-glyph boxes.
