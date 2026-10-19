#!/usr/bin/env bash
# Puts the patched Craft release zips from the crafts workflow (artifacts craft-<app>, downloaded
# into $1) where hosted/<app>/build.mjs looks for them: hosted/<app>/.cache/source-<key>.zip.
set -euo pipefail
dir="${1:?usage: scripts/craft-builds.sh <download dir>}"
[ -d "$dir" ] || exit 0
for artifact in "$dir"/craft-*/; do
  app="$(basename "$artifact")"
  app="${app#craft-}"
  mkdir -p "hosted/$app/.cache"
  cp "$artifact"source-*.zip "hosted/$app/.cache/"
done
