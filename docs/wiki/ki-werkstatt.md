---
title: KI-Werkstatt: Apps mit KI bauen
category: apps
order: 40
summary: Der Prompt-Ersteller, die Varianten je KI-Werkzeug, das Startpaket und die Vorgaben dahinter
---

Verwaltung → **KI-Werkstatt** bündelt alles, was eine KI zum Bauen einer MiniNode-App braucht (ADR 0003, ADR 0030).

## Der Prompt-Ersteller

Du wählst, was die KI tun soll, beschreibst deine Idee und wählst **App-Typ**, **Funktionen**, **für wen** und **womit du baust**.
Daraus entsteht der Prompt, der zu deinem Werkzeug passt. Fährst du mit der Maus über einen Typ, eine Funktion oder eine
Aufgabe (oder wählst sie mit der Tastatur), erklärt ein Hinweis in einfachen Worten, **wann sie passt**. `Escape` blendet ihn aus.

| Eingabe | Wirkung |
| --- | --- |
| **Aufgabe** | *Neue App bauen*; *Bestehende App erweitern* (die KI baut die gewählten Funktionen ein und lässt den Rest gleich, den Code hängst du an); *Prüfbefunde beheben* (du fügst die Meldungen von `mininode doctor` oder vom Upload ein) |
| **Typ** | Organisation, Archiv, Finanzen, … Er wählt Farbe, **für wen** und **passende Funktionen** vor; du kannst alles ändern |
| **Funktionen** | Fotos, KI, Karten, Push, Offline, Teilen, Spiele, PDFs einlesen, WebAssembly, … in klappbaren Gruppen. *Eigene Tabellen* ist immer dabei, sobald die App etwas speichert; bei Teams und „Admin pflegt“ kommt der passende Baustein von selbst dazu |
| **Für wen** | `Nur für mich` → private Daten je Person; `Haushalt` → gemeinsames Konto; `Gruppe` → alle sehen alles; `Teams`; `Admin pflegt, alle lesen`; `Speichert nichts` (Rechner) |
| **Womit du baust** | passt Form und Anweisungen an das Werkzeug an (Tabelle unten); darunter steht **So gehst du vor** |
| **Kurzfassung** | kürzt Designsystem und Sprachanleitung für Werkzeuge mit kleinem Prompt-Limit |

Rechts steht der fertige Text mit seiner Größe in Tokens (für GPT/Gemini und für Claude getrennt, Claude zählt etwa ein Drittel mehr).

## Varianten je Werkzeug

| Werkzeug | Was du bekommst |
| --- | --- |
| **Coding-Agent im Repository** (Claude Code, Codex, Cursor, Copilot, Gemini CLI, Jules) | einen **kurzen Prompt**, der auf die Dateien im Repository zeigt; fertig ist es, wenn `mininode doctor`, `pnpm check` und ein e2e-Test grün sind und ein Pull Request offen ist. Die Regeln für Apps stehen in `hosted/AGENTS.md` |
| **Claude (claude.ai)** | den vollständigen Prompt und das **Startpaket**; Claude legt echte Dateien an und gibt ein ZIP zurück |
| **ChatGPT** | einen kurzen Prompt und die **Referenzdatei** `MININODE-REFERENCE.md` (steckt auch im Startpaket) zum Anhängen |
| **Google AI Studio** | den vollständigen Prompt, der Server, Firebase und Tailwind abschaltet, und das Startpaket |
| **Bolt.new** | **Regeln fürs Wissensfeld** (Projekteinstellungen → Knowledge), einen kurzen Prompt und das Startpaket |
| **Lokales oder kleines Modell** | einen **kompakten Prompt** (SDK, Manifest, eine Seitenvorlage, Typ, Funktionen); gebaut wird in Schritten. Kontext auf mindestens 32.000 Tokens stellen |
| **Andere KI** | den vollständigen Prompt; das Startpaket, wenn das Werkzeug Dateien annimmt |

Jeder Prompt ist gleich aufgebaut: zuerst die Vorgaben (jede in einem eigenen Abschnitt), dann deine Aufgabe, wie geliefert wird,
**15 nummerierte feste Regeln** und eine Prüfliste, die auf die Regeln verweist. So steht das Wichtigste am Ende, wo die Modelle
es am zuverlässigsten befolgen, und die Teile widersprechen sich nicht (ein Test prüft das).

