# infra/nucbox

Everything that runs on the NucBox. Install and operations: `docs/runbooks/nucbox-install.md`,
`restore.md`, `key-rotation.md`.

On the Linux VM the repo is cloned to `/srv/mininode/infra-src`; `/srv/mininode/platform` holds
the env files and symlinks to `compose.yml` and `traefik/`, `/srv/mininode/apps/<slug>` the
generated compose project and data of each container app.
