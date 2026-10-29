# Variant 3: Cloudflare and a home server

The cloud variant ([setup-cloudflare.md](setup-cloudflare.md)) plus a home server for what Workers
cannot do: Docker containers (n8n, Jellyfin, Uptime Kuma, your own services), programs from the
App-Bibliothek, and native Windows programs streamed to the browser. The portal, API, database and
login stay in the cloud; the home server only runs what you put on it and is reached through a
Cloudflare Tunnel, so **no port is opened on your router**.

This is not the desktop edition ([setup-desktop.md](setup-desktop.md)): that one is a complete
platform on its own, with its own accounts. Here the home server is the second half of the cloud
installation and is useless without it.

## What the home server can be

| Hardware | What works |
| --- | --- |
| **Any Linux machine with Docker** (a mini PC, a Raspberry Pi 5, an old laptop, a VM; Intel/AMD or ARM, Debian/Ubuntu or similar with systemd) | container apps, the App-Bibliothek, Wine sessions (x64 only) |
| **A Proxmox VE 9 host** with a Linux VM for the above and a Windows 11 VM | additionally native Windows programs; the VM sleeps when nobody uses it |

macOS and Windows hosts are not supported for this half: the deploy command and the compose paths
assume Linux and systemd (the desktop edition is the way to run MiniNode on those).

## Steps

1. **Finish variant 1.** The platform must be running at `https://<domain>` with an admin account.
2. **Cloudflare tunnel, Access and R2** (one-time, on the home server, in the repository folder; it writes the tunnel token there):

   ```bash
   export CLOUDFLARE_API_TOKEN=…            # also needs: Cloudflare Tunnel, Access: Apps and Policies,
                                            # Access: Service Tokens, Zone Settings (all Edit), AI Gateway
   export CLOUDFLARE_ACCOUNT_ID=<your account id>
   export DOMAIN=<your platform domain>
   export OWNER_EMAIL=<you@example.org>     # may open Access-protected hosts
   infra/cloudflare/bootstrap.sh
   ```

   It creates the tunnel, the Access applications and service tokens, and the buckets; secrets that
   Cloudflare shows only once land in `./cloudflare-secrets/` (mode 700). Enable R2 in the
   dashboard first (it needs a payment method; the free 10 GB are plenty).
3. **The home server itself:** follow [nucbox-install.md](nucbox-install.md), section "Plain Docker
   host" (or the Proxmox sections for the Windows part). You end with the compose stack running
   (Traefik, cloudflared, nucbox-control, Guacamole) and the tunnel showing *Healthy*.
4. **Connect the two halves** in the GitHub environment `production`:
   - variable `NUCBOX_TUNNEL_ID` (the tunnel id from step 2): switches the container deploy jobs on;
   - secrets `NUCBOX_DEPLOY_SSH_KEY`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET` (deploy over
     SSH through Access) and `CF_ACCESS_API_CLIENT_ID`/`_SECRET`, `NUCBOX_CONTROL_TOKEN`,
     `GUACAMOLE_JSON_SECRET` (the API talks to nucbox-control): values from `bootstrap.sh` and
     the home server's `secrets.env`, which must hold the same `NUCBOX_CONTROL_TOKEN` and
     `GUACAMOLE_JSON_SECRET` as the Worker.
   - Then run *Deploy* once more.
5. **Try it:** Verwaltung → Hardware-Server shows the machine and its containers; the
   App-Bibliothek installs Jellyfin with one click (`app-library.md`). Container apps and programs
   use the same login as every other app.
6. **Back it up:** the backup timers (`nucbox-install.md`, section "Backups") and `restore.md`.

## Troubleshooting

See `nucbox-install.md`, section "Verify", and `docs/wiki/fehlerbehebung.md`. The two most common
causes: the tunnel is not *Healthy* (the token in `secrets.env`/`platform.env` is wrong), and the
Worker and the home server disagree on `NUCBOX_CONTROL_TOKEN`.
