---
title: KI-Werkstatt: Apps mit KI bauen
category: apps
order: 40
summary: Der Prompt-Ersteller und die Vorgaben, mit denen eine KI eine passende App baut
---

Verwaltung → **KI-Werkstatt** bündelt alles, was eine KI zum Bauen einer MiniNode-App braucht (ADR 0003).

## Der Prompt-Ersteller

Du beschreibst deine Idee (Name, Zweck, für wen, mit welchem Werkzeug gebaut wird) und wählst **App-Typ** und **Funktionen**. Daraus
entsteht ein vollständiger Prompt: dein Kurzbeschrieb, die App-Spezifikation, das Designsystem, der gewählte Typ, die gewählten
Funktionen und eine abschließende Checkliste. Den fügst du in Claude, Google AI Studio oder ein anderes Werkzeug ein.

| Eingabe | Wirkung |
| --- | --- |
| **Für wen** | `Nur ich` → private Daten je Person; `Haushalt` → gemeinsames Konto; `Gruppe` → alle sehen alles |
| **Gebaut mit** | Claude-Artifact, AI Studio, Claude Code oder andere: passt die Anweisungen an das Werkzeug an |
| **Typ** | Organisation, Archiv, Finanzen, … mit Vorschlag für Farbe, Ansichten und Datenform |
| **Funktionen** | Fotos, KI, Kalender, Push, Offline, Teilen, Spiele, Server, … in klappbaren Gruppen |
| **Kurzfassung** | die kürzere Spezifikation für Werkzeuge mit kleinem Prompt-Limit |

## Die Dateien dahinter

Alle Bausteine liegen im Repository und sind in der Werkstatt zum Kopieren oder Herunterladen:

| Datei | Zweck |
| --- | --- |
| `docs/ai/NEW-APP-SPEC.md` | Die Spezifikation: Stack, SDK, Daten, Manifest (`specVersion`) |
| `docs/ai/NEW-APP-SPEC.short.md` | Kurzfassung, **erzeugt** (`pnpm spec:short`), nie von Hand ändern |
| `docs/ai/DESIGN-SYSTEM.md` | App-Kit: Farben (hell/dunkel), Hülle, Komponenten, Textregeln |
| `docs/ai/LANGUAGE-PACKAGES.md` | Zwei Sprachpakete, Stil, Glossar, Prüfungen; **steckt in jedem zusammengesetzten Prompt** (Abschnitt 5, mit Prüfpunkten in der Checkliste) |
| `docs/ai/RETROFIT-LANGUAGE.md` | Auftrag, um **nachträglich** Sprachpakete in eine bestehende App einzubauen; in der Werkstatt als *Prompt: Sprachpakete nachrüsten* mit der ganzen Anleitung ([Sprache und Formate](wiki:sprachen-formate)) |
| `docs/ai/prompts/types`, `prompts/modules` | App-Typen und Funktionsbausteine für den Prompt-Ersteller |
| `docs/ai/playbooks/` | Schritt-für-Schritt-Umbau je Quelle (Claude-Artifact, AI Studio, Vite, Next.js, statisch, Server, Docker, Installer) |

Neue Funktionen der Plattform gehören **im selben Pull Request** auch in die Prompt-Bausteine (`docs/ai/prompts/…`) und, wenn sie
das App-Verhalten betreffen, in die Spezifikation: sonst baut die KI Apps ohne die Funktion. Eine neue Funktionsgruppe wird in
`MODULE_GROUPS` (`apps/portal/src/admin/prompts.ts`) eingetragen; ein Test prüft das.

## Fertige Aufträge (Briefs)

Für Apps, die schon beschrieben sind, liegen Aufträge unter `docs/ai/briefs/` (zurzeit: Projekte, Fahrzeuge, Geburtstage in der Wunschliste und in
Aether Notes). `node scripts/compose-brief.ts docs/ai/briefs/<name>.brief.md` macht daraus denselben vollständigen Prompt wie die Werkstatt
(Auftrag, Spezifikation, Designsystem, Bausteine, Kit-CSS); er wird aus den aktuellen Dokumenten gebaut, nach Änderungen also neu erzeugen.

## Danach

Die fertige App kommt als ZIP in [Hochladen](wiki:hochladen) oder nach `inbox/` für `/integrate-app`
([Mit Claude Code arbeiten](wiki:claude-code)). Das Designsystem gibt es auch als durchsuchbares Claude-Artifact mit Live-Vorschau
(Link in der Werkstatt).
