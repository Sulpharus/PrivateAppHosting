---
title: Tests und CI
category: entwicklung
order: 30
summary: Welche Prüfungen es gibt, was sie sichern und was ein roter Lauf heißt
---

## Die Prüfungen jedes Pull Requests (`ci.yml`)

| Prüfung | Was sie macht |
| --- | --- |
| **What changed** | stellt fest, welche Teile der Pull Request berührt (`scripts/ci-changes.sh`); die Prüfungen unten laufen nur, wenn sie etwas Geändertes testen |
| **Lint, typecheck, test** | Biome, `tsc`, alle Vitest-Tests (Turborepo); `mininode doctor --all` für alle Apps; **die Kurzfassung der App-Spezifikation ist aktuell** (`pnpm spec:short`, sonst rot, wenn du `docs/ai/NEW-APP-SPEC.md` änderst); **das JSON-Schema des Manifests ist aktuell** |
| **Dry-run deploy of changed apps** | ein Probe-Deploy der geänderten Apps (bauen, Gate-Konfiguration); wartet auf die Programm-Bauten der Craft-Apps und von MuseScore, aber nur, wenn eine davon geändert wurde |
| **Database, integration and e2e** | startet ein lokales Supabase; pgTAP (`db:test`), Integrationstests, **Sicherung/Löschen-Rundlauf** (`test:roundtrip`), dann alle Playwright-e2e-Tests |
| **Infra scripts and images** | Shell-Skripte (shellcheck), Docker-Images der Server-Hardware, Test des Deploy-Skripts |
| **Secret scan** | gitleaks über jeden Commit |
| **Starter package** | baut das Starter-ZIP (und prüft, dass nichts von dieser Installation darin steckt), entpackt es, richtet eine Installation ein und lässt dort `pnpm check` laufen |
| **Desktop edition** | startet den echten Installer, meldet sich über das Gateway an und prüft Schlüssel, Rolle und Zugriff der Daten-API |

Auf `main` sollen „Lint, typecheck, test“, „Database, integration and e2e“, „Infra scripts and images“ und „Secret scan“ **verbindlich** sein (Regel unter Settings → Rules); sonst lässt GitHub rote Pull Requests zu.

### Was übersprungen wird

Eine Prüfung, die nichts Geändertes testet, läuft nicht; GitHub zählt sie als bestanden. Immer laufen Lint, typecheck, test, der Secret scan und das Starter-Paket.

| Geändert | Läuft zusätzlich |
| --- | --- |
| nur Dokumentation (`docs/`, `*.md`) | nichts; ändert sich `docs/wiki/`, der e2e-Test der Wiki-Seiten (nur das Portal, ohne Datenbanktests) |
| Code irgendwo | Database, integration and e2e (alles) |
| `infra/`, `scripts/`, Gate, Steuerprogramm der Server-Hardware, `release.yml` | Infra scripts and images |
| `apps/`, `packages/`, `supabase/`, `infra/desktop/`, `scripts/` | Desktop edition |
| eine App in `hosted/` | Dry-run deploy; bei MuseScore oder einer Craft-App vorher deren Programm-Bau |
| `ci.yml`, `crafts.yml`, `musescore.yml`, `package.json`, `pnpm-lock.yaml` oder andere Einstellungen im Hauptordner | alles |

Auf `main` (nach dem Merge) laufen dieselben Prüfungen für das, was der Merge geändert hat; die Programm-Bauten macht dort nur der Deploy.

## Testarten

- **Vitest** für Einheiten (Pakete, Worker mit Workers-Pool, Portal mit happy-dom). Integrationstests laufen nur mit lokalem Supabase.
- **pgTAP** für die Datenbank. Ein Meta-Test fällt durch, wenn eine Tabelle in `app_*` keinen Zeilenschutz hat oder eine Regel `platform.app_access` nicht aufruft;
  dazu Negativtests (fremdes Schema lesen, Admin-Funktionen als Nutzer, Budget aufgebraucht).
- **Playwright e2e**: echte Browser gegen lokale Dienste, auch Passkeys mit virtuellem Authenticator und ein Zwei-Subdomain-Test für abgelaufene Tokens. Die e2e-Umgebung hat
  **keinen API-Worker und kein GitHub**: Seiten, die sie brauchen, beantworten Tests über `page.route`.
- **Fixtures**: Beispiel-Exporte mit erwarteten Ergebnissen, bei jedem Pull Request geprüft.
- **`mininode doctor --all`** prüft alle Apps.

## Regeln

- Jede Funktion bekommt einen CI-Smoketest **oder** sitzt hinter einem als „nicht unterstützt“ markierten Schalter. Ungetesteter Code verrottet still.
- **Nie** einen Test überspringen, abschalten oder auskommentieren, um grün zu werden. Flackernde Tests werden robust gemacht (Ursache suchen, etwa Wartezeiten bei
  kalt startenden Servern).
- Ein roter Lauf auf `main` ist Arbeit, kein Hintergrundrauschen.
- Ein Pull Request, den das Einbau-Skript erzeugt, ist nur nach grünen Prüfungen zu mergen ([Hochladen](wiki:hochladen)).
