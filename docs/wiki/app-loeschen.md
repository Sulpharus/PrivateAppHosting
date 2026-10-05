---
title: Apps deaktivieren und löschen
category: apps
order: 80
summary: Der Unterschied zwischen Deaktivieren, Löschen ohne und mit Daten, und was dabei passiert
---

Verwaltung → Apps (ADR 0020, Runbook `uninstall.md`).

## Drei Stufen

| Stufe | Wirkung | Rückgängig |
| --- | --- | --- |
| **Deaktivieren** | App sofort offline, alles bleibt (Code, Daten, Freigaben) | *Aktivieren* |
| **Löschen ohne Daten** | App offline, Server bei Cloudflare gelöscht, **Code wird per Pull Request entfernt**; Datenbank-Tabellen und Dateien bleiben | App neu hochladen oder den Entfernen-Pull-Request zurücknehmen |
| **Löschen mit Daten** | wie oben, und alle Daten der App sind weg: Tabellen, Dateien, Logo, Freigaben, Einstellungen, Push-Abos, Spielergebnisse | **nicht möglich**, außer aus einer [Sicherung](wiki:sicherung) |

Link-Kacheln haben „Entfernen“. Die App **kalender** ist geschützt (gemeinsame Daten und Google-Sync hängen an ihr) und lässt sich nur
deaktivieren.

## So löschst du eine App

1. Optional zuerst eine [Sicherung](wiki:sicherung) erstellen, falls du Daten behalten könntest.
2. Verwaltung → Apps → **Löschen** bei der App. Im Dialog das Häkchen „Auch alle Daten löschen“ setzen oder entfernen und die Adresse der App
   zur Bestätigung eintippen.
3. Die App ist sofort offline. Der Workflow **App löschen** (`uninstall-app.yml`) löscht den Cloudflare-Server und (mit Daten) die Tabellen,
   Dateien und den Eintrag, danach öffnet er einen **Pull Request**, der `hosted/<name>` entfernt.
4. **Diesen Pull Request mergen** (nach grünen Prüfungen). Sonst bringt ein späterer vollständiger Deploy die App zurück. Wird CI rot, weil
   etwas anderes die App erwähnt (ein e2e-Test, ein Dokument), korrigierst du das im selben Pull Request.

## Was genau gelöscht wird (mit Daten)

Reihenfolge: App aus (`disabled`) → Cloudflare-Worker samt Domain-Zuordnung → Schema `app_<name>` aus der Daten-API entfernen, bestätigen und
**erst dann** löschen → Dateien unter `app-files/<name>/` und das Logo → Eintrag in `platform.apps` zuletzt (damit alles daran Hängende
mitgeht) und die Liste der angewendeten App-Migrationen. Jeder Schritt lässt sich wiederholen, falls ein Lauf abbricht.

## Was nicht automatisch weggeht

- **Bibliotheks-Programme:** der Container wird gestoppt; sein Datenordner (`/srv/mininode/apps/<name>`) und der DNS-Eintrag der Adresse
  bleiben, bis du sie selbst entfernst.
- **Andere Container-Apps** auf der NucBox laufen weiter, bis du sie dort stoppst.
- **Programme in der Windows-VM** bleiben installiert; deinstalliere sie dort.
- **Gemeinsame Datensätze**, die die App in die Suite geschrieben hat (Termine, Verträge), bleiben erhalten.

## Von Hand

`pnpm mininode uninstall <name> --purge --env production` (braucht die Schlüssel, siehe Runbook), oder GitHub → Actions → *App löschen*.
