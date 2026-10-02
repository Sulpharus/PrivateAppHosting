# @mininode/api — `api.mininode.app`

Hono Worker for everything that needs the service role or a secret:

| Route | Who | Purpose |
|---|---|---|
| `POST /invites` | admin, signed in < 10 min | Create invite, pre-create the account, send mail via Cloudflare Email; returns the link for sharing |
| `DELETE /invites/:id` | admin, recent | Revoke; deletes the pre-created account if never used |
| `POST /hooks/send-email` | Supabase (Standard Webhooks signature) | Renders and sends every auth mail |
| `POST /google/connect` | signed-in user | Stores the Google refresh token from a Google sign-in, encrypted (ADR 0004) |
| `GET /google` / `DELETE /google` | signed-in user | Status of the Google grant / revoke it at Google and forget it |
| `POST /google/token` | signed-in user with grant, from the app's own origin | Short-lived Google access token limited to the app's `google` scopes |
| `GET` / `PUT /google/calendar` | Kalender user (grant + MFA), from the Kalender's origin | Google Calendar sync state / switch it on or off, choose sources and Google calendars (ADR 0010) |
| `POST /google/calendar/sync` | same | Sync now (at most every 30 seconds unless something was requested) |
| `GET /push/config` | anyone | VAPID public key for the portal's push subscription (ADR 0005) |
| `POST /push/test` | signed-in user | Sends a test notification to all of the caller's devices |
| `ALL /proxy/:service/*` | signed-in user with grant, from the app's own origin, API declared by the app | Calls the external API with the host-level key added server-side (ADR 0006) |
| `PUT` / `DELETE /admin/api-keys/:service` | admin, recent sign-in | Stores (encrypted with `VAULT_KEY`) or removes the key of an API |
| `PUT /admin/api-services/:service/mode` | admin, recent sign-in | `sitewide` or `personal` keys for an API (ADR 0014) |
| `PUT` / `DELETE /me/api-keys/:service` | signed in | A user enters or removes their own key for a personal API |
| `GET /admin/submissions/config`, `POST /admin/submissions` | admin (`POST`: recent) | Uploads: ZIP (web app → `integrate.yml`) or `.exe`/`.msi` (program → R2 + NucBox), ADR 0013 |
| `GET /admin/submissions/:id`, `POST …/retry`, `POST …/dismiss` | admin | An upload; refreshes a running program install; try again; take it off the list |
| `DELETE /admin/api-services/:service` | admin, recent sign-in | Removes an API entry no app declares any more |
| `POST /remote/sessions` | signed-in user with grant | Queue or start a remote session; returns a Guacamole link |
| `POST /remote/sessions/:id/heartbeat` | session owner | Keeps the session alive |
| `DELETE /remote/sessions/:id` | owner or admin | Ends the session, promotes the next in queue |
| `POST /remote/installs` | admin, recent | Starts an install of a remote app on the NucBox (snapshot → verify → install) |
| `GET /remote/installs/:id` | admin | Install job status |
| `GET /admin/nucbox/resources` | admin | NucBox resource report from nucbox-control (Verwaltung → NucBox) |
| `GET /admin/library` | admin | Whether App-Bibliothek installs can be started (`GITHUB_DISPATCH_TOKEN` set) |
| `POST /admin/apps/:slug/export` | admin, recent | Starts `export-app.yml`: the app as its own GitHub repository (ADR 0012) |
| `POST /admin/library` | admin, recent | Starts the `library.yml` workflow: install or remove a catalog program (ADR 0011) |
| `POST /admin/users/:id/recovery-link` | admin, recent | One-time password-reset link to share (no email needed) |
| `DELETE /admin/users/:id` | admin, recent | Deletes a user |
| cron `* * * * *` | — | Every minute: releases due reminders and pushes new notifications (ADR 0005). Every fifth minute also: expires idle sessions, releases stale AI reservations, syncs NucBox runtimes, keeps Supabase awake |
| cron `2-59/5 * * * *` | — | Google Calendar sync of the most overdue user, with its own subrequest budget (ADR 0010) |

Email is optional: without the `EMAIL` binding (Workers Paid) invites return only the link and
`POST /admin/users/:id/recovery-link` (admin, recent) creates password-reset links to share.

Secrets: `SUPABASE_SECRET_KEY`, `SEND_EMAIL_HOOK_SECRET` (only with email), `GUACAMOLE_JSON_SECRET`,
`NUCBOX_CONTROL_TOKEN`, `ACCESS_CLIENT_ID`, `ACCESS_CLIENT_SECRET` (`wrangler secret put <NAME>`).

```bash
pnpm dev                     # wrangler dev
pnpm types                   # regenerate worker-configuration.d.ts after editing wrangler.jsonc
pnpm test                    # unit tests; integration tests need `pnpm test:integration` from the root
```

Secrets for uploads (optional): `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (and
`R2_BUCKET`) for program installers; the ZIP path uses `GITHUB_DISPATCH_TOKEN` like the library.
