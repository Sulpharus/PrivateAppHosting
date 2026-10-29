# ADR 0026: Instance configuration, desktop edition and starter package

- Status: accepted
- Date: 2026-10-29

## Context

MiniNode was built as one person's installation: the domain, the Cloudflare account, the Supabase
projects and the GitHub repository were written into about 130 files, the platform ran only on
Cloudflare Workers with a cloud Supabase project, and the home-server half assumed Proxmox. The goal
changed to a platform anyone can set up: on any Cloudflare domain, on one computer without any cloud
account, or both, from a download that carries nothing of the original installation (PLAN §15.2).

## Decision

**One instance file.** Everything that differs between installations lives in
`mininode.config.json` (domain, optional zone, Cloudflare account id, Supabase project reference and
publishable key per environment, GitHub repository, mail sender): public identifiers only, validated
by `packages/manifest/src/instance.ts`. `mininode init` writes it, `mininode configure` renders it
into the wrangler files and `supabase/config.toml` (`--check` in CI and before the platform deploy),
and the workflows read it through `.github/actions/load-config`. Code takes addresses from its
environment (`PORTAL_URL` and friends) and never names a domain. The wiki writes the domain as
`{{domain}}`; the portal substitutes its own host.

**Desktop edition.** `apps/desktop-host` runs the unchanged platform Workers (portal, API, AI proxy,
one gate per app) in workerd through Miniflare: bundled with esbuild, one port, hosts routed by name
(`<domain>`, `api.`, `ai.`, `supabase.`, `<slug>.`), the API's cron triggers driven by a timer, apps
hot-reloaded when a deploy touches `apps.changed`. Miniflare gives all Workers one asset store, so
one Worker holds every app's files and each app reaches its folder through a shim (isolation is
tested). Supabase runs as Docker services (Postgres, GoTrue, PostgREST, Storage) behind Kong with
the same key handling as `supabase start`; the installer generates every secret (database password,
ES256 signing key, role tokens, publishable and secret keys, vault key) per installation, so no
default key exists. `mininode deploy --env desktop` builds an app, migrates its schema and puts it
into the host; `mininode desktop init|migrate|admin|password` set up and maintain the installation.
`install.sh`/`install.ps1` and `mininode-desktop` (shell and PowerShell) need only Docker and so work
on Windows, macOS and Linux, x64 and ARM (the images are multi-architecture upstream).

**Optional Proxmox.** nucbox-control runs on any Docker host; without `PROXMOX_URL` Windows programs
fail with a clear message and the resource page reports the machine itself.

**Starter package.** `scripts/make-starter.sh` builds `mininode-starter-<version>.zip` from the
committed files: no apps, no instance file, neutral placeholders, a lockfile without the apps, and a
scan of the result for every identifier of the building installation (names, addresses, domain,
account, project references, keys). A hit stops the build.

**Login hardening.** Gate and API accept only asymmetric signing algorithms; the AI proxy answers
CORS preflights only for the platform's own origins; production sign-ins are limited to 10 per five
minutes per address and passwords need 12 characters.

## Consequences

- A new installation needs `pnpm mininode init` (or the desktop installer) and nothing is edited by
  hand. Existing installations keep working: the owner's `mininode.config.json` renders to the
  values that were already committed (`configure --check` proves it).
- Two migrations lost seed data that named one installation (an origin backfill with a hardcoded
  domain, a seeded link tile). They only ever mattered to databases that already ran them.
- The desktop edition is not a mirror of a cloud installation and has no GitHub-driven features
  (upload workflow, library, export, deploy on push), email, or Google sign-in; AI needs keys in
  `.env`. Passkeys work on `*.localhost` and behind HTTPS; over plain http on another name browsers
  refuse them (passwords still work).
- The session cookie stays readable by JavaScript, because every app on a subdomain shares it; the
  strict content policy and the review of apps are the mitigation (documented in the wiki).
- Miniflare 4 is used because the 5.x line is still an alpha with a different options shape.
- Not verified on real Windows or ARM hardware: the Windows scripts and the ARM images follow the
  same Docker commands as the Linux path that CI and development exercise.
