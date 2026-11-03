# Versions of the MuseScore web toolchain, sourced by the other scripts in this folder.
# Keep them in step with upstream's .github/workflows/build_wasm.yml and
# buildscripts/ci/linux/setup.sh (EMSDK_VERSION) for the MuseScore version in source.json.
QT_VERSION=6.10.2
EMSDK_VERSION=4.0.7
EMSDK_DIR="${EMSDK_DIR:-$HOME/.cache/mininode/emsdk}"

# Installs (once) and activates the pinned Emscripten SDK in the current shell.
emsdk_activate() {
  if [ ! -x "$EMSDK_DIR/emsdk" ]; then
    git clone -q https://github.com/emscripten-core/emsdk.git "$EMSDK_DIR"
  fi
  if [ ! -f "$EMSDK_DIR/.installed-$EMSDK_VERSION" ]; then
    "$EMSDK_DIR/emsdk" install "$EMSDK_VERSION"
    touch "$EMSDK_DIR/.installed-$EMSDK_VERSION"
  fi
  "$EMSDK_DIR/emsdk" activate "$EMSDK_VERSION" >/dev/null
  # shellcheck disable=SC1091
  source "$EMSDK_DIR/emsdk_env.sh" >/dev/null 2>&1
}
