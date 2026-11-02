---
title: MiniNode und Apps aktualisieren
category: betrieb
order: 75
summary: Mit einem Klick die neue MiniNode-Version oder die neueste Version einer App von GitHub holen, ohne Daten zu verlieren
---

Verwaltung → **Updates** (ADR 0028, Runbook `updates.md`). Die Seite zeigt, welche Version von MiniNode installiert ist und welche die neueste ist, und listet jede App, die ein GitHub-Repository hat.

## So läuft ein Update

1. **Aktualisieren** klicken (nach kurzer Bestätigung der Identität). Das startet einen GitHub-Workflow.
2. Der Workflow holt die neue Version und legt sie als **Pull Request** bereit: bei MiniNode das Starter-Paket des neuesten Releases, bei einer App der aktuelle Stand ihres Repositories.
3. Die üblichen Prüfungen (Lint, Tests, Datenbank, Sicherheitsscan) laufen auf diesem Pull Request. Sind sie grün, **mergen** (mit der Variable `INTEGRATE_AUTOMERGE=true` passiert das von selbst).
4. Erst das Mergen deployt. Ist etwas rot, passiert nichts, und dein Stand bleibt wie er ist.

## Was dabei geschützt ist

- **Daten** liegen in Supabase, nicht in den Dateien. Ein Update berührt sie nie.
- **Datenbank-Migrationen**, die schon gelaufen sind, werden nie verändert, auch nicht von einer neuen Version. Würde ein Update das tun, bricht es mit einer klaren Meldung ab. Neue Migrationen kommen dazu und laufen beim Deploy.
- **Deine eigenen Dateien** bleiben: alle Apps unter `hosted/`, `mininode.config.json`, `docs/STATUS.md` und `biome.json` (mit den Ausnahmen deiner Apps).
- Die **Workflow-Dateien** (`.github/workflows`) werden nur mit dem Secret `INTEGRATE_TOKEN` (Berechtigung „Workflows: Read and write“) mitaktualisiert; ohne ihn steht das im Pull Request.
- Wer einen eigenen Stand von Dateien der Plattform hat, sieht die Änderung im Pull Request und kann sie dort prüfen, bevor er mergt.

## Eine App mit Repository

Trage in der `mininode.json` der App `"repository": "name/projekt"` ein (zum Beispiel das Projekt, das [Apps exportieren](wiki:apps-exportieren-releases) angelegt hat). Danach erscheint sie unter Updates. Das Update ersetzt `hosted/<slug>` durch den Stand des Repositories und merkt sich dessen Commit. Die Adresse (`slug`) der App muss im Repository dieselbe sein.

## Vorher sichern

Wenn dir die Daten wichtig sind, mach vor dem Mergen eine [Sicherung](wiki:sicherung). Zurückspielen geht damit auch, falls eine neue Version Daten anders deutet als erwartet.

## Einrichten

- `updates.source` in `mininode.config.json`: das Projekt, das Releases veröffentlicht (`owner/repo`). Das Starter-Paket trägt es schon ein.
- `LIBRARY_DISPATCH_TOKEN` startet die Workflows (wie bei der [App-Bibliothek](wiki:app-bibliothek-programme)); für private App-Repositories braucht der Workflow zusätzlich `EXPORT_REPO_TOKEN` oder `INTEGRATE_TOKEN` mit Lesezugriff.
