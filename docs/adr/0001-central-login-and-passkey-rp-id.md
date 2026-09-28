# ADR 0001: Central login origin and permanent passkey RP ID

- Status: accepted
- Date: 2026-09-23

## Context

Every hosted app lives on its own subdomain of `mininode.app`. Supabase Auth passkeys
(WebAuthn) require a Relying Party ID and an explicit list of at most five allowed origins.
Changing the RP ID later invalidates every enrolled passkey. Passkey support in Supabase is
marked experimental and needs an explicit client opt-in.

## Decision

- The RP ID is `mininode.app` and is treated as permanent.
- All sign-in, sign-up (invite acceptance), passkey enrolment and password fallback happen on one
  origin: `https://mininode.app/login`. Apps never call WebAuthn themselves;
  `sdk.auth.requireLogin()` redirects to the central login with a `next` parameter.
- Allowed origins: `https://mininode.app` (production) and `http://localhost:5173`
  (local development). The staging project uses its own RP configuration.
- All passkey calls live in one portal module (`apps/portal/src/auth/passkeys.ts`), and the
  `@supabase/supabase-js` version is pinned exactly, so API changes are isolated.
- Email + password stays enabled as the fallback for devices without passkey support.

## Consequences

- Five-origin limit is never a constraint.
- One redirect hop for apps whose session has expired (`/auth/refresh?next=`).
- Upgrading supabase-js requires re-running the passkey e2e test (Playwright virtual authenticator).

## Addendum (2026-09): Google sign-in and authenticator apps

- "Mit Google anmelden" joins passkey and password on `/login`. Sign-ups stay off, so it only
  reaches existing accounts (same verified email, or Google connected under *Dein Konto*).
- An authenticator app (TOTP) is an optional second factor. The database enforces it:
  `platform.has_grant` and `platform.is_admin` require an aal2 session once the user has a
  verified factor, so the portal, the gate and every app's RLS follow without their own checks.
  The access token hook reports `mn_role: user` and `mn_mfa: pending` until the code is
  verified, so the API and NucBox (which trust `mn_role`) follow too, and the gate sends such
  sessions to the portal's code step.
  A passkey sign-in (AMR method `webauthn`) counts as enough on its own, because it already
  proves possession of a device. The e2e test `e2e/mfa.spec.ts` covers that exemption; re-run it
  after Supabase upgrades, as with the passkey test.
