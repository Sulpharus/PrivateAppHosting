# MiniNode.app — Project Plan (v2)

Status: **agreed, in implementation** · v1 2026-09-23 · v2 2026-09-23 (after an external architecture review)
Design reference: Host Manager canvas (claude.ai artifact, private to the owner)

MiniNode.app is a private, invite-only hosting platform. It runs web apps, services and
remote-controlled native programs under `*.mininode.app` with one login, one role model and
one data layer (Supabase). It is a clean-room project and reuses nothing from earlier
hosting projects.

---

## 1. Goals

1. Drop an app (a ZIP) into the repo, let an AI agent integrate it, then push. The app goes live
   at `<slug>.mininode.app` with login and per-user data.
2. Every app, whatever its stack, shares the same accounts, roles and database.
3. Native Windows programs can be used from any device through the browser, including with
   the owner's account shared without revealing credentials.
4. Machine-readable rules let AI tools produce apps that integrate with little or no rework,
   and a deterministic checker (`mininode doctor`) verifies the result.
5. The codebase is clean, typed and tested from the first commit.

Non-goals: public sign-up, multi-tenant SaaS, a hot standby database.

---

## 2. Decisions

| Topic | Decision |
|---|---|
| Domain | `mininode.app` (Cloudflare Registrar, Cloudflare DNS) |
| Default host | **Cloudflare Workers Paid** ($5/month): static assets plus Worker code, with the Worker running first only for navigations and `/api/*` |
| Next.js | In order of preference: static export, then vinext (beta), then OpenNext, then **Vercel** as the exception |
| Home server | NucBox G9 (N150, 16 GB) running **Proxmox VE**: a Linux VM (Docker) and a Windows 11 Pro VM |
| Exposure | **Cloudflare Tunnel** only. Admin surfaces (Proxmox, SSH, Guacamole admin) sit behind **Cloudflare Access** |
| Database | **Supabase Cloud** Free (production). A second free project serves as **staging**. No hot standby; a scripted monthly **restore drill** instead |
| Keep-alive | A daily real query (not a cached request), monitored by a dead-man's switch |
| Backups | Nightly `pg_dump` + storage sync on the NucBox, then restic to NVMe (7/4/6) and an encrypted restic copy in R2. Restore drill scripted and alerting |
| Auth | Supabase Auth, invite-only. **Passkeys** (Face ID, fingerprint, Windows Hello) primary, email + password fallback. All auth UI lives at **`mininode.app/login`** (ADR 0001) |
| Email | **Off for now** (Cloudflare Email Sending needs Workers Paid). Invites and password resets are one-time links the admin shares directly. The Email Sending binding and Send Email hook stay implemented and switch on with one config change |
| Roles | `admin` (owner), `trusted` (shared-account apps), `user` |
| Isolation | **RLS is the security boundary.** Every app table policy calls `platform.app_access(slug)` (user grant **and** the calling app, identified by its origin; ADR 0002); a schema per app is for tidiness only |
| Deploy | `git push` to `main` runs GitHub Actions. Cloud targets deploy with `wrangler`. The NucBox deploys by pulling a digest-pinned image through a forced-command SSH over Access |
| Integration | The `integrate-app` skill (Claude Code, local PC or cloud) runs against **local Supabase only**, then `mininode doctor` |
| AI | `ai.mininode.app` Worker (auth, per-app model allow-list, reserve/settle budget) forwarding through **Cloudflare AI Gateway** |
| Remote apps | Guacamole with **encrypted JSON auth** issued by the platform API. Windows 11 RemoteApp in a locked-down session. Wine via RDP/VNC images. Android optional (disabled by default) |
| Monitoring | Healthchecks.io dead-man's switches + an external uptime check + phone alerts (ntfy), all independent of the NucBox |
| Secrets | GitHub/Cloudflare secrets for CI and Workers; NucBox `.env` encrypted in the repo with **SOPS + age** |
| Stack | TypeScript monorepo: pnpm, Turborepo, Biome, React + Vite, Hono, Vitest, Playwright, pgTAP |

Monthly cost: Workers Paid ≈ 4.60 €, domain ≈ 1 € (≈ 12 €/year), everything else on free tiers.
Total **≈ 6 €** (budget 15 €). A Windows 11 Pro licence is a one-off cost.

---

## 3. Architecture

