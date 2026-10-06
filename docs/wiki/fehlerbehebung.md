---
title: Fehlerbehebung
category: betrieb
order: 50
summary: Typische Probleme und die schnellste Prüfung dafür
---

## Ich sehe eine Änderung nicht

Meist eine **zwischengespeicherte** PWA-Version: Seite neu laden oder die App schließen und neu öffnen. Prüfe sonst im Deploy-Lauf (GitHub → Actions → *Deploy*), ob die App an der Reihe war.

## Anmelden, Zugriff

| Symptom | Ursache und Schritt |
| --- | --- |
| Gate-Seite „Kein Zugriff auf …“ | Person hat keine Freigabe: Verwaltung → Apps → Zugriff |
| nacktes „403 Forbidden“ | kommt nicht vom Gate (das hat eine eigene Seite): Cloudflare oder Googles Zustimmungsbildschirm prüfen |
| Passkey geht nicht auf neuem Gerät | Passwort-Anmeldung nutzen, Passkey unter *Dein Konto* neu anlegen |
| Authenticator-Code verloren | [Anmeldung](wiki:anmeldung): Faktor in Supabase löschen, neu koppeln |
| App zeigt keine Daten | wird sie von ihrer eigenen Adresse aufgerufen? Daten gehen nur von dort ([App-Kit und SDK](wiki:app-kit-sdk)) |

## Hochladen, Einbau, Deploy

| Symptom | Ursache und Schritt |
| --- | --- |
| „GitHub hat den Start … abgelehnt (404)“ | Standard-Branch ist nicht `main`, oder `integrate.yml` nicht auf `main`, oder Token sieht das Repository nicht ([Hochladen](wiki:hochladen)) |
| „(403)“ | dem Token fehlt *Actions: Read and write* |
| Upload steht auf „Pull Request offen“, Prüfungen rot | nicht mergen; Ursache im Pull Request lesen; neu hochladen oder per Claude Code beheben |
| Einbau geht an die KI-Prüfung | Grund im Bericht; „arbeite die ai-review-Issues ab“ ([Mit Claude Code arbeiten](wiki:claude-code)) |
| Prüf-Issue nennt `Unrecognized key "accent"` im Manifest | der Generator hat die Farbe in `mininode.json` geschrieben; sie gehört als `data-accent` ins HTML. Das Einbau-Skript entfernt unbekannte Schlüssel inzwischen selbst |
| Prüf-Issue: `window.MiniNode` / `sdk-required` / `sdk-not-loaded` / `stand-in-sdk` | die App bringt ihren eigenen Ersatz für das Plattform-Gerüst mit (Rückfall auf Browser-Speicher); der Einbau ersetzt ihn durch `@mininode/sdk` ([App-Kit und SDK](wiki:app-kit-sdk)) |
| App „durcheinander“: Icon-Namen als Text (`dashboard`, `settings`) | Google-Schriften sind durch die Sicherheitsregeln gesperrt; Icons als Teilmenge einbinden (`python3 scripts/subset-icons.py hosted/<name>`), Schriften als npm-Paket |
| Neue App heißt „Neue App“ / `neue-app` | in der KI-Werkstatt kein Name eingetragen; Einbau fragt jetzt nach (`placeholder_name`): Name vergeben, oder beim Hochladen eine Adresse angeben |
| Prüf-Issue: E-Mail-Adresse `max@beispiel.de` | Beispielpersonen mit echten Adressen verhindern den Export; das Skript ersetzt sie durch `@example.com` |
| Deploy: „SUPABASE_DB_URL points at the IPv6-only direct connection“ | Session-pooler-Adresse verwenden |
| App-Deploy stoppt bei `doctor` | die Fehlerliste nennt `[regel] datei: text`; ausbessern, `pnpm mininode doctor hosted/<name>` |
| Ein Deploy-Schritt für eine App scheitert, die anderen gehen weiter | gewollt: eine kaputte App stoppt die anderen nicht; am Ende schlägt der Lauf fehl |

## Daten und Schlüssel

| Symptom | Ursache und Schritt |
| --- | --- |
| „Schlüssel fehlt“ in einer App | Verwaltung → API-Schlüssel: Schlüssel eintragen (oder Person trägt persönlichen ein) |
| `budget_exceeded` | KI-Budget aufgebraucht: Verwaltung → KI-Proxy erhöhen |
| Kalender zeigt nichts | Gemeinsame Daten genehmigen ([Gemeinsame Daten](wiki:gemeinsame-daten)) |
| Google-Sync Fehler | [Google](wiki:google), Tabelle am Ende |
| Sicherung scheitert | Protokoll lesen: oft fehlt `BACKUP_PASSPHRASE` (16+ Zeichen) oder `SUPABASE_DB_URL` |
| App gelöscht, kommt wieder | der Pull Request mit dem entfernten Code wurde nicht gemergt ([App löschen](wiki:app-loeschen)) |

## Entwicklung

| Symptom | Schritt |
| --- | --- |
| CI rot nach Merge, Test „language“ flackert | kalte Dev-Server: Wartezeiten, nicht die App; im Zweifel Lauf wiederholen **und** Ursache beheben, nie Tests abschalten |
| Lokal geht Docker/Supabase nicht | `scripts/cloud-stack.sh` (Cloud-Sitzung), dann `pnpm exec supabase db reset --local` |
| Alter Dev-Server blockiert Port | Prozess per PID beenden (`ps -eo pid,args \| grep -E "[w]rangler\|[v]ite"`), nicht `pkill -f` |
| Deploy bricht bei `supabase link` ab: „FGA Authentication Error. Unauthorized“ | Fehler der Supabase-Seite, nicht des Tokens (Projekt-Abfrage 200, Listen-Abfragen 500). Der Deploy versucht den Link jetzt bis zu 5-mal; sonst Deploy neu starten |
| Echte Schlüssel in Chat/Terminal gelandet | widerrufen, neu erstellen |

Mehr: die Runbooks ([Liste](wiki:ref-runbooks)) und [Wissen aktuell halten](wiki:wissen-pflegen), falls hier ein Fall fehlt: ergänze ihn.
