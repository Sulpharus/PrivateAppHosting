---
title: Apps verstehen: Arten, Adresse und mininode.json
category: apps
order: 10
summary: Was eine App ist, welche Arten es gibt und was im Manifest steht
---

Eine **App** ist alles, was eine Kachel und eine Adresse hat. Die meisten liegen als Ordner `hosted/<name>/` im
Repository; was dort steht, bestimmt alles Weitere (Kachel, Adresse, Deploy, Verwaltung). Die aktuelle Liste:
[Apps im System](wiki:ref-apps).

## Arten (`kind`) und Ziele (`target`)

| `kind` | `target` | Läuft auf | Typisches |
| --- | --- | --- | --- |
| `static` | `cloudflare` | Worker mit statischen Dateien | HTML/CSS/JS ohne Build (Sportplaner, Haushalt, Spiele) |
| `spa` | `cloudflare` | Worker mit gebautem Vite/React-Projekt | Medialog, Haushaltsinventar |
| `nextjs` | `cloudflare` / `vercel` | statischer Export, vinext oder Vercel | Next.js-Apps (Ausnahme: Vercel) |
| `container` | `nucbox` | Docker auf der Linux-VM | Server-Programme (Python, Node, WebSockets) |
| `remote` | `remote` | Windows-VM oder Wine | native Programme |
| `link` | `external` | nichts | Kachel, die eine fremde Website öffnet |

Webseiten-Apps laufen **hinter dem Gate** (der Schranke): erst Anmeldung und Freigabe prüfen, dann Dateien liefern.
Mehr zur Technik: [Überblick](wiki:ueberblick).

## Die Adresse (Slug)

Der **Slug** ist der Name und die Adresse: `rezepte` → `https://rezepte.mininode.app`. Er hat 2 bis 32 Zeichen,
Kleinbuchstaben, Ziffern und einzelne Bindestriche, beginnt mit einem Buchstaben. Reserviert (nicht vergebbar) sind
`admin`, `ai`, `api`, `auth`, `control`, `guac`, `login`, `mail`, `proxmox`, `remote`, `ssh`, `staging`, `status`, `www`.
Einmal vergeben, ändert man den Slug nicht mehr (Daten und Freigaben hängen daran).

## `mininode.json`

Das Manifest beschreibt die App und wird bei jedem Deploy geprüft (JSON-Schema in `packages/manifest`, dazu `mininode doctor`).

```json
{
  "$schema": "../../packages/manifest/schema.json",
  "specVersion": 1,
  "slug": "rezepte",
  "name": "Rezepte",
  "description": "Rezepte und Wochenplan",
  "kind": "spa",
  "target": "cloudflare",
  "access": { "default": true, "roles": ["user", "trusted", "admin"] },
  "data": { "mode": "private" },
  "ai": { "models": ["gemini-flash"], "monthlyBudgetEur": 3 },
  "i18n": { "languages": ["de", "en"], "default": "de" },
  "build": { "command": "pnpm build", "output": "dist" }
}
```

| Feld | Bedeutung |
| --- | --- |
| `slug`, `name`, `description` | Adresse, Anzeigename, Zeile unter dem Namen (bis 120 Zeichen); aus Name und Beschreibung entsteht die Kategorie |
| `access.default` | Neue Personen bekommen die App automatisch |
| `data.mode` | `none`, `private`, `shared-account`, `group`, `readonly` ([Daten speichern](wiki:daten-speichern)) |
| `ai` | Erlaubte KI-Modelle und Monatsbudget ([KI-Proxy](wiki:ki-proxy)) |
| `apis` | Externe APIs, die die App über den Schlüssel-Proxy ruft ([API-Schlüssel](wiki:api-schluessel)) |
| `google` | Google-Dienste (Gmail, Kalender), die die App nutzt ([Google](wiki:google)) |
| `suite.uses` | Gemeinsame Datentypen, die sie lesen oder schreiben will ([Gemeinsame Daten](wiki:gemeinsame-daten)) |
| `game` | Spiel-Werte für den Gaming Hub ([Gaming Hub](wiki:gaming-hub)) |
| `i18n` | Sprachpakete ([Sprache und Formate](wiki:sprachen-formate)) |

Dazu kommen je nach Art `build`, `container` und `remote`. Alles Weitere: `docs/ai/NEW-APP-SPEC.md` und `packages/manifest`.

## Prüfen

`pnpm mininode doctor hosted/<name>` ist die **eindeutige Definition von fertig**: Manifest, keine Geheimnisse, SDK-Nutzung,
Zeilenschutz der Tabellen, CSP, Sprachpakete, keine privaten Kennungen. CI führt es für jede geänderte App aus.

## Was nach dem Deploy in der Verwaltung steht

Nach dem Merge registriert der Deploy die App in `platform.apps`. Unter Verwaltung → **Apps** siehst du Status, Version,
Kategorie, Zugriff und kannst deaktivieren, exportieren, ein Logo setzen oder löschen
([App löschen](wiki:app-loeschen), [Logos](wiki:app-hinzufuegen)).
