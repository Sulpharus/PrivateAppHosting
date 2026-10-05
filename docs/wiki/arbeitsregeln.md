---
title: Arbeitsregeln für den Code
category: entwicklung
order: 40
summary: Die Regeln aus CLAUDE.md in einfacher Sprache: Typen, Sicherheit, Datenbank, Oberfläche, Git
---

Die verbindliche Fassung steht in `CLAUDE.md` im Repository. Hier die Regeln mit Begründung.

## Code

- TypeScript **strikt**, nur ES-Module, **kein `any`**, keine `!`-Zusicherungen. Externe Eingaben mit **zod** am Rand prüfen.
- Änderungen **klein** halten und den Stil der Umgebung treffen; jedes Paket hat eine README.
- Commits nach **Conventional Commits** (`feat:`, `fix:`, `docs:`, `chore:`, `test:`).
- Eine Funktion für eine spätere Phase kommt mit CI-Smoketest oder hinter einem Schalter „nicht unterstützt“.

## Sicherheit und Datenbank

- **RLS ist die Sicherheitsgrenze:** jede Tabelle in `app_*` hat Zeilenschutz und jede Regel ruft `platform.app_access('<name>')` auf. Nie etwas an `anon` vergeben.
- **Keine Geheimnisse** im Repository, in Client-Bündeln oder in `mininode.json`.
- Alle Anmelde-Oberflächen liegen im Portal unter `/login` (ADR 0001); Apps rufen `sdk.auth.requireLogin()`.
- **Webhooks und Hooks** prüfen Signaturen und sind **idempotent** (zweimal empfangen schadet nicht).
- Migrationen auf Live-Daten: **Expand and Contract** (nullable anlegen, doppelt schreiben, nachfüllen, Lesen umstellen, dann entfernen); Indizes auf großen Tabellen `concurrently`.
- Vor SQL, RLS oder Auth-Code die Skills `supabase` und `supabase-postgres-best-practices` laden und gegen die aktuelle Dokumentation prüfen.
- **Workers:** generierte Bindungstypen (`wrangler types`), Observability an, Hintergrundarbeit mit `ctx.waitUntil`; Skills `workers-best-practices` und `wrangler`.

## Oberfläche

- Tokens aus `packages/ui` (nie rohe Farben oder Schriften in Komponenten); Schriften: Bricolage Grotesque, Instrument Sans, JetBrains Mono, selbst gehostet.
- **Hell und dunkel** Pflicht; Ziele **mindestens 44 px**; Text mit WCAG-AA-Kontrast.
- Jedes bedienbare Element hat ein sichtbares `:focus-visible`; Dialoge halten den Fokus und schließen mit `Escape`.
- Nur `transform` und `opacity` animieren, nie `transition: all`; `prefers-reduced-motion` beachten.
- Keine Farbverläufe, keine Emoji, keine austauschbaren KI-Layouts.

## Git

- Nur auf dem vorgesehenen Branch arbeiten; **nie** Verlauf umschreiben oder erzwungen pushen; **nie** ohne dein ausdrückliches „mergen“ mergen.
- Nach einem Merge den Branch neu von `origin/main` starten.
- Nicht-triviale Änderungen vorher vom **Reviewer** prüfen lassen.

## Dokumentation gehört zur Änderung

Jede Änderung, die man sehen oder bedienen kann, aktualisiert im selben Commit die Dokumentation: **das Wiki**, den ADR (neue Entscheidungen), das Runbook (Betrieb),
`docs/STATUS.md` und, wenn sie das App-Verhalten betrifft, die KI-Vorgaben und Prompt-Bausteine. Details: [Wissen aktuell halten](wiki:wissen-pflegen).
