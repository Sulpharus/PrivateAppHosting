# Playbook: native program (Windows / Android)

Native programs run on the NucBox and are used through the browser (Guacamole).

1. **Do not commit the installer.** Upload it to R2 (`installers/<slug>/<file>`) and note its
   SHA-256 (`sha256sum file.exe`). Prefer a `wingetId` when the program is in winget.
2. Manifest: `kind: "remote"`, `target: "remote"`,
   `remote: { runtime: "windows" | "wine" | "android", program, installer: { r2Key, sha256 } }`.
   `program` is the executable path after installation (Windows) or package name (Android).
   Add `installer.silentArgs` when the installer is not NSIS (`/S`) or MSI (`/qn /norestart`),
   e.g. `/VERYSILENT /NORESTART` for Inno Setup.
3. Data mode: `shared-account` when the program runs logged in as the owner and trusted users
   control it; otherwise `private` (each session starts clean).
4. The admin clicks **Installieren** under *Admin → Remote-Apps*; `nucbox-control` snapshots the
   VM first, verifies the hash, installs silently and registers the RemoteApp alias. A failed
   install shows the installer output; roll back with the `pre-<slug>-…` snapshot in Proxmox.
5. Test from a phone: connect, work, disconnect; check the VM hibernates after the idle timeout.
