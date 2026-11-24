#!/usr/bin/env bash
# Marks the apps built from source (MuseScore, Craft apps with patches) as changed, so the next
# deploy ships them. They otherwise ship only for changes to their own folder (and the gate or
# manifest), not for the SDK, kit, CLI or lockfile. Run it in the same commit as such a change
# when these apps need it before the next nightly deploy of all apps (Monday and Thursday).
# Writes hosted/<app>/REBUILD (no function; only the change counts). Nothing is compiled again:
# the program caches depend only on each app's version, patches and toolchain.
#
# Usage: scripts/mark-program-apps.sh "<reason>"   (from the repository root)
set -euo pipefail
reason="${1:?usage: scripts/mark-program-apps.sh \"<reason>\"}"
cd "$(dirname "$0")/.."
stamp="$(date -u +%Y-%m-%dT%H:%MZ)"
for dir in hosted/*/; do
  slug="$(basename "$dir")"
  if [ -f "$dir/source.json" ] || { [ -f "$dir/release.json" ] && jq -e '(.patches | type == "array") and (.patches | length > 0)' "$dir/release.json" >/dev/null; }; then
    printf '%s %s\n' "$stamp" "$reason" >"$dir/REBUILD"
    echo "marked $slug"
  fi
done
