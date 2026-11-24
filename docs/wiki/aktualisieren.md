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

**Wichtig:** Nur mit dem Secret `INTEGRATE_TOKEN` starten die Prüfungen auf dem Pull Request von selbst (ein Push mit dem Standard-Token startet keine Workflows). Ohne ihn steht im Pull Request eine Warnung: nicht ungeprüft mergen. Ein Update einer **App** wird nie automatisch gemergt, weil sie Code und Rechte (`mininode.json`) von außen mitbringt; lies den Pull Request.

## Was dabei geschützt ist

- **Daten** liegen in Supabase, nicht in den Dateien. Ein Update berührt sie nie.
- **Datenbank-Migrationen**, die schon gelaufen sind, werden nie verändert, auch nicht von einer neuen Version. Würde ein Update das tun, bricht es mit einer klaren Meldung ab. Neue Migrationen kommen dazu und laufen beim Deploy.
- **Deine eigenen Dateien** bleiben: alle Apps unter `hosted/`, `mininode.config.json`, `docs/STATUS.md`, `biome.json` (mit den Ausnahmen deiner Apps) sowie dein Verlauf in `neuigkeiten.md` und `startup-guide.md`. Alles andere von der Plattform (auch andere Wiki-Artikel) wird ersetzt; deine Änderungen daran siehst du im Pull Request.
- Die **Workflow-Dateien** (`.github/workflows`) werden nur mit dem Secret `INTEGRATE_TOKEN` (Berechtigung „Workflows: Read and write“) mitaktualisiert; ohne ihn steht das im Pull Request.
- Wer einen eigenen Stand von Dateien der Plattform hat, sieht die Änderung im Pull Request und kann sie dort prüfen, bevor er mergt.

## Eine App mit Repository

Trage in der `mininode.json` der App `"repository": "name/projekt"` ein (zum Beispiel das Projekt, das [Apps exportieren](wiki:apps-exportieren-releases) angelegt hat). Danach erscheint sie unter Updates. „Installiert“ steht bei einer App auf *unbekannt*, bis das erste Update ihren Stand gemerkt hat; bei MiniNode, bis das erste Update `.mininode/platform-files.json` geschrieben hat. Das Update ersetzt `hosted/<slug>` durch den Stand des Repositories und merkt sich dessen Commit. Die Adresse (`slug`) der App muss im Repository dieselbe sein.

## Automatisch aktualisieren (ADR 0029)

Neben jeder App mit Repository steht der Schalter **Automatisch aktualisieren**. Ist er an, holt der Workflow **Apps automatisch
aktualisieren** (`auto-update-apps.yml`) jede Nacht um 02:41 UTC die neueste Version. Der Pull Request mergt sich selbst, sobald die
Pflicht-Prüfungen von `main` grün sind, aber **nur, wenn die `mininode.json` gleich bleibt** (Rechte, Domains, Schlüssel, Datenmodus):
sonst wartet er auf dich wie jedes andere Update. Bei einer App, die schon auf dem neuesten Stand ist, passiert nichts.

Voraussetzungen fürs selbständige Mergen: der Schlüssel `INTEGRATE_TOKEN` (sonst laufen keine Prüfungen), **Allow auto-merge** in den
Repository-Einstellungen und eine Regel, die auf `main` die Prüfungen verlangt. Fehlt etwas davon, bleibt der Pull Request einfach
offen. Bedenke: Ein automatisches Update kann ändern, was die App innerhalb ihrer Rechte tut. Schalte es nur für Projekte ein, denen
du vertraust.

## Vorher sichern

Wenn dir die Daten wichtig sind, mach vor dem Mergen eine [Sicherung](wiki:sicherung). Zurückspielen geht damit auch, falls eine neue Version Daten anders deutet als erwartet.

## Einrichten

- `updates.source` in `mininode.config.json`: das Projekt, das Releases veröffentlicht (`owner/repo`). Das Starter-Paket trägt es schon ein.
- `LIBRARY_DISPATCH_TOKEN` startet die Workflows (wie bei der [App-Bibliothek](wiki:app-bibliothek-programme)); für private App-Repositories braucht der Workflow zusätzlich `EXPORT_REPO_TOKEN` oder `INTEGRATE_TOKEN` mit Lesezugriff.
