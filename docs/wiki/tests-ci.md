---
title: Tests und CI
category: entwicklung
order: 30
summary: Welche Prüfungen es gibt, was sie sichern und was ein roter Lauf heißt
---

## Die vier Prüfungen jedes Pull Requests (`ci.yml`)

| Prüfung | Was sie macht |
| --- | --- |
| **Lint, typecheck, test** | Biome, `tsc`, alle Vitest-Tests (Turborepo) |
| **Database, integration and e2e** | startet ein lokales Supabase; pgTAP (`db:test`), Integrationstests, **Sicherung/Löschen-Rundlauf** (`test:roundtrip`), dann alle Playwright-e2e-Tests |
| **Infra scripts and images** | Shell-Skripte (shellcheck), Docker-Images der NucBox, Test des Deploy-Skripts |
| **Secret scan** | gitleaks über jeden Commit |

Auf `main` sollen diese vier Prüfungen **verbindlich** sein (Regel unter Settings → Rules); sonst lässt GitHub rote Pull Requests zu.

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
