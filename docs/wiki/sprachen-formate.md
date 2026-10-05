---
title: Sprache und Formate
category: apps
order: 60
summary: Deutsch und Englisch in jeder App, Sprachpakete und die deutschen Zahlen- und Datumsformate
---

## Eine Sprache pro Person

Jede Person wählt die Sprache **einmal** unter *Dein Konto → Sprache / Language* (Deutsch oder English). Sie steht im Profil
(`platform.profiles.language`) und im Cookie `mn-lang` auf `*.mininode.app`; so folgt jede App und jedes neue Gerät (ADR 0017). Die
Oberfläche des Portals selbst (Verwaltung, Wiki) ist noch Deutsch.

## Sprachpakete in Apps

Jede App liefert zwei Dateien: `i18n/de.json` und `i18n/en.json` (bei Build-Apps `public/i18n/`) und deklariert sie im Manifest:
`"i18n": { "languages": ["de", "en"], "default": "de" }`.

- Schlüssel: `gruppe.name` in camelCase, Werte reiner Text mit `{name}`-Platzhaltern. Mehrzahl als Objekt (`zero`, `one`, `other`).
- Das HTML behält den **deutschen** Text und nennt den Schlüssel: `<h1 data-i18n="app.title">Haushalt</h1>`; Skripte nutzen
  `mnI18n.t('liste.anzahl', { n })` nach `await mnI18n.ready`.
- Eine App ohne Paket für die Sprache bleibt Deutsch, nichts geht kaputt.
- `mininode doctor` prüft: fehlende oder kaputte Pakete, im Code benutzte, aber fehlende Schlüssel, unterschiedliche Platzhalter oder
  Mehrzahlformen, leere Werte; und warnt vor nicht übersetzten Texten. Der Deploy lehnt Apps mit diesen Fehlern ab.
- Stil: Deutsch mit „du“, Englisch britisch mit „you“; App- und Markennamen bleiben.
- Was Personen selbst eingetippt haben (oder eine API lieferte), wird nicht übersetzt.

Neue Apps müssen beide Pakete mitbringen; die Spezifikation und die [KI-Werkstatt](wiki:ki-werkstatt) verlangen es. Ausführlich:
`docs/ai/LANGUAGE-PACKAGES.md`.

## Sprachpakete nachträglich einbauen

Eine App ohne Pakete (ältere App, Export, Upload) bekommt sie mit einem fertigen Auftrag: Verwaltung → KI-Werkstatt → Dateien → **Prompt: Sprachpakete nachrüsten**
(`docs/ai/RETROFIT-LANGUAGE.md` plus die ganze Anleitung). So gehst du vor:

1. Prompt kopieren und in die KI einfügen (Claude, AI Studio oder Claude Code im Repository).
2. Den Code der App anhängen oder einfügen (oder in Claude Code den Ordner `hosted/<name>` nennen).
3. Die KI liefert `i18n/de.json`, `i18n/en.json`, die angepassten Dateien und eine Liste unsicherer Stellen. Sie ändert sonst nichts.
4. Einspielen (als Pull Request) und `pnpm mininode doctor hosted/<name>` ausführen: keine `i18n-*`-Meldung mehr; die App einmal auf Deutsch und Englisch durchklicken.

Ohne Pakete meldet `doctor` die Warnung `i18n-missing`; die App läuft trotzdem, bleibt aber Deutsch.

## Deutsche Formate

Zahlen, Daten und Sortierung folgen der Sprache (`mnI18n.locale` = `de-DE` oder `en-GB`). Die deutschen Regeln:

- Vollständiges Datum: **„01. Okt. 2026“** (`mnui.date.format(iso)` oder `Intl.DateTimeFormat('de-DE', …)`).
- Uhrzeit im 24-Stunden-Format; Beträge wie **„1.234,50 €“**; eingetippte Beträge werden deutsch gelesen.
- Nie ISO-Daten oder `TT.MM.JJJJ` zeigen.
- Datums- und Zeitfelder bleiben normale `<input type="date|month|time">`; das App-Kit zeigt sie als Tag · Monat · Jahr bzw. Stunde : Minute
  (abschaltbar mit `data-mn-native`). Tests können weiter `.fill('2026-10-01')` nutzen.