```
 Browser ──TLS──▶ Cloudflare
 (PC / phone)      ├─ mininode.app ............ apps/portal   (Worker + assets: start page, /login, /admin)
                   ├─ api.mininode.app ........ apps/api      (Hono: invites, email hook, remote tokens, deploy registry)
                   ├─ ai.mininode.app ......... apps/ai-proxy (Hono → AI Gateway → Gemini / Claude)
                   ├─ <slug>.mininode.app ..... hosted app Worker (gate from packages/gate) | Vercel (exception)
                   ├─ remote.mininode.app ─┐
                   ├─ <slug>.mininode.app ─┴── Tunnel ──▶ NucBox · Linux VM
                   │                                        cloudflared · Traefik · forward-auth
                   │                                        container apps · Guacamole · nucbox-control
                   │                                        backup job · Wine images · (Redroid, optional)
                   │                                      NucBox · Windows 11 VM (RemoteApp, on demand)
                   ├─ Access: proxmox / ssh / guac-admin (owner + CI service token)
                   └─ R2: installers, encrypted backups · AI Gateway
 Supabase Cloud (prod) + Supabase Cloud (staging) ◀── supabase-js + RLS from every app
```

### 3.1 Hosting targets

| `target` | Runs on | Used for | Deployed by |
|---|---|---|---|
| `cloudflare` | Worker with static assets | Static, SPA, Claude/AI Studio exports, Next.js via static export or vinext | `wrangler deploy` in CI |
| `vercel` | Vercel | Next.js apps that fail on Workers | Vercel CLI in CI |
| `nucbox` | Docker on the Linux VM | Long-running servers (Python, Node, WebSockets) | CI builds image → GHCR (+ attestation) → `nucbox-deploy <slug> <digest>` |
| `remote` | Windows VM / Wine | Native programs | Installer (hash-pinned) in R2 → `nucbox-control` installs after snapshot |

DNS is explicit: CI creates one record per app. There is no wildcard catch-all.

### 3.2 NucBox (16 GB)

| Component | RAM | Policy |
|---|---|---|
| Proxmox host | 1 GB | always |
| Linux VM | 6 GB (balloon) | always. Runs cloudflared, Traefik, forward-auth, Guacamole, nucbox-control, container apps |
| Windows 11 VM | 0 / 6 GB | **hibernate** after idle; resume on connect |
| Wine sessions | 0–2 GB | started on connect, stopped when idle |
| Redroid (optional) | 0–3 GB | disabled by default; **mutually exclusive** with the Windows VM (enforced by the scheduler) |

---

## 4. Identity and access

- **Central login:** `mininode.app/login` handles invite acceptance, passkey enrolment, passkey
  sign-in, password fallback and password reset. Apps call `sdk.auth.requireLogin()`, which
  redirects there with `?next=`. The RP ID is `mininode.app` and permanent.
- **Session:** `@supabase/ssr` cookies on `.mininode.app` (the staging project uses a different
  cookie name). The gate verifies JWTs with `jose` against Supabase's cached remote JWKS.
  An expired token redirects to `mininode.app/auth/refresh?next=`.
- **Step-up:** admin actions and generating remote-session tokens require a passkey (or password)
  sign-in within the last 10 minutes. This is checked via the JWT `amr` claim.
- **Invites:**
  - The admin creates an invite (email, role, grants, expiry). The API Worker calls
    `auth.admin.generateLink` and emails a link to a portal page.
  - That page has a **Continue** button that calls `verifyOtp(token_hash)`, so mail scanners
    cannot consume the token.
  - Sign-ups are otherwise disabled.
- **Roles and grants:**
  - `platform.profiles.role` holds `admin`, `trusted` or `user`.
  - `platform.app_grants(user_id, app_slug)` records access; apps flagged `default` are granted
    automatically.
- **Shared-account mode** (per-app flag):
  - Web apps: `trusted` users with a grant act on the owner's rows via
    `platform.effective_owner(slug)`.
  - Remote apps: the program runs as the owner inside a dedicated, locked-down Windows account.
  - Every write goes to an audit log with the real user ID.
- **Defense in depth:**
  - A strict CSP set by the gate.
  - No `anon` grants on any app schema.
  - Access in front of all infrastructure admin UIs.

---

## 5. Data

- **Schemas:**
  - `platform`: profiles, grants, invites, apps, deployments, remote sessions and queue,
    AI budgets/usage, audit, notifications.
  - `app_<slug>`: one per app. CI adds each to the exposed schemas via the Management API.
