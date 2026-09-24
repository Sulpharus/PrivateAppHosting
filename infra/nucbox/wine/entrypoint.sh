#!/usr/bin/env bash
# run                        → desktop session: Xvfb + openbox + VNC on :5900, starts $PROGRAM
# install <url> <sha256> [args] → verified silent install into the prefix, then exit
set -euo pipefail

mode=${1:-run}

init_prefix() {
  if [ ! -d "$WINEPREFIX" ]; then
    wineboot --init >/dev/null 2>&1
    wineserver -w
  fi
}

case "$mode" in
  install)
    url=$2 sha=$3 args=${4:-/S}
    file=/tmp/installer
    case "$url" in *.msi\?*|*.msi) file=/tmp/installer.msi ;; *) file=/tmp/installer.exe ;; esac
    curl -fsSL --retry 3 -o "$file" "$url"
    actual=$(sha256sum "$file" | cut -d' ' -f1)
    if [ "$actual" != "$sha" ]; then echo "sha256 mismatch: $actual" >&2; exit 2; fi
    Xvfb :0 -screen 0 1280x800x24 -nolisten tcp &
    init_prefix
    # shellcheck disable=SC2086 # args are intentionally split
    if [[ $file == *.msi ]]; then wine msiexec /i "$file" $args; else wine "$file" $args; fi
    wineserver -w
    echo "installed"
    ;;
  run)
    : "${PROGRAM:?PROGRAM is required}" "${VNC_PASSWORD:?VNC_PASSWORD is required}"
    Xvfb :0 -screen 0 1600x900x24 -nolisten tcp &
    sleep 1
    openbox &
    x11vnc -storepasswd "$VNC_PASSWORD" /tmp/vncpass >/dev/null
    x11vnc -display :0 -rfbauth /tmp/vncpass -rfbport 5900 -forever -shared -quiet -noxdamage &
    init_prefix
    # Keep the session alive while the program runs; restart it once if it crashes early.
    wine "$PROGRAM" || { sleep 2; wine "$PROGRAM"; }
    wineserver -w
    ;;
  *)
    echo "unknown mode: $mode" >&2
    exit 64
    ;;
esac
