# @mininode/nucbox-control

Small Node service on the NucBox Linux VM (compose service `nucbox-control`,
`control.mininode.app` behind Cloudflare Access). It is the only component that can touch the
hypervisor and the Docker socket.

| Route | Caller | Purpose |
|---|---|---|
| `GET /health` | compose, nucbox-deploy | liveness |
| `GET /auth` | Traefik forward-auth | Same decision as the Workers gate (`@mininode/gate`): 200 with `X-Mininode-User/Email/Role/Token`, 302 to the central login (401 for non-navigations), or 403 without a grant. Grants are cached for 60 s |
| `POST /sessions/prepare` | API (`/remote/sessions`) | Windows: wake the VM from hibernation, answer `ready:false, etaSeconds` until the guest agent responds, then RDP RemoteApp parameters (`remote-app: \|\|<slug>`). Wine: start `mn-wine-<slug>`, answer VNC parameters |
| `POST /sessions/sync` | API cron (5 min) | Apps with live sessions; also runs the idle reaper |
| `POST /installers`, `GET /installers/:id` | API (`/remote/installs`) | Background job: wake VM → Proxmox snapshot `pre-<slug>-<time>` → download from R2 (presigned, 15 min) inside the guest → SHA-256 check → silent install → register the RemoteApp alias in `TSAppAllowList`. Wine: same in a one-off container |

Everything except `/health` and `/auth` requires `Authorization: Bearer $CONTROL_TOKEN`.

**Freeing resources:** a reaper runs every minute. The Windows VM is hibernated to disk
(`qm suspend --todisk`) after `WINDOWS_IDLE_MINUTES` (default 15) without use; Wine containers
stop after `WINE_IDLE_MINUTES` (10). Usage comes from `prepare` and the API's `sync`; after a
restart everything counts as freshly used, so nothing is torn down under a live session.
Android (Redroid) is not implemented yet and answers 501.

Configuration: environment variables, validated in `src/config.ts`; the template is
`infra/nucbox/secrets.example.env`.

```bash
pnpm test           # unit tests with fake hypervisor and Docker
pnpm build          # bundle to dist/main.mjs (what the image runs)
docker build -f apps/nucbox-control/Dockerfile -t mininode-nucbox-control .   # from the repo root
```