- **RLS templates** (every one includes `platform.app_access(slug)`):
  - `private`: the owner is `auth.uid()`.
  - `shared-account`: the owner is `effective_owner()`.
  - `group`: all users with a grant.
  - `readonly`: read-only for users with a grant.
- **pgTAP tests:**
  - A meta-test fails if any `app_*` table lacks RLS or a policy lacks the grant check.
  - Negative tests: a user reading another app's schema; a `user` calling admin RPCs; the AI
    budget running out.
- **Shared suite data (ADR 0002):** `platform.records` holds records of shared types (events,
  tasks, sport sessions, contracts, bookings …, registry in `platform.record_types`) in
  collections that can be shared with people as viewer or editor. Apps ask for types in
  `mininode.json` (`suite.uses`); the admin grants them under Verwaltung → Gemeinsame Daten.
  Writes go only through `suite_upsert` / `suite_delete` (identity merge, per-field priority,
  JSON-schema check); deletes go to a 30-day bin. The Kalender reads everything dated from here.
- **Google Calendar sync (ADR 0010):** `platform.gcal_*`, service role only; the API Worker
  mirrors chosen Kalender sources into a Google calendar "MiniNode" and pulls the user's Google
  calendars in, both ways.
- **Migrations:** platform migrations live in `supabase/migrations`; each app's SQL lives in
  `hosted/<slug>/db/`. Both are applied by CI, first to staging, then to production.
- **Backups and restore drill** as in §2. The drill restores the latest backup into a local
  `supabase start`, runs smoke queries and pings Healthchecks.

---

## 6. App model

Each hosted app is a folder `hosted/<slug>/` containing the source and `mininode.json`:

```jsonc
{
  "$schema": "../../packages/manifest/schema.json",
  "specVersion": 1,
  "slug": "rezepte",
  "name": "Rezepte",
  "description": "Rezepte und Wochenplan",
  "kind": "spa",                        // static | spa | nextjs | container | remote
  "target": "cloudflare",               // cloudflare | vercel | nucbox | remote
  "access": { "default": true, "roles": ["user", "trusted", "admin"] },
  "data": { "mode": "private" },        // none | private | shared-account | group | readonly
  "ai": { "models": ["gemini-flash"], "monthlyBudgetEur": 3 },
  "build": { "command": "pnpm build", "output": "dist" },
  "container": { "port": 8080, "memoryMb": 256, "healthPath": "/health" },
  "remote": { "runtime": "windows", "installer": { "r2Key": "…", "sha256": "…" } }
}
```

The JSON Schema lives in `packages/manifest` and is validated in CI and by `mininode doctor`.
Everything else is derived from manifests: portal tiles, DNS, deploy, Host Manager.

---

## 7. Pipeline

1. **Drop** the ZIP into `inbox/` (contents are git-ignored).
2. **`/integrate-app inbox/foo.zip`:**
   1. The agent classifies the source, follows the matching playbook, and wires in the SDK, the
      gate, the data layer, AI calls and the manifest.
   2. It tests against local Supabase.
   3. It runs `mininode doctor`.
   4. It commits on a branch.
3. **PR checks:**
   - Biome (a relaxed profile for `hosted/`) and typecheck.
   - Vitest and pgTAP.
   - `mininode doctor` for every changed app.
   - Build, secret scan and fixture snapshots.
   - Changed apps only (`turbo --affected`).
4. **Merge → deploy:**
   - Migrations to staging, then production.
   - Deploy by target and update DNS.
   - Register the app in `platform.apps`.
5. **NucBox deploy:**
   - The CI job runs `cloudflared access ssh` with a service token.
   - The SSH key is `restrict,command="nucbox-deploy"`; the script accepts only a slug regex
     and a `sha256:` digest.
   - It verifies the attestation, then runs `flock` and compose up, then a health check.
   - On failure it rolls back to the recorded previous digest.
6. **Installers:**
   - Admin only. Uploaded to R2 together with a SHA-256.
   - `nucbox-control` snapshots the Windows VM, verifies the hash, installs silently (winget when
     possible) and reports back.

---

## 8. Platform SDK (`@mininode/sdk`)

A framework-agnostic ES module, also built as a single `<script>` file for plain HTML apps.

