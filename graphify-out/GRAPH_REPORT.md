# Graph Report - PrivateAppHosting  (2026-09-28)

## Corpus Check
- 233 files · ~116,088 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 34 file(s) not represented in the graph (top: (none) 10, .css 8, .jsonc 3)

## Summary
- 1482 nodes · 2971 edges · 125 communities (67 shown, 58 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 61 edges (avg confidence: 0.89)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d0b01fb0`
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
- ref_vitest
- stats.js
- .mcp.json
- with-local-supabase.sh
- ADR 0001: Central login origin and permanent passkey RP ID
- doctor.ts
- main.jsx
- restore-drill.sh
- 20260923000600_invite_helpers.sql
- 20_app_isolation.test.sql
- backup.sh
- entrypoint.sh
- deploy/index.ts
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
- backup.js
- 20260923000800_app_migrations.sql
- bin.ts
- Workshop.tsx
- ADR 0003: Construction prompts, app kit and the suite build order
- 20260928100740_app_identity.sql
- deploy.test.ts
- ref_node_fs
- supabase
- ui.test.ts
- ui.js
- preview.js
- Users.tsx
- api/src/index.ts
- hooks.ts
- lib/auth.ts
- worker.ts
- portal/src/main.tsx
- 20260928132539_mfa_enforcement.sql
- standard-webhooks.ts
- src/auth.ts
- AccountSecurity.tsx
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
- organisation.md
- sonstiges.md
- spiel.md
- tracker.md

## God Nodes (most connected - your core abstractions)
1. `supabase()` - 36 edges
2. `platform()` - 27 edges
3. `h()` - 27 edges
4. `editBooking()` - 24 edges
5. `viewOverview()` - 20 edges
6. `previewImport()` - 20 edges
7. `useAuth()` - 19 edges
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

## Communities (125 total, 58 thin omitted)

### Community 0 - "Login.tsx"
Cohesion: 0.14
Nodes (22): AdminLayout(), AuthContext, AuthProvider(), AuthState, Profile, Role, useAuth(), signInWithGoogle() (+14 more)

### Community 1 - "Suite data types (catalog)"
Cohesion: 0.12
Nodes (16): 10. Games (including multiplayer), 11. Platform and meta types, 1. Self-organisation, 2. Office and collaboration, 3. CRM and sales, 4. Finance, 5. Places, travel and media, 6. Archive and collections (books, films, music, games, …) (+8 more)

### Community 2 - "remote.ts"
Cohesion: 0.20
Nodes (12): clientIdentifier(), encryptAuthPayload(), GuacAuthPayload, GuacConnection, hexToBytes(), lockDownParameters(), controlHeaders(), PrepareResult (+4 more)

### Community 3 - "decide.ts"
Cohesion: 0.14
Nodes (17): decide(), DecideInput, Decision, loginUrl(), refreshUrl(), url, base64UrlToString(), createVerifier() (+9 more)

### Community 4 - "ai-proxy/src/index.ts"
Cohesion: 0.09
Nodes (33): app, AppAi, appCache, buildDeps(), createApp(), defaultDeps(), Deps, originMatchesApp() (+25 more)

### Community 5 - "schema.ts"
Cohesion: 0.10
Nodes (19): accessSchema, AiModel, aiModelSchema, aiSchema, buildSchema, containerSchema, CURRENT_SPEC_VERSION, DataMode (+11 more)

### Community 6 - "20260923000100_platform_core.sql"
Cohesion: 0.12
Nodes (24): platform.handle_new_user, app_grants_app_slug_idx, apps_touch, audit_log_at_idx, invites_created_by_idx, invites_one_open_per_email_idx, notifications_app_slug_idx, notifications_user_unread_idx (+16 more)

### Community 7 - "Home.tsx"
Cohesion: 0.17
Nodes (23): AppsIcon(), base(), BellIcon(), GoogleMark(), IconProps, MoonIcon(), PinIcon(), ScreenIcon() (+15 more)

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
Cohesion: 0.09
Nodes (24): cachedGrants(), bool, Config, loadConfig(), schema, app, config, docker (+16 more)

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
Cohesion: 0.13
Nodes (10): config, TOKEN, ContainerInfo, demuxLogs(), dockerEngine, RunSpec, proxmoxClient(), VmState (+2 more)

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
Cohesion: 0.06
Nodes (27): 10. Do not, 11. Checklist before handover, 1. How an app uses the kit, 2. Principles, 3. Tokens, 4. Dark mode, 5. App shell, 6. Components (+19 more)

### Community 23 - "platform.app_kv"
Cohesion: 0.24
Nodes (8): app_kv_owner_idx, app_kv_touch, app_kv_unique_idx, platform.app_kv, auth, auth.users, platform.apps, platform.touch_updated_at

### Community 24 - "core.js"
Cohesion: 0.06
Nodes (58): actActive(), addDays(), buildIndex(), byStart(), dataChanged(), dayCache, DAYS, DAYS2 (+50 more)

### Community 25 - "mininode"
Cohesion: 0.36
Nodes (6): AiError, createAi(), createMininode(), mininode, createKv(), enabled

### Community 26 - "ref_vite"
Cohesion: 0.32
Nodes (3): ref_tailwindcss_vite, ref_vite, ref_vitejs_plugin_react

### Community 27 - "First setup"
Cohesion: 0.05
Nodes (35): Agent instructions, Commands, Knowledge graph (graphify), Layout, MiniNode.app, Rules, UI, Add an app (+27 more)

### Community 28 - "bootstrap.sh"
Cohesion: 0.50
Nodes (6): access_app(), cf(), log(), service_token(), bootstrap.sh script, warn()

### Community 30 - "editor.js"
Cohesion: 0.10
Nodes (31): addPhotos(), BLOCK_HANDLERS, blockHead(), blocksToSlots(), blockTitle(), cancelEdit(), collectForm(), dropAsset() (+23 more)

### Community 31 - "rezeptideen/src/main.tsx"
Cohesion: 0.43
Nodes (5): App(), root, Recipe, suggestRecipes(), fixtures_ai_studio_expected_rezeptideen_src_styles

### Community 32 - "nucbox-deploy"
Cohesion: 0.67
Nodes (6): nucbox-deploy script, die(), digest_ok(), log(), probe(), verify()

### Community 34 - "views.js"
Cohesion: 0.15
Nodes (22): applyLocal(), H, persist(), removeAct(), toast(), togglePlan(), agendaItemHTML(), countLabel() (+14 more)

### Community 35 - "ref_vitest"
Cohesion: 0.15
Nodes (9): Call, env, hosted, appSchemaName(), ManifestResult, parseManifest(), PLATFORM_DOMAIN, spa (+1 more)

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
Cohesion: 0.15
Nodes (19): checkLayout(), checkMigrations(), checkSources(), doctor(), DoctorReport, Finding, IGNORED_DIRS, SECRET_PATTERNS (+11 more)

### Community 46 - "20_app_isolation.test.sql"
Cohesion: 0.50
Nodes (3): app_haushalt.entries, app_pinnwand.notes, app_rezepte.recipes

### Community 49 - "deploy/index.ts"
Cohesion: 0.17
Nodes (21): deployApp(), devApp(), ensureSdkBundle(), exposeLocally(), KIT, kitFonts(), NOT_SERVED, REPO_ROOT (+13 more)

### Community 68 - "backup.js"
Cohesion: 0.23
Nodes (14): BK, bkStatus(), blobToDataURL(), dataURLToBlob(), exportData(), importData(), legacyRange(), sanitizeAct() (+6 more)

### Community 78 - "bin.ts"
Cohesion: 0.17
Nodes (16): envFlag(), flag(), main(), ROOT, appsFromPaths(), changedApps(), DeployEnv, DeployOptions (+8 more)

### Community 79 - "Workshop.tsx"
Cohesion: 0.07
Nodes (44): BuildFile, FILES, LIBRARY, modules, types, ACCENTS, approxTokens(), Audience (+36 more)

### Community 80 - "ADR 0003: Construction prompts, app kit and the suite build order"
Cohesion: 0.25
Nodes (7): 1. Construction prompt library ("Konstruktions-Prompts"), 2. App kit (design system for apps), 3. Build order, ADR 0003: Construction prompts, app kit and the suite build order, Consequences, Context, Decision

### Community 81 - "20260928100740_app_identity.sql"
Cohesion: 0.28
Nodes (4): app_origins_app_slug_idx, platform.app_origins, platform.calling_app(), platform.apps

### Community 82 - "deploy.test.ts"
Cohesion: 0.23
Nodes (10): ADR-0002, parsed, production, environmentSettings, required(), appRow(), registerApp(), COMPATIBILITY_DATE (+2 more)

### Community 83 - "ref_node_fs"
Cohesion: 0.18
Nodes (10): jsonSchema, target, manifestSchema, ref_node_fs, ref_node_url, body, match, source (+2 more)

### Community 84 - "supabase"
Cohesion: 0.26
Nodes (17): listAuthenticators(), needsAal2(), deletePasskey(), listPasskeys(), PasskeyInfo, registerPasskey(), renamePasskey(), signInWithPasskey() (+9 more)

### Community 86 - "ui.js"
Cohesion: 0.33
Nodes (5): closeCurrent(), onKey(), open(), toast(), toastRegion()

### Community 87 - "preview.js"
Cohesion: 0.50
Nodes (3): current, levels, saved

### Community 88 - "Users.tsx"
Cohesion: 0.10
Nodes (40): dateTime(), euro(), EXTERNAL, LINKS, Ai(), Apps(), STATUS, TARGET (+32 more)

### Community 90 - "api/src/index.ts"
Cohesion: 0.20
Nodes (9): enabled, RFC-6238, ApiEnv, app, maintenance(), scheduled(), adminClient(), remote (+1 more)

### Community 91 - "hooks.ts"
Cohesion: 0.23
Nodes (13): AUTH_COPY, authEmail(), AuthEmailAction, Email, escapeHtml(), inviteEmail(), layout(), buildMessages() (+5 more)

### Community 92 - "lib/auth.ts"
Cohesion: 0.20
Nodes (12): AppContext, problem(), Requirements, requireUser(), verifierFor(), createInvite, invites, packages_gate_src_index_createverifier (+4 more)

### Community 93 - "worker.ts"
Cohesion: 0.19
Nodes (15): fetch(), portalConfig(), supabaseGrantChecker(), contentSecurityPolicy(), CspOptions, securityHeaders(), withHeaders(), packages_gate_src_index_securityheaders (+7 more)

### Community 94 - "portal/src/main.tsx"
Cohesion: 0.16
Nodes (17): BudgetRow, SCOPE_LABEL, UsageRow, loadConfig(), PortalConfig, setRuntimeConfig(), initApi(), initSupabase() (+9 more)

### Community 95 - "20260928132539_mfa_enforcement.sql"
Cohesion: 0.22
Nodes (7): auth.mfa_factors, platform.app_grants, platform.custom_access_token_hook(), platform.has_grant(), platform.mfa_satisfied(), platform.apps, platform.profiles

### Community 96 - "standard-webhooks.ts"
Cohesion: 0.52
Nodes (6): base64ToBytes(), bytesToBase64(), secretBytes(), sign(), timingSafeEqual(), verify()

### Community 97 - "src/auth.ts"
Cohesion: 0.24
Nodes (11): forbiddenPage(), forwardAuth(), ForwardAuthOptions, pick(), slugFromHost(), GrantChecker, isNavigation(), packages_gate_src_index_decide (+3 more)

### Community 98 - "AccountSecurity.tsx"
Cohesion: 0.13
Nodes (24): CodeForm(), connectGoogle(), disconnectGoogle(), googleEnabled(), googleErrorFromUrl(), googleIdentity(), returnUrl(), errorFor() (+16 more)

### Community 99 - "haushalt/mininode.json"
Cohesion: 0.17
Nodes (11): access, default, data, mode, description, kind, name, $schema (+3 more)

### Community 100 - "sportplaner/mininode.json"
Cohesion: 0.17
Nodes (11): access, default, data, mode, description, kind, name, $schema (+3 more)

### Community 104 - "Haushalt"
Cohesion: 0.33
Nodes (5): Check, Data, Haushalt, Tests, What it does

### Community 105 - "Sportplaner"
Cohesion: 0.40
Nodes (4): Check, Moving data over from the artifact, Origin, Sportplaner

### Community 108 - "activity.test.ts"
Cohesion: 0.38
Nodes (4): AuditRow, describeActivity(), ROLE, names

### Community 109 - "8. Platform SDK (`@mininode/sdk`)"
Cohesion: 0.25
Nodes (5): app(), Development, @mininode/sdk, requireLogin(), 8. Platform SDK (`@mininode/sdk`)

## Knowledge Gaps
- **409 isolated node(s):** `supabase`, `cloudflare-docs`, `context7`, `npx`, `@playwright/mcp` (+404 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 609 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **58 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `platform()` connect `Users.tsx` to `Login.tsx`, `20260923000100_platform_core.sql`, `Home.tsx`, `MiniNode.app — Project Plan (v2)`, `supabase`, `platform.app_kv`, `portal/src/main.tsx`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._
- **Why does `base()` connect `Home.tsx` to `remote.ts`, `First setup`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Why does `platform.notifications` connect `20260923000100_platform_core.sql` to `Users.tsx`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **What connects `supabase`, `cloudflare-docs`, `context7` to the rest of the system?**
  _409 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Login.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.1431451612903226 - nodes in this community are weakly interconnected._
- **Should `Suite data types (catalog)` be split into smaller, more focused modules?**
  _Cohesion score 0.11764705882352941 - nodes in this community are weakly interconnected._
- **Should `decide.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.14492753623188406 - nodes in this community are weakly interconnected._