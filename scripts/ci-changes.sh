#!/usr/bin/env bash
# Which parts of the repository a change touches, so CI runs only the jobs that test them.
#
# Usage: scripts/ci-changes.sh [base]   (base: the commit a pull request is merged into)
# Prints key=value lines for $GITHUB_OUTPUT:
#   code       something besides documentation changed (docs/, graphify-out/, *.md, LICENSE,
#              workflows CI does not run)
#   docs       documentation the portal bundles and e2e shows (wiki, AI specs and prompts, ADRs,
#              runbooks, workflow list)
#   infra      what the infra job checks: scripts, server images, the release packages' contents
#   desktop    what the desktop image builds (also the portal with its bundled documentation)
#   hosted     a hosted app changed (dry-run deploy of the changed apps)
#   musescore  hosted/musescore changed (its program build takes hours on a cold cache)
#   crafts     a Craft app built from patched source changed
# Without a base (a push to main), with an unusable one, or when CI's own workflows or the root
# build setup changed, everything is true. Tested by scripts/ci-changes.test.sh.
set -euo pipefail

keys=(code docs infra desktop hosted musescore crafts)
everything() {
  for key in "${keys[@]}"; do echo "$key=true"; done
  exit 0
}

base="${1:-}"
if [ -z "$base" ] || [[ "$base" =~ ^0+$ ]]; then everything; fi
files="$(git diff --name-only "$base...HEAD" 2>/dev/null)" || everything

# No pipes into `grep -q`: it stops reading early, and under pipefail the writer's SIGPIPE would
# turn a match into "no match" for long file lists.
has() { grep -q -E "$1" <<<"$files"; }
flag() { if has "$2"; then echo "$1=true"; else echo "$1=false"; fi; }

# CI's own workflows and the root build setup can change any result.
if has '^(\.github/workflows/(ci|crafts|musescore)\.yml|package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|turbo\.json|\.nvmrc|biome\.json|tsconfig[^/]*\.json)$'; then
  everything
fi

if grep -q -v -E '^(docs/|graphify-out/|\.github/)|\.md$|^LICENSE$' <<<"$files"; then
  echo "code=true"
else
  echo "code=false"
fi
flag docs '^(docs/(wiki|ai|adr|runbooks)/|\.github/workflows/)'
flag infra '^(infra/|scripts/|apps/nucbox-control/|packages/(gate|config|manifest)/|\.github/actions/|\.github/workflows/release\.yml$|docs/(runbooks|adr)/|LICENSE$)'
flag desktop '^(infra/desktop/|apps/|packages/|supabase/|scripts/|mininode\.config\.json$|\.dockerignore$|docs/(wiki|ai|adr|runbooks)/|\.github/workflows/)'
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
