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
#   musescore  hosted/musescore or its build workflow changed (the program build takes hours)
#   crafts     a Craft app built from patched source, or the Craft build workflow, changed
#   craft_apps JSON list of those Craft apps (empty: all of them)
# Without a base (a push to main) or with an unusable one, everything is true. When CI's own
# workflow or the root build setup changed, everything is true except the program builds:
# MuseScore and the Craft apps are only built for a change to their own folder or build workflow.
# Tested by scripts/ci-changes.test.sh.
set -euo pipefail

keys=(code docs infra desktop hosted musescore crafts)
everything() {
  for key in "${keys[@]}"; do echo "$key=true"; done
  echo "craft_apps="
  exit 0
}

base="${1:-}"
if [ -z "$base" ] || [[ "$base" =~ ^0+$ ]]; then everything; fi
files="$(git diff --name-only "$base...HEAD" 2>/dev/null)" || everything

# No pipes into `grep -q`: it stops reading early, and under pipefail the writer's SIGPIPE would
# turn a match into "no match" for long file lists.
has() { grep -q -E "$1" <<<"$files"; }
flag() { if has "$2"; then echo "$1=true"; else echo "$1=false"; fi; }

# CI's own workflow and the root build setup can change any result, except the program builds.
if has '^(\.github/workflows/ci\.yml|package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|turbo\.json|\.nvmrc|biome\.json|tsconfig[^/]*\.json)$'; then
  for key in code docs infra desktop hosted; do echo "$key=true"; done
else
  if grep -q -v -E '^(docs/|graphify-out/|\.github/)|\.md$|^LICENSE$' <<<"$files"; then
    echo "code=true"
  else
    echo "code=false"
  fi
  flag docs '^(docs/(wiki|ai|adr|runbooks)/|\.github/workflows/)'
  flag infra '^(infra/|scripts/|apps/nucbox-control/|packages/(gate|config|manifest)/|\.github/actions/|\.github/workflows/release\.yml$|docs/(runbooks|adr)/|LICENSE$)'
  flag desktop '^(infra/desktop/|apps/|packages/|supabase/|scripts/|mininode\.config\.json$|\.dockerignore$|docs/(wiki|ai|adr|runbooks)/|\.github/workflows/)'
  flag hosted '^hosted/'
fi
# Documentation and tests inside an app's folder do not change its program.
builds="$(grep -v -E '\.md$|^hosted/[^/]+/test/' <<<"$files" || true)"
builds_has() { grep -q -E "$1" <<<"$builds"; }
if builds_has '^(hosted/musescore/|\.github/workflows/musescore\.yml$)'; then echo "musescore=true"; else echo "musescore=false"; fi

# Craft apps with patches whose own folder changed; the Craft workflow itself means all of them.
patched=()
for release in hosted/*/release.json; do
  [ -f "$release" ] || continue
  if jq -e '(.patches // []) | length > 0' "$release" >/dev/null; then
    patched+=("$(basename "$(dirname "$release")")")
  fi
done
craft_apps=()
for slug in "${patched[@]}"; do
  if builds_has '^\.github/workflows/crafts\.yml$' || builds_has "^hosted/$slug/"; then craft_apps+=("$slug"); fi
done
if [ "${#craft_apps[@]}" -gt 0 ]; then
  echo "crafts=true"
  echo "craft_apps=$(printf '%s\n' "${craft_apps[@]}" | jq -R . | jq -s -c .)"
else
  echo "crafts=false"
  echo "craft_apps=[]"
fi
