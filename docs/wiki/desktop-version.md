---
title: Desktop-Version
category: betrieb
order: 45
summary: MiniNode komplett auf einem Computer: Installation, Alltag, Sicherung, Netzwerk und Sicherheit
---

Die Desktop-Version ist **die ganze Plattform auf einem Computer** (ADR 0026): Portal, API, KI-Proxy und die Schranke jeder App laufen in einem Container (`apps/desktop-host`, auf demselben Laufzeitsystem
wie die Cloudflare Workers), daneben Supabase (Datenbank, Anmeldung, Daten-API, Dateien). Kein Cloudflare-Konto, kein Supabase-Konto, keine geteilten Schlüssel: der Installer erzeugt alle Geheimnisse auf deinem Rechner.
Läuft auf Windows, macOS und Linux, mit Intel/AMD- und ARM-Prozessoren; nötig ist nur Docker.

## Installieren

```bash
./infra/desktop/install.sh --admin-email du@example.org                  # Linux, macOS
powershell -ExecutionPolicy Bypass -File .\infra\desktop\install.ps1 -AdminEmail du@example.org   # Windows
```

Der Installer fragt nach einem Passwort (12 Zeichen oder mehr) für das erste Konto (Admin), baut das Image (beim ersten Mal einige Minuten), startet alles, richtet die Datenbank ein und nennt die Adresse:
**`http://mininode.localhost:8787/login`**. Erneutes Ausführen ist sicher: es baut neu und startet neu, Daten und Geheimnisse bleiben. Optionen: `--dir`, `--domain`, `--port`, `--scheme`, `--host-port`, `--lan`, `--no-admin`, `--ca-file`
(Firmen-Proxy mit eigenem Zertifikat).

## Alltag

| Befehl (`mininode-desktop`, in `~/mininode`) | Wirkung |
| --- | --- |
| `status`, `start`, `stop`, `restart` | Dienste ansehen, starten, anhalten (die Daten bleiben) |
| `logs host` | Protokoll eines Dienstes (`host`, `auth`, `rest`, `storage`, `kong`, `db`) |
| `add <Ordner oder ZIP>` | eine Web-App installieren oder aktualisieren (prüft, baut, legt Tabellen an, schaltet sie frei) |
| `remove <Name>` | eine App offline nehmen (mit `--purge` auch ihre Daten löschen) |
| `admin <E-Mail>` / `password <E-Mail>` | ein Konto anlegen / ein neues Passwort setzen (ohne E-Mail-Versand) |
| `backup` / `restore <Ordner>` | alles sichern / alles aus einer Sicherung zurückholen |
| `update <Ordner>` | auf eine neuere MiniNode-Version wechseln (sichert vorher) |
| `uninstall` | Container entfernen (fragt, bevor Daten gelöscht werden) |

Nach einem Neustart des Rechners startet MiniNode von selbst, sobald Docker läuft.

## Was anders ist als in der Cloud

- **Dabei:** Konten, Passkeys, Rollen, Freigaben, Daten (Tabellen, Dateien), Sprache, Offline-Betrieb, das App-Kit, Verwaltung, Wiki.
- **Mit eigenem Schlüssel:** KI-Funktionen (`GEMINI_API_KEY` oder `ANTHROPIC_API_KEY` als Zeile in `.env`, dann `restart`).
- **Nicht dabei:** alles, was GitHub oder Cloudflare braucht (Hochladen per Workflow, Bibliothek, Export, Sicherung aus der Verwaltung, Deploy per Push), E-Mail-Versand, Google-Anmeldung, Windows-Programme.

## Andere Geräte und Internet

Standard ist **nur dieser Rechner** (`127.0.0.1`). Für andere Geräte im Netz: Installer mit `--lan` und einer Domain, die jedes Gerät samt Unterdomains auflöst (Wildcard-DNS im Router oder ein Dienst wie
`sslip.io`). Ohne HTTPS erlauben Browser auf solchen Namen **keine Passkeys**; Anmeldung geht mit E-Mail und Passwort. Für das Internet: ein HTTPS-Tunnel davor (z. B. Cloudflare Tunnel auf deiner Domain mit `--scheme https --port 443 --host-port 8787`).
Den unverschlüsselten Port nie ins Internet stellen.

## Sicherung

`mininode-desktop backup` legt in `~/mininode/backups/<Datum>` ab: `database.dump`, die Dateien, die App-Dateien und `env.backup` (deine Geheimnisse). **Ohne `env.backup` ist die Sicherung nutzlos, mit ihm kann sie jeder lesen, der es hat:** lege den Ordner
privat außerhalb des Rechners ab. `restore <Ordner>` ersetzt alles durch die Sicherung (fragt vorher; du tippst RESTORE) und behebt die ID-Zähler. Einen Umzug auf einen anderen Rechner machst du so: dort installieren, dann `restore`.

## Sicherheit

- Alle Schlüssel (Datenbank-Passwort, Signierschlüssel, Schlüssel des Gateways, Verschlüsselungsschlüssel) entstehen bei der Installation; es gibt keine Standard-Passwörter. Der Installationsordner gehört nur dir (`.env` nur für dich lesbar).
- Keine offene Anmeldung; Passwörter mindestens 12 Zeichen; Anmeldeversuche sind begrenzt; Passkeys und Authenticator-App wie in der Cloud.
- Nur der Port der Schranke ist veröffentlicht, an `127.0.0.1` (außer mit `--lan`); Datenbank und Supabase-Dienste sind nur im Docker-Netz erreichbar.
- Zeilen-Sicherheit der Datenbank schützt Daten wie in der Cloud ([Rollen](wiki:rollen-zugriff), [Daten speichern](wiki:daten-speichern)).
- Docker, Betriebssystem und MiniNode aktuell halten.

Mehr: Runbook `setup-desktop.md`. Probleme: [Fehlerbehebung](wiki:fehlerbehebung).
