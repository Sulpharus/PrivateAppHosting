#!/usr/bin/env bash
# Builds Qt for WebAssembly from the official sources on GitHub: first the host tools (Linux),
# then the WebAssembly libraries (static, single thread, size-optimised, wasm exceptions + JSPI so
# MuseScore's modal dialogs work). The official Qt binaries are not used: they are built without
# JSPI and their download server is not reachable from every build environment.
#
# Usage: toolchain/build-qt.sh <prefix>     (needs cmake, ninja, git, a C++ compiler, OpenGL headers)
# Result: <prefix>/gcc_64 (host) and <prefix>/wasm_singlethread (target), each with a .done marker
# (the target's holds a hash of toolchain/qt-*.patch).
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

# Fixes for Qt itself (toolchain/qt-<module>.patch), applied once; a changed patch replaces the
# old one on a clean source. The WebAssembly marker holds the patches' hash, so an existing Qt
# built before a patch changed is built again.
for patch in "$here"/qt-*.patch; do
  [ -e "$patch" ] || continue
  module="$(basename "$patch" .patch)"
  module="${module#qt-}"
  if ! git -C "$SRC/$module" apply --reverse --check "$patch" 2>/dev/null; then
    git -C "$SRC/$module" checkout -q -- .
    git -C "$SRC/$module" apply "$patch"
  fi
done
qt_patches="$(cat /dev/null "$here"/qt-*.patch 2>/dev/null | sha256sum | cut -c1-16)"
if [ -f "$WASM_PREFIX/.done" ] && [ "$(cat "$WASM_PREFIX/.done")" != "$qt_patches" ]; then
  rm "$WASM_PREFIX/.done"
fi

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

# Qt5Compat's graphical effects (MuseScore's shadows, masks) ship prebuilt shaders with GLSL ES
# 1.00 only, while Qt builds its own shaders for WebAssembly with 1.00 and 3.00. WebGL 2 then links
# a 3.00 vertex shader with a 1.00 fragment shader and fails ("Fragment shader version does not
# match"), and MuseScore falls back to software rendering. Regenerate them for the web (GLSL ES
# only), with the flags of the module's own compile.bat.
regenerate_qt5compat_shaders() {
  local dir="$SRC/qt5compat/src/imports/graphicaleffects5/shaders_ng"
  grep -E '^qsb ' "$dir/compile.bat" | while read -r line; do
    local batch="" out input
    [[ " $line " == *" -b "* ]] && batch="-b"
    out="$(sed -E 's/.* -o ([^ ]+) ([^ ]+)\r?$/\1/' <<<"$line")"
    input="$(sed -E 's/.* -o ([^ ]+) ([^ ]+)\r?$/\2/' <<<"$line" | tr -d '\r')"
    out="$(tr -d '\r' <<<"$out")"
    "$HOST_PREFIX/bin/qsb" $batch --glsl "100es,300es" -o "$dir/$out" "$dir/$input"
  done
}

emsdk_activate
if [ ! -f "$WASM_PREFIX/.done" ]; then
  regenerate_qt5compat_shaders
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
  echo "$qt_patches" > "$WASM_PREFIX/.done"
fi
echo "=== Qt $QT_VERSION for WebAssembly is in $PREFIX"
