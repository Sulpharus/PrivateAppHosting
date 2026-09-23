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
