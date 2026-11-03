#!/usr/bin/env bash
# Which parts of the repository a change touches, so CI runs only the jobs that test them.
#
# Usage: scripts/ci-changes.sh <base>   (base: the PR's base commit, or the commit before a push)
# Prints key=value lines for $GITHUB_OUTPUT:
#   code       something besides documentation changed (docs/, graphify-out/, *.md)
#   wiki       docs/wiki changed (the portal bundles it; e2e/wiki.spec.ts shows it)
#   infra      infra/, scripts/, the physical server's control program or the gate
#   desktop    what the desktop installer builds and starts
#   hosted     a hosted app changed (dry-run deploy of the changed apps)
#   musescore  hosted/musescore changed (its program build takes hours on a cold cache)
#   crafts     a Craft app built from patched source changed
# Without a usable base (first push, force push, shallow clone), or when the build setup itself
# changed (workflows, lockfile, root config), everything is true.
set -euo pipefail

keys=(code wiki infra desktop hosted musescore crafts)
everything() {
  for key in "${keys[@]}"; do echo "$key=true"; done
  exit 0
}

base="${1:-}"
[ -n "$base" ] && ! [[ "$base" =~ ^0+$ ]] || everything
files="$(git diff --name-only "$base...HEAD" 2>/dev/null)" || everything

has() { grep -q -E "$1" <<<"$files"; }
flag() { if has "$2"; then echo "$1=true"; else echo "$1=false"; fi; }

# CI's own workflows and the root build setup can change any result. Other workflows (deploy,
# release, updates) are not run by CI; the wiki test (always run) checks that they are listed.
has '^(\.github/workflows/(ci|crafts|musescore)\.yml$|package\.json$|pnpm-lock\.yaml$|pnpm-workspace\.yaml$|turbo\.json$|\.nvmrc$|biome\.json$|tsconfig[^/]*\.json$)' &&
  everything

if grep -v -E '^(docs/|graphify-out/|\.github/)|\.md$|^LICENSE$' <<<"$files" | grep -q .; then
  echo "code=true"
else
  echo "code=false"
fi
flag wiki '^docs/wiki/'
flag infra '^(infra/|scripts/|apps/nucbox-control/|packages/gate/|\.github/actions/|\.github/workflows/release\.yml$)'
flag desktop '^(infra/desktop/|apps/|packages/|supabase/|scripts/|mininode\.config\.json$)'
flag hosted '^hosted/'
flag musescore '^hosted/musescore/'

crafts=false
for slug in $(grep -o -E '^hosted/[^/]+/' <<<"$files" | cut -d/ -f2 | sort -u); do
  release="hosted/$slug/release.json"
  if [ -f "$release" ] && jq -e '(.patches // []) | length > 0' "$release" >/dev/null; then
    crafts=true
  fi
done
echo "crafts=$crafts"
