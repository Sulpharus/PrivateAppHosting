# Variant 1: Cloudflare only

MiniNode on Cloudflare Workers with a Supabase project for the data. Time: about an hour, most of
it clicking through dashboards. Every step can be repeated safely.

```
you ──▶ https://<domain>          portal (login, start page, Verwaltung)   Cloudflare Worker
        https://api.<domain>      platform API                              Cloudflare Worker
        https://ai.<domain>       AI proxy                                  Cloudflare Worker
        https://<app>.<domain>    one gate Worker per app                   Cloudflare Worker
                       └──▶ Supabase project: sign-in, database, files
GitHub repository + Actions: builds and deploys everything on every push to main
```

## 0. What you need

| Need | Notes |
| --- | --- |
| A **domain in Cloudflare** | Any domain whose DNS Cloudflare serves (*Websites → Add a domain*, then switch the nameservers at your registrar to Cloudflare's). It can be an apex (`example.com`) or a subdomain of a zone you own (`apps.example.com`); the platform uses the name you give for the portal and `api.`, `ai.` and `<app>.` below it. |
| A **Cloudflare account** | The free plan works. R2 and Email Sending are optional and need a payment method. |
| A **Supabase account** | The free plan works for a handful of people. |
| A **GitHub account** | Private repository, Actions enabled. |
| On your computer | Git, Node 22 and pnpm (`corepack enable`) for the one-time `init`. |

## 1. The code in your own repository

1. Unpack the starter ZIP (`mininode-starter-<version>.zip`) and create a **private** repository on
   GitHub (empty, no README).
2. In the unpacked folder:

   ```bash
   git init -b main
   git add -A && git commit -m "Initial MiniNode"
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```

   The first push starts the *Deploy* workflow, which fails until the steps below are done. That is
   expected.

## 2. Supabase: one project, three values

1. *New project*: any name, a strong database password (store it in your password manager), the
   region closest to you. Note the **project reference**: the 20 letters in the dashboard URL.
2. *Project Settings → API Keys*: copy the **publishable key** (`sb_publishable_…`); create a
   **secret key** (`sb_secret_…`) named `mininode-workers`. The publishable key is public by design;
   the secret key is a secret.
3. *Project Settings → JWT Keys*: if the current key is the *Legacy JWT secret*, click *Migrate JWT
   secret*, then *Rotate keys*, so that tokens are signed with ES256. The gates verify sessions
   against the project's public key set, which only holds asymmetric keys.
4. *Account → Access Tokens → Generate new token* (`mininode-ci`): lets the workflow push
   migrations and auth settings. (`sbp_…`, a secret.)
5. *Connect → Session pooler*: copy the connection string (`…pooler.supabase.com:5432`). Needed
   once apps have their own tables (`SUPABASE_DB_URL`).

## 3. Cloudflare: account id and deploy token

1. Your **account id**: *Workers & Pages* → right column, or the dashboard URL of any domain.
2. *My Profile → API Tokens → Create Token*, template **Edit Cloudflare Workers**, then:
   - *Permissions*: Workers must be **Admin** at the Workers product scope, because the first
     deploy *creates* the Workers (Editor can only update existing ones). Keep *Workers Routes:
     Edit* (it covers the custom domains) and add *Zone → DNS → Edit*.
   - *Account Resources*: your account. *Zone Resources*: *Specific zone → your zone*.
   - Copy the token (a secret).
3. Nothing else for the first deploy: `wrangler deploy` creates the DNS records and certificates
   for `<domain>`, `api.`, `ai.` and every app by itself.

## 4. Tell the repository about your installation

```bash
pnpm install
pnpm mininode init        # asks for: domain, (zone), Cloudflare account id, Supabase ref, publishable key, repo
git add -A && git commit -m "Configure my installation" && git push
```

`init` writes `mininode.config.json` (public identifiers only: no secret belongs in it) and
renders it into the Worker configuration and `supabase/config.toml` (`pnpm mininode configure`
does the same again later; CI checks that they match). Non-interactive:
`pnpm mininode init --domain apps.example.com --zone example.com --accountId … --supabaseRef … --publishableKey … --repository you/repo`.

## 5. GitHub secrets

Repository → *Settings → Environments → New environment* `production` → add the secrets. The
deploy workflow uploads the Worker secrets from here, so nothing is set with `wrangler` by hand.
Restrict the environment to the `main` branch.

| Secret | Value | Needed |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | step 3.2 | now |
| `SUPABASE_ACCESS_TOKEN` | step 2.4 | now |
| `SUPABASE_SECRET_KEY` | step 2.2 | now |
| `SUPABASE_DB_PASSWORD` | the database password from step 2.1 | optional: only if `supabase link` asks for it |
| `SUPABASE_DB_URL` | step 2.5, with the password URL-encoded | apps with own tables |
| `VAULT_KEY` | `openssl rand -base64 32` (encrypts the API keys entered in Verwaltung; **keep a copy**) | apps with external APIs |
| `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` | provider keys for the AI proxy | AI features |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_TOKEN_KEY` | section 9 | Google |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | `node scripts/vapid-keys.ts` | push notifications |
| `BACKUP_PASSPHRASE` | 24+ random characters, **keep a copy** | backups from Verwaltung |
| `LIBRARY_DISPATCH_TOKEN`, `EXPORT_REPO_TOKEN`, `INTEGRATE_TOKEN` | fine-grained GitHub tokens, see `uploads.md`, `app-library.md`, `app-export.md` | uploads, library, export |

Removing a GitHub secret does not remove it from the Worker; use
`pnpm exec wrangler secret delete <NAME>` in the Worker's folder.

## 6. First deploy

*Actions → Deploy → Run workflow* (or push to `main`). The workflow: pushes the database
migrations and the auth settings (sign-ups off, passwords of at least 12 characters, passkeys for
your domain, the access-token hook), then deploys the portal, the API, the AI proxy and your apps.
Wrangler creates the custom domains on the way. It takes a few minutes.

## 7. First account

1. Supabase → *Authentication → Users → Add user → Create new user*: your email, a password of at
   least 12 characters, *Auto confirm*. **The first user of the project becomes the admin.**
2. Open `https://<domain>/login`, sign in, open *Dein Konto* and add a **passkey**; add a second
   passkey on another device.
3. Optional: an authenticator app. From then on a password or Google sign-in asks for its code; a
   passkey sign-in does not. Keep a passkey on a second device as well. Lost the phone? A passkey
   still signs in, but removing the app needs its code: delete the factor in Supabase →
   *Authentication → Users → the user → MFA factors*, then set up the new phone.
4. Invite everyone else from *Verwaltung → Nutzer & Rollen*; send them the link by messenger
   (email is off by default, see section 9).

## 8. Check it

Run the checks in [getting-started.md](getting-started.md). Also: `https://api.<domain>/health`
answers `{"ok":true}`; Actions shows the last *Deploy* green; *Verwaltung → Übersicht* shows no red
numbers you care about.

## 9. Optional

- **Google sign-in, Gmail and Calendar in apps.** Google Cloud console → OAuth consent screen
  (*External*, publishing status *In production*, no verification needed for up to 100 accounts),
  scopes `openid`, `email`, `profile` and, for apps, `gmail.readonly`, `gmail.modify`,
  `calendar.readonly`, `calendar`; enable the Gmail and Calendar APIs. *Credentials → OAuth client
  ID → Web application*: authorized origin `https://<domain>`, redirect URI
  `https://<supabase ref>.supabase.co/auth/v1/callback`. Put client id and secret and a
  `GOOGLE_TOKEN_KEY` (`openssl rand -base64 32`, keep a copy) into the GitHub secrets and deploy.
- **Email** (invites and password resets by mail): Cloudflare Email Sending needs Workers Paid. Add
  the `send_email` binding back to `apps/api/wrangler.jsonc`, set `EMAIL_ENABLED` to `"true"` in
  `apps/portal/wrangler.jsonc`, then configure the Supabase *Send Email* hook. Without it the
  admin copies one-time links (the default).
- **A ruleset on `main`** that requires the CI checks, so nobody can merge a red pull request
  (Settings → Rules → Rulesets).
- **Staging**: a second Supabase project listed under `environments.staging` in
  `mininode.config.json` (database and auth only).
- **A home server** for programs and containers: [setup-both.md](setup-both.md).

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Deploy fails at *Link and push migrations* | `SUPABASE_ACCESS_TOKEN` is a project key; it must be an account token (`sbp_…`) |
| Deploy fails at *Worker config matches mininode.config.json* | run `pnpm mininode configure`, commit |
| `wrangler deploy` says the zone is not found | the token's *Zone Resources* does not include your zone, or the domain is not active in Cloudflare yet |
| Login works on the portal but apps redirect forever | the portal and the apps must share the domain (cookie on `.<domain>`); check `COOKIE_DOMAIN` in `apps/portal/wrangler.jsonc` was rendered by `configure` |
| Passkey: "does not match this address" | the passkey was made on another domain; the relying party id is your domain and cannot change later without invalidating all passkeys |
| A bare "403 Forbidden" | not MiniNode's own page ("Kein Zugriff auf …"): Cloudflare or Google's consent screen |
