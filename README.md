# MiniNode

A private, invite-only home for apps: web apps, small services and native Windows programs,
each on its own subdomain of `mininode.app`, all behind one login (passkey or email +
password). Built for a handful of trusted people, not the public.

- **Portal** (`mininode.app`): start page with your apps, login, account, admin
  (apps, users & roles, remote apps, AI budget).
- **Web apps** (`<slug>.mininode.app`): Cloudflare Workers with a gate in front that checks the
  session and the grant. Data lives in Supabase, isolated per app by row-level security.
- **Server apps**: Docker containers on a NucBox at home, reached through a Cloudflare Tunnel,
  same login via forward-auth.
- **Native programs**: a Windows 11 VM (or Wine) streamed to the browser with Guacamole. The VM
  hibernates when nobody uses it.
- **AI** (`ai.mininode.app`): one proxy for Gemini and Claude with per-app model lists and
  monthly budgets; apps never see a provider key.
- **Adding apps**: drop a ZIP (Claude artifact, AI Studio export, any project) into `inbox/`
  and run `/integrate-app` in Claude Code; `git push` deploys it.

## Start here

| You want to… | Read |
|---|---|
| understand the design | [PLAN.md](PLAN.md), [docs/adr/](docs/adr/) |
| set up the platform from scratch | [docs/runbooks/first-setup.md](docs/runbooks/first-setup.md) |
| set up the home server | [docs/runbooks/nucbox-install.md](docs/runbooks/nucbox-install.md) |
| add an app | [docs/runbooks/add-app.md](docs/runbooks/add-app.md) |
| build an app with an AI | [docs/ai/NEW-APP-SPEC.md](docs/ai/NEW-APP-SPEC.md) |
| work on the code | [CLAUDE.md](CLAUDE.md) |

## Repository

```
apps/       portal · api · ai-proxy · nucbox-control
packages/   manifest · sdk · gate · ui · cli · config
hosted/     one folder per app (mininode.json + code)
supabase/   platform migrations and pgTAP tests
infra/      Cloudflare bootstrap, NucBox stack, backups, Windows scripts
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
