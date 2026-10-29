# MiniNode · Starter

Everything needed to start your own MiniNode, with no apps and nothing of anyone else's
installation in it: no domain, no account, no key. It contains the platform for all three variants
and the documentation.

Start with `docs/runbooks/getting-started.md`, then follow the guide of your variant:

| Variant | Guide |
| --- | --- |
| Cloudflare only | `docs/runbooks/setup-cloudflare.md` |
| Desktop only (one computer, Docker) | `docs/runbooks/setup-desktop.md`: `infra/desktop/install.sh` (Linux, macOS) or `infra/desktop/install.ps1` (Windows) |
| Both (Cloudflare plus a home server) | `docs/runbooks/setup-both.md` |

What is in it: `apps/` (portal, API, AI proxy, desktop host, hardware-server control), `packages/`
(gate, SDK, kit, CLI, manifest), `supabase/` (migrations and tests), `infra/` (Cloudflare, desktop,
home server), `docs/` (runbooks, decisions, the knowledge base shown in Verwaltung → Wissen, the
AI specifications for building apps), `.github/` (CI and deploy workflows).

What is not in it: apps (`hosted/` is empty; build one with the KI-Werkstatt in Verwaltung and
add it as described in `docs/runbooks/add-app.md`), `mininode.config.json` (made by
`pnpm mininode init`; `mininode.config.example.json` shows its shape), secrets of any kind.

Verify the download with `sha256sum -c SHA256SUMS`.
