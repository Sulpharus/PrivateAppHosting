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

Jede Version hat bis zu drei Pakete mit Prüfsummen (`SHA256SUMS`):

| Tag | Baut |
| --- | --- |
| `v1.2.0` | Cloud, PC/Server und Komplett |
| `cloud-v1.2.0` | nur Cloud |
| `pc-server-v1.2.0` | nur PC/Server |

```bash
git tag v1.2.0 && git push origin v1.2.0
```

Der Workflow *Release* baut die Pakete (`scripts/package-release.sh`) und hängt sie an das GitHub-Release. Prüfen:
`sha256sum -c SHA256SUMS`. Betriebssystem für den PC/Server-Teil: Proxmox VE 9 mit Linux-VM (Docker) und optional Windows 11.

## Die Plattform teilen (Idee, nicht begonnen)

Plan: Instanz-Einstellungen in eine `mininode.config.json`, ein sauberes Vorlagen-Repository und ein `init`-Assistent (`PLAN.md` §15.2).
Noch nicht entschieden.
