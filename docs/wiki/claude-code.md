---
title: Mit Claude Code arbeiten
category: entwicklung
order: 50
summary: Wie du Claude Code am System arbeiten lässt: Skills, Prüfer, Branches, Pull Requests und Sitzungsstand
---

Claude Code arbeitet im Repository (lokal oder in einer Cloud-Sitzung). Es liest `CLAUDE.md` (Regeln) und `docs/STATUS.md` (Stand) und hält sich an die
[Arbeitsregeln](wiki:arbeitsregeln).

## Typische Aufträge

| Du sagst … | Was passiert |
| --- | --- |
| „arbeite die ai-review-Issues ab“ | Skill **`integrate-app`**: baut jeden hochgeladenen Export, den das Skript nicht schaffte, nach `hosted/<name>`, öffnet einen Pull Request mit `Closes #<Issue>` und räumt den Branch `review/<id>` ab |
| „integriere die App in inbox“ / `/integrate-app inbox/x.zip` | derselbe Skill für ein ZIP in `inbox/` (Playbook je Quelle, lokaler Test, `doctor`, Branch) |
| „füge … zum System hinzu“ | Planen, ändern, testen, Wissen mitpflegen, prüfen lassen, Pull Request |
| „mergen“ | **erst dann** wird gemergt; Claude mergt nie von selbst |

## Skills und Agenten (`.claude/`)

- **`integrate-app`**: Quelle erkennen, Playbook anwenden, SDK einbauen, lokal gegen Supabase testen, `mininode doctor`.
- **`supabase`, `supabase-postgres-best-practices`**: vor SQL, RLS und Auth-Code zu laden.
- **`cloudflare`, `workers-best-practices`, `wrangler`, `nextjs-on-cloudflare`, `cloudflare-one`, `cloudflare-email-service`**: für Workers, Wrangler, Produktwahl.
- **`web-perf`**: Ladezeit und Bedienbarkeit messen und verbessern.
- **Unteragent `reviewer`**: prüft einen fertigen Stand gegen `CLAUDE.md` und `PLAN.md` und meldet konkrete Funde. Er hat in jeder größeren Änderung echte Fehler gefunden
  (Umgebungsvariablen, Symlinks in Exporten, ungeprüfte Binärdateien, Datumsfelder, Sicherheitslücken). **Vor jedem Push nicht-trivialer Änderungen** einsetzen und die Funde beheben.

## Branches und Pull Requests

- Gearbeitet wird **nur auf dem vorgegebenen Branch**; nach jedem Push ein **Draft-Pull-Request**, falls keiner offen ist.
- Prüfungen müssen grün sein; Claude behebt rote Läufe auf eigenen Pull Requests, antwortet auf Review-Kommentare und wartet dann auf dein „mergen“.
- Nach einem Merge startet der Branch neu von `origin/main`; ein gemergter Pull Request wird nie wiederverwendet.

## Cloud-Sitzungen: Besonderheiten

- Lokalen Stack mit `scripts/cloud-stack.sh` starten (Docker läuft nicht von selbst), dann `pnpm exec supabase db reset --local`. Der Container startet ab und zu neu: beides wiederholen.
- `*.mininode.app` und die Produktions-Datenbank sind aus der Sitzung **nicht erreichbar**; um einen Deploy zu prüfen, liest man die Logs der GitHub-Actions-Läufe.
- Alte Dev-Server per PID beenden, nie mit `pkill -f`.
- Echte Schlüssel gehören nicht in den Chat. Ist einer gelandet: widerrufen.

## Vor dem Ende einer Sitzung

`docs/STATUS.md` aktualisieren (was neu ist, was du noch tun musst, was die nächste Sitzung wissen sollte), Wiki mitpflegen, pushen. Frage ruhig: „Was steht für mich noch an?“
