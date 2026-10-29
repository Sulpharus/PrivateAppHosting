# Getting started: pick your variant

MiniNode runs in three ways. Pick one, follow its guide from the first step to the first login,
then come back to the common steps below. Nothing in the guides assumes a previous installation.

| Variant | What runs where | You need | Guide |
| --- | --- | --- | --- |
| **1. Cloudflare only** | Portal, API, AI proxy and every app on Cloudflare Workers; data in Supabase | a Cloudflare account with a domain, a Supabase project, a GitHub account | [setup-cloudflare.md](setup-cloudflare.md) |
| **2. Desktop only** | Everything on one computer in Docker, nothing in the cloud | a computer with Docker (Windows, macOS or Linux; Intel/AMD or ARM) | [setup-desktop.md](setup-desktop.md) |
| **3. Both** | Cloudflare as in variant 1, plus a home server for programs that need a real computer (containers, Jellyfin, n8n, Windows programs) | variant 1, plus a Linux machine with Docker at home | [setup-both.md](setup-both.md) |

Which one?

- **Cloudflare only** when people reach MiniNode from anywhere, you want it always on without a
  computer at home, and web apps are enough. Free plans cover a handful of people.
- **Desktop only** when it should stay on your own hardware, you do not want accounts at
  Cloudflare or Supabase, and it is for you or for people on your network. It is reachable on the
  same computer out of the box; other devices or the internet need one more step (see its guide).
- **Both** when you want the cloud variant and also run server programs at home.

The variants are separate installations: the desktop edition is not a mirror of a cloud
installation, and the two do not share accounts or data.

## What every variant has in common

- **One login for everything.** The first visit to a new installation creates the admin account
  (a setup screen, ADR 0027). Sign-ups are off: more people come
  in through an invitation link (Verwaltung → Nutzer & Rollen).
- **Passkeys.** After the first login set up a passkey under *Dein Konto*, and a second one on
  another device, so a lost device never locks you out. An authenticator app can be added as a
  second factor.
- **Apps** are folders with a `mininode.json`. Build them with an AI from the KI-Werkstatt
  (Verwaltung), integrate them (`docs/runbooks/add-app.md`, `uploads.md`), and give people access
  under Verwaltung → Apps. New apps are invisible to everyone until you do.
- **Backups.** Cloudflare: Verwaltung → Sicherung (`backups.md`). Desktop: `mininode-desktop backup`.
  Keep the file and the secrets (`key-rotation.md` lists them) outside the machine.
- **Secrets never go into the code.** Cloudflare: GitHub environment secrets. Desktop: the
  installation's `.env`, readable only by you. `mininode.config.json` holds public identifiers only.

## Checks after any installation

1. `/login` opens and signing in works with the first account.
2. A passkey can be created and used to sign in again.
3. Without signing in, an app's address redirects to `/login` (it must never show the app).
4. After signing in with an account that has no access to an app, the app shows "Kein Zugriff".
5. A second invited account sees only what it was given.

If one of these fails, `docs/wiki/fehlerbehebung.md` (Verwaltung → Wissen → Fehlerbehebung) lists
the usual causes.
