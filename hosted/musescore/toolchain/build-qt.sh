#!/usr/bin/env bash
# Builds Qt for WebAssembly from the official sources on GitHub: first the host tools (Linux),
# then the WebAssembly libraries (static, single thread, size-optimised, wasm exceptions + JSPI so
# MuseScore's modal dialogs work). The official Qt binaries are not used: they are built without
# JSPI and their download server is not reachable from every build environment.
#
# Usage: toolchain/build-qt.sh <prefix>     (needs cmake, ninja, git, a C++ compiler, OpenGL headers)
# Result: <prefix>/gcc_64 (host) and <prefix>/wasm_singlethread (target), each with a .done marker.
# Emscripten comes from toolchain/env.sh (EMSDK_VERSION).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=env.sh
source "$here/env.sh"
PREFIX="${1:?usage: build-qt.sh <prefix>}"
SRC="$PREFIX/src"
BUILD="$PREFIX/build"
HOST_PREFIX="$PREFIX/gcc_64"
WASM_PREFIX="$PREFIX/wasm_singlethread"
MODULES=(qtbase qtshadertools qtsvg qtdeclarative qt5compat)
JOBS="$(nproc)"
mkdir -p "$SRC" "$BUILD"

for module in "${MODULES[@]}"; do
  [ -d "$SRC/$module" ] ||
    git clone -q --depth 1 --branch "v$QT_VERSION" "https://github.com/qt/$module.git" "$SRC/$module"
done

common=(-GNinja -DCMAKE_BUILD_TYPE=Release -DQT_BUILD_EXAMPLES=OFF -DQT_BUILD_TESTS=OFF
  -DQT_GENERATE_SBOM=OFF)
command -v ccache >/dev/null && common+=(-DQT_USE_CCACHE=ON)

if [ ! -f "$HOST_PREFIX/.done" ]; then
  echo "=== host qtbase"
  cmake -S "$SRC/qtbase" -B "$BUILD/host-qtbase" "${common[@]}" -DCMAKE_INSTALL_PREFIX="$HOST_PREFIX" \
    -DFEATURE_xcb=OFF -DFEATURE_dbus=OFF -DFEATURE_sql=OFF -DFEATURE_printsupport=OFF
  cmake --build "$BUILD/host-qtbase" -j"$JOBS"
  cmake --install "$BUILD/host-qtbase"
  for module in "${MODULES[@]:1}"; do
    echo "=== host $module"
    cmake -S "$SRC/$module" -B "$BUILD/host-$module" "${common[@]}" \
      -DCMAKE_PREFIX_PATH="$HOST_PREFIX" -DCMAKE_INSTALL_PREFIX="$HOST_PREFIX"
    cmake --build "$BUILD/host-$module" -j"$JOBS"
    cmake --install "$BUILD/host-$module"
  done
  touch "$HOST_PREFIX/.done"
fi

emsdk_activate
if [ ! -f "$WASM_PREFIX/.done" ]; then
  echo "=== wasm qtbase"
  mkdir -p "$BUILD/wasm-qtbase"
  (cd "$BUILD/wasm-qtbase" &&
    "$SRC/qtbase/configure" -prefix "$WASM_PREFIX" -qt-host-path "$HOST_PREFIX" \
      -platform wasm-emscripten -static -release -optimize-size -nomake examples -nomake tests \
      -no-sbom -feature-wasm-exceptions -feature-wasm-jspi)
  cmake --build "$BUILD/wasm-qtbase" -j"$JOBS"
  cmake --install "$BUILD/wasm-qtbase"
  for module in "${MODULES[@]:1}"; do
    echo "=== wasm $module"
    mkdir -p "$BUILD/wasm-$module"
    (cd "$BUILD/wasm-$module" && "$WASM_PREFIX/bin/qt-configure-module" "$SRC/$module")
    cmake --build "$BUILD/wasm-$module" -j"$JOBS"
    cmake --install "$BUILD/wasm-$module"
  done
  touch "$WASM_PREFIX/.done"
fi
echo "=== Qt $QT_VERSION for WebAssembly is in $PREFIX"
