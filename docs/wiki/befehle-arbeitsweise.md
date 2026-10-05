---
title: Befehle und tägliche Arbeitsweise
category: entwicklung
order: 20
summary: Die pnpm-Skripte, der mininode-Befehl und wie ein typischer Arbeitstag aussieht
---

## Das Wichtigste in einer Zeile

```bash
pnpm install
pnpm check          # Lint (Biome), Typen (tsc) und Tests (Vitest), vor jedem Commit
```

| Befehl | Zweck |
| --- | --- |
| `pnpm lint` / `pnpm format` | Biome prüfen / automatisch korrigieren |
| `pnpm typecheck` | `tsc` im ganzen Arbeitsbereich |
| `pnpm test` | Vitest überall |
| `pnpm check` | alles davon |
| `pnpm db:start` / `db:stop` / `db:reset` | lokales Supabase (Docker) |
| `pnpm db:test` | pgTAP-Tests; Pflicht, wenn sich etwas unter `supabase/` ändert |
| `pnpm test:integration` | Tests, die ein lokales Supabase brauchen |
| `pnpm test:roundtrip` | Sicherung/Wiederherstellung und Löschen gegen die lokale Datenbank (leert sie, läuft allein) |
| `pnpm e2e <spec>` | Playwright für die berührte App |
| `pnpm mininode …` | die Kommandozeile, siehe [Befehle (mininode)](wiki:ref-befehle) |
| `pnpm spec:short` | Kurzfassung der KI-Spezifikation erzeugen |
| `pnpm kb` | Wissensgraph aktualisieren |

## Der Alltag

1. Branch (Cloud-Sitzung: der vorgegebene Branch). Lokalen Stack starten (`scripts/cloud-stack.sh`, dann `pnpm exec supabase db reset --local`).
2. Ändern, dabei Tests mitschreiben, `pnpm check`; bei `supabase/` zusätzlich `pnpm db:test`; für die berührte App `pnpm e2e <spec>`.
3. **Wissen mitpflegen** (Wiki, ADR, Runbook, STATUS, KI-Bausteine): siehe [Wissen aktuell halten](wiki:wissen-pflegen).
4. Nicht-triviale Änderungen vom **Reviewer-Unteragenten** prüfen lassen und seine Funde beheben ([Mit Claude Code arbeiten](wiki:claude-code)).
5. Commit nach *Conventional Commits* (`feat:`, `fix:`, `docs:`, `chore:`, `test:`), Push, **Draft-Pull-Request**.
6. Warten auf grüne Prüfungen; Merge nur auf dein „mergen“.

## Eine App lokal ansehen

```bash
pnpm mininode dev hosted/<name> --port 8790
```

Startet die App hinter dem Gate gegen das lokale Supabase. `e2e/playwright.config.ts` startet für die Tests jede App auf einem festen Port.
