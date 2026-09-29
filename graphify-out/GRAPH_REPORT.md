# Graph Report - PrivateAppHosting  (2026-09-29)

## Corpus Check
- 317 files · ~166,769 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 35 file(s) not represented in the graph (top: (none) 10, .css 9, .jsonc 3)

## Summary
- 2042 nodes · 4134 edges · 168 communities (88 shown, 80 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 92 edges (avg confidence: 0.9)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `83698505`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- portal/src/main.tsx
- Suite data types (catalog)
- remote.ts
- decide.ts
- ai-proxy/src/index.ts
- schema.ts
- 20260923000100_platform_core.sql
- TopBar.tsx
- playbooks/README.md
- sdk/src/index.ts
- rezeptideen/mininode.json
- MiniNode.app — Project Plan (v2)
- wunschliste/app.js
- notizen/mininode.json
- runtimes.ts
- lib/push.ts
- seed.ts
- 20260923000300_ai_budget.sql
- control.test.ts
- platform.remote_sessions
- hallo/mininode.json
- haushalt/app.js
- MiniNode App Kit: design system for hosted apps
- platform.app_kv
- core.js
- createMininode
- apis.ts
- First setup
- bootstrap.sh
- Hypervisor
- editor.js
- rezeptideen/src/main.tsx
- nucbox-deploy
- kb.sh
- views.js
- deploy.test.ts
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
- worker.ts
- ref_node_fs
- supabase
- ui.test.ts
- ui.js
- preview.js
- platform
- ref_supabase_supabase_js
- 20260928145158_push_notifications.sql
- 20260929082657_app_catalog.sql
- main.ts
- Users.tsx
- 20260928132539_mfa_enforcement.sql
- Scheduler
- server.ts
- auth/google.ts
- haushalt/mininode.json
- sportplaner/mininode.json
- ai.md
- calendar.md
- collaboration.md
- Haushalt
- Sportplaner
- ci-clean-secret.sh
- files.md
- offline.ts
- ExternalApiError
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
- routes/push.ts
- sonstiges.md
- spiel.md
- tracker.md
- webpush.ts
- README.md
- ref_vitest
- runbooks/README.md
- AuthProvider.tsx
- ADR 0004: Google services (Gmail, Calendar) for hosted apps
- NucBox install (Proxmox, Linux VM, Windows VM)
- Restore
- MiniNode.app
- assets/sw.js
- 20260928143037_google_grants.sql
- forms.md
- keyboard.md
- lists.md
- public/sw.js
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
- vapid-keys.ts
- 3. Architecture
- http-ece.d.ts
- rework.md
- familie.md
- lernen.md
- reisen.md
- werkzeug.md
- pwa.js
- 20260929073053_api_keys.sql
- ref_node_path
- ADR 0007: App catalog on the start page
- 001_init.sql
- wunschliste/mininode.json

## God Nodes (most connected - your core abstractions)
1. `platform()` - 45 edges
2. `supabase()` - 42 edges
3. `h()` - 27 edges
4. `editBooking()` - 24 edges
5. `useAuth()` - 22 edges
6. `useStepUp()` - 22 edges
7. `api()` - 20 edges
8. `viewOverview()` - 20 edges
9. `previewImport()` - 20 edges
10. `render()` - 19 edges

## Surprising Connections (you probably didn't know these)
- `8. Home, family and everyday life` --references--> `maintenance()`  [INFERRED]
  docs/suite/data-types.md → apps/api/src/index.ts
- `Windows VM` --references--> `base()`  [INFERRED]
  docs/runbooks/restore.md → apps/portal/src/components/icons.tsx
- `Rules` --references--> `supabase()`  [INFERRED]
  CLAUDE.md → apps/portal/src/lib/supabase.ts
- `6. Components` --references--> `today()`  [INFERRED]
  docs/ai/DESIGN-SYSTEM.md → hosted/haushalt/app.js
- `5. First deploy and first login` --references--> `main()`  [INFERRED]
  docs/runbooks/first-setup.md → packages/cli/src/bin.ts

## Import Cycles
- None detected.

## Communities (168 total, 80 thin omitted)

### Community 0 - "portal/src/main.tsx"
Cohesion: 0.08
Nodes (33): AdminLayout(), euro(), EXTERNAL, LINKS, useMissingKeys(), BudgetRow, SCOPE_LABEL, UsageRow (+25 more)

### Community 1 - "Suite data types (catalog)"
Cohesion: 0.12
Nodes (16): 10. Games (including multiplayer), 11. Platform and meta types, 1. Self-organisation, 2. Office and collaboration, 3. CRM and sales, 4. Finance, 5. Places, travel and media, 6. Archive and collections (books, films, music, games, …) (+8 more)

### Community 2 - "remote.ts"
Cohesion: 0.15
Nodes (18): clientIdentifier(), encryptAuthPayload(), GuacAuthPayload, GuacConnection, hexToBytes(), lockDownParameters(), base64ToBytes(), bytesToBase64() (+10 more)

### Community 3 - "decide.ts"
Cohesion: 0.15
Nodes (16): decide(), DecideInput, Decision, loginUrl(), refreshUrl(), url, base64UrlToString(), parseCookies() (+8 more)

### Community 4 - "ai-proxy/src/index.ts"
Cohesion: 0.09
Nodes (33): app, AppAi, appCache, buildDeps(), createApp(), defaultDeps(), Deps, originMatchesApp() (+25 more)

### Community 5 - "schema.ts"
Cohesion: 0.07
Nodes (27): accessSchema, AiModel, aiModelSchema, aiSchema, apiAuthSchema, ApiService, apiServiceSchema, buildSchema (+19 more)

### Community 6 - "20260923000100_platform_core.sql"
Cohesion: 0.12
Nodes (24): platform.handle_new_user, app_grants_app_slug_idx, apps_touch, audit_log_at_idx, invites_created_by_idx, invites_one_open_per_email_idx, notifications_app_slug_idx, notifications_user_unread_idx (+16 more)

### Community 7 - "TopBar.tsx"
Cohesion: 0.15
Nodes (24): AppsIcon(), base(), BellIcon(), ExternalIcon(), GoogleMark(), IconProps, MoonIcon(), PinIcon() (+16 more)

### Community 8 - "playbooks/README.md"
Cohesion: 0.13
Nodes (11): Playbook: Google AI Studio export, Playbook: Claude artifact, Common steps (every playbook ends here), Playbook: any other stack with a Dockerfile, Playbook: native program (Windows / Android), Playbook: Next.js, Playbook: Node server (runs on the NucBox), Playbook: Python server (runs on the NucBox) (+3 more)

### Community 9 - "sdk/src/index.ts"
Cohesion: 0.10
Nodes (17): AiChatOptions, AiMessage, AiModel, TokenSource, appSchema(), assertConfig(), loadConfig(), REQUIRED (+9 more)

### Community 10 - "rezeptideen/mininode.json"
Cohesion: 0.11
Nodes (18): access, default, ai, maxOutputTokens, models, monthlyBudgetEur, build, command (+10 more)

### Community 11 - "MiniNode.app — Project Plan (v2)"
Cohesion: 0.14
Nodes (16): user(), 10. Remote apps, 11. AI proxy, 12. UI, 13. Repository layout, 14. Engineering standards, 15. Phases, 16. Review log (v1 → v2) (+8 more)

### Community 12 - "wunschliste/app.js"
Cohesion: 0.12
Nodes (41): euro(), parseLink(), parsePrice(), titleFromPath(), cancel(), dateLabel(), details(), field() (+33 more)

### Community 13 - "notizen/mininode.json"
Cohesion: 0.12
Nodes (16): ai, maxOutputTokens, models, monthlyBudgetEur, build, command, output, data (+8 more)

### Community 14 - "runtimes.ts"
Cohesion: 0.15
Nodes (13): bool, Config, loadConfig(), schema, createScheduler(), prepareWine(), GuacConnection, PrepareRequest (+5 more)

### Community 15 - "lib/push.ts"
Cohesion: 0.17
Nodes (21): applicationServerKey(), deviceStatus, disablePush(), enablePush(), isIos(), isStandalone(), listenForRenewals(), owner() (+13 more)

### Community 16 - "seed.ts"
Cohesion: 0.13
Nodes (19): ADR-0007, month, year, base32(), freshCode(), totp(), RFC-6238, ADR-0005 (+11 more)

### Community 17 - "20260923000300_ai_budget.sql"
Cohesion: 0.20
Nodes (10): ai_usage_app_month_idx, ai_usage_open_idx, ai_usage_user_month_idx, platform.ai_budgets, platform.ai_spent_micro(), platform.ai_usage, platform.my_ai_budget(), auth.users (+2 more)

### Community 18 - "control.test.ts"
Cohesion: 0.10
Nodes (24): config, TOKEN, ContainerInfo, demuxLogs(), dockerEngine, RunSpec, createInstaller(), runWindows() (+16 more)

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

### Community 25 - "createMininode"
Cohesion: 0.13
Nodes (16): AiError, createAi(), createApi(), config, TokenSource, ADR-0006, MininodeConfig, createGoogle() (+8 more)

### Community 26 - "apis.ts"
Cohesion: 0.09
Nodes (21): apis, audit(), Auth, FORWARD_REQUEST, FORWARD_RESPONSE, keySchema, log(), ProxyContext (+13 more)

### Community 27 - "First setup"
Cohesion: 0.20
Nodes (11): 1. Cloudflare: domain and deploy token (5 min), 2. Supabase: two values and one click (5 min), 3.1 Google sign-in (optional, 10 min), 3. GitHub secrets (3 min), 4. Apps, 5. First deploy and first login, 6. NucBox (later), Already done (+3 more)

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
Cohesion: 0.15
Nodes (22): applyLocal(), H, persist(), removeAct(), toast(), togglePlan(), agendaItemHTML(), countLabel() (+14 more)

### Community 35 - "deploy.test.ts"
Cohesion: 0.11
Nodes (19): ADR-0002, parsed, production, Call, env, hosted, appRow(), registerApp() (+11 more)

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
Nodes (17): checkLayout(), checkMigrations(), checkSources(), doctor(), DoctorReport, Finding, IGNORED_DIRS, SECRET_PATTERNS (+9 more)

### Community 43 - "routes/google.ts"
Cohesion: 0.13
Nodes (21): problem(), aesKey(), base64(), GoogleAccessToken, googleAccount(), GoogleError, GoogleSettings, refreshAccessToken() (+13 more)

### Community 46 - "20_app_isolation.test.sql"
Cohesion: 0.50
Nodes (3): app_haushalt.entries, app_pinnwand.notes, app_rezepte.recipes

### Community 49 - "deploy/index.ts"
Cohesion: 0.16
Nodes (22): checkDatabaseSettings(), deployApp(), devApp(), ensureSdkBundle(), exposeLocally(), KIT, kitFonts(), NOT_SERVED (+14 more)

### Community 50 - "api/src/index.ts"
Cohesion: 0.12
Nodes (28): AUTH_COPY, authEmail(), AuthEmailAction, Email, escapeHtml(), inviteEmail(), layout(), maintenance() (+20 more)

### Community 68 - "backup.js"
Cohesion: 0.23
Nodes (14): BK, bkStatus(), blobToDataURL(), dataURLToBlob(), exportData(), importData(), legacyRange(), sanitizeAct() (+6 more)

### Community 78 - "bin.ts"
Cohesion: 0.16
Nodes (18): envFlag(), flag(), main(), ROOT, appsFromPaths(), changedApps(), DeployEnv, environmentSettings (+10 more)

### Community 79 - "Workshop.tsx"
Cohesion: 0.06
Nodes (45): BuildFile, FILES, LIBRARY, modules, types, ACCENTS, approxTokens(), Audience (+37 more)

### Community 80 - "ADR 0003: Construction prompts, app kit and the suite build order"
Cohesion: 0.25
Nodes (7): 1. Construction prompt library ("Konstruktions-Prompts"), 2. App kit (design system for apps), 3. Build order, ADR 0003: Construction prompts, app kit and the suite build order, Consequences, Context, Decision

### Community 81 - "20260928100740_app_identity.sql"
Cohesion: 0.28
Nodes (4): app_origins_app_slug_idx, platform.app_origins, platform.calling_app(), platform.apps

### Community 82 - "worker.ts"
Cohesion: 0.11
Nodes (28): fetch(), portalConfig(), isNavigation(), supabaseGrantChecker(), contentSecurityPolicy(), CspOptions, securityHeaders(), withHeaders() (+20 more)

### Community 83 - "ref_node_fs"
Cohesion: 0.15
Nodes (11): init, jsonSchema, target, manifestSchema, ref_node_fs, ref_node_url, body, match (+3 more)

### Community 84 - "supabase"
Cohesion: 0.13
Nodes (36): useAuth(), googleEnabled(), googleErrorFromUrl(), googleHandOverDone(), calls, errorFor(), needsAal2(), deletePasskey() (+28 more)

### Community 86 - "ui.js"
Cohesion: 0.33
Nodes (5): closeCurrent(), onKey(), open(), toast(), toastRegion()

### Community 87 - "preview.js"
Cohesion: 0.50
Nodes (3): current, levels, saved

### Community 88 - "platform"
Cohesion: 0.10
Nodes (44): Apps(), Person, RESERVED, STATUS, TARGET, Catalog(), idFor(), ADR-0007 (+36 more)

### Community 90 - "ref_supabase_supabase_js"
Cohesion: 0.10
Nodes (20): enabled, RFC-6238, enabled, ADR-0006, ApiEnv, ADR-0004, ADR-0005, ADR-0006 (+12 more)

### Community 91 - "20260928145158_push_notifications.sql"
Cohesion: 0.13
Nodes (17): platform.notifications, notifications_push_pending_idx, platform.push_device_count(), platform.push_list(), platform.push_release_due(), platform.push_schedule(), platform.push_subscribe(), platform.push_subscriptions (+9 more)

### Community 92 - "20260929082657_app_catalog.sql"
Cohesion: 0.09
Nodes (19): platform.app_categories, platform.apps_auto_category, platform.recategorize_apps, app_categories_recategorize, app_favorites_app_slug_idx, app_opens_app_slug_idx, app_set_items_app_slug_idx, apps_auto_category (+11 more)

### Community 93 - "main.ts"
Cohesion: 0.10
Nodes (20): app, config, containerResources, docker, hostResources, hypervisor, reaper, scheduler (+12 more)

### Community 94 - "Users.tsx"
Cohesion: 0.09
Nodes (33): dateTime(), Ai(), ApiKeys(), Auth, placement(), RequestRow, ServiceRow, ADR-0006 (+25 more)

### Community 95 - "20260928132539_mfa_enforcement.sql"
Cohesion: 0.22
Nodes (7): auth.mfa_factors, platform.custom_access_token_hook(), platform.has_grant(), platform.mfa_satisfied(), platform.app_grants, platform.apps, platform.profiles

### Community 96 - "Scheduler"
Cohesion: 0.20
Nodes (6): @mininode/nucbox-control, Scheduler, ADR 0005: Push notifications, installable apps and offline data, Consequences, Context, Decision

### Community 97 - "server.ts"
Cohesion: 0.12
Nodes (21): cachedGrants(), forbiddenPage(), forwardAuth(), ForwardAuthOptions, pick(), slugFromHost(), Installer, ResourceReport (+13 more)

### Community 98 - "auth/google.ts"
Cohesion: 0.11
Nodes (31): CodeForm(), connectGoogle(), disconnectGoogle(), GOOGLE_CONNECTED, googleIdentity(), googleServices, grantedForOtherUser(), grantGoogleServices() (+23 more)

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

### Community 108 - "offline.ts"
Cohesion: 0.12
Nodes (21): Feature: offline use and sync, createKv(), failure(), Json, KvScope, createOfflineKv(), exclusive(), indexedDbStore() (+13 more)

### Community 109 - "ExternalApiError"
Cohesion: 0.12
Nodes (12): ADR 0006: Host-level API keys for external APIs, Consequences, Context, Decision, Converting an existing app, Feature: External APIs with host-level keys, app(), Development (+4 more)

### Community 120 - "routes/push.ts"
Cohesion: 0.21
Nodes (16): adminClient(), PushSubscription, googleLinked(), absoluteUrl(), ClaimedNotification, deliverPushes(), Job, lastTest (+8 more)

### Community 125 - "webpush.ts"
Cohesion: 0.20
Nodes (17): concat(), ecdhWith(), encoder, EncryptOptions, encryptPayload(), fromBase64Url(), hkdf(), p256Jwk() (+9 more)

### Community 126 - "README.md"
Cohesion: 0.29
Nodes (4): Agent instructions, MiniNode, Repository, Start here

### Community 127 - "ref_vitest"
Cohesion: 0.12
Nodes (8): answer, config, ADR-0005, user, cookieSessionUserId(), session, ADR-0005, ref_vitest

### Community 128 - "runbooks/README.md"
Cohesion: 0.25
Nodes (3): Add an app, Key rotation, Runbooks

### Community 129 - "AuthProvider.tsx"
Cohesion: 0.18
Nodes (11): AuthContext, AuthProvider(), AuthState, Profile, Role, handOverGoogleGrant(), codeRequired(), forgetOfflineCopies() (+3 more)

### Community 130 - "ADR 0004: Google services (Gmail, Calendar) for hosted apps"
Cohesion: 0.33
Nodes (5): ADR 0004: Google services (Gmail, Calendar) for hosted apps, Consequences, Context, Decision, Limits

### Community 131 - "NucBox install (Proxmox, Linux VM, Windows VM)"
Cohesion: 0.40
Nodes (4): 1. Proxmox VE, 2. Linux VM (id 100), 4. Verify, NucBox install (Proxmox, Linux VM, Windows VM)

### Community 132 - "Restore"
Cohesion: 0.33
Nodes (6): Database (Supabase), One app's data on the NucBox, Restore, Whole NucBox lost, Windows VM, Wine prefix of a remote app

### Community 133 - "MiniNode.app"
Cohesion: 0.22
Nodes (8): Commands, Knowledge graph (graphify), Layout, MiniNode.app, Rules, UI, @mininode/cli — `pnpm mininode`, manifest()

### Community 134 - "assets/sw.js"
Cohesion: 0.40
Nodes (4): cacheable(), fromNetwork(), ADR-0005, PRECACHE

### Community 135 - "20260928143037_google_grants.sql"
Cohesion: 0.40
Nodes (4): google_grants_touch, platform.google_grants, auth.users, platform.touch_updated_at

### Community 151 - "vapid-keys.ts"
Cohesion: 0.40
Nodes (3): pair, raw, ADR-0005

### Community 152 - "3. Architecture"
Cohesion: 0.67
Nodes (3): 3.1 Hosting targets, 3.2 NucBox (16 GB), 3. Architecture

### Community 161 - "20260929073053_api_keys.sql"
Cohesion: 0.31
Nodes (9): api_services_key_updated_by_idx, api_services_touch, app_api_services_service_id_idx, platform.api_services, platform.app_api_services, platform.register_app_apis(), auth.users, platform.apps (+1 more)

### Community 162 - "ref_node_path"
Cohesion: 0.24
Nodes (4): ref_node_path, ref_tailwindcss_vite, ref_vite, ref_vitejs_plugin_react

### Community 164 - "ADR 0007: App catalog on the start page"
Cohesion: 0.40
Nodes (4): ADR 0007: App catalog on the start page, Consequences, Context, Decision

### Community 165 - "001_init.sql"
Cohesion: 0.26
Nodes (11): app_wunschliste.touch, app_wunschliste.people(), app_wunschliste.reservations, app_wunschliste.reserve(), app_wunschliste.wishes, app_wunschliste.wishlist(), reservations_recipient_id_idx, auth (+3 more)

### Community 166 - "wunschliste/mininode.json"
Cohesion: 0.17
Nodes (11): access, default, data, mode, description, kind, name, $schema (+3 more)

## Knowledge Gaps
- **555 isolated node(s):** `supabase`, `cloudflare-docs`, `context7`, `npx`, `@playwright/mcp` (+550 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 845 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **80 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `platform()` connect `platform` to `portal/src/main.tsx`, `AuthProvider.tsx`, `20260929073053_api_keys.sql`, `20260923000100_platform_core.sql`, `TopBar.tsx`, `MiniNode.app — Project Plan (v2)`, `lib/push.ts`, `supabase`, `platform.app_kv`, `20260928145158_push_notifications.sql`, `Users.tsx`?**
  _High betweenness centrality (0.074) - this node is a cross-community bridge._
- **Why does `platform.notifications` connect `20260923000100_platform_core.sql` to `platform`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **What connects `supabase`, `cloudflare-docs`, `context7` to the rest of the system?**
  _555 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `portal/src/main.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.08484848484848485 - nodes in this community are weakly interconnected._
- **Should `Suite data types (catalog)` be split into smaller, more focused modules?**
  _Cohesion score 0.11764705882352941 - nodes in this community are weakly interconnected._
- **Should `remote.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.14624505928853754 - nodes in this community are weakly interconnected._
- **Should `ai-proxy/src/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08748615725359911 - nodes in this community are weakly interconnected._