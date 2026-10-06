---
title: App-Kit und SDK
category: apps
order: 50
summary: Was eine App von der Plattform bekommt: Design, Skripte und die SDK-Funktionen
---

Jede App bekommt von der Plattform zwei Dinge, die der **Gate** unter `/_mininode/` ausliefert: das **App-Kit** (Aussehen) und das
**SDK** (Funktionen). Dieselben Dateien laufen auf Staging und Produktion; die Einstellungen kommen aus `/_mininode/config.json`.

## App-Kit (`packages/ui`)

| Datei | Aufgabe |
| --- | --- |
| `/_mininode/ui.css` | Farben (hell/dunkel), Schriften, Hülle (`mn-app`) und Komponenten (`mn-*`), Akzent über `data-accent` |
| `/_mininode/ui.js` | Datum/Uhrzeit-Felder als Tag · Monat · Jahr bzw. Stunde : Minute, Dialoge, Kleinigkeiten |
| `/_mininode/i18n.js` | Sprachpakete (`window.mnI18n`), siehe [Sprache und Formate](wiki:sprachen-formate) |
| `/_mininode/game.js` | Hilfen für Spiele (Spielername, Zeit, Bestenliste), siehe [Gaming Hub](wiki:gaming-hub) |
| `/_mininode/sdk.js` | Das SDK als einzelne Skriptdatei für reines HTML |
| `/_mininode/pwa.js`, `sw.js`, `manifest.webmanifest` | Macht jede App installierbar und offlinefähig (automatisch, nicht selbst bauen) |

Schriften: Bricolage Grotesque (Überschriften), Instrument Sans (Text), JetBrains Mono (Code), alle selbst gehostet. Regeln für das
Aussehen: `docs/ai/DESIGN-SYSTEM.md` (Farben, Komponenten, Texte, Barrierefreiheit, „was man nicht tut“). Wichtigste Regeln: nur Tokens
(`--mn-*`), nie rohe Farben; hell und dunkel; Ziele mindestens 44 px; sichtbarer Fokus; nur `transform` und `opacity` animieren;
keine Farbverläufe, keine Emoji.

## SDK (`packages/sdk`)

```ts
import { mininode } from '@mininode/sdk';   // Vite/React; reines HTML: window.mininode.mininode()
const mn = await mininode();
const user = await mn.auth.requireLogin();  // schickt zum zentralen Login, falls nötig
```

| Bereich | Wofür | Mehr |
| --- | --- | --- |
| `mn.auth` | `requireLogin()`, `user()`, `role()` | [Anmeldung](wiki:anmeldung) |
| `mn.table` | Listen von Einträgen als Tabellen im Schema `app_<name>`: `list`, `get`, `upsert`, `remove`; **auch offline** | [Daten speichern](wiki:daten-speichern) |
| `mn.kv` | Einstellungen und kleine Zustände (Schlüssel-Wert), privat oder geteilt, **auch offline** | [Daten speichern](wiki:daten-speichern) |
| `mn.db` | Abfragen, Summen und Filter auf den Tabellen (online; Zeilenschutz) | [Daten speichern](wiki:daten-speichern) |
| `mn.files` | Dateien (Fotos, Belege), privat, geteilt oder je Team (`{ team }`), mit signierten Adressen | [Daten speichern](wiki:daten-speichern) |
| `mn.team` | Teams für Apps mit Datenmodus `team`: `list`, `create`, `members`, `setMember`, `removeMember`, `rename`, `remove`, `notify` | [Daten speichern](wiki:daten-speichern) |
| `mn.ai` | `chat()`, `stream()`, `json()` über den KI-Proxy, keine Schlüssel im Browser | [KI-Proxy](wiki:ki-proxy) |
| `mn.api(id)` | Externe APIs über den Schlüssel-Proxy | [API-Schlüssel](wiki:api-schluessel) |
| `mn.google` | Gmail/Kalender-Tokens für deklarierte Bereiche; `calendarSync` (nur Kalender) | [Google](wiki:google) |
| `mn.suite` | Gemeinsame Datensätze und Sammlungen | [Gemeinsame Daten](wiki:gemeinsame-daten) |
| `mn.notify`, `mn.push` | Glocke und Push; Erinnerungen zu einer Zeit | [Push und Offline](wiki:push-offline) |
| `mn.people()` | Personen mit Zugriff auf die App, zum Teilen | ADR 0008 |
| `mn.birthdays()` | freigegebene Geburtstage der Personen dieser App (ADR 0025) | [Anmeldung](wiki:anmeldung) |
| `mn.ai.search()` | KI-Antwort mit Websuche und Quellen, nur mit `ai.search` im Manifest (ADR 0024) | [KI-Proxy](wiki:ki-proxy) |
| `mn.game` | Spielername, Zeit, Ergebnis, Bestenliste | [Gaming Hub](wiki:gaming-hub) |
| `mn.realtime(kanal)` | Live-Updates zwischen Nutzern | |

**Wichtig:** Datenaufrufe funktionieren nur von der registrierten Adresse der App (`https://<name>.mininode.app`, lokal der Port von
`mininode dev`), weil der Zeilenschutz die aufrufende App am `Origin`-Header erkennt (ADR 0002). Von einer fremden Seite oder einem
beliebigen Dev-Server aus sieht man keine Daten.

Für Apps, die für andere Umgebungen gebaut wurden, gibt es zwei **Kompatibilitätsschichten**, die `mininode integrate` einbaut:
`installMiniNodeCompat(mn)` (definiert `window.MiniNode`) und `installLocalStorageSync(mn)` (hält `localStorage` im Konto).

## Lokal entwickeln

```bash
pnpm db:start                       # lokales Supabase (Docker)
pnpm mininode dev hosted/<name>     # App hinter dem Gate auf localhost
pnpm mininode doctor hosted/<name>  # Regeln prüfen
```

Dazu `e2e/<name>.spec.ts` mit Playwright ([Tests und CI](wiki:tests-ci)).
