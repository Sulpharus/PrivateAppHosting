#!/usr/bin/env bash
# Local loop: relink the editor (ms-ninja.sh), package dist/ from the built tree, run the smoke test
# against server.mjs (start it first: node server.mjs <dist> <packages/ui/kit> 8791).
# Env: DEBUG_WASM=0 for a Brotli build, GLDEBUG=1 for Qt RHI logs, PLUGIN_DIR / SOUNDS_DIR seeds, TAIL.
# Relink the editor, package dist/, serve the uncompressed debug module, run the browser smoke test.
set -u
"$(dirname "$0")/ms-ninja.sh" MuseScoreStudio > ~/build_tools/ms-build.log 2>&1 || { echo "BUILD FAILED"; grep -E "error:|wasm-ld: error" ~/build_tools/ms-build.log | head -20; exit 1; }
cd /home/user/PrivateAppHosting && MUSESCORE_PLAIN_WASM=${DEBUG_WASM:-1} MUSESCORE_PREBUILT=$HOME/src/musescore PATH=$HOME/build_tools/bin:$PATH node hosted/musescore/build.mjs > ~/build_tools/pack.log 2>&1 || { echo "PACK FAILED"; tail -5 ~/build_tools/pack.log; exit 1; }
D=/home/user/PrivateAppHosting/hosted/musescore/dist
if [ "${GLDEBUG:-0}" = 1 ]; then sed -i "s/environment: { MININODE_LANGUAGE: window.mnI18n?.lang ?? 'de' },/environment: { MININODE_LANGUAGE: window.mnI18n?.lang ?? 'de', QT_LOGGING_RULES: 'qt.rhi.*=true' },/" "$D/mn-musescore.js"; fi
W=$(ls "$D" | grep "wasm.br$" | sed 's/\.br$//')
S="$(cd "$(dirname "$0")" && pwd)"  # this folder: server, stand-in SDK, tests; screenshots land here
cd "$S" && timeout 400 node smoke.cjs "$S"
grep -v "fonts/\|status of 404" "$S/console.log" | cut -c1-260 | tail -${TAIL:-30}
