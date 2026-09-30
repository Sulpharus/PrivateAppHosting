# infra/nucbox

Everything that runs on the NucBox. Install and operations: `docs/runbooks/nucbox-install.md`,
`restore.md`, `key-rotation.md`.

On the Linux VM the repo is cloned to `/srv/mininode/infra-src`; `/srv/mininode/platform` holds
the env files and symlinks to `compose.yml` and `traefik/`, `/srv/mininode/apps/<slug>` the
generated compose project and data of each container app.

`library.json` is the App-Bibliothek catalog (ADR 0011): third-party programs pinned by digest,
installed with `deploy/nucbox-deploy library <slug> <entry>`, which reads the entry from `main`
(`docs/runbooks/app-library.md`).
