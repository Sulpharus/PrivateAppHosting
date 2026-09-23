# First setup

From an empty Cloudflare account and an empty Supabase organization to a running MiniNode.
Do the steps in order; each one is idempotent and can be repeated.

## 1. Cloudflare (dashboard, ~10 min)

The Cloudflare MCP connector can read Workers/KV/R2/D1 but cannot manage DNS, tunnels, Access,
AI Gateway or Email Sending, and deploys run from CI anyway. So the dashboard steps are:

1. **Zone:** `mininode.app` must show *Active* (nameservers switched at the registrar).
2. **R2:** open *R2 Object Storage* once and enable it (needs a payment method; the free tier
   covers backups and installers: 10 GB storage, no egress fees).
3. **Email Sending:** *Compute → Email Service → Email Sending → Onboard Domain → mininode.app*.
   This adds the `cf-bounce` MX, SPF, DKIM and DMARC records. The API Worker sends from
   `hallo@mininode.app` (see `apps/api/wrangler.jsonc`).
4. **Zero Trust:** open *Zero Trust* once and choose a team name (free plan, up to 50 users).
   Access protects `ssh.` and `control.`; the One-time PIN login method is enough.
5. **Account ID:** copy it from *Workers & Pages → Overview* (right-hand column).
6. **API token** (*My Profile → API Tokens → Create Custom Token*), name `mininode-ci`:

   | Scope | Permission |
   |---|---|
   | Account · Workers Scripts | Edit |
   | Account · Workers R2 Storage | Edit |
   | Account · AI Gateway | Edit |
   | Account · Cloudflare Tunnel | Edit |
   | Account · Access: Apps and Policies | Edit |
   | Account · Access: Service Tokens | Edit |
   | Account · Account Settings | Read |
   | Zone (mininode.app) · Workers Routes | Edit |
   | Zone (mininode.app) · DNS | Edit |
   | Zone (mininode.app) · Zone Settings | Edit |
   | Zone (mininode.app) · Zone | Read |

   Restrict it to the account and the `mininode.app` zone. Set an expiry (1 year); rotation is
   described in `key-rotation.md`.

## 2. Cloudflare resources (script, ~1 min)

On the NucBox Linux VM (or any machine with bash, curl and jq):

```bash
CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… OWNER_EMAIL=wopucsala20@gmail.com \
  ./infra/cloudflare/bootstrap.sh
```

It hardens the zone (strict TLS, HTTPS only, CAA), creates the AI Gateway `mininode`
(authenticated, logs on, 120 req/min), the R2 buckets `mininode-backups` and
`mininode-installers`, the tunnel `mininode-nucbox` with its ingress, the DNS records for
`remote.`, `control.` and `ssh.`, and the Access apps with the service tokens `github-deploy`
and `mininode-api`. One-time secrets land in `./cloudflare-secrets/` (mode 700); move them to
where the next steps say, then delete the folder.

Also create an **AI Gateway token** (*AI → AI Gateway → mininode → Settings → Create
authentication token*) for `AI_GATEWAY_TOKEN`.

## 3. Supabase

1. Create two projects in region *eu-central-1 (Frankfurt)*: `mininode` and `mininode-staging`.
2. *Authentication → Sign In / Providers:* keep email enabled, **disable sign-ups**; enable
   **Passkeys** with RP ID `mininode.app` and origin `https://mininode.app` (staging:
   `staging.mininode.app`).
3. *Authentication → URL configuration:* Site URL `https://mininode.app`, redirect allow-list
   `https://mininode.app/**` and `https://*.mininode.app/**`.
4. *Authentication → Hooks:*
   - Custom Access Token → Postgres function `platform.custom_access_token_hook`.
   - Send Email → HTTPS `https://api.mininode.app/hooks/send-email`; copy the generated secret
     into the API Worker secret `SEND_EMAIL_HOOK_SECRET`.
5. *Settings → API:* note the URL, the publishable key and a secret key.
6. **First admin:** the very first user of a fresh project becomes admin automatically. Create
   it in *Authentication → Users → Add user → Create new user* (your email, a password of at
   least 10 characters, *auto confirm*). Sign in at `https://mininode.app/login`, add a passkey
   under *Konto*, then invite everyone else from *Admin → Benutzer*.

## 4. GitHub (repository → Settings → Environments → `production`, then `staging`)

| Kind | Name | Value |
|---|---|---|
| var | `CLOUDFLARE_ACCOUNT_ID` | step 1.5 |
| var | `SUPABASE_PROJECT_REF` | project ref (enables the deploy workflow's database job) |
| var | `SUPABASE_URL` | `https://<ref>.supabase.co` |
| var | `SUPABASE_PUBLISHABLE_KEY` | step 3.5 |
| var | `AI_GATEWAY_BASE` | `https://gateway.ai.cloudflare.com/v1/<account-id>/mininode` |
| var | `STAGING_DOMAIN` | staging only: `staging.mininode.app` |
| secret | `CLOUDFLARE_API_TOKEN` | step 1.6 |
| secret | `SUPABASE_ACCESS_TOKEN` | supabase.com → Account → Access Tokens |
| secret | `SUPABASE_DB_PASSWORD` | project database password |
| secret | `SUPABASE_DB_URL` | session-pooler connection string (hosted-app migrations) |
| secret | `SUPABASE_SECRET_KEY` | step 3.5 |
| secret | `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` | `cloudflare-secrets/github-deploy.*` |
| secret | `NUCBOX_DEPLOY_SSH_KEY` | private half of the `deploy` key (see `nucbox-install.md`) |

## 5. Worker secrets (once, from your machine)

```bash
cd apps/api
pnpm exec wrangler secret put SUPABASE_SECRET_KEY
pnpm exec wrangler secret put SEND_EMAIL_HOOK_SECRET
pnpm exec wrangler secret put GUACAMOLE_JSON_SECRET     # same 32 hex chars as in infra/nucbox/secrets.env
pnpm exec wrangler secret put NUCBOX_CONTROL_TOKEN      # same as CONTROL_TOKEN in infra/nucbox/secrets.env
pnpm exec wrangler secret put ACCESS_CLIENT_ID          # cloudflare-secrets/mininode-api.client_id
pnpm exec wrangler secret put ACCESS_CLIENT_SECRET      # cloudflare-secrets/mininode-api.client_secret

cd ../ai-proxy
pnpm exec wrangler secret put SUPABASE_SECRET_KEY
pnpm exec wrangler secret put AI_GATEWAY_TOKEN
pnpm exec wrangler secret put ANTHROPIC_API_KEY         # or store provider keys in the gateway (BYOK)
pnpm exec wrangler secret put GEMINI_API_KEY
```

Worker secrets survive deploys. The first `wrangler secret put` on a Worker that doesn't exist
yet creates an empty one, which is fine: the next CI deploy fills in the code.

## 6. First deploy

Merge to `main` (or run *Actions → Deploy → Run workflow*). The workflow migrates the database,
deploys portal, API and AI proxy (their custom domains `mininode.app`, `api.` and `ai.` are
created by wrangler), then every hosted app. Check `https://mininode.app/login`.

## 7. NucBox

Follow `nucbox-install.md`. Container and remote apps work once the tunnel shows *Healthy*.
