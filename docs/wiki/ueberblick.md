---
title: Was ist MiniNode?
category: einstieg
order: 10
summary: Das System in fünf Minuten: wofür es da ist und wie die Teile zusammenspielen
---

MiniNode ist eine **private Hosting-Plattform nur auf Einladung**. Sie betreibt Web-Apps, Dienste und
ferngesteuerte Windows-Programme unter `*.mininode.app`, mit **einem Login**, **einem Rollenmodell** und
**einer Datenschicht** (Supabase) für alles. Es gibt keine öffentliche Anmeldung und keine Mandanten: es ist dein
eigenes System für dich und die Menschen, die du einlädst.

## Was du damit tust

- Eigene und gebaute **Apps** (Haushalt, Kalender, Sportplaner, Spiele, …) laufen unter `<name>.mininode.app`,
  geschützt durch denselben Login. Jede Person hat darin ihre eigenen Daten, oder ihr teilt euch welche.
- **Neue Apps** entstehen mit KI (Claude, Google AI Studio) und kommen als ZIP über Verwaltung → Apps → Hochladen
  hinein; ein Skript baut sie ein ([Hochladen und Einbau](wiki:hochladen)).
- **Programme** für den PC oder Server (Jellyfin, n8n, Windows-Programme) laufen auf deinem Heimserver und sind
  von jedem Gerät im Browser erreichbar ([App-Bibliothek und Programme](wiki:app-bibliothek-programme)).
- **Alles Wichtige** (Konten, Daten, Dateien, Einstellungen) lässt sich als verschlüsselte Datei sichern und wieder
  einspielen ([Sicherung](wiki:sicherung)).

## Die Teile im Überblick

```
 Browser (PC / Handy)
   │
   ▼  Cloudflare
   ├─ mininode.app ........ Portal: Startseite, /login, /admin (Verwaltung)
   ├─ api.mininode.app .... API: Einladungen, Schlüssel, Uploads, Sicherung, Löschen …
   ├─ ai.mininode.app ..... KI-Proxy (Budget, Modelle) → Cloudflare AI Gateway
   ├─ <app>.mininode.app .. jede gehostete App (ein Worker mit Login-Schranke, dem „Gate")
   └─ Tunnel ───────────── dein Server („NucBox"): Container, Windows-VM, Wine, Guacamole
   ▲
   └─ Supabase: Datenbank, Login, Dateispeicher (für alles)
```

| Teil | Wo im Code | Aufgabe |
| --- | --- | --- |
| Portal | `apps/portal` | Startseite, Login, Konto, Verwaltung (auch dieses Wiki) |
| API | `apps/api` | Alles, was ein Geheimnis braucht: Einladungen, API-Schlüssel, Uploads, Google, Push, Sicherung |
| KI-Proxy | `apps/ai-proxy` | KI-Aufrufe der Apps, ohne dass ein Schlüssel im Browser landet, mit Budget |
| NucBox-Steuerung | `apps/nucbox-control` | Schaltet VMs, vergibt Sitzungen für Remote-Apps, rollt Container aus |
| Gate | `packages/gate` | Die Schranke vor jeder App: prüft Anmeldung und Zugriff, setzt die Sicherheits-Header |
| SDK | `packages/sdk` | Die eine Bibliothek, die eine App braucht (`mn.kv`, `mn.files`, `mn.ai`, …) |
| App-Kit | `packages/ui` | Gemeinsames Design (Farben, Schriften, Komponenten) und Skripte für alle Apps |
| Manifest | `packages/manifest` | Das Format `mininode.json` und seine Prüfung |
| Kommandozeile | `packages/cli` | `mininode doctor`, `deploy`, `integrate`, `backup`, `uninstall` … |
| Konfiguration | `packages/config` | Gemeinsame TypeScript-Einstellungen |

## Die wichtigsten Ideen

1. **Eine App ist ein Ordner** `hosted/<name>/` mit Code und `mininode.json`. Aus dem Manifest leiten sich Kachel,
   Adresse, Deploy und Verwaltung ab ([Apps verstehen](wiki:apps-verstehen)).
2. **Die Datenbank ist die Sicherheitsgrenze.** Jede Tabelle hat Zeilenschutz (*Row Level Security*), der Zugriff und
   aufrufende App prüft; eine App kann nicht an Daten einer anderen ([Daten speichern](wiki:daten-speichern), ADR 0002).
3. **Ein Login für alles** auf `mininode.app/login`, mit Passkeys (Fingerabdruck, Gesicht) als Hauptweg
   ([Anmeldung](wiki:anmeldung), ADR 0001).
4. **Alles ist Code und wird per Git ausgeliefert:** ein Merge in `main` startet den Deploy
   ([Deploy und Workflows](wiki:deploy-workflows)).
5. **Dokumentation gehört zum Code:** Entscheidungen stehen in ADRs, Anleitungen in Runbooks, und dieses Wiki wird bei
   jeder Änderung am System mitgepflegt ([Wissen aktuell halten](wiki:wissen-pflegen)).

## Was es kostet

Cloudflare Workers Paid etwa 4,60 €/Monat und die Domain etwa 1 €/Monat; alles andere läuft auf kostenlosen Stufen
(Supabase Free, GitHub, Cloudflare R2/Tunnel). Ein Windows-11-Pro-Schlüssel ist einmalig. Ausführlich: `PLAN.md` §2.

## Wo es weitergeht

- Neu hier: der [Startup-Guide](/admin/guide).
- Begriffe nachschlagen: [Begriffe von A bis Z](wiki:begriffe).
- Etwas ist kaputt: [Fehlerbehebung](wiki:fehlerbehebung).
