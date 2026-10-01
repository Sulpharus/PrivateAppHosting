# MiniNode · Cloud edition

The platform that runs on Cloudflare Workers and Supabase: portal, API, AI proxy, the gate,
hosted apps, the CLI and the database migrations. Everything for the home server (NucBox, the
PC/server edition) is left out; a Cloud-only setup works without it.

- Runs on: **Cloudflare** (Workers, DNS, R2) and **Supabase**. No operating system matters;
  you only need a computer with Node.js 22 and pnpm to deploy it.
- Setup: `docs/runbooks/first-setup.md`
- Add the PC/server edition later when you want container apps, the App-Bibliothek or Windows
  programs: `mininode-pc-server-<version>.zip` of the same release.

See `PLAN.md` for the architecture and `docs/STATUS.md` for where things stand.

The API keeps its NucBox routes (`apps/api/src/routes/nucbox.ts`) and the install runbook is
included; without the PC/server edition they simply have nothing to talk to.