## Das Startpaket

Ein ZIP für alle Werkzeuge außerhalb des Repositorys: der Ordner `_mininode/` mit App Kit, Sprachhelfer und einem
**Vorschau-SDK**, leere Sprachpakete, `mininode.json`, eine Startseite, `AGENTS.md` mit den Regeln und
`MININODE-REFERENCE.md`. Damit läuft die App schon in der Vorschau des Werkzeugs (Daten bleiben dort im Browser, KI, Google
und Push sind aus), und die KI muss keinen eigenen Ersatz für MiniNode erfinden. Beim **Hochladen** entfernt MiniNode diese
Teile wieder; auf MiniNode kommen die echten Dateien vom Gate.

## Die Dateien dahinter

Alle Bausteine liegen im Repository und sind in der Werkstatt einzeln zum Kopieren oder Herunterladen:

| Datei | Zweck |
| --- | --- |
| `docs/ai/NEW-APP-SPEC.md` | Die Spezifikation: Stack, SDK, Daten, Manifest (`specVersion`) |
| `docs/ai/NEW-APP-SPEC.short.md` | Kurzfassung, **erzeugt** (`pnpm spec:short`), nie von Hand ändern; sie steckt in jedem Prompt |
| `docs/ai/DESIGN-SYSTEM.md` | App-Kit: Farben (hell/dunkel), Hülle, Komponenten, Textregeln; Teile zwischen `full:start` und `full:end` fehlen in der Kurzfassung |
| `docs/ai/LANGUAGE-PACKAGES.md` | Zwei Sprachpakete, Stil, Glossar, Prüfungen; **steckt in jedem Prompt** |
| `docs/ai/RETROFIT-LANGUAGE.md` | Auftrag, um **nachträglich** Sprachpakete in eine bestehende App einzubauen; in der Werkstatt als *Prompt: Sprachpakete nachrüsten* ([Sprache und Formate](wiki:sprachen-formate)) |
| `docs/ai/prompts/types`, `prompts/modules` | App-Typen und Funktionsbausteine; jeder mit einer Zeile `when:` für den Hinweis (Aufbau in `docs/ai/prompts/README.md`) |
| `packages/ui/kit/sdk-preview.js` | das Vorschau-SDK des Startpakets |
| `hosted/AGENTS.md` | Regeln für Apps, die Agenten im Repository lesen |
| `docs/ai/playbooks/` | Schritt-für-Schritt-Umbau je Quelle (Claude, AI Studio, Vite, Next.js, statisch, Server, Docker, Installer) |

Neue Funktionen der Plattform gehören **im selben Pull Request** auch in die Prompt-Bausteine (`docs/ai/prompts/…`) und, wenn sie
das App-Verhalten betreffen, in die Spezifikation und ins Vorschau-SDK: sonst baut die KI Apps ohne die Funktion. Ein Baustein
beschreibt nur, was die Plattform heute kann, speichert Listen in Tabellen und schreibt Datums- und Zahlenformate nie fest auf
Deutsch; ein Test prüft das. Eine neue Funktionsgruppe wird in `MODULE_GROUPS` (`apps/portal/src/admin/prompts.ts`) eingetragen.

## Fertige Aufträge (Briefs)

Für Apps, die schon beschrieben sind, liegen Aufträge unter `docs/ai/briefs/` (zurzeit: Projekte, Fahrzeuge und Reiseplaner).
`node scripts/compose-brief.ts docs/ai/briefs/<name>.brief.md` macht daraus denselben Prompt wie die Werkstatt für das im Brief
genannte Werkzeug; er wird aus den aktuellen Dokumenten gebaut, nach Änderungen also neu erzeugen.

## Danach

Die fertige App kommt als ZIP in [Hochladen](wiki:hochladen) oder nach `inbox/` für `/integrate-app`
([Mit Claude Code arbeiten](wiki:claude-code)). Das Designsystem gibt es auch als durchsuchbares Claude-Artifact mit Live-Vorschau
(Link in der Werkstatt).
