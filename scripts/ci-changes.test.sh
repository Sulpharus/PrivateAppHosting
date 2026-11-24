#!/usr/bin/env bash
# Tests scripts/ci-changes.sh in a throwaway git repository: which jobs a change turns on.
# Usage: scripts/ci-changes.test.sh   (run by CI's infra job)
set -euo pipefail
script="$(cd "$(dirname "$0")" && pwd)/ci-changes.sh"
repo="$(mktemp -d)"
trap 'rm -rf "$repo"' EXIT
cd "$repo"
git init -q -b main
git config user.email ci@example.org
git config user.name ci
mkdir -p hosted/wordcraft hosted/filmcraft hosted/notes docs/wiki
echo '{"patches":["a.patch"]}' > hosted/wordcraft/release.json
echo '{"patches":["b.patch"]}' > hosted/filmcraft/release.json
echo '{}' > hosted/notes/mininode.json
git add -A && git commit -q -m base
base="$(git rev-parse HEAD)"

failures=0
# expect "<description>" "<files to add, space-separated>" "<key=value ...>"
expect() {
  git checkout -q -B "t$RANDOM" "$base"
  for file in $2; do
    mkdir -p "$(dirname "$file")" && echo x >> "$file"
  done
  git add -A && git commit -q -m change
  local out
  out="$("$script" "$base" | tr '\n' ' ')"
  for pair in $3; do
    if [[ " $out" != *" $pair "* ]]; then
      echo "FAIL $1: expected $pair, got: $out"
      failures=$((failures + 1))
    fi
  done
}

all='code=true docs=true infra=true desktop=true hosted=true musescore=true crafts=true craft_apps='
expect 'README only' 'README.md' 'code=false docs=false infra=false desktop=false hosted=false'
expect 'wiki article' 'docs/wiki/a.md' 'code=false docs=true infra=false desktop=true hosted=false'
expect 'runbook' 'docs/runbooks/r.md' 'code=false docs=true infra=true'
expect 'deploy workflow' '.github/workflows/deploy.yml' 'code=false docs=true infra=false'
# The root setup tests everything except the program builds, which take hours.
shared='code=true docs=true infra=true desktop=true hosted=true musescore=false crafts=false craft_apps=[]'
expect 'CI workflow' '.github/workflows/ci.yml' "$shared"
expect 'lockfile' 'pnpm-lock.yaml' "$shared"
expect 'kit' 'packages/ui/kit/ui.js' 'musescore=false crafts=false'
expect 'MuseScore workflow' '.github/workflows/musescore.yml' 'musescore=true crafts=false'
expect 'Craft workflow' '.github/workflows/crafts.yml' 'crafts=true craft_apps=["filmcraft","wordcraft"] musescore=false'
expect 'portal code' 'apps/portal/src/x.ts' 'code=true docs=false infra=false desktop=true hosted=false'
expect 'gate' 'packages/gate/src/x.ts' 'code=true infra=true desktop=true'
expect 'desktop installer' 'infra/desktop/install.sh' 'code=true infra=true desktop=true'
expect 'plain app' 'hosted/notes/index.html' 'code=true hosted=true musescore=false crafts=false desktop=false'
expect 'craft app' 'hosted/wordcraft/build.mjs' 'hosted=true crafts=true craft_apps=["wordcraft"] musescore=false'
expect 'musescore' 'hosted/musescore/build.mjs' 'hosted=true musescore=true crafts=false'
expect 'app readme' 'hosted/notes/README.md' 'code=false hosted=true'
expect 'MuseScore readme and tests' 'hosted/musescore/README.md hosted/musescore/test/a.test.js' 'musescore=false'
expect 'Craft readme' 'hosted/wordcraft/README.md' 'crafts=false craft_apps=[]'

# More files than a pipe buffer holds: code must still be seen (no SIGPIPE under pipefail).
many=""
for i in $(seq 1 3000); do many="$many src/a-rather-long-directory-name/with-a-long-file-name-$i.ts"; done
expect 'thousands of code files' "docs/x.md$many" 'code=true'

out="$("$script" '' | tr '\n' ' ')"
[[ "$out" == "$all " ]] || { echo "FAIL no base: $out"; failures=$((failures + 1)); }
out="$("$script" 0000000000000000000000000000000000000000 | tr '\n' ' ')"
[[ "$out" == "$all " ]] || { echo "FAIL zero base: $out"; failures=$((failures + 1)); }
out="$("$script" not-a-commit | tr '\n' ' ')"
[[ "$out" == "$all " ]] || { echo "FAIL unknown base: $out"; failures=$((failures + 1)); }

if [ "$failures" -gt 0 ]; then
  echo "$failures failure(s)"
  exit 1
fi
echo "ci-changes: all cases pass"
