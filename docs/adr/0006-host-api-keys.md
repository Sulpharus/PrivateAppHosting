# ADR 0006: Host-level API keys for external APIs

- Status: accepted
- Date: 2026-09-29

## Context

Apps want external APIs that need a key (weather, maps, translation, film data). Keys in the
app would end up in the browser bundle, in `mininode.json` or in every app separately, and
several apps often use the same API. The admin should enter each key once, see which apps need
which key and why, and no app or browser should ever see it.

## Decision

**Apps request, the admin grants.** An app declares each external API in `mininode.json`
(`apis`: `id`, `name`, `baseUrl`, `auth` placement `header` | `bearer` | `query`, `docs`,
`reason`; at most ten). `baseUrl` must be a public `https` URL (no IP literals, localhost,
credentials or query, nothing on `mininode.app` or `supabase.co`). The deploy calls
`platform.register_app_apis`, which makes the app's declared set exact:

- `platform.api_services` holds one row per API `id`, whatever the number of apps. A second app
  with the same `id` joins the existing row and later uses the same key. If it declares a
  different `baseUrl` or `auth` while another app uses the row, the deploy stops (one key
  cannot serve two different APIs).
- `platform.app_api_services` records which app needs which API and why; APIs an app no longer
  declares are removed from it on the next deploy.

**Verwaltung → API-Schlüssel** lists the APIs apps need, those still missing a key first (also
counted in the navigation), with the requesting apps and their reasons, a link to get a key,
the last four characters of the stored key and when it changed. The admin enters, replaces or
removes a key (recent sign-in required, audit-logged) and removes entries no app uses any more.

**Keys stay in the API Worker.** `PUT /admin/api-keys/:service` encrypts the key with AES-GCM
(`VAULT_KEY`, a Worker secret). The additional authenticated data is the API id, `baseUrl` and
`auth`, so a stored key cannot be decrypted once the entry points elsewhere; the deploy also drops
the key whenever an entry's target changes (the only app moved it, or an unused entry is taken
over), and saving a key only succeeds if the target is still the one the admin saw. Keys are at
least 12 characters (the hint shows the last four). Entries can be removed only while no app
requests them (foreign key). Authenticated users can read the list columns but never
`key_enc` (column grants plus admin-only RLS).

**Calls go through `/proxy/:service/*`** on api.mininode.app (`mn.api(id).fetch(path, init)`
in the SDK). The Worker checks the signed-in user, the calling app from the `Origin` header
(`platform.app_origins`), the user's grant (`has_grant` with the user's token) and that the app
declared the API; then it builds the URL below `baseUrl` (no `..`, no encoded slashes or dots,
same origin and path prefix), puts the key where `auth` says (overriding anything the app sent
there) and forwards only `Accept`, `Accept-Language` and `Content-Type`. Responses carry only
content headers plus `Cache-Control: no-store`; redirects are never followed or passed on (a
query key would leak in `Location`). Limits: 1 MB request body, 15 s timeout, 60 calls per
minute per user and API (per isolate, against runaway loops); the body limit is enforced while
reading, not only from `Content-Length`. `baseUrl` is re-checked on every call (public https host,
no IP literal, trailing dot, `mininode.app`, `supabase.co`, `workers.dev` or `pages.dev`), and
header names the proxy manages (`Host`, `Cookie`, `Content-Type`, …) cannot carry the key. The proxy's own refusals carry
`X-MiniNode-Error`, so the SDK throws `ExternalApiError` for them (`keyMissing` for
`api_key_missing`) and returns the external API's answers unchanged, errors included.

## Consequences

- Adding a keyed API to an app is a manifest change; the key is entered once and applies to
  every app with that `id`. Apps show a "wird eingerichtet" state until then.
- Losing `VAULT_KEY` makes stored keys unreadable: the admin enters them again. Rotating it
  means re-entering every key.
- Every external call costs one extra hop through the API Worker and counts against its
  subrequest limits; apps cache answers in `mn.kv`.
- **A key serves every signed-in user with access to a requesting app, for any method and path
  below `baseUrl`.** The `Origin` check keeps other pages out, but a user with access can send
  requests with their own token from outside a browser (as with Google, ADR 0004). Enter keys
  with the narrowest permissions the provider offers (read-only, quotas, spending limits).
- The rate limit is per isolate and therefore approximate; it protects against loops, not
  against a determined user with access to the app.
- Only request/response headers on the allow-list pass, so APIs that need other headers (e.g.
  pagination in `Link`) need the list extended here.
