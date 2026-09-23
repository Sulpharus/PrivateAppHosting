# Graph Report - PrivateAppHosting  (2026-09-23)

## Corpus Check
- 169 files · ~59,315 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 28 file(s) not represented in the graph (top: (none) 10, .css 5, .jsonc 3)

## Summary
- 912 nodes · 1784 edges · 79 communities (40 shown, 39 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 25 edges (avg confidence: 0.93)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `741df4ab`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- portal/src/main.tsx
- deploy/index.ts
- remote.ts
- src/auth.ts
- ai-proxy/src/index.ts
- schema.ts
- 20260923000100_platform_core.sql
- TopBar.tsx
- playbooks/README.md
- sdk/src/index.ts
- rezeptideen/mininode.json
- MiniNode.app — Project Plan (v2)
- server.ts
- notizen/mininode.json
- main.ts
- install.ts
- portal.spec.ts
- 20260923000300_ai_budget.sql
- control.test.ts
- platform.remote_sessions
- hallo/mininode.json
- runtimes.ts
- You are building an app for MiniNode
- platform.app_kv
- MiniNode.app
- mininode
- ref_vite
- First setup
- bootstrap.sh
- Hypervisor
- runbooks/README.md
- rezeptideen/src/main.tsx
- nucbox-deploy
- kb.sh
- README.md
- NucBox install (Proxmox, Linux VM, Windows VM)
- Restore
- .mcp.json
- with-local-supabase.sh
- ADR 0001: Central login origin and permanent passkey RP ID
- 8. Platform SDK (`@mininode/sdk`)
- main.jsx
- restore-drill.sh
- 20260923000600_invite_helpers.sql
- 20_app_isolation.test.sql
- backup.sh
- entrypoint.sh
- @mininode/sdk
- kv.ts
- ai-proxy/README.md
- api/README.md
- portal/README.md
- rezeptideen/README.md
- notizen/README.md
- fixtures/README.md
- hallo/README.md
- inbox/README.md
- dns-upsert.sh
- cloudflare/README.md
- nucbox/README.md
- infra/README.md
- config/README.md
- gate/README.md
- manifest/README.md
- ui/README.md
- 20260923000800_app_migrations.sql
- dockerEngine

## God Nodes (most connected - your core abstractions)
1. `platform()` - 27 edges
2. `supabase()` - 24 edges
3. `useAuth()` - 19 edges
4. `Account()` - 17 edges
5. `MiniNode.app — Project Plan (v2)` - 17 edges
6. `useStepUp()` - 15 edges
7. `base()` - 14 edges
8. `deployApp()` - 14 edges
9. `doctor()` - 14 edges
10. `mininode` - 13 edges

## Surprising Connections (you probably didn't know these)
- `3. Windows 11 VM (id 200)` --references--> `base()`  [INFERRED]
  docs/runbooks/nucbox-install.md → apps/portal/src/components/icons.tsx
- `Windows VM` --references--> `base()`  [INFERRED]
  docs/runbooks/restore.md → apps/portal/src/components/icons.tsx
- `Rules` --references--> `supabase()`  [INFERRED]
  CLAUDE.md → apps/portal/src/lib/supabase.ts
- `5. First deploy and first login` --references--> `main()`  [INFERRED]
  docs/runbooks/first-setup.md → packages/cli/src/bin.ts
- `Layout` --references--> `api()`  [INFERRED]
  CLAUDE.md → apps/portal/src/lib/api.ts

## Import Cycles
- None detected.

## Communities (79 total, 39 thin omitted)

### Community 0 - "portal/src/main.tsx"
Cohesion: 0.05
Nodes (96): AdminLayout(), dateTime(), euro(), EXTERNAL, LINKS, Ai(), BudgetRow, SCOPE_LABEL (+88 more)

### Community 1 - "deploy/index.ts"
Cohesion: 0.05
Nodes (71): flag(), main(), ROOT, appsFromPaths(), changedApps(), parsed, production, DeployEnv (+63 more)

### Community 2 - "remote.ts"
Cohesion: 0.07
Nodes (50): enabled, AUTH_COPY, authEmail(), AuthEmailAction, Email, escapeHtml(), inviteEmail(), layout() (+42 more)

### Community 3 - "src/auth.ts"
Cohesion: 0.07
Nodes (44): forbiddenPage(), forwardAuth(), ForwardAuthOptions, pick(), slugFromHost(), fetch(), portalConfig(), decide() (+36 more)

### Community 4 - "ai-proxy/src/index.ts"
Cohesion: 0.09
Nodes (34): app, AppAi, appCache, buildDeps(), createApp(), defaultDeps(), Deps, originMatchesApp() (+26 more)

### Community 5 - "schema.ts"
Cohesion: 0.10
Nodes (19): accessSchema, AiModel, aiModelSchema, aiSchema, buildSchema, containerSchema, CURRENT_SPEC_VERSION, DataMode (+11 more)

### Community 6 - "20260923000100_platform_core.sql"
Cohesion: 0.12
Nodes (24): platform.handle_new_user, app_grants_app_slug_idx, apps_touch, audit_log_at_idx, invites_created_by_idx, invites_one_open_per_email_idx, notifications_app_slug_idx, notifications_user_unread_idx (+16 more)

### Community 7 - "TopBar.tsx"
Cohesion: 0.16
Nodes (22): AppsIcon(), base(), BellIcon(), IconProps, Logo(), MoonIcon(), PinIcon(), ScreenIcon() (+14 more)

### Community 8 - "playbooks/README.md"
Cohesion: 0.13
Nodes (11): Playbook: Google AI Studio export, Playbook: Claude artifact, Common steps (every playbook ends here), Playbook: any other stack with a Dockerfile, Playbook: native program (Windows / Android), Playbook: Next.js, Playbook: Node server (runs on the NucBox), Playbook: Python server (runs on the NucBox) (+3 more)

### Community 9 - "sdk/src/index.ts"
Cohesion: 0.14
Nodes (11): AiChatOptions, AiMessage, AiModel, TokenSource, appSchema(), assertConfig(), loadConfig(), MininodeConfig (+3 more)

### Community 10 - "rezeptideen/mininode.json"
Cohesion: 0.11
Nodes (18): access, default, ai, maxOutputTokens, models, monthlyBudgetEur, build, command (+10 more)

### Community 11 - "MiniNode.app — Project Plan (v2)"
Cohesion: 0.12
Nodes (19): user(), 10. Remote apps, 11. AI proxy, 12. UI, 13. Repository layout, 14. Engineering standards, 15. Phases, 16. Review log (v1 → v2) (+11 more)

### Community 12 - "server.ts"
Cohesion: 0.15
Nodes (10): @mininode/nucbox-control, Installer, Scheduler, bearer(), createServer(), installSchema, prepareSchema, ServerDeps (+2 more)

### Community 13 - "notizen/mininode.json"
Cohesion: 0.12
Nodes (16): ai, maxOutputTokens, models, monthlyBudgetEur, build, command, output, data (+8 more)

### Community 14 - "main.ts"
Cohesion: 0.12
Nodes (15): cachedGrants(), bool, Config, loadConfig(), schema, app, config, docker (+7 more)

### Community 15 - "install.ts"
Cohesion: 0.21
Nodes (15): createInstaller(), runWindows(), runWine(), signOrFail(), defaultSilentArgs(), encodePowerShell(), InstallJob, InstallRequest (+7 more)

### Community 16 - "portal.spec.ts"
Cohesion: 0.27
Nodes (9): admin, cleanup(), createApp(), createUser(), grant(), PASSWORD, secretKey, url (+1 more)

### Community 17 - "20260923000300_ai_budget.sql"
Cohesion: 0.20
Nodes (10): ai_usage_app_month_idx, ai_usage_open_idx, ai_usage_user_month_idx, platform.ai_budgets, platform.ai_spent_micro(), platform.ai_usage, platform.my_ai_budget(), auth.users (+2 more)

### Community 18 - "control.test.ts"
Cohesion: 0.22
Nodes (8): config, TOKEN, ContainerInfo, demuxLogs(), RunSpec, proxmoxClient(), VmState, ref_undici

### Community 19 - "platform.remote_sessions"
Cohesion: 0.27
Nodes (12): platform.remote_end(), platform.remote_expire_idle(), platform.remote_request(), platform.remote_sessions, platform.remote_status(), remote_sessions_one_active_idx, remote_sessions_one_open_per_user_idx, remote_sessions_queue_idx (+4 more)

### Community 20 - "hallo/mininode.json"
Cohesion: 0.17
Nodes (11): access, default, data, mode, description, kind, name, $schema (+3 more)

### Community 21 - "runtimes.ts"
Cohesion: 0.22
Nodes (9): createScheduler(), prepareWine(), GuacConnection, PrepareRequest, PrepareResult, RuntimeConfig, RuntimeName, RuntimeUnavailable (+1 more)

### Community 22 - "You are building an app for MiniNode"
Cohesion: 0.18
Nodes (9): Before you hand it over, Design guidance, Hard rules, MiniNode app spec (specVersion 1), `mininode.json`, Tables (optional), The SDK, You are building an app for MiniNode (+1 more)

### Community 23 - "platform.app_kv"
Cohesion: 0.24
Nodes (8): app_kv_owner_idx, app_kv_touch, app_kv_unique_idx, platform.app_kv, auth, auth.users, platform.apps, platform.touch_updated_at

### Community 24 - "MiniNode.app"
Cohesion: 0.22
Nodes (8): Commands, Knowledge graph (graphify), Layout, MiniNode.app, Rules, UI, @mininode/cli — `pnpm mininode`, manifest()

### Community 25 - "mininode"
Cohesion: 0.36
Nodes (6): AiError, createAi(), createMininode(), mininode, createKv(), enabled

### Community 26 - "ref_vite"
Cohesion: 0.32
Nodes (3): ref_tailwindcss_vite, ref_vite, ref_vitejs_plugin_react

### Community 27 - "First setup"
Cohesion: 0.25
Nodes (8): 1. Cloudflare: add the domain (5 min), 2. Supabase: two values and one click (5 min), 3. GitHub secrets (3 min), 4. Worker secrets (once), 5. First deploy and first login, 6. NucBox (later), Already done, First setup

### Community 28 - "bootstrap.sh"
Cohesion: 0.50
Nodes (6): access_app(), cf(), log(), service_token(), bootstrap.sh script, warn()

### Community 30 - "runbooks/README.md"
Cohesion: 0.25
Nodes (3): Add an app, Key rotation, Runbooks

### Community 31 - "rezeptideen/src/main.tsx"
Cohesion: 0.43
Nodes (5): App(), root, Recipe, suggestRecipes(), fixtures_ai_studio_expected_rezeptideen_src_styles

### Community 32 - "nucbox-deploy"
Cohesion: 0.67
Nodes (6): nucbox-deploy script, die(), digest_ok(), log(), probe(), verify()

### Community 34 - "README.md"
Cohesion: 0.29
Nodes (4): Agent instructions, MiniNode, Repository, Start here

### Community 35 - "NucBox install (Proxmox, Linux VM, Windows VM)"
Cohesion: 0.33
Nodes (5): 1. Proxmox VE, 2. Linux VM (id 100), 3. Windows 11 VM (id 200), 4. Verify, NucBox install (Proxmox, Linux VM, Windows VM)

### Community 36 - "Restore"
Cohesion: 0.33
Nodes (6): Database (Supabase), One app's data on the NucBox, Restore, Whole NucBox lost, Windows VM, Wine prefix of a remote app

### Community 37 - ".mcp.json"
Cohesion: 0.29
Nodes (6): npx, cloudflare-docs, context7, playwright, supabase, @playwright/mcp

### Community 38 - "with-local-supabase.sh"
Cohesion: 0.33
Nodes (5): with-local-supabase.sh script, SUPABASE_DB_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY, SUPABASE_URL

### Community 39 - "ADR 0001: Central login origin and permanent passkey RP ID"
Cohesion: 0.40
Nodes (4): ADR 0001: Central login origin and permanent passkey RP ID, Consequences, Context, Decision

### Community 40 - "8. Platform SDK (`@mininode/sdk`)"
Cohesion: 0.40
Nodes (3): app(), requireLogin(), 8. Platform SDK (`@mininode/sdk`)

### Community 46 - "20_app_isolation.test.sql"
Cohesion: 0.50
Nodes (3): app_haushalt.entries, app_pinnwand.notes, app_rezepte.recipes

## Knowledge Gaps
- **259 isolated node(s):** `supabase`, `cloudflare-docs`, `context7`, `npx`, `@playwright/mcp` (+254 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 385 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **39 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `platform()` connect `portal/src/main.tsx` to `MiniNode.app — Project Plan (v2)`, `platform.app_kv`, `20260923000100_platform_core.sql`, `TopBar.tsx`?**
  _High betweenness centrality (0.088) - this node is a cross-community bridge._
- **Why does `platform.notifications` connect `20260923000100_platform_core.sql` to `portal/src/main.tsx`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._
- **Why does `base()` connect `TopBar.tsx` to `remote.ts`, `NucBox install (Proxmox, Linux VM, Windows VM)`, `Restore`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **What connects `supabase`, `cloudflare-docs`, `context7` to the rest of the system?**
  _259 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `portal/src/main.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.054580645161290325 - nodes in this community are weakly interconnected._
- **Should `deploy/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.050187265917602995 - nodes in this community are weakly interconnected._
- **Should `remote.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06806526806526807 - nodes in this community are weakly interconnected._