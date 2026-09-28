# Graph Report - PrivateAppHosting  (2026-09-28)

## Corpus Check
- 257 files · ~125,443 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 34 file(s) not represented in the graph (top: (none) 10, .css 8, .jsonc 3)

## Summary
- 1592 nodes · 3165 edges · 151 communities (82 shown, 69 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 66 edges (avg confidence: 0.89)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `bb064e54`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Login.tsx
- Suite data types (catalog)
- remote.ts
- decide.ts
- ai-proxy/src/index.ts
- schema.ts
- 20260923000100_platform_core.sql
- Home.tsx
- playbooks/README.md
- sdk/src/index.ts
- rezeptideen/mininode.json
- MiniNode.app — Project Plan (v2)
- server.ts
- notizen/mininode.json
- main.ts
- install.ts
- mfa.spec.ts
- 20260923000300_ai_budget.sql
- control.test.ts
- platform.remote_sessions
- hallo/mininode.json
- haushalt/app.js
- MiniNode App Kit: design system for hosted apps
- platform.app_kv
- core.js
- mininode
- ref_vite
- First setup
- bootstrap.sh
- Hypervisor
- editor.js
- rezeptideen/src/main.tsx
- nucbox-deploy
- kb.sh
- views.js
- manifest/src/index.ts
- stats.js
- .mcp.json
- with-local-supabase.sh
- ADR 0001: Central login origin and permanent passkey RP ID
- doctor.ts
- routes/google.ts
- restore-drill.sh
- 20260923000600_invite_helpers.sql
- 20_app_isolation.test.sql
- backup.sh
- entrypoint.sh
- deploy/index.ts
- api/src/index.ts
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
- backup.js
- 20260923000800_app_migrations.sql
- bin.ts
- Workshop.tsx
- ADR 0003: Construction prompts, app kit and the suite build order
- 20260928100740_app_identity.sql
- deploy.test.ts
- ref_node_fs
- Account.tsx
- ref_vitest
- ui.js
- preview.js
- Users.tsx
- ref_supabase_supabase_js
- templates.ts
- lib/auth.ts
- worker.ts
- portal/src/main.tsx
- 20260928132539_mfa_enforcement.sql
- standard-webhooks.ts
- src/auth.ts
- supabase
- haushalt/mininode.json
- sportplaner/mininode.json
- ai.md
- calendar.md
- collaboration.md
- Haushalt
- Sportplaner
- ci-clean-secret.sh
- files.md
- activity.test.ts
- 8. Platform SDK (`@mininode/sdk`)
- import-export.md
- notifications.md
- places.md
- stats.md
- tables.md
- prompts/README.md
- archiv.md
- buero.md
- crm.md
- finanzen.md
- wrangler-config.ts
- sonstiges.md
- spiel.md
- tracker.md
- src/google.ts
- README.md
- DESIGN-SYSTEM.md
- runbooks/README.md
- You are building an app for MiniNode
- ADR 0004: Google services (Gmail, Calendar) for hosted apps
- NucBox install (Proxmox, Linux VM, Windows VM)
- Restore
- MiniNode.app
- 3. Tokens
- 20260928143037_google_grants.sql
- forms.md
- keyboard.md
- lists.md
- offline.md
- onboarding.md
- performance.md
- print.md
- privacy.md
- push.md
- scanning.md
- search.md
- sharing.md
- timer.md
- undo.md

## God Nodes (most connected - your core abstractions)
1. `supabase()` - 38 edges
2. `platform()` - 27 edges
3. `h()` - 27 edges
4. `editBooking()` - 24 edges
5. `useAuth()` - 21 edges
6. `viewOverview()` - 20 edges
7. `previewImport()` - 20 edges
8. `Account()` - 19 edges
9. `render()` - 19 edges
10. `useStepUp()` - 18 edges

## Surprising Connections (you probably didn't know these)
- `8. Home, family and everyday life` --references--> `maintenance()`  [INFERRED]
  docs/suite/data-types.md → apps/api/src/index.ts
- `3. Windows 11 VM (id 200)` --references--> `base()`  [INFERRED]
  docs/runbooks/nucbox-install.md → apps/portal/src/components/icons.tsx
- `Windows VM` --references--> `base()`  [INFERRED]
  docs/runbooks/restore.md → apps/portal/src/components/icons.tsx
- `Rules` --references--> `supabase()`  [INFERRED]
  CLAUDE.md → apps/portal/src/lib/supabase.ts
- `6. Components` --references--> `today()`  [INFERRED]
  docs/ai/DESIGN-SYSTEM.md → hosted/haushalt/app.js

## Import Cycles
- None detected.

## Communities (151 total, 69 thin omitted)

### Community 0 - "Login.tsx"
Cohesion: 0.16
Nodes (16): AuthState, googleErrorFromUrl(), googleHandOverDone(), calls, errorFor(), Logo(), emailEnabled(), goTo() (+8 more)

### Community 1 - "Suite data types (catalog)"
Cohesion: 0.12
Nodes (16): 10. Games (including multiplayer), 11. Platform and meta types, 1. Self-organisation, 2. Office and collaboration, 3. CRM and sales, 4. Finance, 5. Places, travel and media, 6. Archive and collections (books, films, music, games, …) (+8 more)

### Community 2 - "remote.ts"
Cohesion: 0.23
Nodes (10): clientIdentifier(), encryptAuthPayload(), GuacAuthPayload, GuacConnection, hexToBytes(), lockDownParameters(), PrepareResult, RemoteManifest (+2 more)

### Community 3 - "decide.ts"
Cohesion: 0.15
Nodes (16): decide(), DecideInput, Decision, loginUrl(), refreshUrl(), url, base64UrlToString(), parseCookies() (+8 more)

### Community 4 - "ai-proxy/src/index.ts"
Cohesion: 0.09
Nodes (33): app, AppAi, appCache, buildDeps(), createApp(), defaultDeps(), Deps, originMatchesApp() (+25 more)

### Community 5 - "schema.ts"
Cohesion: 0.09
Nodes (22): accessSchema, AiModel, aiModelSchema, aiSchema, buildSchema, containerSchema, CURRENT_SPEC_VERSION, DataMode (+14 more)

### Community 6 - "20260923000100_platform_core.sql"
Cohesion: 0.12
Nodes (24): platform.handle_new_user, app_grants_app_slug_idx, apps_touch, audit_log_at_idx, invites_created_by_idx, invites_one_open_per_email_idx, notifications_app_slug_idx, notifications_user_unread_idx (+16 more)

### Community 7 - "Home.tsx"
Cohesion: 0.16
Nodes (24): AppsIcon(), base(), BellIcon(), GoogleMark(), IconProps, MoonIcon(), PinIcon(), ScreenIcon() (+16 more)

### Community 8 - "playbooks/README.md"
Cohesion: 0.13
Nodes (11): Playbook: Google AI Studio export, Playbook: Claude artifact, Common steps (every playbook ends here), Playbook: any other stack with a Dockerfile, Playbook: native program (Windows / Android), Playbook: Next.js, Playbook: Node server (runs on the NucBox), Playbook: Python server (runs on the NucBox) (+3 more)

### Community 9 - "sdk/src/index.ts"
Cohesion: 0.13
Nodes (9): appSchema(), assertConfig(), loadConfig(), REQUIRED, Role, ADR-0004, Json, KvScope (+1 more)

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
Cohesion: 0.09
Nodes (23): cachedGrants(), bool, Config, loadConfig(), schema, app, config, docker (+15 more)

### Community 15 - "install.ts"
Cohesion: 0.21
Nodes (15): createInstaller(), runWindows(), runWine(), signOrFail(), defaultSilentArgs(), encodePowerShell(), InstallJob, InstallRequest (+7 more)

### Community 16 - "mfa.spec.ts"
Cohesion: 0.15
Nodes (16): month, year, base32(), freshCode(), totp(), RFC-6238, admin, cleanup() (+8 more)

### Community 17 - "20260923000300_ai_budget.sql"
Cohesion: 0.20
Nodes (10): ai_usage_app_month_idx, ai_usage_open_idx, ai_usage_user_month_idx, platform.ai_budgets, platform.ai_spent_micro(), platform.ai_usage, platform.my_ai_budget(), auth.users (+2 more)

### Community 18 - "control.test.ts"
Cohesion: 0.12
Nodes (11): config, TOKEN, ContainerInfo, demuxLogs(), dockerEngine, RunSpec, proxmoxClient(), VmState (+3 more)

### Community 19 - "platform.remote_sessions"
Cohesion: 0.27
Nodes (12): platform.remote_end(), platform.remote_expire_idle(), platform.remote_request(), platform.remote_sessions, platform.remote_status(), remote_sessions_one_active_idx, remote_sessions_one_open_per_user_idx, remote_sessions_queue_idx (+4 more)

### Community 20 - "hallo/mininode.json"
Cohesion: 0.17
Nodes (11): access, default, data, mode, description, kind, name, $schema (+3 more)

### Community 21 - "haushalt/app.js"
Cohesion: 0.06
Nodes (112): applyRules(), barRow(), bookingList(), bookingRow(), bookings(), catById(), catName(), cats() (+104 more)

### Community 22 - "MiniNode App Kit: design system for hosted apps"
Cohesion: 0.18
Nodes (11): 10. Do not, 11. Checklist before handover, 1. How an app uses the kit, 2. Principles, 4. Dark mode, 5. App shell, 6. Components, 7. Screen patterns (+3 more)

### Community 23 - "platform.app_kv"
Cohesion: 0.24
Nodes (8): app_kv_owner_idx, app_kv_touch, app_kv_unique_idx, platform.app_kv, auth, auth.users, platform.apps, platform.touch_updated_at

### Community 24 - "core.js"
Cohesion: 0.06
Nodes (51): actActive(), addDays(), buildIndex(), byStart(), dataChanged(), dayCache, DAYS, DAYS2 (+43 more)

### Community 25 - "mininode"
Cohesion: 0.22
Nodes (10): AiChatOptions, AiError, AiMessage, AiModel, createAi(), TokenSource, createMininode(), mininode (+2 more)

### Community 26 - "ref_vite"
Cohesion: 0.32
Nodes (3): ref_tailwindcss_vite, ref_vite, ref_vitejs_plugin_react

### Community 27 - "First setup"
Cohesion: 0.22
Nodes (9): 1. Cloudflare: domain and deploy token (5 min), 2. Supabase: two values and one click (5 min), 3.1 Google sign-in (optional, 10 min), 3. GitHub secrets (3 min), 4. Apps, 5. First deploy and first login, 6. NucBox (later), Already done (+1 more)

### Community 28 - "bootstrap.sh"
Cohesion: 0.50
Nodes (6): access_app(), cf(), log(), service_token(), bootstrap.sh script, warn()

### Community 30 - "editor.js"
Cohesion: 0.10
Nodes (31): addPhotos(), BLOCK_HANDLERS, blockHead(), blocksToSlots(), blockTitle(), cancelEdit(), collectForm(), dropAsset() (+23 more)

### Community 31 - "rezeptideen/src/main.tsx"
Cohesion: 0.25
Nodes (7): App(), root, Recipe, suggestRecipes(), fixtures_ai_studio_expected_rezeptideen_src_styles, App(), ref_react_dom

### Community 32 - "nucbox-deploy"
Cohesion: 0.67
Nodes (6): nucbox-deploy script, die(), digest_ok(), log(), probe(), verify()

### Community 34 - "views.js"
Cohesion: 0.11
Nodes (29): applyLocal(), H, persist(), removeAct(), toast(), togglePlan(), timeLabel(), closeSheet() (+21 more)

### Community 35 - "manifest/src/index.ts"
Cohesion: 0.15
Nodes (11): ADR-0002, Call, env, hosted, appRow(), registerApp(), packages_manifest_src_index_manifest, MANIFEST_FILENAME (+3 more)

### Community 36 - "stats.js"
Cohesion: 0.16
Nodes (18): addInterval(), computeStats(), eur(), eurF, EVERY1, numF, parseMoney(), paymentsCount() (+10 more)

### Community 37 - ".mcp.json"
Cohesion: 0.29
Nodes (6): npx, cloudflare-docs, context7, playwright, supabase, @playwright/mcp

### Community 38 - "with-local-supabase.sh"
Cohesion: 0.33
Nodes (5): with-local-supabase.sh script, SUPABASE_DB_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY, SUPABASE_URL

### Community 39 - "ADR 0001: Central login origin and permanent passkey RP ID"
Cohesion: 0.33
Nodes (5): Addendum (2026-09): Google sign-in and authenticator apps, ADR 0001: Central login origin and permanent passkey RP ID, Consequences, Context, Decision

### Community 40 - "doctor.ts"
Cohesion: 0.16
Nodes (18): checkLayout(), checkMigrations(), checkSources(), doctor(), DoctorReport, Finding, hostedApps(), IGNORED_DIRS (+10 more)

### Community 43 - "routes/google.ts"
Cohesion: 0.13
Nodes (19): aesKey(), base64(), GoogleAccessToken, googleAccount(), GoogleError, GoogleSettings, refreshAccessToken(), revoke() (+11 more)

### Community 46 - "20_app_isolation.test.sql"
Cohesion: 0.50
Nodes (3): app_haushalt.entries, app_pinnwand.notes, app_rezepte.recipes

### Community 49 - "deploy/index.ts"
Cohesion: 0.17
Nodes (21): deployApp(), devApp(), ensureSdkBundle(), exposeLocally(), KIT, kitFonts(), NOT_SERVED, REPO_ROOT (+13 more)

### Community 50 - "api/src/index.ts"
Cohesion: 0.19
Nodes (17): maintenance(), scheduled(), AppContext, adminClient(), buildMessages(), hooks, Payload, payloadSchema (+9 more)

### Community 68 - "backup.js"
Cohesion: 0.23
Nodes (14): BK, bkStatus(), blobToDataURL(), dataURLToBlob(), exportData(), importData(), legacyRange(), sanitizeAct() (+6 more)

### Community 78 - "bin.ts"
Cohesion: 0.21
Nodes (14): envFlag(), flag(), main(), ROOT, DeployEnv, environmentSettings, required(), DeployOptions (+6 more)

### Community 79 - "Workshop.tsx"
Cohesion: 0.06
Nodes (45): BuildFile, FILES, LIBRARY, modules, types, ACCENTS, approxTokens(), Audience (+37 more)

### Community 80 - "ADR 0003: Construction prompts, app kit and the suite build order"
Cohesion: 0.25
Nodes (7): 1. Construction prompt library ("Konstruktions-Prompts"), 2. App kit (design system for apps), 3. Build order, ADR 0003: Construction prompts, app kit and the suite build order, Consequences, Context, Decision

### Community 81 - "20260928100740_app_identity.sql"
Cohesion: 0.28
Nodes (4): app_origins_app_slug_idx, platform.app_origins, platform.calling_app(), platform.apps

### Community 82 - "deploy.test.ts"
Cohesion: 0.20
Nodes (9): Layout, @mininode/cli — `pnpm mininode`, appsFromPaths(), changedApps(), parsed, production, manifest(), ref_node_child_process (+1 more)

### Community 83 - "ref_node_fs"
Cohesion: 0.18
Nodes (10): jsonSchema, target, manifestSchema, ref_node_fs, ref_node_url, body, match, source (+2 more)

### Community 84 - "Account.tsx"
Cohesion: 0.20
Nodes (19): needsAal2(), deletePasskey(), listPasskeys(), passkeyErrorMessage(), PasskeyInfo, passkeysSupported(), registerPasskey(), renamePasskey() (+11 more)

### Community 85 - "ref_vitest"
Cohesion: 0.17
Nodes (3): Mnui, source, ref_vitest

### Community 86 - "ui.js"
Cohesion: 0.33
Nodes (5): closeCurrent(), onKey(), open(), toast(), toastRegion()

### Community 87 - "preview.js"
Cohesion: 0.50
Nodes (3): current, levels, saved

### Community 88 - "Users.tsx"
Cohesion: 0.12
Nodes (33): dateTime(), euro(), Ai(), Apps(), STATUS, TARGET, Overview(), Remote() (+25 more)

### Community 90 - "ref_supabase_supabase_js"
Cohesion: 0.14
Nodes (12): enabled, RFC-6238, ApiEnv, ADR-0004, enabled, sealFor(), app, packages_manifest_src_index_google_scopes (+4 more)

### Community 91 - "templates.ts"
Cohesion: 0.43
Nodes (7): AUTH_COPY, authEmail(), AuthEmailAction, Email, escapeHtml(), inviteEmail(), layout()

### Community 92 - "lib/auth.ts"
Cohesion: 0.24
Nodes (9): problem(), Requirements, requireUser(), verifierFor(), notConfigured(), notConnected(), packages_gate_src_index_hasrecentauth, packages_gate_src_index_sessionclaims (+1 more)

### Community 93 - "worker.ts"
Cohesion: 0.18
Nodes (16): fetch(), portalConfig(), supabaseGrantChecker(), contentSecurityPolicy(), CspOptions, securityHeaders(), withHeaders(), packages_gate_src_index_securityheaders (+8 more)

### Community 94 - "portal/src/main.tsx"
Cohesion: 0.12
Nodes (24): AdminLayout(), EXTERNAL, LINKS, BudgetRow, SCOPE_LABEL, UsageRow, InstallJob, SessionRow (+16 more)

### Community 95 - "20260928132539_mfa_enforcement.sql"
Cohesion: 0.22
Nodes (7): auth.mfa_factors, platform.app_grants, platform.custom_access_token_hook(), platform.has_grant(), platform.mfa_satisfied(), platform.apps, platform.profiles

### Community 96 - "standard-webhooks.ts"
Cohesion: 0.52
Nodes (6): base64ToBytes(), bytesToBase64(), secretBytes(), sign(), timingSafeEqual(), verify()

### Community 97 - "src/auth.ts"
Cohesion: 0.24
Nodes (11): forbiddenPage(), forwardAuth(), ForwardAuthOptions, pick(), slugFromHost(), GrantChecker, isNavigation(), packages_gate_src_index_decide (+3 more)

### Community 98 - "supabase"
Cohesion: 0.11
Nodes (40): AuthContext, AuthProvider(), Profile, Role, CodeForm(), connectGoogle(), disconnectGoogle(), GOOGLE_CONNECTED (+32 more)

### Community 99 - "haushalt/mininode.json"
Cohesion: 0.17
Nodes (11): access, default, data, mode, description, kind, name, $schema (+3 more)

### Community 100 - "sportplaner/mininode.json"
Cohesion: 0.17
Nodes (11): access, default, data, mode, description, kind, name, $schema (+3 more)

### Community 104 - "Haushalt"
Cohesion: 0.18
Nodes (8): settings(), Feature: settings and editable lists, App type: organisation and planning, Check, Data, Haushalt, Tests, What it does

### Community 105 - "Sportplaner"
Cohesion: 0.40
Nodes (4): Check, Moving data over from the artifact, Origin, Sportplaner

### Community 108 - "activity.test.ts"
Cohesion: 0.38
Nodes (4): AuditRow, describeActivity(), ROLE, names

### Community 109 - "8. Platform SDK (`@mininode/sdk`)"
Cohesion: 0.25
Nodes (5): app(), Development, @mininode/sdk, requireLogin(), 8. Platform SDK (`@mininode/sdk`)

### Community 120 - "wrangler-config.ts"
Cohesion: 0.20
Nodes (9): COMPATIBILITY_DATE, GATE_ENTRY, packages_manifest_src_index_all_google_scopes, packages_manifest_src_index_googleconnectsrc, packages_manifest_src_index_googlescopes, ALL_GOOGLE_SCOPES, googleConnectSrc(), googleScopes() (+1 more)

### Community 125 - "src/google.ts"
Cohesion: 0.29
Nodes (6): MininodeConfig, createGoogle(), GoogleError, config, TokenSource, ADR-0004

### Community 126 - "README.md"
Cohesion: 0.29
Nodes (4): Agent instructions, MiniNode, Repository, Start here

### Community 127 - "DESIGN-SYSTEM.md"
Cohesion: 0.25
Nodes (4): MiniNode app spec (specVersion 1), AI instructions, App kit (`kit/`), @mininode/ui

### Community 128 - "runbooks/README.md"
Cohesion: 0.25
Nodes (3): Add an app, Key rotation, Runbooks

### Community 129 - "You are building an app for MiniNode"
Cohesion: 0.29
Nodes (7): Before you hand it over, Design guidance, Hard rules, `mininode.json`, Tables (optional), The SDK, You are building an app for MiniNode

### Community 130 - "ADR 0004: Google services (Gmail, Calendar) for hosted apps"
Cohesion: 0.33
Nodes (5): ADR 0004: Google services (Gmail, Calendar) for hosted apps, Consequences, Context, Decision, Limits

### Community 131 - "NucBox install (Proxmox, Linux VM, Windows VM)"
Cohesion: 0.33
Nodes (5): 1. Proxmox VE, 2. Linux VM (id 100), 3. Windows 11 VM (id 200), 4. Verify, NucBox install (Proxmox, Linux VM, Windows VM)

### Community 132 - "Restore"
Cohesion: 0.33
Nodes (6): Database (Supabase), One app's data on the NucBox, Restore, Whole NucBox lost, Windows VM, Wine prefix of a remote app

### Community 133 - "MiniNode.app"
Cohesion: 0.40
Nodes (5): Commands, Knowledge graph (graphify), MiniNode.app, Rules, UI

### Community 134 - "3. Tokens"
Cohesion: 0.40
Nodes (5): 3. Tokens, Accents (`data-accent`), Colour roles, Space, radius, layout, Type

### Community 135 - "20260928143037_google_grants.sql"
Cohesion: 0.40
Nodes (4): google_grants_touch, platform.google_grants, auth.users, platform.touch_updated_at

## Knowledge Gaps
- **446 isolated node(s):** `supabase`, `cloudflare-docs`, `context7`, `npx`, `@playwright/mcp` (+441 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 672 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **69 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `platform()` connect `Users.tsx` to `Login.tsx`, `supabase`, `20260923000100_platform_core.sql`, `Home.tsx`, `MiniNode.app — Project Plan (v2)`, `Account.tsx`, `platform.app_kv`, `portal/src/main.tsx`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **Why does `MiniNode.app — Project Plan (v2)` connect `MiniNode.app — Project Plan (v2)` to `8. Platform SDK (`@mininode/sdk`)`, `README.md`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Why does `maintenance()` connect `api/src/index.ts` to `Suite data types (catalog)`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **What connects `supabase`, `cloudflare-docs`, `context7` to the rest of the system?**
  _446 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Suite data types (catalog)` be split into smaller, more focused modules?**
  _Cohesion score 0.11764705882352941 - nodes in this community are weakly interconnected._
- **Should `ai-proxy/src/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08748615725359911 - nodes in this community are weakly interconnected._
- **Should `schema.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08695652173913043 - nodes in this community are weakly interconnected._