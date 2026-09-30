# Graph Report - PrivateAppHosting  (2026-09-30)

## Corpus Check
- 373 files · ~220,382 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 39 file(s) not represented in the graph (top: .css 12, (none) 11, .jsonc 3)

## Summary
- 2507 nodes · 5229 edges · 200 communities (118 shown, 82 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 128 edges (avg confidence: 0.9)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `83144bd3`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- portal/src/main.tsx
- Suite data types (catalog)
- lib.test.ts
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
- AuthProvider.tsx
- seed.ts
- 20260923000300_ai_budget.sql
- install.ts
- platform.remote_sessions
- hallo/mininode.json
- haushalt/app.js
- MiniNode App Kit: design system for hosted apps
- platform.app_kv
- core.js
- mininode
- apis.ts
- First setup
- bootstrap.sh
- Hypervisor
- editor.js
- rezeptideen/src/main.tsx
- nucbox-deploy
- kb.sh
- views.js
- prune.test.ts
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
- hooks.ts
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
- game
- backup.js
- 20260923000800_app_migrations.sql
- bin.ts
- Workshop.tsx
- Users.tsx
- 20260928100740_app_identity.sql
- worker.ts
- emit-json-schema.ts
- supabase
- ui.test.ts
- ui.js
- preview.js
- platform
- api/src/index.ts
- 20260928145158_push_notifications.sql
- 20260929082657_app_catalog.sql
- resources.ts
- NucBox.tsx
- 20260928132539_mfa_enforcement.sql
- Scheduler
- server.ts
- auth/google.ts
- haushalt/mininode.json
- sportplaner/mininode.json
- ai.md
- calendar.md
- at
- settings
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
- leaflet.js
- buero.md
- crm.md
- finanzen.md
- App.tsx
- sonstiges.md
- memory/app.js
- tracker.md
- routes/push.ts
- README.md
- ref_vitest
- runbooks/README.md
- 20260929141832_game_hub.sql
- ADR 0004: Google services (Gmail, Calendar) for hosted apps
- map.js
- Restore
- manifest
- assets/sw.js
- 20260928143037_google_grants.sql
- forms.md
- k
- lists.md
- public/sw.js
- onboarding.md
- performance.md
- print.md
- privacy.md
- providers.ts
- scanning.md
- search.md
- sharing.md
- timer.md
- undo.md
- vapid-keys.ts
- types/index.ts
- http-ece.d.ts
- rework.md
- familie.md
- lernen.md
- Games.tsx
- werkzeug.md
- pwa.js
- 20260929073053_api_keys.sql
- ref_node_fs
- ADR 0007: App catalog on the start page
- 001_init.sql
- wunschliste/mininode.json
- mediaApis.ts
- ListenView.tsx
- lib/auth.ts
- deploy.test.ts
- memory/mininode.json
- ref_react
- medialog/mininode.json
- MediaItem
- main.ts
- google.integration.test.ts
- gate/src/index.ts
- game.ts
- control.test.ts
- You are building an app for MiniNode
- p
- dockerEngine
- bi
- 001_shares.sql
- ADR 0008: People directory for sharing inside an app
- 3. Tokens
- platform.app_people
- main.jsx
- mediaApis.test.ts
- m
- Jt
- oi
- game-levels.md
- game-loop.md
- game-opponent.md

## God Nodes (most connected - your core abstractions)
1. `platform()` - 50 edges
2. `supabase()` - 42 edges
3. `h()` - 27 edges
4. `MediaItem` - 27 edges
5. `editBooking()` - 24 edges
6. `searchMediaApis()` - 23 edges
7. `useAuth()` - 22 edges
8. `useStepUp()` - 22 edges
9. `api()` - 20 edges
10. `viewOverview()` - 20 edges

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

## Communities (200 total, 82 thin omitted)

### Community 0 - "portal/src/main.tsx"
Cohesion: 0.08
Nodes (33): AdminLayout(), euro(), EXTERNAL, LINKS, useMissingKeys(), BudgetRow, SCOPE_LABEL, UsageRow (+25 more)

### Community 1 - "Suite data types (catalog)"
Cohesion: 0.12
Nodes (16): 10. Games (including multiplayer), 11. Platform and meta types, 1. Self-organisation, 2. Office and collaboration, 3. CRM and sales, 4. Finance, 5. Places, travel and media, 6. Archive and collections (books, films, music, games, …) (+8 more)

### Community 2 - "lib.test.ts"
Cohesion: 0.24
Nodes (12): clientIdentifier(), encryptAuthPayload(), GuacAuthPayload, GuacConnection, hexToBytes(), lockDownParameters(), base64ToBytes(), bytesToBase64() (+4 more)

### Community 3 - "decide.ts"
Cohesion: 0.15
Nodes (16): decide(), DecideInput, Decision, loginUrl(), refreshUrl(), url, base64UrlToString(), parseCookies() (+8 more)

### Community 4 - "ai-proxy/src/index.ts"
Cohesion: 0.14
Nodes (18): app, AppAi, appCache, createApp(), Deps, originMatchesApp(), problem(), ProxyEnv (+10 more)

### Community 5 - "schema.ts"
Cohesion: 0.06
Nodes (30): accessSchema, AiModel, aiModelSchema, aiSchema, apiAuthSchema, ApiService, apiServiceSchema, buildSchema (+22 more)

### Community 6 - "20260923000100_platform_core.sql"
Cohesion: 0.12
Nodes (24): platform.handle_new_user, app_grants_app_slug_idx, apps_touch, audit_log_at_idx, invites_created_by_idx, invites_one_open_per_email_idx, notifications_app_slug_idx, notifications_user_unread_idx (+16 more)

### Community 7 - "TopBar.tsx"
Cohesion: 0.14
Nodes (25): AppsIcon(), base(), BellIcon(), ExternalIcon(), GamepadIcon(), GoogleMark(), IconProps, MoonIcon() (+17 more)

### Community 8 - "playbooks/README.md"
Cohesion: 0.09
Nodes (19): 1. Construction prompt library ("Konstruktions-Prompts"), 2. App kit (design system for apps), 3. Build order, ADR 0003: Construction prompts, app kit and the suite build order, Consequences, Context, Decision, Playbook: Google AI Studio export (+11 more)

### Community 9 - "sdk/src/index.ts"
Cohesion: 0.10
Nodes (18): AiChatOptions, AiMessage, AiModel, TokenSource, appSchema(), assertConfig(), loadConfig(), REQUIRED (+10 more)

### Community 10 - "rezeptideen/mininode.json"
Cohesion: 0.11
Nodes (18): access, default, ai, maxOutputTokens, models, monthlyBudgetEur, build, command (+10 more)

### Community 11 - "MiniNode.app — Project Plan (v2)"
Cohesion: 0.12
Nodes (19): user(), 10. Remote apps, 11. AI proxy, 12. UI, 13. Repository layout, 14. Engineering standards, 15. Phases, 16. Review log (v1 → v2) (+11 more)

### Community 12 - "wunschliste/app.js"
Cohesion: 0.12
Nodes (41): euro(), parseLink(), parsePrice(), titleFromPath(), cancel(), dateLabel(), details(), field() (+33 more)

### Community 13 - "notizen/mininode.json"
Cohesion: 0.12
Nodes (16): ai, maxOutputTokens, models, monthlyBudgetEur, build, command, output, data (+8 more)

### Community 14 - "runtimes.ts"
Cohesion: 0.15
Nodes (13): bool, Config, loadConfig(), schema, createScheduler(), prepareWine(), GuacConnection, PrepareRequest (+5 more)

### Community 15 - "AuthProvider.tsx"
Cohesion: 0.11
Nodes (30): AuthContext, AuthProvider(), AuthState, Profile, Role, handOverGoogleGrant(), scrubProviderTokens(), forgetOfflineCopies() (+22 more)

### Community 16 - "seed.ts"
Cohesion: 0.10
Nodes (23): ADR-0007, ADR-0009, username, month, year, lena, tom, base32() (+15 more)

### Community 17 - "20260923000300_ai_budget.sql"
Cohesion: 0.20
Nodes (10): ai_usage_app_month_idx, ai_usage_open_idx, ai_usage_user_month_idx, platform.ai_budgets, platform.ai_spent_micro(), platform.ai_usage, platform.my_ai_budget(), auth.users (+2 more)

### Community 18 - "install.ts"
Cohesion: 0.21
Nodes (15): createInstaller(), runWindows(), runWine(), signOrFail(), defaultSilentArgs(), encodePowerShell(), InstallJob, InstallRequest (+7 more)

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
Cohesion: 0.14
Nodes (12): 10. Do not, 11. Checklist before handover, 1. How an app uses the kit, 2. Principles, 4. Dark mode, 5. App shell, 6. Components, 7. Screen patterns (+4 more)

### Community 23 - "platform.app_kv"
Cohesion: 0.24
Nodes (8): app_kv_owner_idx, app_kv_touch, app_kv_unique_idx, platform.app_kv, auth, auth.users, platform.apps, platform.touch_updated_at

### Community 24 - "core.js"
Cohesion: 0.06
Nodes (53): actActive(), addDays(), buildIndex(), byStart(), courseDates(), dataChanged(), dayCache, DAYS (+45 more)

### Community 25 - "mininode"
Cohesion: 0.13
Nodes (17): AiError, createAi(), createApi(), config, TokenSource, ADR-0006, MininodeConfig, createGame() (+9 more)

### Community 26 - "apis.ts"
Cohesion: 0.12
Nodes (14): apis, audit(), Auth, FORWARD_REQUEST, FORWARD_RESPONSE, keySchema, log(), ProxyContext (+6 more)

### Community 27 - "First setup"
Cohesion: 0.22
Nodes (9): 1. Cloudflare: domain and deploy token (5 min), 2. Supabase: two values and one click (5 min), 3.1 Google sign-in (optional, 10 min), 3. GitHub secrets (3 min), 4. Apps, 5. First deploy and first login, 6. NucBox (later), Already done (+1 more)

### Community 28 - "bootstrap.sh"
Cohesion: 0.50
Nodes (6): access_app(), cf(), log(), service_token(), bootstrap.sh script, warn()

### Community 30 - "editor.js"
Cohesion: 0.08
Nodes (38): addPhotos(), BLOCK_HANDLERS, blockHead(), blocksToSlots(), blockTitle(), cancelEdit(), collectForm(), courseFieldSync() (+30 more)

### Community 31 - "rezeptideen/src/main.tsx"
Cohesion: 0.43
Nodes (5): App(), root, Recipe, suggestRecipes(), fixtures_ai_studio_expected_rezeptideen_src_styles

### Community 32 - "nucbox-deploy"
Cohesion: 0.67
Nodes (6): nucbox-deploy script, die(), digest_ok(), log(), probe(), verify()

### Community 34 - "views.js"
Cohesion: 0.11
Nodes (29): applyLocal(), H, persist(), removeAct(), toast(), togglePlan(), timeLabel(), closeSheet() (+21 more)

### Community 35 - "prune.test.ts"
Cohesion: 0.20
Nodes (8): ADR-0002, Call, env, hosted, appRow(), registerApp(), ADR-0006, packages_manifest_src_index_manifest

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
Cohesion: 0.12
Nodes (22): checkLayout(), checkMigrations(), checkSources(), doctor(), DoctorReport, Finding, IGNORED_DIRS, SECRET_PATTERNS (+14 more)

### Community 43 - "routes/google.ts"
Cohesion: 0.13
Nodes (19): aesKey(), base64(), GoogleAccessToken, googleAccount(), GoogleError, GoogleSettings, refreshAccessToken(), revoke() (+11 more)

### Community 46 - "20_app_isolation.test.sql"
Cohesion: 0.50
Nodes (3): app_haushalt.entries, app_pinnwand.notes, app_rezepte.recipes

### Community 49 - "deploy/index.ts"
Cohesion: 0.14
Nodes (24): DeployEnv, checkDatabaseSettings(), deployApp(), DeployOptions, devApp(), ensureSdkBundle(), exposeLocally(), KIT (+16 more)

### Community 50 - "hooks.ts"
Cohesion: 0.18
Nodes (17): AUTH_COPY, authEmail(), AuthEmailAction, Email, escapeHtml(), inviteEmail(), layout(), AppContext (+9 more)

### Community 67 - "game"
Cohesion: 0.14
Nodes (9): game(), ADR 0009: Gaming Hub, Consequences, Context, Decision, App type: archive and collection, App type: game, Memory (+1 more)

### Community 68 - "backup.js"
Cohesion: 0.23
Nodes (14): BK, bkStatus(), blobToDataURL(), dataURLToBlob(), exportData(), importData(), legacyRange(), sanitizeAct() (+6 more)

### Community 78 - "bin.ts"
Cohesion: 0.27
Nodes (10): envFlag(), flag(), main(), ROOT, appsFromPaths(), changedApps(), readVersion(), hostedTargets() (+2 more)

### Community 79 - "Workshop.tsx"
Cohesion: 0.06
Nodes (45): BuildFile, FILES, LIBRARY, modules, types, ACCENTS, approxTokens(), Audience (+37 more)

### Community 80 - "Users.tsx"
Cohesion: 0.10
Nodes (28): dateTime(), Ai(), ApiKeys(), Auth, placement(), RequestRow, ServiceRow, ADR-0006 (+20 more)

### Community 81 - "20260928100740_app_identity.sql"
Cohesion: 0.28
Nodes (4): app_origins_app_slug_idx, platform.app_origins, platform.calling_app(), platform.apps

### Community 82 - "worker.ts"
Cohesion: 0.16
Nodes (21): isNavigation(), supabaseGrantChecker(), appIcon(), escapeXml(), HEAD_TAGS, PwaApp, tileColour(), TILES (+13 more)

### Community 83 - "emit-json-schema.ts"
Cohesion: 0.18
Nodes (9): jsonSchema, target, manifestSchema, ref_node_url, body, match, source, target (+1 more)

### Community 84 - "supabase"
Cohesion: 0.12
Nodes (36): googleErrorFromUrl(), googleHandOverDone(), returnUrl(), signInWithGoogle(), calls, errorFor(), codeRequired(), needsAal2() (+28 more)

### Community 86 - "ui.js"
Cohesion: 0.33
Nodes (5): closeCurrent(), onKey(), open(), toast(), toastRegion()

### Community 87 - "preview.js"
Cohesion: 0.50
Nodes (3): current, levels, saved

### Community 88 - "platform"
Cohesion: 0.10
Nodes (41): Apps(), Person, RESERVED, STATUS, TARGET, Catalog(), idFor(), ADR-0007 (+33 more)

### Community 90 - "api/src/index.ts"
Cohesion: 0.13
Nodes (17): enabled, RFC-6238, enabled, ADR-0006, ApiEnv, ADR-0004, ADR-0005, ADR-0006 (+9 more)

### Community 91 - "20260928145158_push_notifications.sql"
Cohesion: 0.13
Nodes (17): platform.notifications, notifications_push_pending_idx, platform.push_device_count(), platform.push_list(), platform.push_release_due(), platform.push_schedule(), platform.push_subscribe(), platform.push_subscriptions (+9 more)

### Community 92 - "20260929082657_app_catalog.sql"
Cohesion: 0.09
Nodes (19): platform.app_categories, platform.apps_auto_category, platform.recategorize_apps, app_categories_recategorize, app_favorites_app_slug_idx, app_opens_app_slug_idx, app_set_items_app_slug_idx, apps_auto_category (+11 more)

### Community 93 - "resources.ts"
Cohesion: 0.19
Nodes (9): app, collect(), ContainerSource, dockerResources(), DockerStats, fromDockerStats(), HostSource, proxmoxResources() (+1 more)

### Community 94 - "NucBox.tsx"
Cohesion: 0.29
Nodes (10): Bar(), gb(), mb(), NucBox(), pct(), Report, share(), STATUS (+2 more)

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
Cohesion: 0.13
Nodes (29): CodeForm(), connectGoogle(), disconnectGoogle(), GOOGLE_CONNECTED, googleEnabled(), googleIdentity(), googleServices, grantedForOtherUser() (+21 more)

### Community 99 - "haushalt/mininode.json"
Cohesion: 0.17
Nodes (11): access, default, data, mode, description, kind, name, $schema (+3 more)

### Community 100 - "sportplaner/mininode.json"
Cohesion: 0.15
Nodes (12): access, default, apis, data, mode, description, kind, name (+4 more)

### Community 103 - "at"
Cohesion: 0.22
Nodes (8): Feature: sharing and realtime, Feature: push notifications, at(), d(), ht(), i(), Mi(), zi()

### Community 104 - "settings"
Cohesion: 0.10
Nodes (16): settings(), Feature: sound and haptics, Feature: settings and editable lists, App type: organisation and planning, Check, Data, Haushalt, Tests (+8 more)

### Community 105 - "Sportplaner"
Cohesion: 0.33
Nodes (5): Check, Courses, cancelled sessions and the map, Moving data over from the artifact, Origin, Sportplaner

### Community 108 - "offline.ts"
Cohesion: 0.12
Nodes (21): Feature: offline use and sync, createKv(), failure(), Json, KvScope, createOfflineKv(), exclusive(), indexedDbStore() (+13 more)

### Community 109 - "ExternalApiError"
Cohesion: 0.12
Nodes (12): ADR 0006: Host-level API keys for external APIs, Consequences, Context, Decision, Converting an existing app, Feature: External APIs with host-level keys, app(), Development (+4 more)

### Community 116 - "leaflet.js"
Cohesion: 0.08
Nodes (7): 9. Accessibility and motion, a(), Ci(), l(), me(), x(), ze()

### Community 120 - "App.tsx"
Cohesion: 0.14
Nodes (30): App(), init(), AppTab, Navigation(), NavigationProps, apiJson(), pruneApiCache(), initials() (+22 more)

### Community 122 - "memory/app.js"
Cohesion: 0.18
Nodes (19): cardLabel(), clock(), elapsed(), ADR-0009, pick(), render(), SHAPE_LABEL, SHAPE_SVG (+11 more)

### Community 125 - "routes/push.ts"
Cohesion: 0.11
Nodes (31): concat(), ecdhWith(), encoder, EncryptOptions, encryptPayload(), fromBase64Url(), hkdf(), p256Jwk() (+23 more)

### Community 126 - "README.md"
Cohesion: 0.17
Nodes (9): Agent instructions, Commands, Knowledge graph (graphify), MiniNode.app, Rules, UI, MiniNode, Repository (+1 more)

### Community 127 - "ref_vitest"
Cohesion: 0.12
Nodes (8): answer, config, ADR-0005, user, cookieSessionUserId(), session, ADR-0005, ref_vitest

### Community 128 - "runbooks/README.md"
Cohesion: 0.14
Nodes (8): Add an app, Key rotation, 1. Proxmox VE, 2. Linux VM (id 100), 3. Windows 11 VM (id 200), 4. Verify, NucBox install (Proxmox, Linux VM, Windows VM), Runbooks

### Community 129 - "20260929141832_game_hub.sql"
Cohesion: 0.19
Nodes (19): game_profiles_username_key, game_results_app_user_idx, game_results_user_app_at_idx, game_results_user_at_idx, game_sessions_app_idx, game_sessions_user_app_idx, platform.calling_game(), platform.game_days() (+11 more)

### Community 130 - "ADR 0004: Google services (Gmail, Calendar) for hosted apps"
Cohesion: 0.33
Nodes (5): ADR 0004: Google services (Gmail, Calendar) for hosted apps, Consequences, Context, Decision, Limits

### Community 131 - "map.js"
Cohesion: 0.18
Nodes (18): checkDraftAddress(), drawMap(), geoCache, geocode(), geocodeNow(), geoFits(), geoMatches, geoQueue (+10 more)

### Community 132 - "Restore"
Cohesion: 0.33
Nodes (6): Database (Supabase), One app's data on the NucBox, Restore, Whole NucBox lost, Windows VM, Wine prefix of a remote app

### Community 133 - "manifest"
Cohesion: 0.50
Nodes (3): Layout, @mininode/cli — `pnpm mininode`, manifest()

### Community 134 - "assets/sw.js"
Cohesion: 0.40
Nodes (4): cacheable(), fromNetwork(), ADR-0005, PRECACHE

### Community 135 - "20260928143037_google_grants.sql"
Cohesion: 0.40
Nodes (4): google_grants_touch, platform.google_grants, auth.users, platform.touch_updated_at

### Community 137 - "k"
Cohesion: 0.21
Nodes (13): Feature: keyboard and desktop use, F(), G(), h(), j(), k(), ke(), ne() (+5 more)

### Community 144 - "providers.ts"
Cohesion: 0.15
Nodes (15): buildDeps(), defaultDeps(), ModelEntry, anthropicProvider(), ChatMessage, ChatRequest, ChatResult, gatewayHeaders() (+7 more)

### Community 151 - "vapid-keys.ts"
Cohesion: 0.40
Nodes (3): pair, raw, ADR-0005

### Community 152 - "types/index.ts"
Cohesion: 0.13
Nodes (25): onKey(), Overlay(), OverlayProps, stack, StarRating(), StarRatingProps, ApiSearchResult, SearchCategoryTarget (+17 more)

### Community 157 - "Games.tsx"
Cohesion: 0.12
Nodes (40): appUrl(), monogram(), tintFor(), Achievement, achievements(), byGenre(), GameDay, GENRE_LABEL (+32 more)

### Community 161 - "20260929073053_api_keys.sql"
Cohesion: 0.27
Nodes (10): api_services_key_updated_by_idx, api_services_touch, app_api_services_service_id_idx, platform.api_services, platform.app_api_services, platform.register_app_apis(), auth, auth.users (+2 more)

### Community 162 - "ref_node_fs"
Cohesion: 0.15
Nodes (8): init, Tx, init, ref_node_fs, ref_postgres, ref_tailwindcss_vite, ref_vite, ref_vitejs_plugin_react

### Community 164 - "ADR 0007: App catalog on the start page"
Cohesion: 0.40
Nodes (4): ADR 0007: App catalog on the start page, Consequences, Context, Decision

### Community 165 - "001_init.sql"
Cohesion: 0.26
Nodes (11): app_wunschliste.touch, app_wunschliste.people(), app_wunschliste.reservations, app_wunschliste.reserve(), app_wunschliste.wishes, app_wunschliste.wishlist(), reservations_recipient_id_idx, auth (+3 more)

### Community 166 - "wunschliste/mininode.json"
Cohesion: 0.17
Nodes (11): access, default, data, mode, description, kind, name, $schema (+3 more)

### Community 168 - "mediaApis.ts"
Cohesion: 0.17
Nodes (27): calculateRelevanceScore(), calculateRichnessScore(), cleanHtml(), findCorrectionSuggestion(), FOREIGN_TITLE_TRANSLATIONS, KNOWN_CANONICAL_TITLES, levenshteinDistance(), MediaSearchResponse (+19 more)

### Community 169 - "ListenView.tsx"
Cohesion: 0.21
Nodes (20): DetailSheet(), EditorSheet(), MediaRow(), ShareModal(), showToast(), ToastContainer(), ToastState, formatDateDe() (+12 more)

### Community 170 - "lib/auth.ts"
Cohesion: 0.13
Nodes (18): problem(), Requirements, requireUser(), verifierFor(), notConfigured(), notConnected(), nucbox, controlHeaders() (+10 more)

### Community 171 - "deploy.test.ts"
Cohesion: 0.21
Nodes (13): parsed, production, environmentSettings, required(), CloudflareList, pruneApps(), PruneOptions, workersToPrune() (+5 more)

### Community 172 - "memory/mininode.json"
Cohesion: 0.12
Nodes (15): access, default, data, mode, description, game, genre, players (+7 more)

### Community 173 - "ref_react"
Cohesion: 0.15
Nodes (12): Header(), HeaderProps, MediaTile(), hosted_medialog_src_index, root, executeSemanticSearch(), normalizeText(), LibraryCategory (+4 more)

### Community 174 - "medialog/mininode.json"
Cohesion: 0.12
Nodes (15): access, default, apis, build, command, output, data, mode (+7 more)

### Community 175 - "MediaItem"
Cohesion: 0.21
Nodes (15): DetailSheetProps, EditorSheetProps, MediaRowProps, MediaTileProps, ShareModalProps, SemanticMatchResult, Person, SharedEntry (+7 more)

### Community 176 - "main.ts"
Cohesion: 0.15
Nodes (13): config, containerResources, docker, hostResources, hypervisor, reaper, scheduler, server (+5 more)

### Community 177 - "google.integration.test.ts"
Cohesion: 0.15
Nodes (12): enabled, sealFor(), packages_manifest_src_index_all_google_scopes, packages_manifest_src_index_google_scopes, packages_manifest_src_index_googleconnectsrc, packages_manifest_src_index_googlescopes, packages_manifest_src_index_isallowedapibase, ALL_GOOGLE_SCOPES (+4 more)

### Community 178 - "gate/src/index.ts"
Cohesion: 0.29
Nodes (8): fetch(), portalConfig(), contentSecurityPolicy(), CspOptions, securityHeaders(), withHeaders(), packages_gate_src_index_securityheaders, packages_gate_src_index_withheaders

### Community 179 - "game.ts"
Cohesion: 0.20
Nodes (7): GameOutcome, GameStats, LeaderboardRow, PING_MS, config, Timers, ADR-0009

### Community 180 - "control.test.ts"
Cohesion: 0.27
Nodes (6): config, TOKEN, ContainerInfo, demuxLogs(), RunSpec, packages_gate_src_index_createverifier

### Community 181 - "You are building an app for MiniNode"
Cohesion: 0.18
Nodes (9): Before you hand it over, Design guidance, Hard rules, MiniNode app spec (specVersion 1), `mininode.json`, Tables (optional), The SDK, You are building an app for MiniNode (+1 more)

### Community 182 - "p"
Cohesion: 0.22
Nodes (9): Ae(), be(), De(), ei(), Ie(), ii(), p(), pe() (+1 more)

### Community 184 - "bi"
Cohesion: 0.25
Nodes (8): bi(), c(), e(), hi(), Pi(), Qe(), Ti(), u()

### Community 185 - "001_shares.sql"
Cohesion: 0.33
Nodes (3): app_medialog.shares, auth, auth.users

### Community 186 - "ADR 0008: People directory for sharing inside an app"
Cohesion: 0.40
Nodes (4): ADR 0008: People directory for sharing inside an app, Consequences, Context, Decision

### Community 187 - "3. Tokens"
Cohesion: 0.40
Nodes (5): 3. Tokens, Accents (`data-accent`), Colour roles, Space, radius, layout, Type

### Community 188 - "platform.app_people"
Cohesion: 0.40
Nodes (4): platform.app_people(), platform.app_grants, platform.apps, platform.profiles

### Community 192 - "m"
Cohesion: 0.32
Nodes (8): Li(), m(), v(), ve(), W(), xe(), ye(), z()

### Community 193 - "Jt"
Cohesion: 0.29
Nodes (7): Jt(), Le(), O(), Qt(), Re(), $t(), te()

### Community 194 - "oi"
Cohesion: 0.67
Nodes (4): Je(), ni(), oi(), si()

## Knowledge Gaps
- **634 isolated node(s):** `supabase`, `cloudflare-docs`, `context7`, `npx`, `@playwright/mcp` (+629 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 977 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **82 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `platform()` connect `platform` to `portal/src/main.tsx`, `20260929073053_api_keys.sql`, `20260929141832_game_hub.sql`, `20260923000100_platform_core.sql`, `TopBar.tsx`, `MiniNode.app — Project Plan (v2)`, `AuthProvider.tsx`, `Users.tsx`, `supabase`, `platform.app_kv`, `20260928145158_push_notifications.sql`, `Games.tsx`?**
  _High betweenness centrality (0.056) - this node is a cross-community bridge._
- **Why does `c()` connect `bi` to `apis.ts`, `leaflet.js`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **Why does `settings()` connect `settings` to `routes/google.ts`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **What connects `supabase`, `cloudflare-docs`, `context7` to the rest of the system?**
  _634 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `portal/src/main.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.07862679955703211 - nodes in this community are weakly interconnected._
- **Should `Suite data types (catalog)` be split into smaller, more focused modules?**
  _Cohesion score 0.11764705882352941 - nodes in this community are weakly interconnected._
- **Should `ai-proxy/src/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.14153846153846153 - nodes in this community are weakly interconnected._