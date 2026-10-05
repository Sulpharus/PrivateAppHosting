---
title: App-Bibliothek, Programme und Remote-Apps
category: apps
order: 90
summary: Container-Programme, Windows-Programme und Wine: was es gibt und wie man sie installiert
---

Neben Web-Apps betreibt MiniNode **Programme auf deinem Heimserver** (der NucBox, siehe [NucBox](wiki:nucbox)). Sie laufen hinter dem
MiniNode-Login und sind von jedem Gerät im Browser erreichbar.

## App-Bibliothek (ADR 0011)

Bekannte Linux-Programme als Container, **mit einem Klick** unter Verwaltung → Hardware-Server → App-Bibliothek: Jellyfin, n8n,
Uptime Kuma, Stirling PDF. Die Versionen sind **fest** in `infra/nucbox/library.json` eingetragen (Image mit Prüfsumme); neue
Versionen oder Programme kommen per Pull Request.

- **Installieren:** Adresse wählen, klicken; nach zwei bis fünf Minuten steht die App unter Verwaltung → Apps. Dann Zugriff vergeben.
- **Aktualisieren:** installiert die Version, die der Katalog auf `main` nennt; Daten bleiben.
- **Entfernen:** stoppt das Programm und deaktiviert die App; Daten bleiben unter `/srv/mininode/apps/<name>/data`. Wirklich löschen:
  [App löschen](wiki:app-loeschen).
- Fehlerhafte Starts rollen sich selbst zurück (Gesundheitsprüfung nach 60 s).

Einrichtung einmalig: `LIBRARY_DISPATCH_TOKEN` (Actions: Read and write) und auf der NucBox `CATALOG_TOKEN` (Contents: Read), siehe
`app-library.md`.

## Programme für PC/Server hochladen (ADR 0013)

`.exe`/`.msi` unter Verwaltung → Apps → [Hochladen](wiki:hochladen): Die API legt die Datei in Cloudflare R2
(`installers/<name>/<datei>`), registriert eine Remote-App und startet die Installation auf der NucBox: **Snapshot der VM, Prüfsumme prüfen,
stille Installation** (Windows-VM) oder Wine-Container. Klappt etwas nicht („Braucht Prüfung“), stehen im Protokoll die Gründe; meist
helfen andere stille Argumente (Inno Setup: `/VERYSILENT /NORESTART`) oder der richtige Programmpfad, dann „Erneut versuchen“. Die VM lässt
sich in Proxmox auf den Snapshot `pre-<name>-…` zurückrollen. Installer über 95 MB legst du selbst in R2 (`programs.md`).

## Remote-Apps im Betrieb

Verwaltung → Hardware-Server → **Remote-Apps**: Native Programme im Browser über Guacamole. Eine Sitzung gleichzeitig mit Warteschlange
und Anzeige „belegt seit …“. Windows-VM und Container schlafen, solange niemand verbunden ist (Leerlauf 15 Minuten, Warnung 2 Minuten
vorher). Für `trusted`-Personen im gemeinsamen Konto sind Zwischenablage, Dateiübertragung und Laufwerksumleitung abgeschaltet; sie arbeiten
in einem eigenen, gesperrten Windows-Konto. Die Sitzung braucht eine frische Anmeldung (Step-up).

## Linux oder Windows?

- **Linux-Programm** (Container-Image) → App-Bibliothek.
- **Windows-Programm** → Hochladen als Programm.
- Ein `.exe` ist nie für Linux; ein Linux-Programm gehört nie in die Windows-VM.
