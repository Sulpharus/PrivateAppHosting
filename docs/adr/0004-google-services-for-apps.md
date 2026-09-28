# ADR 0004: Google services (Gmail, Calendar) for hosted apps

- Status: accepted
- Date: 2026-09-28

## Context

Users sign in with Google or connect Google under *Dein Konto* (ADR 0001 addendum). Apps for
mail and calendar should then use that Google account without a second login. Supabase Auth
hands out Google's tokens (`provider_token`, `provider_refresh_token`) only once, in the
session right after the OAuth redirect, and neither stores nor refreshes them. The session
cookie is shared with every app on `*.mininode.app`, so a Google refresh token must not stay in
it.

## Decision

- **One consent, in the portal.** Google sign-in, "Verbinden" and "Freigeben" ask for `openid
  email profile` plus Gmail (`gmail.readonly`, `gmail.modify`) and Calendar (`calendar.readonly`,
  `calendar`) with `access_type=offline`. The list is `ALL_GOOGLE_SCOPES` in
  `@mininode/manifest`.
- **Hand-over.** Right after the redirect the portal posts the refresh token to
  `POST api/google/connect` and then refreshes the Supabase session, which drops the provider
  tokens from the cookie. The API checks that the token belongs to the Google identity linked
  to this user (userinfo `sub`), encrypts it with AES-GCM (key `GOOGLE_TOKEN_KEY`, a Worker
  secret; AAD = user id) and stores it in `platform.google_grants`. Only the service role can
  read that table.
- **Apps declare, the API issues.** An app lists `"google": { "gmail": "read" | "write",
  "calendar": "read" | "write" }` in `mininode.json`. `mn.google.fetch()` asks
  `POST api/google/token`, which checks the request's Origin (registered app origin, so one app
  cannot ask for another's token), `has_grant` with the user's token (grant, disabled apps,
  second factor), and the manifest. It then refreshes at Google with `scope` limited to the
  app's scopes and returns a short-lived access token. Tokens are not cached server-side.
- **The browser calls Google directly.** The gate adds the Google API origins to the app's CSP
  `connect-src` only when the manifest declares `google`.
- **Revocation.** *Dein Konto → Zugriff entziehen* revokes the token at Google and deletes the
  row; unlinking Google does the same. `invalid_grant` from Google deletes the row, so the
  portal offers "Freigeben" again.

## Consequences

- Gmail scopes are *restricted* and Calendar scopes *sensitive*. Without Google's verification
  (and, for Gmail, a paid security assessment) the consent screen shows "Google hat diese App
  nicht überprüft", and at most 100 Google accounts can grant access. That is acceptable for an
  invite-only platform; verification is the step if it ever grows beyond that.
- Every Google sign-in shows the Gmail and Calendar consent at least once. Users who decline
  still sign in; apps then show "Google verbinden".
- Access tokens reach app JavaScript (limited to the declared scopes, about one hour). Apps are
  reviewed code on the platform, so that is the same trust as their data access.
- Losing `GOOGLE_TOKEN_KEY` makes every stored grant unreadable: users press "Freigeben" again.
  Rotating it means deleting `platform.google_grants`.
- Downscoping on refresh relies on Google honouring `scope` in the refresh request. The API
  fails closed: a token with scopes beyond the app's declaration is not handed out (502). The
  first real deployment has to confirm that Google limits as expected (the tests stub Google).
- The hand-over briefly has the refresh token in the shared session cookie (Supabase writes
  it before any code can run); the portal replaces the session before it sends the token to
  the API and before it navigates to an app.
- "Freigeben" signs in again with Google (preselecting the linked account); the portal warns
  when that ended in a different MiniNode account.

## Limits

The Origin check stops one app's *page* from getting another app's token, because browsers set
Origin. It does not stop a non-browser client that holds the user's session: the session cookie
is readable by script on every app (ADR 0002, Limits), so malicious app code could send it to a
server that then asks for another app's Google token. Apps are reviewed code on a private
platform, so this is the same trust as their data access today; the planned HttpOnly per-host
session (ADR 0002) closes it for Google as well. Until then, grant apps `write` only when needed.
