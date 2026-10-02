---
id: remote-program
title: Programm für PC/Server
summary: Windows- oder Linux-Programm im Browser nutzen, stille Installation, Prüfsumme
group: server
order: 111
---

## Feature: a native program as a remote app

Use it for an existing desktop program that should be used through the browser. Do not rewrite
it as a web app unless asked.

- Manifest: `kind: "remote"`, `target: "remote"`,
  `remote: { runtime: "windows" | "wine" | "android", program, installer: { r2Key, sha256 } }`.
  `program` is the executable path after installation (or the Android package name).
- **Never commit the installer.** Upload it (Verwaltung → Apps → Hochladen) or put it in R2 under
  `installers/<slug>/<file>` and note its SHA-256. Prefer a `wingetId` when the program is in winget.
- Silent install: NSIS `/S`, MSI `/qn /norestart`, Inno Setup `/VERYSILENT /NORESTART`. Set
  `installer.silentArgs` when it is none of the first two.
- Data mode: `shared-account` when the program runs logged in as the owner and trusted users
  control it; otherwise `private` (each session starts clean).
- The install snapshots the VM first, checks the hash and rolls back on failure; a failed install
  shows the installer output.
- Linux programs belong in the App-Bibliothek instead (a pinned container image).
- Test from a phone: connect, work, disconnect; the VM sleeps after the idle limit (15 minutes).
