# MiniNode · Cloudflare edition

Everything needed to run your own MiniNode on **Cloudflare and Supabase**, with no apps and nothing
of anyone else's installation in it: no domain, no account, no key. The portal, API, AI proxy and
every app run as Cloudflare Workers; the data lives in a Supabase project. You need a domain that
is active in your Cloudflare account, a Supabase project and a GitHub repository for this folder.
No computer has to stay on.

Start with `docs/runbooks/setup-cloudflare.md`. It covers the accounts, the keys, `pnpm mininode init`,
the first deploy and the first admin account (the first visit to the portal creates it).

Left out on purpose: the desktop installer (one computer with Docker) and everything for a home
server (container apps, Windows programs, the App-Bibliothek). Those are in the full starter
package of the same project; some pages in `docs/` still describe them.

What is in it: `apps/` (portal, API, AI proxy), `packages/` (gate, SDK, kit, CLI, manifest),
`supabase/` (migrations and tests), `infra/cloudflare` (one-time Cloudflare setup), `docs/`
(runbooks, decisions, the knowledge base shown in Verwaltung → Wissen, the AI specifications for
building apps), `.github/` (CI and deploy workflows).

What is not in it: apps (`hosted/` is empty; build one with the KI-Werkstatt in Verwaltung and add
it as described in `docs/runbooks/add-app.md`), `mininode.config.json` (made by
`pnpm mininode init`; `mininode.config.example.json` shows its shape), secrets of any kind.

Verify the download with `sha256sum -c SHA256SUMS`. License: PolyForm Noncommercial 1.0.0 (`LICENSE`).
