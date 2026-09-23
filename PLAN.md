# MiniNode.app — Project Plan

Status: **agreed plan, pre-implementation** (2026-09-23)
Design reference: Host Manager canvas (claude.ai artifact, private to the owner)

MiniNode.app is a private, invite-only hosting platform. It serves web apps, services and
remote-controlled native programs under `*.mininode.app`, with one shared login, one role
model and one data layer (Supabase). It is a clean-room project: nothing is reused from
earlier personal hosting projects.

---

## 1. Goals

1. Drop an app (ZIP) into the repo, let an AI agent integrate it, push — it is live at
   `<slug>.mininode.app` with login and per-user data.
2. Every app, whatever its stack, uses the same accounts, roles and database.
3. Native Windows and Android programs can be used from any device through the browser,
   including with the owner's account shared without revealing credentials.
4. Clear, machine-readable rules so that AI tools produce apps that integrate with zero or
   minimal changes, and an autonomous agent can integrate everything else.
5. A clean, typed, tested codebase from the first commit.

Non-goals: public sign-up, multi-tenant SaaS, hosting other people's commercial workloads.

---

## 2. Decisions

| Topic | Decision |
|---|---|
| Domain | `mininode.app`, registered at Cloudflare Registrar; DNS on Cloudflare |
| Default host | **Cloudflare Workers** (static assets + server code; Next.js via OpenNext) |
| Exception host | **Vercel** only for Next.js apps that do not run on Workers |
| Home server | GMKtec NucBox G9 (16 GB), reinstalled with **Proxmox VE** |
| NucBox VMs | Linux VM (Docker: container apps, Guacamole, Wine, Redroid, local Supabase, backups) + Windows 11 VM (remote apps) |
| Exposure | **Cloudflare Tunnel** only — no open ports, no static IP needed |
| Database | **Supabase Cloud** (free tier) primary; self-hosted Supabase on the NucBox as standby/offline mode |
| Keep-alive | Daily ping against Supabase so the free project never pauses |
| Backups | Nightly dump to NucBox NVMe, retention 7 daily / 4 weekly / 6 monthly, plus encrypted copy in Cloudflare R2 |
| Auth | Supabase Auth, invite-only. **Passkeys** (device biometrics: Face ID, fingerprint, Windows Hello) as primary; email + password as fallback |
| Roles | `admin` (owner), `trusted` (may use apps in shared-account mode), `user` |
| URLs | One subdomain per app; session cookie scoped to `.mininode.app` |
| Deploy trigger | `git push` to `main` → GitHub Actions |
| Integration | Local Claude Code on the owner's PC or a cloud session runs the `integrate-app` skill **before** code reaches GitHub |
| AI keys | Central **AI proxy** (`ai.mininode.app`); keys never ship to clients; per-user budgets |
| Remote apps | Guacamole in the browser; Windows VM (1 session + queue), Wine containers (parallel), Android via Redroid |
| Idle policy | Windows VM shuts down after idle timeout; Wine/Android containers stop; RAM is freed |
| Stack | TypeScript monorepo: pnpm + Turborepo, React + Vite (portal/admin), Hono (API workers), Node/TS agent on the NucBox |

---

## 3. Architecture

```
                 ┌──────────────────── Cloudflare ─────────────────────┐
 Browser ──TLS──▶│ DNS *.mininode.app                                  │
 (PC / phone)    │  ├─ mininode.app ........ Portal + Host Manager (Worker)
                 │  ├─ api.mininode.app .... Platform API (Hono Worker)
                 │  ├─ ai.mininode.app ..... AI proxy (Hono Worker)
                 │  ├─ <slug>.mininode.app . App Worker  ── or ──▶ Vercel (exception)
                 │  ├─ remote.mininode.app . ─┐
                 │  └─ <slug>.mininode.app . ─┴─ Cloudflare Tunnel ─┐
                 │  R2: installers, encrypted backups                │
                 └──────────────────────────────────────────────────┼──┘
                                                                     ▼
 Supabase Cloud ◀──────── all apps (supabase-js, RLS) ──── NucBox G9 · Proxmox
  auth · postgres · realtime · storage                     ├─ Linux VM (Docker)
        ▲                                                  │   cloudflared, Traefik, forward-auth,
        └── nightly dump ─────────────────────────────────│   container apps, Guacamole, Wine pool,
                                                           │   Redroid, agent, backup job,
                                                           │   standby Supabase
                                                           └─ Windows 11 VM (RemoteApp, on demand)
```

