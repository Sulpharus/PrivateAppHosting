# Local test tools (not deployed)

For working on the port in a session; `build.mjs` does not ship this folder.

- `server.mjs` serves `dist/` like the gate (CSP with `wasm-unsafe-eval`, COOP, `.wasm.br` with
  `Content-Encoding: br`) and the kit under `/_mininode/`; `sdk-stub.js` stands in for the SDK
  (signed in, files and kv in memory, seeds from `window.__mnSeed`).
  `node server.mjs ../dist ../../../packages/ui/kit 8791`
- `smoke.cjs` opens the app in headless Chromium (SwiftShader WebGL), waits for the editor, writes
  `console.log` and screenshots; `PLUGIN_ZIP`, `PLUGIN_DIR`, `SOUNDS_DIR` seed shared plugins or a
  sound folder. `flow.cjs <out> '<json steps>'` clicks, types and screenshots
  (`[{"click":[x,y]},{"key":"Control+s"},{"clickText":"In MiniNode speichern"},{"shot":"name"}]`).
- `ms-ninja.sh` builds the patched tree incrementally; `ms-test.sh` relinks, packages
  (`MUSESCORE_PREBUILT`, `MUSESCORE_PLAIN_WASM`) and runs the smoke test.
- `sf2-check.mjs` writes a SoundFont from `../web/mn-sf2.js` to check with another parser.

Screen positions in the flows are for a 1440 × 900 window.
