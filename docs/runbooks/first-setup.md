# First setup

Where the platform stands and what is left, in order. Every step is idempotent.

## Already done

| What | Details |
|---|---|
| Supabase production | project `mininode` (`ojicmpgqvoyakigvubek`, Frankfurt, free plan), all platform migrations applied and recorded for `supabase db push` |
| Supabase staging | project `mininode-staging` (`ttgrtecdqouiogiwcjag`), empty; migrated on its first `supabase db push` |
| Public config | Supabase URL, publishable keys, Cloudflare account id and AI Gateway URL are in the `wrangler.jsonc` files and `deploy.yml` (none of them are secret) |
| Auth settings as code | `supabase/config.toml` + `[remotes.production]`: sign-ups off, passwords ≥ 10, passkeys for `mininode.app`, custom access token hook. Applied by the deploy workflow (`supabase config push`); passkeys and the WebAuthn relying party are set by a separate Management API step, because `config push` does not manage them |
| JWT signing keys | migrated to asymmetric keys (JWKS at `/auth/v1/.well-known/jwks.json`), as the gates require |
| Supabase access token + secret key | created (`mininode-ci`, `mininode-workers`); they only need to go into GitHub (step 3) |
| No email | Email Sending needs Workers Paid, so it is off. Invites and password resets are one-time links the admin copies from *Verwaltung → Nutzer & Rollen* and sends by messenger. To turn email on later: add the `send_email` binding back to `apps/api/wrangler.jsonc` and set `EMAIL_ENABLED` to `"true"` in `apps/portal/wrangler.jsonc` |

## 1. Cloudflare: domain and deploy token (5 min)

`mininode.app` was bought through **Cloudflare Registrar**, so the zone already exists and
always uses Cloudflare's nameservers; there is nothing to change at a registrar.

1. *Domains*: `mininode.app` must show **Active**. A new registration can take a few minutes.
   Confirm the registrant verification email from Cloudflare (ICANN requires it; unverified
   domains are suspended after 15 days).
