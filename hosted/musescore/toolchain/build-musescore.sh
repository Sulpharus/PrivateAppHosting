#!/usr/bin/env bash
# Builds MuseScore Studio for WebAssembly in the "app-mininode" configuration (the desktop editor,
# added by patches/mininode.patch) and its audio engine (MuseAudio, runs in an AudioWorklet).
#
# Usage: toolchain/build-musescore.sh <qt prefix> <patched source dir> <out dir>
#   <qt prefix> from toolchain/build-qt.sh. <out dir> receives MuseScoreStudio.{js,wasm},
#   MuseAudio.js (the engine with its module inside) and qtloader.js.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=env.sh
source "$here/env.sh"
QT="${1:?usage: build-musescore.sh <qt prefix> <source dir> <out dir>}"
SRC="$(cd "${2:?source dir}" && pwd)"
OUT="${3:?out dir}"
JOBS="$(nproc)"
emsdk_activate

export QT_HOST_PATH="$QT/gcc_64"
toolchain="$QT/wasm_singlethread/lib/cmake/Qt6/qt.toolchain.cmake"
launcher=()
command -v ccache >/dev/null && launcher=(-DCMAKE_C_COMPILER_LAUNCHER=ccache -DCMAKE_CXX_COMPILER_LAUNCHER=ccache)

echo "=== MuseScore Studio (app-mininode)"
cmake -S "$SRC" -B "$SRC/build.web" -GNinja "${launcher[@]}" \
  -DCMAKE_TOOLCHAIN_FILE="$toolchain" \
  -DCMAKE_BUILD_TYPE=Release \
  -DMUSESCORE_BUILD_CONFIGURATION=app-mininode \
  -DMUSE_APP_BUILD_MODE=release \
  -DCMAKE_BUILD_NUMBER="${MUSESCORE_BUILD_NUMBER:-0}" \
  -DMUSESCORE_REVISION="$(git -C "$SRC" rev-parse --short=7 HEAD 2>/dev/null || echo unknown)" \
  -DMUE_RUN_LRELEASE=OFF \
  -DMUE_DOWNLOAD_SOUNDFONT=OFF \
  -DMUSE_ENABLE_UNIT_TESTS=OFF \
  -DMUSE_MODULE_GLOBAL_LOGGER_DEBUGLEVEL=OFF \
  -DMUSE_COMPILE_USE_UNITY=ON
cmake --build "$SRC/build.web" -j"$JOBS"

echo "=== MuseAudio (audio engine)"
cmake -S "$SRC/src/web/audioengine" -B "$SRC/build.audio" -GNinja "${launcher[@]}" \
  -DCMAKE_TOOLCHAIN_FILE="$EMSDK/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake" \
  -DCMAKE_BUILD_TYPE=Release
cmake --build "$SRC/build.audio" -j"$JOBS"

mkdir -p "$OUT"
bin="$SRC/build.web/src/app"
cp "$bin/MuseScoreStudio.js" "$bin/MuseScoreStudio.wasm" "$OUT/"
cp "$SRC/build.artifacts/MuseAudio.js" "$OUT/"
cp "$SRC/src/web/appjs/distr/qtloader.js" "$OUT/"
ls -la "$OUT"
