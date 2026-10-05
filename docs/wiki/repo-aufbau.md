---
title: Repository-Aufbau
category: entwicklung
order: 10
summary: Wo im Repository was liegt
---

Alles liegt in einem Monorepo (pnpm, Turborepo): `github.com/Sulpharus/PrivateAppHosting`.

```
.
├─ apps/                 Plattform-Programme
│  ├─ portal/            Startseite, /login, Konto, Verwaltung (React + Vite auf einem Worker)
│  ├─ api/               Plattform-API (Hono-Worker): Einladungen, Schlüssel, Uploads, Sicherung, …
│  ├─ ai-proxy/          KI-Proxy (Hono-Worker)
│  └─ nucbox-control/    VM-Strom, Warteschlange, Guacamole-Token, Deploy-Skript (Node)
├─ hosted/               Nutzer-Apps, je ein Ordner mit mininode.json
├─ inbox/                Ablage für ZIPs (nicht in Git)
├─ packages/
│  ├─ manifest/          mininode.json: Schema, Typen, Prüfung
│  ├─ sdk/               @mininode/sdk
│  ├─ gate/              Schranke für App-Worker und Forward-Auth
│  ├─ ui/                Designtokens, App-Kit (kit/ui.css, ui.js, i18n.js, game.js)
│  ├─ cli/               mininode-Befehle (doctor, deploy, integrate, backup, uninstall, …)
│  └─ config/            gemeinsame tsconfig
├─ supabase/             Migrationen, Tests (pgTAP), Konfiguration
├─ infra/                Cloudflare (Tunnel, DNS, Access) und NucBox (Compose, Backup, Windows)
├─ fixtures/             Beispiel-Exporte mit erwarteten Ergebnissen
├─ docs/                 ai/ (Vorgaben für KI), adr/ (Entscheidungen), runbooks/, suite/, wiki/ (dieses Wiki)
├─ e2e/                  Playwright-Tests
├─ scripts/              Hilfsskripte (lokaler Stack, Release, Wissensgraph)
├─ .claude/              Skills (integrate-app, supabase, wrangler, …) und Unteragenten (reviewer)
└─ .github/workflows/    CI, Deploy und alle weiteren Workflows
```

Wichtige Dateien im Wurzelordner: `CLAUDE.md` (Regeln für Claude Code), `PLAN.md` (Architektur und Umfang, die Quelle der Wahrheit), `docs/STATUS.md` (Stand,
offene Schritte für den Eigentümer, Arbeitsweise in Cloud-Sitzungen), `biome.json` (Lint und Format).

## Wohin gehört was?

| Ich ändere … | Datei(en) |
| --- | --- |
| eine Verwaltungsseite | `apps/portal/src/admin/` |
| eine API-Funktion | `apps/api/src/routes/` (+ Test daneben) |
| die Datenbank | neue Datei in `supabase/migrations/` (+ pgTAP-Test in `supabase/tests/`) |
| eine App | `hosted/<name>/` |
| das Aussehen aller Apps | `packages/ui/kit/` und `docs/ai/DESIGN-SYSTEM.md` |
| die KI-Vorgaben | `docs/ai/` (und `docs/ai/prompts/` für die KI-Werkstatt) |
| ein Ablauf bei GitHub | `.github/workflows/` |
| eine Anleitung | `docs/runbooks/` (englisch) |
| eine Entscheidung | neues `docs/adr/00NN-….md` |
| dieses Wissen | `docs/wiki/` ([Wissen aktuell halten](wiki:wissen-pflegen)) |

## Wissensgraph

`graphify-out/graph.json` bildet Symbole, Importe, SQL-Objekte und Überschriften ab. Vor breitem Suchen: `graphify query "wie starten Remote-Sitzungen"`,
`graphify explain "<symbol>"`, `graphify affected "<symbol>"`. Aktualisieren und mit einchecken: `pnpm kb` nach strukturellen Änderungen.

## Anwendungs-Apps

Die aktuelle Liste der Apps in `hosted/` mit Art und Daten steht unter [Apps im System](wiki:ref-apps).