| Namespace | Purpose |
|---|---|
| `auth` | `user()`, `role()`, `requireLogin()` (redirects to central login), `signOut()` |
| `db` | supabase-js client scoped to `app_<slug>` |
| `kv`, `offline` | key-value store (per user or shared) with an offline queue (ADR 0005) |
| `realtime` | channels and presence |
| `files` | Storage scoped to the app |
| `ai` | `chat()`, `json()` via the AI proxy (no keys on the client) |
| `api` | calls to declared external APIs through the host-key proxy (ADR 0006) |
| `google` | Gmail and Calendar tokens for declared scopes; `calendarSync` for the Kalender (ADR 0004, 0010) |
| `push` | scheduled push reminders by key (ADR 0005) |
| `suite` | shared records and collections: `type(t)`, `range()`, `collections()` … (ADR 0002) |
| `game` | player name, sessions, results, leaderboards for games (ADR 0009) |
| `people()`, `notify()` | people who may use the app (ADR 0008), portal notifications |

The host injects the configuration (`/_mininode/config.json`), so the same build runs on
staging and production.

---

## 9. AI instructions

| Artifact | Purpose |
|---|---|
| `docs/ai/NEW-APP-SPEC.md` | Paste-ready spec for any AI building an app (versioned via `specVersion`) |
| `docs/ai/NEW-APP-SPEC.short.md` | **Generated** from the long spec by a script, never hand-edited |
| `docs/ai/playbooks/*.md` | Per source: claude-artifact, ai-studio, vite-react, nextjs, static-html, node-server, python-server, docker-generic, native-installer |
| `packages/cli` → `mininode doctor` | The deterministic definition of done, shared by the skill and CI |
| `.claude/skills/integrate-app/` | Orchestrates classify → playbook → local test → doctor |
| `fixtures/` | Real-shaped sample exports plus expected integrated snapshots, checked on every PR. LLM-driven integration evals run manually or nightly, not per PR |

---

## 10. Remote apps

- **Gateway:** Guacamole at `remote.mininode.app`, reachable only through the tunnel.
- **Connecting:** the portal asks the API for a session. The API checks the JWT, role, grant,
  queue slot and step-up, then signs a short-lived **encrypted JSON auth** blob naming exactly one
  connection. For `trusted` users in shared-account mode, clipboard, file transfer and drive
  redirection are disabled.
- **Windows 11 Pro VM:**
  - RemoteApp via `fAllowUnlistedRemotePrograms`; one session, with a queue and a
    "busy since … by …" indicator.
  - A dedicated Windows account without the owner's browser profile, restricted with
    AppLocker / SRP.
  - Hibernates after idle (default 15 min, warning 2 min before).
- **Wine:** RDP/VNC-capable images so Guacamole stays the only gateway. Parallel use is limited by
  each program's own licensing and login rules.
- **Android (optional):** a Redroid compose profile, disabled by default. It checks for the
  `binder_linux` kernel module and fails with a clear message if missing, and it is mutually
  exclusive with the Windows VM.

---

## 11. AI proxy

- **Auth:** session and grant for the calling app (the request `Origin` is mapped to an app slug),
  plus the model allow-list from the manifest and a `max_tokens` cap.
- **Budget:** a Postgres RPC atomically *reserves* the worst-case cost before the call and
  *settles* the real cost afterwards. It enforces global, per-app, per-role and per-user limits.
  The admin is exempt from the global hard stop.
- **Forwarding:** via Cloudflare AI Gateway (logs, caching, rate limits); provider keys are held
  by the Gateway.

---

## 12. UI

- **Start page** (`mininode.app`): app tiles with favourites, category filters and sorting (A–Z,
  most used, new, old), curated app sets ("Pakete"), link tiles to external websites, remote apps
  with live status, notifications and profile (ADR 0007). Light and dark mode, desktop and mobile.
- **Host Manager** (`mininode.app/admin`, admin only, step-up): **Overview, Apps (incl. inbox,
  categories, whitelist, link tiles), Kategorien & Pakete, Users & roles, Remote apps, NucBox
  (resource usage of host, VMs, storage and containers), AI proxy, API keys** are functional.
  - Deployments, Domains, Logs and Hosts link out to the Cloudflare, Supabase and GitHub
    dashboards; they never show placeholder data.
- **Fonts:** Bricolage Grotesque, Instrument Sans and JetBrains Mono, self-hosted WOFF2.
- **Accessibility:** WCAG AA contrast, touch targets of at least 44 px, keyboard access.

---

## 13. Repository layout

