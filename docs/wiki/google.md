---
title: Google-Dienste und Kalender-Sync
category: daten
order: 30
summary: Mit Google anmelden, Gmail und Kalender in Apps, und der Sync des Kalenders
---

## Mit Google anmelden (optional)

Einrichten in der Google-Cloud-Konsole (OAuth-Zustimmungsbildschirm, Veröffentlichungsstatus *In production*, Gmail- und Calendar-API
aktivieren, OAuth-Client mit Rückleitung `https://<supabase>/auth/v1/callback`), danach `GOOGLE_CLIENT_ID` und `GOOGLE_CLIENT_SECRET` als
GitHub-Geheimnisse; der nächste Deploy schaltet den Anbieter ein. Anleitung: Runbook `first-setup.md` §3.1. Nicht zur Prüfung einreichen: die
Warnung „Google hat diese App nicht überprüft“ ist hier normal (bis 100 Konten).

Neue Konten entstehen nicht über Google: die Google-Adresse muss zu einem eingeladenen Konto passen, oder die Person verbindet Google unter
*Dein Konto*.

## Gmail und Kalender in Apps (ADR 0004)

- Eine **Einwilligung** im Portal (Anmelden, „Verbinden“ oder „Freigeben“) fragt Gmail- und Kalender-Bereiche ab, mit Dauerzugriff.
- Das Portal gibt das Token an die API, die es mit `GOOGLE_TOKEN_KEY` verschlüsselt in `platform.google_grants` ablegt (nur die API kann es lesen).
- Eine App **deklariert** im Manifest `"google": { "gmail": "read", "calendar": "write" }`. `mn.google.fetch(url)` holt über die API ein
  kurzlebiges Token, das nur diese Bereiche erlaubt; geprüft werden Adresse der App, Freigabe, Manifest und zweiter Faktor.
- Dazu kommt `"drive": "file"` (Google Drive, ADR 0023): die App sieht **nur Dateien, die sie selbst angelegt hat**, nie dein ganzes Drive; sie legt
  einen Ordner an, lädt hinein und teilt ihn über Drives eigene Freigabe. Bereits verbundene Konten müssen Google einmal neu verbinden
  (*Dein Konto*), weil der Drive-Bereich neu ist.
- Der Browser ruft Google dann **direkt** auf; das Gate erlaubt die Google-Adressen nur Apps mit `google`-Block.
- *Dein Konto → Zugriff entziehen* widerruft das Token bei Google und löscht den Eintrag.
- **`GOOGLE_TOKEN_KEY` aufbewahren:** ohne ihn sind die gespeicherten Verbindungen unlesbar ([Geheimnisse](wiki:geheimnisse)).

## Kalender-Sync (ADR 0010)

Voraussetzungen: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_TOKEN_KEY` und der zweite Cron-Trigger der API (`2-59/5 * * * *` in
`apps/api/wrangler.jsonc`).

1. Jede Person verbindet Google unter *Dein Konto* mit vollem Kalenderzugriff.
2. Im Kalender: **Google Kalender** (Kopfzeile) einschalten und wählen, was nach Google soll. Der Sync legt in Google den Kalender „MiniNode“
   an und holt Google-Kalender herein. Er läuft alle fünf Minuten, beim Öffnen und nach jeder Änderung.

| Symptom | Prüfen |
| --- | --- |
| „Verbinde zuerst dein Google-Konto“ / „Zugriff“ | Google unter *Dein Konto* neu verbinden (Bereich fehlt oder Widerruf) |
| Status „Fehler“ | API-Logs: `gcal_sync_failed` nennt den Grund; es wird nach einer Stunde wiederholt |
| Sync langsam bei großem Kalender | `gcal_sync_paused` ist normal: es geht seitenweise weiter |
| Ein Google-Termin fehlt | API-Logs: `gcal_apply_failed` |
| Ein Google-Kalender soll nicht herein | im Google-Kalender-Blatt ausschalten; seine Termine gehen in den Papierkorb, bei Google ändert sich nichts |

Ausschalten lässt „MiniNode“ in Google stehen und entfernt die Google-Kalender aus MiniNode.