### 3.1 Hosting targets

| `target` | Runs on | Used for | Deployed by |
|---|---|---|---|
| `cloudflare` | Workers (static assets + optional server code) | Static sites, SPAs, AI Studio / Claude exports, most Next.js | `wrangler deploy` in CI |
| `vercel` | Vercel | Next.js apps that fail on Workers | Vercel CLI in CI |
| `nucbox` | Docker on the Linux VM | Anything with a long-running process: Python, Node servers, WebSockets, databases | CI builds image → GHCR → agent pulls |
| `remote` | Windows VM / Wine / Redroid | Native programs | Installer in R2 → agent installs |

Routing is explicit: CI creates one DNS record per app (Worker custom domain, Vercel CNAME
or tunnel ingress). No wildcard catch-all, so unknown subdomains 404 at the edge.

### 3.2 NucBox layout (16 GB RAM budget)

| Component | RAM (typ.) | Notes |
|---|---|---|
| Proxmox host | 1 GB | |
| Linux VM | 6–7 GB | Docker services below; ballooning enabled |
| ├ cloudflared, Traefik, forward-auth, agent | < 0.5 GB | always on |
| ├ Container apps | 0.5–2 GB | per app limits in manifest |
| ├ Guacamole | 0.5 GB | always on |
| ├ Wine pool / Redroid | 0–3 GB | started on connect, stopped when idle |
| └ Standby Supabase | 0 / 2 GB | off by default; started for failover or local dev |
| Windows 11 VM | 0 / 6 GB | started on connect, shut down when idle |

---

## 4. Identity and access

- **Supabase Auth** is the single identity provider for every app, service and remote session.
- **Invite-only:** sign-ups are disabled. The admin creates an invite (email, role, app grants,
  expiry); the invite link lets the person set up a passkey, or a password as fallback.
- **Passkeys:** Supabase Auth passkeys (WebAuthn, discoverable credentials; currently marked
  experimental by Supabase). Relying Party ID `mininode.app`, so one passkey works on every
  subdomain. The prompt uses the device's biometrics. Email + password stays available as fallback.
- **Session sharing:** the auth cookie is set on `.mininode.app`, so signing in once covers all
  apps. Server-side checks verify the JWT locally against Supabase's JWKS (asymmetric signing keys).
- **Gatekeeping:**
  - Cloudflare-hosted apps: the Worker checks the session before serving any asset.
  - NucBox apps: Traefik forward-auth verifies the JWT.
  - Remote apps: Guacamole trusts the platform login (SSO), never its own user list.
- **Roles** (`platform.profiles.role`):
  - `admin`: everything, including deploys, users, hosts and the AI budget.
  - `trusted`: granted apps, plus apps and remote programs in *shared-account* mode.
  - `user`: granted apps with private data.
- **App grants:** `platform.app_grants(user_id, app_slug)`. Apps can be marked "default for
  everyone" so new users receive them automatically.
- **Shared-account mode (per app toggle):**
  - Web apps: `trusted` users with a grant read and write the owner's data rows (they act as
    the owner). RLS enforces this through `platform.effective_owner(app_slug)`.
  - Remote apps: the program runs logged in with the owner's account; `trusted` users control
    it without ever seeing credentials.
  - Every action is recorded with the real user ID in an audit log.

---

## 5. Data

