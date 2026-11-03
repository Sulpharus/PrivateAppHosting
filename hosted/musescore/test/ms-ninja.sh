#!/usr/bin/env bash
# Incremental MuseScore wasm build; -k 0 keeps going to collect every error in one run.
source "${EMSDK_DIR:-$HOME/build_tools/emsdk}/emsdk_env.sh" >/dev/null 2>&1
export QT_HOST_PATH="${QT_PREFIX:-$HOME/build_tools/Qt/6.10.2}/gcc_64" CCACHE_DIR=$HOME/.cache/ccache CCACHE_MAXSIZE=4G
ninja -C "${MUSESCORE_SRC:-$HOME/src/musescore}/build.web" -j4 -k 0 "$@"
