#!/usr/bin/env bash
# Publishes an exported app folder (mininode export) as a GitHub repository (ADR 0012):
#   publish-export.sh <dir> <repo-name> <private|public> <description>
# EXPORT_REPO_TOKEN: fine-grained token of the owner, Administration + Contents: write.
# A new repository starts with one commit. An existing repository is updated only when it is
# the earlier export of the same app (its .mininode-export names the same slug) and its
# visibility matches the one asked for; any other repository is refused.
set -euo pipefail
dir=$1 name=$2 visibility=$3 description=$4
token=${EXPORT_REPO_TOKEN:?EXPORT_REPO_TOKEN is not set}
[[ $name =~ ^[A-Za-z0-9_-][A-Za-z0-9._-]{0,99}$ ]] || { echo "invalid repository name" >&2; exit 1; }
[[ $visibility == private || $visibility == public ]] || { echo "invalid visibility" >&2; exit 1; }
marker=$(cat "$dir/.mininode-export") || { echo "$dir is not an export" >&2; exit 1; }

api() { # method path [json]
  curl -fsS -X "$1" "https://api.github.com$2" -H "Authorization: Bearer $token" \
    -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28" \
    ${3:+--data "$3"}
}

owner=$(api GET /user | jq -r .login)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
status=$(curl -sS -o "$work/repo.json" -w '%{http_code}' "https://api.github.com/repos/$owner/$name" \
  -H "Authorization: Bearer $token" -H "Accept: application/vnd.github+json")
auth=$(printf 'x-access-token:%s' "$token" | base64 -w0)
git_() { git -c "http.https://github.com/.extraheader=AUTHORIZATION: basic $auth" "$@"; }

case $status in
  200)
    private=$(jq -r .private "$work/repo.json")
    if [ "$visibility" = private ] && [ "$private" != true ]; then
      echo "$owner/$name is public, but a private export was asked for; nothing published" >&2
      exit 1
    fi
    if [ "$visibility" = public ] && [ "$private" = true ]; then
      echo "$owner/$name is private; make it public on GitHub first if that is intended" >&2
      exit 1
    fi
    git_ clone -q -b main "https://github.com/$owner/$name.git" "$work/repo" || {
      echo "$owner/$name has no main branch; not an export" >&2
      exit 1
    }
    if [ "$(cat "$work/repo/.mininode-export" 2>/dev/null)" != "$marker" ]; then
      echo "$owner/$name is not the export of this app; choose another name" >&2
      exit 1
    fi
    find "$work/repo" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
    ;;
  404)
    api POST /user/repos "$(jq -nc --arg n "$name" --arg d "$description" \
      --argjson p "$([ "$visibility" = private ] && echo true || echo false)" \
      '{name: $n, description: $d, private: $p, has_wiki: false}')" >/dev/null
    # Only for finding exports on GitHub; the marker file is what protects updates.
    api PUT "/repos/$owner/$name/topics" '{"names":["mininode-app"]}' >/dev/null ||
      echo "warning: could not set the topic mininode-app" >&2
    git init -q -b main "$work/repo"
    ;;
  *)
    echo "GitHub answered $status for $owner/$name; nothing published" >&2
    exit 1
    ;;
esac

cp -a "$dir/." "$work/repo/"
cd "$work/repo"
git add -A
if git diff --cached --quiet; then
  echo "$owner/$name is already up to date"
  exit 0
fi
git -c user.name="MiniNode export" -c user.email="41898282+github-actions[bot]@users.noreply.github.com" \
  commit -qm "Export from MiniNode"
git_ push -q "https://github.com/$owner/$name.git" HEAD:main
echo "https://github.com/$owner/$name"