- **One Supabase project** holds the whole platform. Schemas:
  - `platform`: profiles, roles, apps, grants, invites, remote sessions and queue, AI usage, audit.
  - `app_<slug>`: one schema per app. Apps only reach their own schema.
- **RLS everywhere.** Default policy templates:
  - `private`: the row owner is `auth.uid()`.
  - `shared-account`: the owner is `effective_owner()`.
  - `group`: all users with a grant read and write.
  - `readonly`: public read inside the platform.
- **Migrations** live in `supabase/migrations`. Each app's SQL lives in `apps/<slug>/db/` and
  is applied through the same pipeline. Nobody changes the production schema by hand.
- **Standby mode:** the same migrations run against self-hosted Supabase on the NucBox. The SDK
  only knows a base URL and a public key, so switching is a configuration change.
- **Backups:** nightly `pg_dump` plus storage sync on the NucBox, then restic to the NVMe (7/4/6)
  and an encrypted restic copy to R2. The Host Manager shows a restore test once a month.

---

## 6. App model

Every hosted app is a folder `apps/<slug>/` containing the app source and a manifest `mininode.json`:

```jsonc
{
  "$schema": "../../packages/manifest/schema.json",
  "slug": "rezepte",                  // → rezepte.mininode.app
  "name": "Rezepte",
  "description": "Rezepte und Wochenplan",
  "kind": "spa",                      // static | spa | nextjs | container | remote
  "target": "cloudflare",             // cloudflare | vercel | nucbox | remote
  "access": { "default": true, "roles": ["user", "trusted", "admin"] },
  "data": { "mode": "private" },      // none | private | shared-account | group
  "ai": { "enabled": true, "models": ["gemini-flash"] },
  "build": { "command": "pnpm build", "output": "dist" },
  "runtime": { "port": 8080, "memory": "256m" },   // container only
  "remote": { "runtime": "windows", "installer": "r2://installers/foo.msi" } // remote only
}
```

The manifest is validated by a JSON Schema in CI. The portal, DNS, deploy and Host Manager are
all derived from these manifests, so there is no second registry to keep in sync.

---

## 7. Pipeline: from ZIP to live

1. **Drop:** put the ZIP in `inbox/`. Contents are git-ignored, so nothing unintegrated is
   ever committed.
2. **Integrate:** run `/integrate-app inbox/foo.zip` in Claude Code, locally or in the cloud. The agent:
   1. Unpacks the ZIP and classifies the source (Claude artifact, AI Studio export,
      Vite/React, Next.js, static HTML, Node server, Python server, other).
   2. Follows the matching playbook in `docs/ai/playbooks/`.
   3. Adds the SDK, login gate, data layer (schema + RLS), AI proxy calls and manifest.
   4. Builds, runs unit and e2e smoke tests locally, then commits on a branch.
3. **Review:** the pull request shows the diff. CI validates the manifest, then runs lint,
   type checks, tests, a build and a security scan (secrets, client-side keys).
4. **Merge → deploy:** CI deploys by target, creates or updates DNS, applies migrations and
   registers the app in `platform.apps`.
5. **NucBox:** the agent watches GHCR, pulls new images and restarts with health checks.
   After a failed health check it rolls back automatically.
6. **Installers (remote apps):** the upload goes to R2, not git. The agent installs it silently
   on the Windows VM (winget ID when available) or tests it in a Wine container, and reports back.

---

## 8. Platform SDK (`@mininode/sdk`)

A newly designed, framework-agnostic ES module. It also ships as a single `<script>` build for
plain HTML apps. It wraps supabase-js and the platform API:

| Namespace | Purpose |
|---|---|
| `auth` | Current user and role; `requireLogin()`; sign out; passkey management link |
| `data` | Typed Supabase client pre-scoped to `app_<slug>`, plus simple key-value helpers |
| `realtime` | Channels and presence for shared features |
| `files` | Supabase Storage scoped to the app |
| `ai` | Calls the AI proxy (chat, structured output, images) with no keys on the client |
| `notify` | Notifications in the portal's bell |
| `app` | Manifest info and shared-account status |

