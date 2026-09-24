# @mininode/portal — `mininode.app`

The start page, the central login and the Host Manager (`/admin`). React + Vite, served by a
small Worker (`worker/index.ts`) that adds security headers and exposes `/config.json`.

| Route | Purpose |
|---|---|
| `/login` | Passkey sign-in (primary), email + password fallback, password reset |
| `/auth/confirm` | Landing page for email links; the token is redeemed only after a click |
| `/auth/refresh` | Central session refresh used by app gates (avoids refresh-token races) |
| `/welcome` | First visit after an invite: name, passkey, optional password |
| `/account` | Profile, passkeys (add/rename/remove), password, sign out |
| `/` | Apps the user may open, remote apps with live status and queue |
| `/admin/*` | Host Manager (admins only; sensitive actions require a sign-in < 10 min) |

All passkey calls live in `src/auth/passkeys.ts` (ADR 0001). The session cookie is `mn-auth` on
`.mininode.app`, shared with `packages/gate` and `packages/sdk`.

```bash
cp .env.example .env.local   # fill in from `pnpm exec supabase status`
pnpm dev                     # http://localhost:5173
pnpm e2e                     # from the repo root: Playwright incl. virtual-authenticator passkeys
```
