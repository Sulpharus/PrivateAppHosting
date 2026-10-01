# App-Bibliothek

Install well-known programs (Jellyfin, n8n, Uptime Kuma, Stirling PDF) on the NucBox with one
click from Verwaltung → App-Bibliothek. See ADR 0011 for the design.

## One-time setup

The NucBox must be running (`nucbox-install.md`) and `vars.NUCBOX_TUNNEL_ID` must be set.

1. **Dispatch token (GitHub → Cloudflare Worker).**
   - GitHub → Settings → Developer settings → Fine-grained tokens → *Generate new token*.
     - Repository access: only `Sulpharus/PrivateAppHosting`.
     - Permissions: *Actions: Read and write*. Nothing else.
   - Save it as the secret `LIBRARY_DISPATCH_TOKEN` in the GitHub environment `production`.
   - The next deploy uploads it to the API Worker as `GITHUB_DISPATCH_TOKEN`.
2. **Catalog token (NucBox).**
   - Create a second fine-grained token for the same repository with *Contents: Read-only*.
   - On the Linux VM, add it to the deploy settings:

     ```bash
     echo "CATALOG_TOKEN=github_pat_…" >> /etc/mininode/deploy.env
     ```

3. Open Verwaltung → App-Bibliothek. The warning "noch nicht eingerichtet" is gone.

## Install, update, remove

- **Installieren:** choose the address (default: the program's name) and click. After two to
  five minutes the app is under Verwaltung → Apps.
  - Grant it there to the people who should use it.
  - Progress and errors: GitHub → Actions → *App-Bibliothek*.
- **Aktualisieren:** installs the version the catalog on `main` names now. Data stays.
- **Entfernen:** stops the program and disables the app.
  - The data stays in `/srv/mininode/apps/<slug>/data` on the NucBox.
  - Installing again at the same address brings it back with its data.

First steps per program:

| Program | After installing |
| --- | --- |
| Jellyfin | Setup wizard in the browser. Put media into `/srv/mininode/apps/<slug>/data/media` (e.g. via `rsync`), then add `/media` as a library. |
| n8n | Create the owner account on first open. Webhooks from outside cannot pass the MiniNode login. |
| Uptime Kuma | Create the admin account on first open. |
| Stirling PDF | Nothing to set up. |

## Adding a program or a new version

1. Find the version tag and its digest. For a multi-arch image take the index digest:

   ```bash
   docker buildx imagetools inspect docker.io/jellyfin/jellyfin:<tag> | grep Digest
   ```

2. Add or change the entry in `infra/nucbox/library.json` (`image: …:<tag>@sha256:<digest>`).
   - Prefer images that run as non-root.
   - Set `user` only to an unprivileged `uid:gid` the image expects.
   - Set `readOnly: false` only when the program writes outside its volumes.
3. `pnpm --filter @mininode/manifest test` validates the catalog.
4. Merge. Then click *Aktualisieren* for installed copies, or try a new program once and check
   it works before telling others.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| "GITHUB_DISPATCH_TOKEN fehlt" | Step 1 not done, or no deploy since. Run the Deploy workflow. |
| "GitHub hat den Start abgelehnt (403/404)" | The token lacks *Actions: write* or is for another repository. |
| Workflow step *nucbox-deploy* fails with "reading the library catalog failed" | `CATALOG_TOKEN` is missing or expired on the NucBox (step 2). |
| "… unhealthy, rolling back" | The program did not answer on its health path within 60 s. The log shows the last 50 lines. Common causes: too little memory, or a volume the image cannot write (check `user`). |
| Workflow is skipped | `vars.NUCBOX_TUNNEL_ID` is empty, or it was not started from `main`. |
| "ist schon vergeben" | Another app uses that address. Pick another one. |