Configuration comes from the host, not the app, so the same build runs in cloud and standby mode.

---

## 9. AI instructions (the core of the streamlined workflow)

All AI instructions live in `docs/ai/`:

| File | Audience | Content |
|---|---|---|
| `NEW-APP-SPEC.md` | Any AI that builds an app (Claude, AI Studio, others) | Paste-ready spec: allowed stacks, SDK usage, no secrets in the client, where data lives, UI conventions, ZIP layout, manifest |
| `NEW-APP-SPEC.short.md` | Tools with small prompt limits | Condensed version |
| `playbooks/<source>.md` | The integration agent | Step-by-step conversion per source type (claude-artifact, ai-studio, vite-react, nextjs, static-html, node-server, python-server, docker-generic, native-installer) |
| `CHECKLIST.md` | Agent and human reviewer | Definition of done for an integrated app |
| `.claude/skills/integrate-app/` | Claude Code | The skill that orchestrates the playbooks and tests |

Playbooks are tested: sample apps for each source type live in `fixtures/` and CI checks that
they integrate cleanly.

---

## 10. Remote apps

- **Gateway:** Apache Guacamole at `remote.mininode.app`, with SSO via the platform login.
  Sessions open in the browser on PC and phone; touch and keyboard work on mobile.
- **Windows 11 VM:** RemoteApp mode shows a single program instead of a full desktop. Windows 11
  allows one concurrent session, so the platform provides a queue and a "busy since … by …"
  indicator and warns the user before disconnecting.
- **Wine containers:** one container per user session, so several people can work at once. Only
  suitable for programs that run under Wine; the agent tests this at install time.
- **Android:** Redroid on the Linux VM, controlled from the browser. x86 compatibility is
  checked per app.
- **Idle policy (configurable in the Host Manager):** VM shutdown after 15 minutes idle,
  containers after 10 minutes, a warning 2 minutes before. The first start takes about 30–40 s,
  and the UI says so.
- **Shared account:** the program stays logged in as the owner; access is limited to `trusted` users.

---

## 11. AI proxy

- A Hono Worker at `ai.mininode.app`. It requires a valid session, adds the provider key
  server-side and streams responses back.
- Providers: Google Gemini and Anthropic Claude. More can be added through adapters.
- Limits: a global monthly budget (hard stop except for the admin), per-role defaults (user 2 €,
  trusted 5 €) and per-user overrides. Usage is logged per user and app in `platform.ai_usage`.
- During integration, AI Studio and Claude artifact apps are rewired to `sdk.ai`.

---

## 12. UI

- **Start page (`mininode.app`):** all apps the user may open, with pinned and shared filters,
  remote apps with live session status, notifications and profile. Light and dark mode, desktop
  and mobile.
- **Host Manager (`mininode.app/admin`, admin only):**
  - Overview
  - App Library (including the inbox)
  - Remote apps
  - Deployments
  - Domains & SSL
  - Logs & incidents
  - Analytics
  - Users & roles
  - AI proxy
  - Hosts
  - Settings
- **Design tokens** live in `packages/ui`, shared by the portal and the SDK's small UI elements
  (login gate, account menu).
- **Fonts:** Bricolage Grotesque (display), Instrument Sans (text) and JetBrains Mono (code).
  All are self-hosted as WOFF2, so they look identical on every device, with the system font
  as fallback.
- **Accessibility:** WCAG AA contrast, touch targets of at least 44 px, full keyboard access.

---

## 13. Repository layout

