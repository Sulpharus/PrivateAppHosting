#!/usr/bin/env bash
# Publishes an exported app folder (mininode export) as a GitHub repository (ADR 0012):
#   publish-export.sh <dir> <repo-name> <private|public> <description>
# EXPORT_REPO_TOKEN: fine-grained token of the owner, Administration + Contents: write.
# A new repository starts with one commit; an earlier export of the same app (topic
# mininode-app) gets a new commit on top. Other existing repositories are never touched.
set -euo pipefail
dir=$1 name=$2 visibility=$3 description=$4
token=${EXPORT_REPO_TOKEN:?EXPORT_REPO_TOKEN is not set}
[[ $name =~ ^[A-Za-z0-9._-]{1,100}$ && $name != .* ]] || { echo "invalid repository name" >&2; exit 1; }
[[ $visibility == private || $visibility == public ]] || { echo "invalid visibility" >&2; exit 1; }

api() { # method path [json]
  curl -fsS -X "$1" "https://api.github.com$2" -H "Authorization: Bearer $token" \
    -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28" \
    ${3:+--data "$3"}
}

owner=$(api GET /user | jq -r .login)
existing=$(curl -sS -o /dev/null -w '%{http_code}' "https://api.github.com/repos/$owner/$name" \
  -H "Authorization: Bearer $token")
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
auth=$(printf 'x-access-token:%s' "$token" | base64 -w0)
git_() { git -c "http.https://github.com/.extraheader=AUTHORIZATION: basic $auth" "$@"; }

if [ "$existing" = 200 ]; then
  topics=$(api GET "/repos/$owner/$name/topics" | jq -r '.names[]')
  grep -qx mininode-app <<<"$topics" || {
    echo "$owner/$name exists and is not a MiniNode export; choose another name" >&2
    exit 1
  }
  git_ clone -q "https://github.com/$owner/$name.git" "$work/repo"
  find "$work/repo" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
else
  private=$([ "$visibility" = private ] && echo true || echo false)
  api POST /user/repos "$(jq -nc --arg n "$name" --arg d "$description" --argjson p "$private" \
    '{name: $n, description: $d, private: $p, has_wiki: false}')" >/dev/null
  api PUT "/repos/$owner/$name/topics" '{"names":["mininode-app"]}' >/dev/null
  git init -q -b main "$work/repo"
fi

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
