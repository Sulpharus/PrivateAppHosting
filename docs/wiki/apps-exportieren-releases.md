---
title: Apps exportieren und Releases
category: apps
order: 95
summary: Eine App als eigenes GitHub-Projekt weitergeben und die Pakete pro Version
---

## Eine App als GitHub-Projekt (ADR 0012)

Verwaltung → Apps → **Als GitHub-Projekt** bei einer selbst gehosteten App: Der Workflow `export-app.yml` legt ein eigenes Repository an
(Name `mininode-<name>`, privat oder öffentlich) oder ergänzt einen Commit. **Nur der Code** der App kommt mit: keine Nutzerdaten, keine
Schlüssel, keine Kennungen dieser Installation. Der Export bricht ab, wenn die Prüfung etwas Privates findet (Schlüssel, Projektkennungen,
persönliche Adressen, Datenfiles, Binärdateien, Bild-Metadaten), und nennt `Datei:Zeile Regel`. Lokal geht es ohne GitHub:
`pnpm mininode export hosted/<name> --out ../export-<name>`. Eine Lizenz wird nicht gesetzt: wähle eine, bevor du das Projekt teilst.

Einrichtung: `EXPORT_REPO_TOKEN` (Administration + Contents: write, alle Repositories) in der GitHub-Umgebung `production`.

## Releases (ADR 0016)

Ein Release enthält das **Starter-Paket** (`mininode-starter-<Version>.zip`) mit Prüfsumme (`SHA256SUMS`). Damit beginnt man ein eigenes MiniNode: die ganze Plattform ohne Apps und ohne Kennungen einer Installation, mit Cloudflare-Einrichtung, Desktop-Installer für Docker, Heimserver-Teil und allen Anleitungen (ADR 0026; Anleitung: [Einrichten](wiki:einrichten)).
Der Paketbauer prüft vor dem Packen, dass keine Kennung dieser Installation darin steckt. Andere Pakete (Cloud, PC/Server, Komplett) gibt es nicht mehr im Release, weil sie das ganze Repository samt eigenen Apps enthielten.

Der Titel des Releases ist die erste Zeile der Tag-Nachricht; ein Tag mit Bindestrich (`v0.1.0-test`) wird als Vorabversion markiert:

```bash
git tag -a v0.1.0-test -m "Titel des Releases" && git push origin v0.1.0-test
```

Der Workflow *Release* baut das Starter-Paket (`scripts/package-release.sh`) und hängt sie an das GitHub-Release. Prüfen:
`sha256sum -c SHA256SUMS`. Betriebssystem für den PC/Server-Teil: Proxmox VE 9 mit Linux-VM (Docker) und optional Windows 11.

## Die Plattform teilen (Idee, nicht begonnen)

Plan: Instanz-Einstellungen in eine `mininode.config.json`, ein sauberes Vorlagen-Repository und ein `init`-Assistent (`PLAN.md` §15.2).
Noch nicht entschieden.
