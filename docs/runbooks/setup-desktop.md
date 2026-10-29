# Variant 2: Desktop only

The whole platform on one computer, in Docker: the portal, the API, the AI proxy, the gate of every
app, and Supabase (database, sign-in, data API, files). Nothing runs in the cloud, no Cloudflare or
Supabase account is needed, and no secret is shared with anyone: the installer makes all of them on
your computer.

```
browser ──▶ http://mininode.localhost:8787           portal (login, start page, Verwaltung)
            http://<app>.mininode.localhost:8787      your apps, each behind its gate
            http://supabase.mininode.localhost:8787   sign-in and data API (what the apps talk to)
                    │
   Docker: host (workerd: portal, API, AI proxy, gates)  ──▶ kong ──▶ auth · rest · storage ──▶ db (Postgres)
```

## 0. What you need

- A computer that can run Docker: **Windows 10/11**, **macOS** or **Linux**, with an **Intel/AMD
  (x64) or ARM (Apple Silicon, Raspberry Pi 5, …)** processor. About 4 GB of free memory and
  10 GB of disk; more with many apps and files.
- **Docker**: [Docker Desktop](https://www.docker.com/products/docker-desktop/) on Windows and
  macOS, Docker Engine with the Compose plugin on Linux
  ([install guide](https://docs.docker.com/engine/install/)). Start it before the installer.
- Nothing else. Node, the database and every tool run in containers.
- The first build downloads the base images and packages (a few hundred MB) and takes several
  minutes.

## 1. Install

Unpack the starter ZIP (`mininode-starter-<version>.zip`) and open a terminal in the folder.

**Linux and macOS**

```bash
./infra/desktop/install.sh --admin-email you@example.org
```

**Windows** (PowerShell)

```powershell
powershell -ExecutionPolicy Bypass -File .\infra\desktop\install.ps1 -AdminEmail you@example.org
```

The installer asks for a password for that first account (12 or more characters; it becomes the
admin), then builds, starts and prepares everything. At the end it prints the address:
**http://mininode.localhost:8787/login**. Open it in Chrome, Edge, Firefox or Safari on the same
computer; `*.localhost` needs no setup.

Options (both installers; PowerShell spells them `-Dir`, `-Domain`, …): the installation folder
(`--dir`, default `~/mininode`), the domain (`--domain`, default `mininode.localhost`), the port in
the address bar (`--port`, default 8787), `--scheme https` and `--host-port` behind a tunnel,
`--lan` (see section 4), `--no-admin`, and `--ca-file` for a company proxy that re-signs HTTPS.

What the installer does: copies the source into the installation folder (so the ZIP folder can be
deleted afterwards), builds one image, creates this installation's secrets (`.env`, readable only
by you), starts the containers, applies the database migrations, and creates the first account.
**Running it again is safe**: it rebuilds and restarts and keeps your data and secrets.

## 2. First steps

1. Sign in at `http://mininode.localhost:8787/login`, open *Dein Konto* and add a **passkey**
   (`*.localhost` counts as a secure context, so passkeys work). Add a second one on another
   device or keep a spare way in.
2. Open **Verwaltung**: *Apps*, *Nutzer & Rollen*, *Wissen* (the wiki and the Startup-Guide).
3. **Add an app.** Build one in the KI-Werkstatt, or take one from a repository, and run:

   ```bash
   ~/mininode/mininode-desktop add path/to/app-folder-or-zip
   ```

   The app must contain a `mininode.json` (`docs/runbooks/add-app.md`). The command checks it,
   builds it when it has a build step, creates its tables, and puts it online at
   `http://<slug>.mininode.localhost:8787`. Then give people access under Verwaltung → Apps (new
   apps are invisible to everyone until you do).
4. **Invite people** under Verwaltung → Nutzer & Rollen. Email is off, so you get a link to send
   by messenger. For people on other devices, read section 4 first.

## 3. Daily use

```bash
~/mininode/mininode-desktop status          # what runs
~/mininode/mininode-desktop stop            # stop everything (data stays)
~/mininode/mininode-desktop start           # start again
~/mininode/mininode-desktop logs host       # follow a service: host, auth, rest, storage, kong, db
~/mininode/mininode-desktop admin <email>   # create another account
~/mininode/mininode-desktop password <email> # a new password for an account (no email needed)
~/mininode/mininode-desktop backup          # database, files and settings into ~/mininode/backups/<date>
```

(On Windows: `mininode-desktop.cmd …` in the installation folder.) The containers restart by
themselves when Docker starts, so MiniNode is back after a reboot as soon as Docker Desktop is
running (set it to start at login).

**What the apps can use:** everything that does not need the cloud: data (tables, files),
accounts, the language switch, offline use, the kit. **Needs a key you add yourself:** AI
features (`GEMINI_API_KEY`, `ANTHROPIC_API_KEY`: add the line to `.env`, then `mininode-desktop
restart`), Google (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_TOKEN_KEY` in `.env`, and
the Google sign-in provider is not wired in the desktop edition). **Not in the desktop edition:**
the GitHub-based features (upload workflow, library installs, app export, backups from Verwaltung,
deploys on push), email, Windows programs.

## 4. Other devices and the internet

By default MiniNode listens on this computer only (`127.0.0.1`).

- **Other devices on your network.** Install with `--lan` and a domain that every device resolves
  *including its subdomains* (`<app>.<domain>`, `supabase.<domain>`, `api.<domain>`): a wildcard
  DNS entry on your router, or a name from a wildcard service such as `mininode.192-168-1-20.sslip.io`
  (`--domain mininode.192-168-1-20.sslip.io` for the computer at 192.168.1.20). Over plain `http` on
  a name that is not `localhost`, browsers do not allow passkeys: sign in with email and password.
- **From anywhere, with HTTPS.** Put an HTTPS reverse proxy or a tunnel in front. A Cloudflare
  Tunnel on a domain you own is the easy way: install with
  `--domain apps.example.org --scheme https --port 443 --host-port 8787`, then create the tunnel
  with two public hostnames, `apps.example.org` and `*.apps.example.org`, both pointing to
  `http://localhost:8787`. Passkeys then work everywhere, and the browser only ever talks HTTPS.
  Never open the plain-http port to the internet.

## 5. Back up, update, move, remove

- **Back up** with `mininode-desktop backup`. The folder has `database.dump`, the stored files
  (`storage-data.tar.gz`), the host's app files (`host-data.tar.gz`) and `env.backup` (your
  secrets). Without `env.backup` nobody can use the dump again: store it somewhere private,
  outside the computer.
- **Restore** with `mininode-desktop restore <backup folder>`. It asks you to type RESTORE,
  stops the services, replaces the database, the files and the apps with the backup, offers to use
  the backup's secrets (`env.backup`; the data only works with its own secrets), starts everything
  and repairs the id counters. To move to another computer: install there first, then restore.
- **Update**: unpack the newer MiniNode ZIP and run `~/mininode/mininode-desktop update <folder>`.
  It backs up first, rebuilds, restarts and applies new migrations. Your apps stay.
- **Remove**: `mininode-desktop uninstall` (asks before deleting data), then delete the folder.

## 6. Security of the desktop edition

- Secrets are made on your computer when you install (database password, signing keys, API keys
  of the gateway, encryption key). There are no default or shared keys; the installation folder is
  private to your user (`.env` mode 600). Do not share `.env` or a backup that contains it.
- Sign-ups are off; every account is made by an admin. Passwords need 12 characters; sign-in is
  rate limited; passkeys and authenticator codes work as in the cloud variant.
- Only the host's port is published, on `127.0.0.1` unless you used `--lan`. The database and the
  Supabase services are reachable only inside Docker's network.
- An app can only read what its tables, its rules and its grants allow (row-level security), exactly
  as in the cloud variant.
- Keep Docker and your operating system updated, and update MiniNode (section 5).

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| Installer: "Docker is installed but not running" | start Docker Desktop / the Docker service and run it again |
| Installer: "port 8787 is already in use" | `--port 8788` (or stop what uses it) |
| `mininode.localhost` does not open | some systems do not resolve `*.localhost`: add `127.0.0.1 mininode.localhost api.mininode.localhost ai.mininode.localhost supabase.mininode.localhost` and one line per app to the hosts file, or use Chrome/Edge/Firefox |
| Build fails with a certificate error | a company proxy re-signs HTTPS: pass its certificate with `--ca-file` |
| "Das Passwort ist zu schwach" | at least 12 characters |
| Pages load but data is empty / error 503 for a moment after a start | the database is still starting; wait a minute. `mininode-desktop logs rest` shows when it is ready |
| An app is added but "Kein Zugriff" | give your account access under Verwaltung → Apps |
| Forgot a password | `mininode-desktop password <email>` sets a new one (no email needed) |