```
.
├─ apps/                  # hosted apps, one folder per app (+ mininode.json)
├─ inbox/                 # ZIP drop zone (contents git-ignored)
├─ platform/
│  ├─ portal/             # start page + Host Manager (React + Vite, Worker)
│  ├─ api/                # platform API (Hono Worker)
│  ├─ ai-proxy/           # AI proxy (Hono Worker)
│  ├─ gate/               # auth gate used by app Workers + forward-auth on the NucBox
│  └─ agent/              # NucBox agent (Node/TS)
├─ packages/
│  ├─ sdk/                # @mininode/sdk
│  ├─ ui/                 # design tokens + shared components
│  ├─ manifest/           # mininode.json schema, types, validator
│  └─ config/             # shared tsconfig, Biome config
├─ supabase/              # config.toml, migrations, seed, RLS tests
├─ infra/
│  ├─ cloudflare/         # wrangler configs, tunnel config, DNS automation
│  └─ nucbox/             # Proxmox notes, docker-compose stacks, Windows VM setup, backup job
├─ fixtures/              # sample apps per source type for playbook tests
├─ docs/
│  ├─ ai/                 # AI specs, playbooks, checklist
│  ├─ adr/                # architecture decision records
│  └─ runbooks/           # restore, failover, add a host, rotate keys
├─ .claude/               # project skills, settings, hooks
└─ .github/workflows/     # CI + deploy
```

---

## 14. Engineering standards

- TypeScript `strict` everywhere, with ESM only.
- **Biome** handles lint and format (one tool, fast); config lives in `packages/config`.
- **Tests:**
  - Vitest for units.
  - Playwright for e2e: login, portal, one app per target.
  - pgTAP for RLS policies.
- **CI** is required on every PR: install → lint → typecheck → test → build → manifest
  validation → secret scan.
- **Commits** follow Conventional Commits; Renovate keeps dependencies current.
- **Secrets** stay in GitHub Actions secrets, Cloudflare secrets and a `.env` on the NucBox.
  They never enter the repo, and `.env.example` documents every variable.
- **Architecture decisions** are recorded as ADRs in `docs/adr/`.
- **Every folder with code** has a short README (purpose, how to run and test).

---

## 15. Phases

| Phase | Scope | Done when |
|---|---|---|
| 0 · Foundation | Tooling research + install (skills, MCPs), monorepo skeleton, CI, Biome, `CLAUDE.md` | Empty repo builds, lints and tests green in CI |
| 1 · Identity & portal | Supabase project, `platform` schema + RLS, invites, passkeys + password, portal start page, admin: users & roles | Owner can invite a person who signs in with a fingerprint |
| 2 · Cloud apps | Manifest, SDK v1, gate, Cloudflare deploy pipeline, DNS automation, App Library | A ZIP from AI Studio is live on its subdomain with per-user data |
| 3 · AI layer | `NEW-APP-SPEC`, playbooks, `integrate-app` skill, fixtures, AI proxy | Each fixture type integrates cleanly through the skill |
| 4 · NucBox | Proxmox, Linux VM, tunnel, Traefik, forward-auth, agent, container target, backups (NVMe + R2), keep-alive | A Python server app runs on the NucBox behind the login; restore test passes |
| 5 · Remote apps | Guacamole + SSO, Windows VM with RemoteApp, idle shutdown, queue, Wine pool, Redroid | A Windows program is usable from the phone; the VM sleeps when idle |
| 6 · Polish | Host Manager analytics, incidents, Vercel exception path, standby-failover runbook | Runbooks tested |

---

## 16. To verify during research (marked [?] in discussion)

- The current status and limits of Supabase passkeys (experimental flag) and cookie sessions
  across subdomains.
- The maturity of the OpenNext adapter for Next.js on Workers, and current Workers free-tier limits.
- The best way to connect Guacamole to Supabase Auth: Supabase as an OAuth/OIDC provider,
  or header auth behind forward-auth.
- Windows 11 RemoteApp setup on the Pro edition; licensing of a Windows 11 VM.
- Redroid on the N150 kernel (binder modules) and ARM app translation.
- Current Cloudflare Registrar pricing for `.app`.
