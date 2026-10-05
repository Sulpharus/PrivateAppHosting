---
title: Sicherung und Wiederherstellung
category: daten
order: 70
summary: Eine vollständige, verschlüsselte Sicherung aller Daten erstellen, aufbewahren und zurückspielen
---

Verwaltung → **Sicherung** (ADR 0019, Runbook `backups.md`). Zusätzlich sichert die NucBox nachts auf eigene Faust (restic; `restore.md`).

## Was drin ist

- die **Datenbank**: Konten **mit Passwort-Prüfsummen und zweiten Faktoren (Passkeys)**, Daten der Plattform und jeder App (`pg_dump`, nur Daten);
- alle **Dateien** im Speicher (Fotos, Belege, Uploads, Logos); abwählbar für eine schnelle Kopie;
- lesbare **Einstellungen** (JSON, ohne Schlüssel): Apps, Freigaben, Kategorien, API-Dienste, Budgets, Profile, Kontenliste;
- ein **Inhaltsverzeichnis** mit Prüfsumme je Datei.

**Nicht drin:** Geheimnisse der Worker und von GitHub (nicht auslesbar), der Code der Apps (liegt in Git), NucBox und Windows-VM (restic, Proxmox).
Hänge sicher an: `VAULT_KEY` und `GOOGLE_TOKEN_KEY` aufbewahren, sonst sind API-Schlüssel und Google-Verbindungen nach einer Wiederherstellung unlesbar.

## Einrichten (einmalig)

1. GitHub → Settings → Environments → `production`: Geheimnis **`BACKUP_PASSPHRASE`**, mindestens 16 Zeichen, besser lang und zufällig; **dieselbe Zeile in den
   Passwortmanager**. Ohne sie lässt sich keine Sicherung öffnen.
2. Die Umgebung `production` auf den Branch `main` beschränken (am besten mit dir als Pflicht-Prüfer): nur das schützt die Schlüssel vor einem Branch.
3. Vorhanden sind schon `SUPABASE_DB_URL`, `SUPABASE_SECRET_KEY` und `LIBRARY_DISPATCH_TOKEN`.

## Erstellen und herunterladen

Verwaltung → Sicherung → **Sicherung erstellen** (Häkchen für Dateien) → nach einigen Minuten *Fertig* → **Herunterladen** (frische Anmeldung, Link gilt
eine Minute, die Datei geht direkt von GitHub zu dir). Du erhältst ein ZIP mit einer **7z-Datei** (AES-256, auch die Dateinamen sind verschlüsselt); öffne sie
mit 7-Zip und der Passphrase. GitHub hält sie **30 Tage**. Lege sie **außerhalb von GitHub und Supabase** ab und prüfe sie:
`pnpm mininode backup verify <entpackter ordner>`. GitHub Free erlaubt insgesamt 500 MB Artefakte: lade herunter und lösche alte unter Actions.

## Wiederherstellen

Auf deinem Rechner, mit Docker (oder PostgreSQL-Tools in Version 17) und den Variablen `SUPABASE_URL`, `SUPABASE_SECRET_KEY` und `SUPABASE_DB_URL` (**Session pooler**, Port 5432):

```bash
pnpm mininode backup verify  ./backup
pnpm mininode backup restore ./backup                                    # zeigt den Plan, ändert nichts
pnpm mininode backup restore ./backup --yes --confirm <datenbank-host>   # führt aus
```

Jede Tabelle der Sicherung wird in **einer Transaktion** geleert und neu gefüllt; sie wird nur übernommen, wenn alles sauber lief und die Zeilenzahlen stimmen,
sonst bleibt alles wie es war. Alle müssen sich neu anmelden; Passwörter und Passkeys gelten weiter. Der Plan nennt auch Tabellen außerhalb der Sicherung, die
mitgeleert würden (Sitzungen sind erwartet, alles andere stoppt die Wiederherstellung, außer mit `--force`).

**In ein neues Supabase-Projekt:** Projekt anlegen, Schlüssel und Adressen in GitHub/Worker eintragen (Geheimnisse aus dem Passwortmanager), den Deploy mit *alle Apps* laufen
lassen (legt Tabellen und App-Schemas an), Auth-Hooks und Google-Anbieter wieder einschalten, dann `restore --yes`.

## Grenzen

Die Sicherung entsteht im laufenden Betrieb: Datenbank, Zahlen und Einstellungen stammen aus einem Schnappschuss, Dateien werden direkt danach kopiert. Getestet ist alles
gegen den lokalen Stack; für das echte Supabase-Projekt vorher **eine Wiederherstellung in ein Staging-Projekt üben**. Einen Zeitplan gibt es noch nicht.
