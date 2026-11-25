---
id: wasm
title: WebAssembly und große Dateien
summary: Kompilierte Programme im Browser (Bild-, Audio-, PDF-Werkzeuge), schnell geladen
when: Nimm das, wenn die App ein kompiliertes Werkzeug im Browser nutzt, etwa für Bilder, Audio oder PDFs.
order: 30
group: server
---

## Feature: WebAssembly and large assets

Use it when the app runs compiled code in the browser (an image, audio or PDF engine, a game
engine, a ported desktop program).

- Add `"wasm": true` to `mininode.json`; the platform then allows compiling WebAssembly (CSP
  `'wasm-unsafe-eval'`). Without it the module fails to load.
- Bundle the `.wasm` file with the app (Vite `?url` import or a file in `public/`); never load it
  from a CDN. Give it a content hash in the name so it can be cached for a year.
- A `.wasm` above 25 MiB ships compressed as `<name>.wasm.br` (Brotli) next to where `<name>.wasm`
  is requested, not under `assets/`; the platform serves it as `<name>.wasm`.
- Load it lazily after the first view is visible, show progress ("Werkzeug wird geladen … 40 %"),
  and run heavy work in a Web Worker so the page stays responsive.
- Files the engine reads or writes go through `mn.files` (data mode `private`), not a virtual
  disk in IndexedDB.
- Check memory: keep the initial memory small and grow it; test on a phone.
