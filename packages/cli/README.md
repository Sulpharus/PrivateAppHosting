# @mininode/cli — `pnpm mininode`

```
mininode doctor <app-dir> | --all          Check hosted apps
mininode dev <app-dir> [--port 8790]       Serve an app locally behind the gate (local Supabase)
mininode deploy <app-dir> [--env staging]  Build, migrate, deploy and register one app
mininode deploy --changed <base-ref>       Deploy every app changed since <base-ref> (--dry-run)
mininode changed <base-ref>                List hosted apps changed since <base-ref>
mininode prune [--env staging] [--dry-run] Delete Workers of apps gone from hosted/ (--force if empty)
mininode export <app-dir> --out <dir>      One app as a shareable folder; stops on keys and private data (ADR 0012)
mininode integrate <zip|dir> [--slug x] [--build] [--tidy] [--json f] [--report f]  Export → hosted/<slug> by script; exit 2 = needs review (ADR 0013)
mininode uninstall <slug> [--purge] [--env]  Take an app offline, with --purge delete its data, files and registry entry (ADR 0020)
mininode backup create --out <dir> | verify <dir> | restore <dir> [--yes]  Full backup folder and restore (ADR 0019)
mininode submission fetch|status <id> …    Uploads from Verwaltung (used by integrate.yml)
mininode library check|install <entry> <slug> [--env]  App-Bibliothek: check, register (ADR 0011)
mininode library remove <slug> <entry> [--env]  App-Bibliothek: disable a removed program
```

**integrate** turns an export (ZIP or folder) into `hosted/<slug>` when it knows the shape and
leaves nothing behind otherwise (`src/integrate/`, ADR 0013): `inspect.ts` classifies and collects
the reasons it must stop, `convert.ts` rewrites Vite/AI Studio apps, plain HTML and ready
manifests, `verify.ts` builds (`--build`) and formats (`--tidy`). Exit code 0 = integrated, 2 =
needs review (the report names the codes), 1 = error.

**doctor** is the gate every AI-integrated app must pass (CI runs `--all`). Errors block the
deploy, warnings are shown in review:

| Rule | Checks |
|---|---|
| `manifest` | `mininode.json` parses against `@mininode/manifest` |
| `no-secrets`, `no-client-ai-keys`, `no-client-ai-sdk` | no keys or provider SDKs in client code; AI goes through `mn.ai` |
| `no-artifact-runtime`, `no-cdn-scripts` | no leftover `window.claude`/`window.storage`, no external scripts (CSP) |
| `sdk-required`, `prefer-kv` | apps with login or data use the SDK; small state uses `mn.kv` |
| `rls-required`, `use-secure-table`, `own-schema`, `no-anon-grants` | migrations stay in `app_<slug>`, enable RLS via `platform.secure_table`, never grant to `anon` |
| `build`, `static`, `container` | target-specific: build output exists, Dockerfile + health path for NucBox apps |
| `readme` | every app documents what it does and its data |

**deploy** (target `cloudflare`): builds, applies the app's SQL migrations (checksummed in
`platform.app_migrations`), exposes the schema to the API, deploys a Worker with the gate and
static assets on `<slug>.mininode.app`, and registers the app in `platform.apps`. Other targets
are registered only; their rollout happens in the deploy workflow (NucBox) or the admin UI
(remote installs).

Deploys also register the app's origin (`https://<slug>.<domain>`, or `http://localhost:<port>`
for `dev`) in `platform.app_origins`. RLS uses it to tell apps apart (ADR 0002).

**prune** runs after every deploy. It deletes `mn-app-*` Workers whose app is no longer a
Cloudflare app in `hosted/`. Apps missing from `hosted/` altogether are first set to
`disabled`; their data stays until the admin deletes it. It refuses to run when `hosted/` is
empty, unless `--force` is given.
