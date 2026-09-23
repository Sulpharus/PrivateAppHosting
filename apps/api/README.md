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
| `DELETE /admin/users/:id` | admin, recent | Deletes a user |
| cron `*/5 * * * *` | — | Expires idle sessions, releases stale AI reservations, syncs NucBox runtimes, keeps Supabase awake |

Secrets: `SUPABASE_SECRET_KEY`, `SEND_EMAIL_HOOK_SECRET`, `GUACAMOLE_JSON_SECRET`,
`NUCBOX_CONTROL_TOKEN`, `ACCESS_CLIENT_ID`, `ACCESS_CLIENT_SECRET` (`wrangler secret put <NAME>`).

```bash
pnpm dev                     # wrangler dev
pnpm types                   # regenerate worker-configuration.d.ts after editing wrangler.jsonc
pnpm test                    # unit tests; integration tests need `pnpm test:integration` from the root
```
