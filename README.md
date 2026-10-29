# MiniNode

A private, invite-only home for apps: web apps, small services and native Windows programs,
each on its own subdomain of your domain, all behind one login (passkey or email +
password). Built for a handful of trusted people, not the public.

It runs **on Cloudflare** (any domain you have there), **on one computer in Docker** (Windows,
macOS or Linux, Intel/AMD or ARM, no cloud account), or **both**. The starter package holds
everything and no apps: start with [docs/runbooks/getting-started.md](docs/runbooks/getting-started.md).

- **Portal** (`<your domain>`): start page with your apps, login, account, admin
  (apps, users & roles, remote apps, AI budget).
- **Web apps** (`<slug>.<your domain>`): Cloudflare Workers with a gate in front that checks the
  session and the grant. Data lives in Supabase, isolated per app by row-level security.
- **Server apps**: Docker containers on a NucBox at home, reached through a Cloudflare Tunnel,
  same login via forward-auth.
- **Native programs**: a Windows 11 VM (or Wine) streamed to the browser with Guacamole. The VM
  hibernates when nobody uses it.
- **AI** (`ai.<your domain>`): one proxy for Gemini and Claude with per-app model lists and
  monthly budgets; apps never see a provider key.
- **Adding apps**: upload the ZIP in Verwaltung → Apps → Hochladen; a script integrates what it knows
  and hands the rest to an AI review. Or drop it into `inbox/` and run `/integrate-app` in Claude
  Code; `git push` deploys it. Programs for the PC/server are uploaded the same way (`.exe`/`.msi`).

## Start here

| You want to… | Read |
|---|---|
| understand the design | [PLAN.md](PLAN.md), [docs/adr/](docs/adr/) |
| choose a variant | [docs/runbooks/getting-started.md](docs/runbooks/getting-started.md) |
| set up on Cloudflare only | [docs/runbooks/setup-cloudflare.md](docs/runbooks/setup-cloudflare.md) |
| set up on one computer (desktop) | [docs/runbooks/setup-desktop.md](docs/runbooks/setup-desktop.md) |
| set up Cloudflare plus a home server | [docs/runbooks/setup-both.md](docs/runbooks/setup-both.md), [nucbox-install.md](docs/runbooks/nucbox-install.md) |
| add an app | [docs/runbooks/uploads.md](docs/runbooks/uploads.md), [docs/runbooks/add-app.md](docs/runbooks/add-app.md) |
| download the starter, cloud or PC/server edition | [docs/runbooks/releases.md](docs/runbooks/releases.md) |
| build an app with an AI | [docs/ai/NEW-APP-SPEC.md](docs/ai/NEW-APP-SPEC.md) |
| work on the code | [CLAUDE.md](CLAUDE.md) |

## Repository

```
apps/       portal · api · ai-proxy · desktop-host · nucbox-control
packages/   manifest · sdk · gate · ui · cli · config
hosted/     one folder per app (mininode.json + code)
supabase/   platform migrations and pgTAP tests
infra/      Cloudflare bootstrap, desktop edition (installer, compose), NucBox stack, backups, Windows scripts
docs/       plan decisions, runbooks, AI specs and playbooks
e2e/        Playwright tests (passkeys via a virtual authenticator)
```

```bash
pnpm install
pnpm check              # lint, typecheck, unit tests
pnpm db:start           # local Supabase in Docker
pnpm db:test            # pgTAP (RLS, grants, budgets, sessions)
pnpm test:integration   # SDK/API against local Supabase
pnpm e2e                # browser tests against local Supabase
```
