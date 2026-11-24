---
title: Hochladen und automatischer Einbau
category: apps
order: 30
summary: Wie ein hochgeladenes ZIP zur App wird, was das Skript prüft und wann die KI-Prüfung nötig ist
---

Verwaltung → Apps → **Hochladen** (ADR 0013). Ein Feld nimmt zwei Arten Dateien:

- **ZIP** = Web-App. Ein Skript baut sie ein.
- **`.exe` / `.msi`** = Programm für PC/Server ([Programme](wiki:app-bibliothek-programme)).

## Von GitHub installieren (ADR 0029)

Unter dem Upload-Feld steht **Von GitHub installieren**: die Adresse eines Projekts eintragen (`https://github.com/name/projekt`)
und **Installieren**. Der Workflow holt das Projekt (bei privaten Projekten mit dem Schlüssel `APP_READ_TOKEN`, nur Lesezugriff, in der
GitHub-Umgebung `production`) und baut es ein wie ein ZIP, mit Pull Request und Liste unten. Projekte mit symbolischen Links oder über
40 MB werden abgelehnt.

Mit **Automatisch aktualisieren** (standardmäßig aus) merkt sich die App ihr Projekt: Jede Nacht kommt dann die neueste Version als Pull
Request. Er mergt sich nur selbst, wenn beim Deploy nichts aus dem Projekt mit den Schlüsseln läuft (keine geänderten Rechte, kein
Build-Schritt, keine Migrationen oder Abhängigkeiten, siehe [Aktualisieren](wiki:aktualisieren)); sonst wartet er auf dich. Was ein
ZIP oder Projekt selbst über Updates in seiner `mininode.json` sagt, wird ignoriert: das entscheidest nur du. Das geht nur bei MiniNode-Apps, die selbst eine `mininode.json` mit derselben Adresse mitbringen (zum Beispiel
ein Projekt aus „Als GitHub-Projekt“); andere Projekte werden einmal eingebaut, ohne Updates. Den Schalter änderst du später unter
Verwaltung → **Updates** ([Aktualisieren](wiki:aktualisieren)).

## Was bei einem ZIP passiert

1. Die API speichert das ZIP und startet den Workflow **Web-App einbauen** (`integrate.yml`).
2. Das Skript `mininode integrate` ordnet den Export um, prüft ihn mit `doctor` und baut ihn. Der Code des Exports läuft dabei
   **ohne Token und Schlüssel**.
3. **Erfolg:** ein **Pull Request** `auto/<name>-<id>`. Die Liste zeigt „**Pull Request offen**“. Erst wenn er gemergt ist,
   steht dort „Eingebaut“ (`pr-merged.yml`); schließt du ihn ohne Merge, steht dort „Ausgeblendet“.
4. **Nicht geschafft:** Das Skript hinterlässt nichts in `hosted/`. Stattdessen entstehen ein Branch `review/<id>` mit dem ZIP und
   ein **Issue** mit Label `ai-review` (siehe unten).

> **Wichtig:** Der Status des Uploads sagt nichts über die Prüfungen. **Mergen erst, wenn jede Prüfung auf dem Pull Request grün ist.**

## Was das Skript selbst kann

Vite/React- und AI-Studio-Exporte (auch mit `window.MiniNode` und `localStorage`-Daten), reines HTML, Exporte mit schon
vorhandener `mininode.json` (dort räumt es auf, was Generatoren regelmäßig falsch machen: unbekannte Schlüssel wie `accent`, den
Platzhalter `neue-app`, `npm run build`, das `package.json` von AI Studio, Beispiel-Mailadressen). Es führt dieselben Prüfungen wie CI aus: `doctor` (inklusive Suche nach Geheimnissen, privaten
Kennungen, echten Mail-Adressen in Demo-Daten und untergeschobenem `/_mininode/`-Ordner), Build und Biome (Code, den Biome
nicht lesen kann, wird ganz von Biome ausgenommen).

## Was zur KI-Prüfung geht

Eigene Server-Routen, KI-Anbieter-SDKs oder Schlüssel im Browser, IndexedDB, eigenes Firebase/Supabase, WebSockets, CDN-Skripte
oder Import-Maps, Inline-Ereignisse, unbekannte Vite-Plugins, Next.js, Python, Docker, ein Installer im ZIP, eine bereits
vergebene Adresse, ein Name oder eine Adresse, die nur ein Platzhalter ist („Neue App“), eine eigene Ersatzdatei für das Plattform-Gerüst
(`FallbackMiniNodeClient`, `window.MiniNode`, Code, der `window.mininode` liest, ohne das SDK zu laden). Dann sagst du Claude Code: **„arbeite die ai-review-Issues ab“** (Skill `integrate-app`). Der Lauf baut die App
nach `hosted/<name>`, öffnet einen Pull Request mit `Closes #<Issue>` und räumt den Branch ab. Mit dem Schließen des Issues steht die
App in der Liste als eingebaut. In der Liste kopiert **Prüfauftrag kopieren** eine fertige Aufgabe für Claude.

Noch nicht möglich: Scans und Fotos per KI lesen (der KI-Proxy leitet nur Text weiter).

## Einrichten (einmalig)

Schlüssel und Regeln dafür stehen im Runbook `uploads.md` ([Liste](wiki:ref-runbooks)). Kurz:

1. `LIBRARY_DISPATCH_TOKEN` (Actions: Read and write): startet Workflows; ohne ihn sagt die Seite „noch nicht eingerichtet“.
2. `INTEGRATE_TOKEN` (Contents und Pull requests: write): damit CI und Deploy laufen, was der Workflow anlegt.
3. **Eine Regel auf `main`**, die die vier Prüfungen verlangt (*Lint, typecheck, test*; *Database, integration and e2e*;
   *Infra scripts and images*; *Secret scan*). Ohne sie lässt GitHub rote Pull Requests zu.
4. Optional `INTEGRATE_AUTOMERGE=true`: GitHub mergt dann selbst, sobald die Prüfungen grün sind.

## Meldung „GitHub hat den Start abgelehnt“

Sie nennt den GitHub-Status: **401** Schlüssel ungültig/abgelaufen; **403** dem Schlüssel fehlt *Actions: Read and write*;
**404** der Schlüssel sieht das Repository nicht, oder `integrate.yml` ist auf `main` nicht registriert, oder (oft!) der
**Standard-Branch des Repositorys ist nicht `main`**; **422** Eingaben fehlen. Nach dem Korrigieren von
`LIBRARY_DISPATCH_TOKEN` einmal den Deploy auf `main` laufen lassen, damit die API den neuen Schlüssel bekommt.

## Selbst ausprobieren

```bash
pnpm mininode integrate pfad/zum/export.zip --build --tidy --report report.md
```

Exit 0: `hosted/<name>` ist fertig. Exit 2: braucht Prüfung (siehe Bericht).