2. Deploy token (*My Profile → API Tokens → Create Token*): start from the template
   **Edit Cloudflare Workers**, then:
   - *Permissions* (Cloudflare's Workers roles, 2026): Workers must be **Admin** at the Workers
     product scope, because the first deploy *creates* the Workers (Editor can only update
     existing ones). The template's *Workers Routes: Edit* covers the custom domains. Add
     *Zone → DNS → Edit* (per-app DNS records for NucBox apps later).
   - *Account Resources*: your account. *Zone Resources*: *Specific zone → mininode.app*.
   - *Create Token*, copy it, and replace the GitHub secret `CLOUDFLARE_API_TOKEN` with it.
   For the NucBox later, the same token also needs *AI Gateway, Cloudflare Tunnel,
   Access: Apps and Policies, Access: Service Tokens → Edit* and *Zone Settings → Edit*
   (used by `infra/cloudflare/bootstrap.sh`).
3. Nothing else for the first deploy: `wrangler deploy` creates the DNS records and
   certificates for `mininode.app`, `api.`, `ai.` and every app itself.

Later, for the NucBox:

- R2: open *R2 Object Storage* once and enable it (payment method required; backups and
  installers stay inside the free 10 GB).
- Zero Trust needs nothing now: `infra/cloudflare/bootstrap.sh` creates the Access
  applications once the zone is active, and the team domain then appears under
  *Zero Trust → Settings*.

## 2. Supabase: two values and one click (5 min)

1. *Account → Access Tokens → Generate new token* (`mininode-ci`). This one token lets CI push
   migrations and auth settings without a database password.
2. Project `mininode` → *Settings → API Keys* → *Create new secret key* (`mininode-workers`).
3. Project `mininode` → *Settings → JWT Keys*: if the current key is the *Legacy JWT secret*,
   click *Migrate JWT secret*, then *Rotate keys*, so that tokens are signed with ES256. The
   gates verify sessions against the project's public JWKS, which only holds asymmetric keys.

## 3. GitHub secrets (3 min)

Repository → *Settings → Environments → New environment* `production` → *Add secret*. The
deploy workflow uses them and also uploads the Worker secrets, so nothing has to be set with
`wrangler` by hand. Removing a GitHub secret does not remove it from the Worker; use
`pnpm exec wrangler secret delete <NAME>` in the Worker's folder for that.

| Secret | Value | Needed |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | the token from step 1 | now |
| `SUPABASE_ACCESS_TOKEN` | step 2.1 | now |
| `SUPABASE_SECRET_KEY` | step 2.2 | now |
| `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` | provider keys for the AI proxy (the *Ideen* app) | for AI |
| `AI_GATEWAY_TOKEN` | AI Gateway → mininode → Settings → auth token | for AI |
| `GUACAMOLE_JSON_SECRET`, `NUCBOX_CONTROL_TOKEN` | `openssl rand -hex 16` / `-hex 32`, same values as on the NucBox | NucBox |
| `CF_ACCESS_API_CLIENT_ID` / `_SECRET` | Access service token `mininode-api` (from `bootstrap.sh`) | NucBox |
| `SUPABASE_DB_URL` | *Connect → Session pooler* string | apps with own tables |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | the Google OAuth client from step 3.1 | "Mit Google anmelden" |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | `node scripts/vapid-keys.ts` (Web Push; changing them later means every device switches push on again) | push notifications |
| `GOOGLE_TOKEN_KEY` | `openssl rand -base64 32` (encrypts stored Google grants; keep a copy) | Gmail/Calendar in apps |
| `VAULT_KEY` | `openssl rand -base64 32` (encrypts the API keys entered under Verwaltung → API-Schlüssel; keep a copy, losing it means entering every key again) | apps with external APIs |
| `LIBRARY_DISPATCH_TOKEN` | fine-grained GitHub token, this repository only, *Actions: Read and write* (`app-library.md`) | App-Bibliothek installs |

### 3.1 Google sign-in (optional, 10 min)

1. [Google Cloud console](https://console.cloud.google.com/) → a project (any) → *APIs & Services →
   OAuth consent screen*: app name *MiniNode*, user type *External*, your email as support and
   developer contact. Scopes: `openid`, `email`, `profile`, and for apps that use Gmail and
   Calendar (ADR 0004) also `gmail.readonly`, `gmail.modify`, `calendar.readonly` and
   `calendar`. Set the publishing status to *In production*: in *Testing* only listed test users
   can sign in and Google's grants expire after seven days. Do not submit it for verification;
   unverified, the consent screen shows a warning ("Google hat diese App nicht überprüft →
   Erweitert → Weiter zu MiniNode") and at most 100 accounts can use it, which is fine here.
   *APIs & Services → Library*: enable the **Gmail API** and the **Google Calendar API**.
2. *Credentials → Create credentials → OAuth client ID*, type *Web application*:
   - Authorized JavaScript origins: `https://mininode.app`
   - Authorized redirect URIs: `https://ojicmpgqvoyakigvubek.supabase.co/auth/v1/callback`
3. Put the client ID and secret into the GitHub secrets above. The next deploy switches the
   provider on; set them there, not in the Supabase dashboard, because `supabase config push`
   switches providers that are not in `config.toml` off again on every deploy.

Sign-ups stay off, so Google only signs in accounts that exist: its email must match the invited
address, or the user connects Google under *Dein Konto* first. With `GOOGLE_TOKEN_KEY` set, the
same sign-in also lets apps that declare `google` in `mininode.json` use the user's Gmail and
Calendar (ADR 0004); *Dein Konto → Google* shows the state and can revoke it.

## 4. Apps

`hosted/sportplaner` (sports offers, planned participation, visits and costs; photos in
`mn.files`) and `hosted/haushalt` (household budget with bank CSV import, standing orders and the
automatic transfer into the income tax forms) deploy with every run. Apps removed from `hosted/`
are pruned: their Workers are deleted and their registry rows disabled (data is kept).

## 5. First deploy and first login

1. Merge PR #1 into `main`. The deploy workflow pushes migrations and auth settings, then
   deploys the portal (`mininode.app`), API (`api.`) and AI proxy (`ai.`); wrangler creates
   the custom domains.
2. Supabase → *Authentication → Users → Add user → Create new user*: your email, a password
   (≥ 10 characters), *Auto confirm*. The first user of the project becomes admin.
3. Sign in at `https://mininode.app/login`, add a passkey under *Dein Konto*, then invite
   everyone else from *Verwaltung → Nutzer & Rollen* and send them the link.
4. Optional: set up an authenticator app under *Dein Konto*. From then on a password or Google
   sign-in asks for its code; a passkey sign-in does not. The database enforces it
   (`platform.mfa_ok`, and the access token hook withholds `mn_role` for the API), so apps, the
   gate and the API follow. Keep a passkey on a second device as well. Lost the phone? A passkey
   still signs in, but removing the app needs its code, so delete the factor in Supabase →
   *Authentication → Users → the user → MFA factors*, then set up the new phone.

## 6. NucBox (later)

`nucbox-install.md`, including `infra/cloudflare/bootstrap.sh` for tunnel, Access and R2.
Container and remote apps work once the tunnel shows *Healthy*; set the GitHub variable
`NUCBOX_TUNNEL_ID` to enable their deploy jobs.
