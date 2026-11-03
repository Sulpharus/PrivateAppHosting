---
title: Tests und CI
category: entwicklung
order: 30
summary: Welche Prüfungen es gibt, was sie sichern und was ein roter Lauf heißt
---

## Die Prüfungen jedes Pull Requests (`ci.yml`)

| Prüfung | Was sie macht |
| --- | --- |
| **What changed** | stellt fest, welche Teile ein Pull Request berührt (`scripts/ci-changes.sh`, getestet von `scripts/ci-changes.test.sh`); die Prüfungen unten laufen nur, wenn sie etwas Geändertes testen |
| **Lint, typecheck, unit tests** | Biome, `tsc`, alle Vitest-Tests (Turborepo); `mininode doctor --all` für alle Apps; **die Kurzfassung der App-Spezifikation ist aktuell** (`pnpm spec:short`, sonst rot, wenn du `docs/ai/NEW-APP-SPEC.md` änderst); **das JSON-Schema des Manifests ist aktuell** |
| **Dry-run deploy of changed apps** | ein Probe-Deploy der geänderten Apps (bauen, Gate-Konfiguration); wartet auf die Programm-Bauten der Craft-Apps und von MuseScore, aber nur, wenn eine davon geändert wurde |
| **Lint, typecheck, test** | die Sammelprüfung: grün, wenn „What changed“, „Lint, typecheck, unit tests“, der Probe-Deploy, „Infra scripts and images“ und „Database, integration and e2e“ bestanden haben oder mit Absicht übersprungen wurden |
| **Database, integration and e2e** | startet ein lokales Supabase; pgTAP (`db:test`), Integrationstests, **Sicherung/Löschen-Rundlauf** (`test:roundtrip`), dann alle Playwright-e2e-Tests |
| **Infra scripts and images** | Shell-Skripte (shellcheck), Test der Änderungserkennung, Docker-Images der Server-Hardware, Test des Deploy-Skripts, Inhalt der Release-Pakete |
| **Secret scan** | gitleaks über jeden Commit |
| **Starter package** | baut das Starter-ZIP (und prüft, dass nichts von dieser Installation darin steckt), entpackt es, richtet eine Installation ein und lässt dort `pnpm check` laufen |
| **Desktop edition** | startet den echten Installer, meldet sich über das Gateway an und prüft Schlüssel, Rolle und Zugriff der Daten-API |

Auf `main` sollen „Lint, typecheck, test“, „Database, integration and e2e“, „Infra scripts and images“ und „Secret scan“ **verbindlich** sein (Regel unter Settings → Rules); sonst lässt GitHub rote Pull Requests zu. Die Sammelprüfung „Lint, typecheck, test“ wartet auf den Probe-Deploy; die schnelle Rückmeldung zu Lint und Tests gibt „Lint, typecheck, unit tests“.

### Was übersprungen wird

Eine Prüfung, die nichts Geändertes testet, läuft im Pull Request nicht; GitHub zählt sie als bestanden. Immer laufen „What changed“, die Unit-Tests, die Sammelprüfung, der Secret scan und das Starter-Paket. Kann „What changed“ nichts feststellen, läuft alles.

| Geändert | Läuft zusätzlich |
| --- | --- |
| nur Text, der nicht ins Portal kommt (`*.md` außerhalb der Ordner unten, `graphify-out/`, `LICENSE`) | nichts (eine `README.md` in `hosted/<app>/` startet den Probe-Deploy dieser App) |
| Dokumentation, die das Portal zeigt (`docs/wiki/`, `docs/ai/`, `docs/adr/`, `docs/runbooks/`, Workflows) | die e2e-Tests von Wiki und Bibliothek (nur das Portal, ohne Datenbanktests) und die Desktop-Ausgabe (sie baut das Portal); bei `docs/adr/`, `docs/runbooks/` auch Infra (Release-Pakete) |
| Code irgendwo | Database, integration and e2e (alles) |
| `infra/`, `scripts/`, Gate, `packages/config`, `packages/manifest`, Steuerprogramm der Server-Hardware, `.github/actions/`, `release.yml`, `LICENSE` | Infra scripts and images |
| `apps/`, `packages/`, `supabase/`, `scripts/`, `infra/desktop/`, `mininode.config.json`, `.dockerignore` | Desktop edition |
| eine App in `hosted/` | Probe-Deploy; bei MuseScore oder einer Craft-App vorher deren Programm-Bau |
| `ci.yml`, `crafts.yml`, `musescore.yml`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `turbo.json`, `.nvmrc`, `biome.json`, `tsconfig*.json` | alles |

Auf `main` (nach dem Merge) läuft jede Prüfung, außer den Programm-Bauten und dem Probe-Deploy: Die Programme baut dort der Deploy.

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
