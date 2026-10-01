# Programs for the PC/server

Programs run on the NucBox: Windows programs in the Windows 11 VM (RemoteApp over Guacamole) or
`.exe` programs under Wine in a container. Background: PLAN §10, ADR 0013.

## Install from Verwaltung → Hochladen

1. Choose the `.exe` or `.msi`. Under "Einstellungen für das Programm" you can set the runtime,
   the address, the path of the program after installation and the silent arguments. Leave them
   empty to let the script decide: the address comes from the file name, the path is searched
   after the install, `/S` (EXE) or `/qn /norestart` (MSI) is used.
2. The API stores the file in R2 (`installers/<slug>/<file>`), registers a remote app and starts
   the install on the NucBox: snapshot of the VM, hash check, silent install.
3. The upload shows *Installiert* when it worked. Then grant access under *Apps*.
4. If it fails (*Braucht Prüfung*): read the log. Typical fixes are other silent arguments (Inno
   Setup: `/VERYSILENT /NORESTART`) or the real program path; enter them on the upload and press
   "Erneut versuchen". The VM can be rolled back to the snapshot `pre-<slug>-…` in Proxmox.
   "Prüfauftrag kopieren" gives a ready request for a Claude session.

## Setup

The API needs R2 credentials with Object Read & Write on the bucket `mininode-installers`, set as
Worker secrets: `R2_ENDPOINT` (`https://<account>.r2.cloudflarestorage.com`), `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY` (optional `R2_BUCKET`). The NucBox side is `nucbox-install.md`. Without both
the page says programs are not available yet.

## Installers over 95 MB

A Worker request is limited, so put big installers into R2 yourself and describe the program in a
`mininode.json` (`docs/ai/playbooks/native-installer.md`):

```bash
wrangler r2 object put mininode-installers/installers/<slug>/<file> --file <file>
sha256sum <file>
```

Then use *Remote-Apps → Installieren* as before.

## Linux programs

An `.exe`/`.msi` is for Windows (or Wine). Linux programs belong in the App-Bibliothek
(`app-library.md`): a container image the catalog pins by digest.