```
.
├─ apps/                 # platform deployables
│  ├─ portal/            # start page, /login, /admin (React + Vite on a Worker)
│  ├─ api/               # platform API (Hono Worker)
│  ├─ ai-proxy/          # AI proxy (Hono Worker)
│  └─ nucbox-control/    # VM power, queue, Guacamole token signer, deploy script (Node)
├─ hosted/               # user apps, one folder each (+ mininode.json)
├─ inbox/                # ZIP drop zone (git-ignored)
├─ packages/
│  ├─ config/            # shared tsconfig
│  ├─ manifest/          # mininode.json schema, types, validator
│  ├─ sdk/               # @mininode/sdk
│  ├─ gate/              # auth gate for app Workers + forward-auth
│  ├─ ui/                # design tokens + shared components
│  └─ cli/               # mininode CLI (doctor, new, deploy helpers)
├─ supabase/             # config.toml, migrations, tests (pgTAP), seed
├─ infra/
│  ├─ cloudflare/        # tunnel config, DNS automation, Access policies
│  └─ nucbox/            # Proxmox setup, compose stacks, Windows VM scripts, backup, SOPS secrets
├─ fixtures/             # sample exports + expected snapshots
├─ docs/
│  ├─ ai/                # NEW-APP-SPEC, playbooks
│  ├─ adr/               # architecture decisions
│  └─ runbooks/          # restore, key rotation, add an app, NucBox install
├─ .claude/              # skills (incl. integrate-app), settings
└─ .github/workflows/    # ci.yml, deploy.yml, nightly.yml
```

---

## 14. Engineering standards

- TypeScript `strict` with `exactOptionalPropertyTypes`, ESM only.
- **Biome** for lint and format: a strict profile for `apps/` and `packages/`, a relaxed profile
  for `hosted/`.
- **Tests:**
  - Vitest for unit tests (and Workers pool tests for the Workers).
  - pgTAP for RLS.
  - Playwright for e2e, including a virtual-authenticator passkey flow and a two-subdomain
    token-expiry test.
- **Rule for later phases:** every feature has a CI smoke test *or* sits behind a flag marked
  unsupported. Untested code must not silently rot.
- **CI** on every PR; Conventional Commits; Renovate with grouped updates for `hosted/`.
- **Secrets** never enter the repo in plain text. `.env.example` documents each variable, and
  there is a runbook for rotating every key.
- ADRs for every non-obvious decision; a README in every package.

---

## 15. Phases

| Phase | Scope | Done when |
|---|---|---|
| 0 · Foundation | Monorepo, CI, Biome, skills, `CLAUDE.md`, ADRs | CI green on the empty skeleton |
| 1 · Identity & portal | Platform schema + RLS + pgTAP, invites, email hook, central login (passkeys + password), start page, admin (Users) | Invite → fingerprint sign-in works end to end (e2e with virtual authenticator) |
| 2 · Cloud apps | Manifest, SDK, gate, doctor, cloudflare deploy, DNS, admin (Apps) | A sample SPA fixture deploys behind login with private data |
| 3 · AI layer | NEW-APP-SPEC, playbooks, integrate-app skill, fixtures, AI proxy + budget RPC, admin (AI) | Fixture snapshots pass; budget tests pass |
| 4 · NucBox | Proxmox runbook, tunnel, Traefik, forward-auth, deploy script, backups, restore drill, monitoring | A container fixture runs behind login; the restore drill passes |
| 5 · Remote apps | Guacamole JSON auth, nucbox-control (VM power, queue), Windows lockdown scripts, admin (Remote) | A Windows program opens from the phone; the VM hibernates when idle |
| 6 · Optional | Wine images, Redroid profile, Vercel path, analytics | Each behind a flag with a smoke test |

### 15.1 Built beyond the phases

Everyday apps and platform features that grew next to the phases, each with its ADR:

