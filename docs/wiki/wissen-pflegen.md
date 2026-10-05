---
title: Wissen aktuell halten
category: entwicklung
order: 60
summary: Die Regel, dass Wiki und Startup-Guide bei jeder Änderung am System mitwachsen, und wie sie erzwungen wird
---

Dieses Wiki ist nur nützlich, wenn es stimmt. Darum gilt: **Jede Änderung am System, die man sehen, bedienen oder betreiben kann, aktualisiert im selben Commit das Wissen.**
Das ist eine feste Regel in `CLAUDE.md` (ADR 0021), die auch Claude Code befolgt, und ein Test erzwingt sie zum Teil.

## Was bei welcher Änderung mitzupflegen ist

| Änderung | Mitpflegen |
| --- | --- |
| neue oder geänderte **Verwaltungsseite** / Menüpunkt | [Verwaltung: jede Seite erklärt](wiki:verwaltung-rundgang) und der passende Fach-Artikel; **der Test verlangt den Namen** |
| neue **Funktion** für Nutzer oder Admin | der passende Artikel ([Apps](wiki:apps-verstehen), [Daten](wiki:daten-speichern), [Sicherung](wiki:sicherung) …), der [Startup-Guide](/admin/guide), falls es ein erster Schritt ist |
| neue **Entscheidung** | ADR unter `docs/adr/`; **der Test verlangt, dass ein Artikel sie als „ADR 00NN“ erwähnt** |
| neuer **Workflow**, **Befehl**, **Runbook** | erscheint automatisch in den Referenzseiten ([Workflows](wiki:ref-workflows), [Befehle](wiki:ref-befehle), [Runbooks](wiki:ref-runbooks)); Fach-Artikel nachführen |
| neues **Paket** oder **Plattform-Programm** in `apps/`, `packages/` | [Was ist MiniNode?](wiki:ueberblick) und [Repository-Aufbau](wiki:repo-aufbau); **der Test verlangt den Ordnernamen** |
| neue **App** in `hosted/` | erscheint automatisch unter [Apps im System](wiki:ref-apps) |
| neuer **Fehlerfall**, der gelöst wurde | [Fehlerbehebung](wiki:fehlerbehebung) |
| **jede** Änderung | ein Eintrag in [Neuigkeiten](wiki:neuigkeiten) (Datum, was, wo man es findet) |
| Funktion, die **Apps** nutzen | auch `docs/ai/NEW-APP-SPEC.md` und die Prompt-Bausteine unter `docs/ai/prompts/` ([KI-Werkstatt](wiki:ki-werkstatt)) |
| Betrieb | das Runbook, und `docs/STATUS.md` (Stand, offene Schritte) |

## Wie das Wiki gebaut ist

- Artikel sind **Markdown-Dateien in `docs/wiki/`**, auf Deutsch, mit Kopfzeilen (`title`, `category`, `order`, `summary`). Sie werden beim Bauen des Portals eingebunden
  (`apps/portal/src/lib/wiki.ts`); jeder Artikel hat unten einen Link „Artikel bearbeiten“ zu seiner Datei.
- Der **Startup-Guide** ist `docs/wiki/startup-guide.md`: jede Überschrift `## …` ist ein Schritt der Checkliste, abhakbar, mit Fortschritt im Browser.
- **Referenzseiten** entstehen aus dem Repository selbst und können nicht veralten: Apps (`hosted/*/mininode.json`), Workflows, Befehle (Hilfetext der CLI), ADRs, Runbooks.
- Links zwischen Artikeln: `[Text](wiki:artikel-name)`; zur Verwaltung: `[Text](/admin/apps)`; nach außen nur `https://`.
- Erlaubt sind Überschriften, Absätze, Listen, Tabellen, Code, Zitate, **fett**, *kursiv*; rohes HTML wird nicht durchgelassen.
- Neuer Artikel: Datei anlegen, Kopfzeilen setzen, aus einem anderen Artikel verlinken; `category` ist `einstieg`, `apps`, `daten`, `betrieb` oder `entwicklung`.

## Der Test (`apps/portal/src/lib/wiki.test.ts`)

Er läuft in jeder CI und schlägt fehl, wenn

- ein Artikel falsche Kopfzeilen hat, doppelt vorkommt oder ein Link ins Leere führt;
- eine **Verwaltungsseite** (Seitenleiste), ein **Ordner unter `apps/` oder `packages/`** oder ein **ADR** in keinem Artikel vorkommt;
- der Startup-Guide fehlt oder keine Schritte hat;
- der Markdown-Renderer rohes HTML durchlässt.

Er kann nicht prüfen, ob ein Text noch **stimmt**. Das ist Aufgabe dessen, der etwas ändert, und des Reviews: Beim Prüfen einer Änderung gehört die Frage „Ist das Wissen dazu aktuell?“
dazu.

## Wenn du etwas Falsches liest

Klicke unten im Artikel auf „Artikel bearbeiten“ (GitHub) oder sag Claude: „Das Wiki sagt X, aber es ist Y. Korrigiere es.“
