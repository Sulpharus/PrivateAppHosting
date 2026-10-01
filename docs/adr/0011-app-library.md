# ADR 0011: App library with one-click NucBox installs

- Status: accepted
- Date: 2026-09-30

## Context

Besides the apps built for MiniNode, the admin wants well-known self-hostable programs
(Jellyfin, n8n, …) on the NucBox: installed with one click, reachable from any device, and behind
the same login as everything else. These are third-party images. They carry no build provenance
from this repository, and they do not follow the app spec: they have their own users, write
where they like and often expect root.

## Decision

**Curated catalog in the repository.**
- `infra/nucbox/library.json` lists the programs, with:
  - name, description, category, website and docs links;
  - the image pinned as `<registry>/<name>:<tag>@sha256:<digest>`;
  - port, memory limit and health path;
  - named volumes, plain environment values (`{host}`, `{slug}`, `{domain}` are filled in) and
    an optional unprivileged `uid:gid`;
  - whether the root filesystem can be read-only, and a note for the admin.
- `packages/manifest/src/library.ts` validates the file with zod. The portal, the API and the
  CLI import it, so a broken entry fails the build.
- New programs and new versions come through a pull request: review is the trust decision.
  There is no free-form "install any image" button.

**Rollout.**
- The portal page Verwaltung → App-Bibliothek lists the entries. Installing asks for an address
  (`<slug>.mininode.app`, default the entry id).
- `POST /admin/library` (admin, sign-in within ten minutes):
  - checks the entry and that the address is free, or already this program;
  - starts the `library.yml` workflow on `main` through the GitHub API (`LIBRARY_DISPATCH_TOKEN`,
    a fine-grained token with Actions: write on this repository only);
  - writes an audit entry.
- The workflow runs `mininode library check`, the DNS upsert to the tunnel,
  `nucbox-deploy library <slug> <entry>`, and `mininode library install`. The last step
  registers the app in `platform.apps` as a `container`/`nucbox` app with `manifest.library`.
- The NucBox never trusts the caller for what to run. `nucbox-deploy` reads the entry from
  `library.json` on `main` itself (`CATALOG_TOKEN`, Contents: read), re-checks the same limits,
  pulls by digest and writes the compose file.
- The hardening of own apps stays: no capabilities, `no-new-privileges`, memory and pid limits,
  a user other than root, and Traefik forward-auth with the platform's headers stripped.
  - Exceptions are per entry and visible in review: a different unprivileged user, and a
    writable root filesystem.
  - Library apps get no platform settings (`app.env`), only their own `library.env`.
- A failed health check rolls back as for own container apps.
- Hosted apps and library apps cannot take over each other's slug: `nucbox-deploy` and the API
  both refuse.

**Access.**
- A library app is an app like any other: the admin grants it under Verwaltung → Apps, and it
  appears as a tile. `access.default` is off, so nobody gets it automatically.
- Traefik asks nucbox-control (`/auth`) on every request. Browsers on any device work.
  - Native clients (Jellyfin TV apps, n8n webhooks from outside) cannot pass the login. This is
    accepted: nothing on the NucBox is exposed without the MiniNode login.

**Updates and removal.**
- "Aktualisieren" reruns the install with the digest the catalog on `main` now names.
- "Entfernen" runs `nucbox-deploy remove <slug>`: it stops the container, keeps the data under
  `apps/<slug>/data`, and disables the app. Installing again brings it back with its data.
- DNS records stay. Without a router they answer 404.

## Consequences

- Programs run with their own accounts inside (n8n owner, Uptime Kuma admin) behind the MiniNode
  login. Two logins are the price of not patching third-party software.
- Catalog entries can only be checked on real hardware: the health check and rollback protect
  the box, but a new entry should be tried once before it is announced.
- Installs need the NucBox (`vars.NUCBOX_TUNNEL_ID`), `LIBRARY_DISPATCH_TOKEN` in the GitHub
  environment, and `CATALOG_TOKEN` on the NucBox. Without them the page shows links only and
  says what is missing.
