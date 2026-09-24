# @mininode/api — `api.mininode.app`

Hono Worker for everything that needs the service role or a secret:

| Route | Who | Purpose |
|---|---|---|
| `POST /invites` | admin, signed in < 10 min | Create invite, pre-create the account, send mail via Cloudflare Email; returns the link for sharing |
| `DELETE /invites/:id` | admin, recent | Revoke; deletes the pre-created account if never used |
| `POST /hooks/send-email` | Supabase (Standard Webhooks signature) | Renders and sends every auth mail |
| `POST /remote/sessions` | signed-in user with grant | Queue or start a remote session; returns a Guacamole link |
| `POST /remote/sessions/:id/heartbeat` | session owner | Keeps the session alive |
| `DELETE /remote/sessions/:id` | owner or admin | Ends the session, promotes the next in queue |
| `POST /remote/installs` | admin, recent | Starts an install of a remote app on the NucBox (snapshot → verify → install) |
| `GET /remote/installs/:id` | admin | Install job status |
| `POST /admin/users/:id/recovery-link` | admin, recent | One-time password-reset link to share (no email needed) |
| `DELETE /admin/users/:id` | admin, recent | Deletes a user |
| cron `*/5 * * * *` | — | Expires idle sessions, releases stale AI reservations, syncs NucBox runtimes, keeps Supabase awake |

Email is optional: without the `EMAIL` binding (Workers Paid) invites return only the link and
`POST /admin/users/:id/recovery-link` (admin, recent) creates password-reset links to share.

Secrets: `SUPABASE_SECRET_KEY`, `SEND_EMAIL_HOOK_SECRET` (only with email), `GUACAMOLE_JSON_SECRET`,
`NUCBOX_CONTROL_TOKEN`, `ACCESS_CLIENT_ID`, `ACCESS_CLIENT_SECRET` (`wrangler secret put <NAME>`).

```bash
pnpm dev                     # wrangler dev
pnpm types                   # regenerate worker-configuration.d.ts after editing wrangler.jsonc
pnpm test                    # unit tests; integration tests need `pnpm test:integration` from the root
```
