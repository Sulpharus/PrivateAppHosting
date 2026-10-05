---
title: Deploy und Workflows
category: betrieb
order: 20
summary: Wie eine Änderung live geht und welche automatischen Abläufe es gibt
---

## Der Weg einer Änderung

1. Änderung auf einem **Branch**, **Pull Request** öffnen.
2. **CI** läuft (Prüfungen, siehe [Tests und CI](wiki:tests-ci)). Alle vier Prüfungen müssen grün sein, bevor du mergst.
3. **Merge in `main`** (nach deinem ausdrücklichen „mergen“; Claude mergt nie von sich aus).
4. Der **Deploy** (`deploy.yml`) startet automatisch, **parallel zur CI und auch bei roter CI** (er wartet nicht darauf): darum nur bei grünen Prüfungen mergen. Ein Push auf `main` geht **direkt nach Produktion**:
   - **database:** Datenbank-Migrationen (`supabase db push`); nur auf **Produktion** außerdem die Auth-Einstellungen (`supabase config push`, Passkey-Einstellungen per Management API, Google-Anmeldung);
   - **platform:** Portal (`mininode.app`), API (`api.`) und KI-Proxy (`ai.`); Wrangler legt Domains an, die Geheimnisse der Worker werden aus GitHub hochgeladen;
   - **apps:** jede **geänderte** App (oder alle: *all_apps*): Migrationen der App, Deploy, Eintrag in `platform.apps`; anschließend **Prune** (Worker von Apps, die nicht mehr im
     Repository liegen, werden gelöscht, ihr Eintrag deaktiviert);
   - **nucbox:** Container-Apps und Bibliothek über SSH (nur wenn `NUCBOX_TUNNEL_ID` gesetzt ist).

Ändern sich Dinge, die **jede App** betreffen (SDK, App-Kit, Gate, Manifest, CLI, Lockfile), werden **alle Apps** neu ausgeliefert.

## Umgebungen

`production` (mininode.app) und `staging` (eigenes Supabase-Projekt `mininode-staging`). Geheimnisse und Variablen liegen in der **GitHub-Umgebung**
(*Settings → Environments*); die Liste steht in `first-setup.md`. **Staging läuft nur auf Wunsch:** den Deploy von Hand starten (*Run workflow*, Umgebung `staging`) und dort üben; ein Push auf `main` geht nicht über Staging.

## Von Hand starten

GitHub → Actions → Workflow → *Run workflow* (am besten von `main`). Viele davon startet die Verwaltung für dich über die API: Hochladen, Sicherung,
App löschen, Export, Bibliothek. Diese Workflows laufen nur von `main`.

## Alle Workflows

Die vollständige, automatisch erzeugte Liste mit Auslösern und Zweck steht unter [Workflows](wiki:ref-workflows). Wichtigste im Alltag:

| Workflow | Wann |
| --- | --- |
| **CI** (`ci.yml`) | jeder Pull Request und jeder Push auf `main` |
| **Deploy** (`deploy.yml`) | Push auf `main`, oder von Hand |
| **Web-App einbauen** (`integrate.yml`) | ein ZIP wurde hochgeladen |
| **Upload nach dem Pull Request** (`pr-merged.yml`) | ein Einbau-Pull-Request wurde gemergt oder geschlossen |
| **Sicherung** (`backup.yml`) | Verwaltung → Sicherung |
| **App löschen** (`uninstall-app.yml`) | Verwaltung → Apps → Löschen |
| **App-Bibliothek** (`library.yml`) | Installieren/Entfernen eines Programms |
| **App als GitHub-Projekt** (`export-app.yml`) | Verwaltung → Apps → Als GitHub-Projekt |
| **Release** (`release.yml`) | Tag `v*`, `cloud-v*` oder `pc-server-v*` |

## Wichtige Eigenheiten

- **Workflows laufen mit der Definition vom Standard-Branch.** Der Standard-Branch des Repositorys muss `main` sein, sonst antwortet die API beim Starten mit 404.
- Workflows, die die API startet, tragen die Prüfung `if: github.ref == 'refs/heads/main'`; zusätzlich beschränkt die **Umgebung** `production` die Branches. Nur das schützt die
  Schlüssel wirklich.
- Pushes mit dem Standard-Token starten keine weiteren Workflows: darum `INTEGRATE_TOKEN` für Pull Requests, die Workflows erzeugen.
- Deploys erreichen die Produktionsdatenbank über den **Session pooler** (`SUPABASE_DB_URL`); der direkte Host ist nur IPv6 und scheitert auf GitHub-Runnern.
