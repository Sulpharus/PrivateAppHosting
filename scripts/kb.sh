#!/usr/bin/env bash
# Refreshes the code knowledge graph in graphify-out/ (tree-sitter, local, no LLM calls).
# Installs the pinned graphify version on first use.
set -euo pipefail
GRAPHIFY_VERSION=0.9.67
if ! command -v graphify >/dev/null 2>&1 || ! graphify --version 2>/dev/null | grep -q "$GRAPHIFY_VERSION"; then
  if command -v uv >/dev/null 2>&1; then
    uv tool install --force "graphifyy[sql]==$GRAPHIFY_VERSION" >/dev/null
  else
    python3 -m pip install --quiet --user "graphifyy[sql]==$GRAPHIFY_VERSION"
  fi
fi
cd "$(git rev-parse --show-toplevel)"
graphify update . "$@"