| Area | State | Where |
|---|---|---|
| App Kit and construction prompts | done | ADR 0003, `docs/ai/DESIGN-SYSTEM.md`, `packages/ui/kit` |
| Google services for apps | done | ADR 0004 |
| Push reminders and offline apps | done | ADR 0005 |
| Host API keys | done | ADR 0006 |
| App catalog (favourites, categories, sets) | done | ADR 0007 |
| People for in-app sharing | done | ADR 0008 |
| Gaming Hub (games only there, not on the start page) | done | ADR 0009, `hosted/memory` |
| More Gaming Hub games: Minensucher, Sudoku (generator, five levels), Solitär, 2048, Codeknacker | done | `hosted/minensucher`, `sudoku`, `solitaer`, `n2048`, `codeknacker`; shared helper `packages/ui/kit/game.js` |
| Suite core (shared records, collections, app grants) | done, lean phase | ADR 0002, `docs/suite/data-types.md` |
| Kalender (own, shared and other apps' dates) | done | `hosted/kalender` |
| Google Calendar two-way sync | done | ADR 0010, `docs/runbooks/kalender.md` |
| Haushalt: PDF statements, fixed costs, Dein Monat, statistics | done | `hosted/haushalt` |
| Sportplaner and Haushalt write their dates as suite records | done | planned sessions (`activity`), payments of fixed costs (`contract`) |
| App library with one-click NucBox installs (Jellyfin, n8n …) | done, needs the NucBox | ADR 0011, `docs/runbooks/app-library.md` |
| Apps as GitHub projects (no data, no keys) | done | ADR 0012, `docs/runbooks/app-export.md` |
| Sportplaner course price split per session | done | `hosted/sportplaner/js/price.js` |
| German date, time and number formats in every app (kit date fields) | done | `packages/ui/kit/ui.js`, `docs/ai/DESIGN-SYSTEM.md` §8 |
| Uploads in Verwaltung, script-first integration (`mininode integrate`), AI review queue | done, needs `INTEGRATE_TOKEN` | ADR 0013, `docs/runbooks/uploads.md` |
| Programs for the PC/server from Verwaltung (R2 upload, install, path detection) | done, needs R2 secrets and the NucBox | ADR 0013, `docs/runbooks/programs.md` |
| Own drawers and own order (start page, Gaming Hub) | done | ADR 0015 |
| API keys site-wide or personal, popup and instruction page | done | ADR 0014 |
| Release editions: cloud, PC/server, complete per version | done | ADR 0016, `docs/runbooks/releases.md` |

### 15.2 Sharing the platform (proposed, not started)

Goal: others can download MiniNode, run it on their own Cloudflare + Supabase (and optionally a
PC as NucBox) and remix it, without anything private from this installation.

- **Already in place:**
  - no secrets in the repository (rule + gitleaks in CI);
  - user data only in Supabase;
  - setup runbooks;
  - single apps exportable (ADR 0012).
- **Instance settings out of the code:** about 130 files name `mininode.app`. A few also name
  the Supabase project refs, publishable keys, the Cloudflare account id or the GitHub owner.
  They move into one `mininode.config.json` (domain, Cloudflare account, Supabase refs and
  keys, repository). The Workers, the deploy workflow, the portal and the apps read it, and the
  apps take the portal URL from the SDK.
- **A clean start:** a public template repository generated from `main` (core code, docs,
  sample app) with one fresh commit, not this repository's history. The personal apps and
  their tests stay here. The export check of ADR 0012 runs over the whole template.
- **First-run setup:**
  - a `pnpm mininode init` wizard writes the config;
  - `infra/cloudflare/bootstrap.sh` and `supabase link` already do the provider side;
  - the first account becomes admin, as today.
- **Hosts:**
  - Cloudflare Workers is the default.
  - The manifest already knows `vercel`.
  - A plain Node/Docker host (the NucBox alone, any VPS) would need the gate and the API as a
    Node server. That is the largest piece.
- **License:** chosen by the owner (e.g. AGPL-3.0 to keep remixes open, or MIT).

---

## 16. Review log (v1 → v2)

The external review raised these points, and all were adopted:
- The 5-origin passkey limit → central login.
- Supabase's built-in email can't send invites → Cloudflare Email plus the hook.
- Schema-per-app is not isolation → RLS with `has_grant()`.
- Guacamole OIDC is incompatible with Supabase → JSON auth.
- The Workers Free quota → Workers Paid with selective `run_worker_first`.
- The Next.js path moves to vinext.
- The cookie blast radius → step-up, CSP and a refresh redirect.
- The hot standby is dropped → restore drill.
- A custom deploy agent is replaced by forced-command SSH plus a small control service.
- Access is placed in front of admin surfaces.
- AI proxy hardening.
- RemoteApp lockdown.
- Android becomes optional.
- Monitoring runs off the NucBox, and secrets are handled with SOPS.
- `mininode doctor`, the generated short spec and `specVersion`.
- Repo naming: `apps/` vs `hosted/`.
