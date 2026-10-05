---
title: Eine App hinzufügen: welcher Weg passt?
category: apps
order: 20
summary: Entscheidungshilfe: Hochladen, KI-Werkstatt, Claude Code, Bibliothek, Link
---

Es gibt mehrere Wege. Wähle nach dem, was du hast:

| Du hast … | Weg | Wo |
| --- | --- | --- |
| eine fertige **Web-App als ZIP** (aus Claude, AI Studio, Vite, Next.js) | **Hochladen**: ein Skript baut sie ein | Verwaltung → Apps → Hochladen ([Hochladen](wiki:hochladen)) |
| nur eine **Idee** | **KI-Werkstatt** liefert den Prompt, die KI baut, dann Hochladen | Verwaltung → KI-Werkstatt ([KI-Werkstatt](wiki:ki-werkstatt)) |
| ein **Windows-Programm** (`.exe`, `.msi`) | Hochladen als Programm; die NucBox installiert es | [Programme](wiki:app-bibliothek-programme) |
| ein **bekanntes Linux-Programm** (Jellyfin, n8n …) | App-Bibliothek, ein Klick | Verwaltung → Hardware-Server → App-Bibliothek |
| eine **fremde Website**, nur als Kachel | Link-Kachel | Verwaltung → Apps → Link-Kachel anlegen |
| ein Projekt, das das Skript **nicht versteht** | Claude Code mit dem Skill `integrate-app` | [Mit Claude Code arbeiten](wiki:claude-code) |
| Lust, direkt im Repository zu bauen | Ordner `hosted/<name>/` anlegen und per Pull Request einbringen | [Repository-Aufbau](wiki:repo-aufbau) |

## Nach dem Einbau: immer dasselbe

1. **Prüfen:** der Pull Request muss grün sein (Prüfungen, `mininode doctor`).
2. **Mergen:** der Deploy migriert die Tabellen der App, veröffentlicht sie unter `<name>.mininode.app` und trägt sie ein.
3. **Freigeben:** Verwaltung → Apps → Zugriff, oder „Für alle neuen Nutzer“ ([Rollen](wiki:rollen-zugriff)).
4. **Gemeinsame Daten genehmigen**, falls die App welche anfragt: Verwaltung → Gemeinsame Daten
   ([Gemeinsame Daten](wiki:gemeinsame-daten)).
5. **API-Schlüssel eintragen**, falls sie externe APIs nutzt: Verwaltung → API-Schlüssel ([API-Schlüssel](wiki:api-schluessel)).
6. **Logo** (optional): Verwaltung → Apps → *Logo hochladen*; oder eine `icon.svg` im App-Ordner, die der Deploy aufnimmt
   (ADR 0018). Jede App bringt eines mit; ohne Logo zeigt die Kachel ein Monogramm. Ein von Hand gesetztes Logo wird nie überschrieben.
7. **Kategorie** prüfen: stimmt die automatische Zuordnung? Sonst von Hand setzen.

## Regeln, die jede App einhält

Die KI-Vorgaben (`docs/ai/NEW-APP-SPEC.md`) und `mininode doctor` erzwingen unter anderem: keine eigenen Logins oder Backends,
keine Geheimnisse im Code, Daten nur über SDK (`mn.kv`, Tabellen), keine eigenen Service Worker, Texte in zwei Sprachen,
deutsche Formate, das App-Kit für das Aussehen ([App-Kit und SDK](wiki:app-kit-sdk), [Sprache und Formate](wiki:sprachen-formate)).

## Apps wieder loswerden

Deaktivieren (sofort offline, alles bleibt) oder **Löschen** (mit Daten): [App löschen](wiki:app-loeschen).
