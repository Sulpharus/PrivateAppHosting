---
title: Begriffe von A bis Z
category: einstieg
order: 20
summary: Das Vokabular von MiniNode, kurz erklärt
---

Die Begriffe, die in Verwaltung, Dokumentation und Gesprächen mit Claude Code vorkommen.

| Begriff | Bedeutung |
| --- | --- |
| **ADR** | *Architecture Decision Record*: eine Datei unter `docs/adr/`, die eine Entscheidung und ihre Gründe festhält ([Liste](wiki:ref-entscheidungen)) |
| **Admin** | Rolle des Eigentümers: verwaltet alles ([Rollen](wiki:rollen-zugriff)) |
| **API-Schlüssel** | Zugang zu einem externen Dienst (Wetter, Karten …); wird einmal in Verwaltung eingetragen und bleibt auf dem Server ([API-Schlüssel](wiki:api-schluessel)) |
| **App** | Etwas, das unter einer eigenen Adresse läuft und eine Kachel hat: Web-App, Container, Programm oder Link |
| **App-Bibliothek** | Fertige Programme (Jellyfin, n8n …), die du mit einem Klick auf dem Heimserver installierst |
| **App-Kit** | Das gemeinsame Design und die Skripte, die jede App lädt (`/_mininode/ui.css`, `ui.js`, `i18n.js`) |
| **Artifact** | Eine App, die in einem Claude-Chat entstanden ist |
| **Backup / Sicherung** | Verschlüsseltes Abbild aller Daten ([Sicherung](wiki:sicherung)) |
| **CI** | *Continuous Integration*: die automatischen Prüfungen bei jedem Pull Request ([Tests und CI](wiki:tests-ci)) |
| **Deploy** | Ausliefern: Ein Merge in `main` bringt Änderungen live ([Deploy](wiki:deploy-workflows)) |
| **doctor** | `mininode doctor`: die Prüfung, ob eine App alle Regeln einhält |
| **Gate** | Die Schranke vor jeder App: prüft Anmeldung, Zugriff und setzt Sicherheits-Header |
| **Gaming Hub** | Bereich für Spiele mit Spielernamen und Bestenlisten ([Gaming Hub](wiki:gaming-hub)) |
| **Grant / Freigabe** | Das Recht einer Person, eine App zu öffnen |
| **hosted/** | Ordner im Repository mit einer Unterordner pro App |
| **Gemeinsame Daten (Suite)** | Datentypen, die mehrere Apps teilen, etwa Termine ([Gemeinsame Daten](wiki:gemeinsame-daten)) |
| **inbox/** | Ablageordner für ZIP-Dateien beim Einbau per Claude Code (nicht in Git) |
| **kv** | Der einfache Schlüssel-Wert-Speicher `mn.kv` für Apps |
| **Manifest** | Die Datei `mininode.json` einer App ([Apps verstehen](wiki:apps-verstehen)) |
| **Migration** | Eine SQL-Datei, die die Datenbank verändert; Plattform: `supabase/migrations`, Apps: `hosted/<name>/db/` |
| **NucBox** | Dein Heimserver (NucBox G9 mit Proxmox): Linux-VM, Windows-VM, Container ([NucBox](wiki:nucbox)) |
| **Passkey** | Anmelden mit Fingerabdruck, Gesicht oder Windows Hello statt Passwort |
| **Portal** | `mininode.app`: Startseite, Login, Konto und Verwaltung |
| **Prune** | Aufräumen: Worker von Apps löschen, die nicht mehr im Repository liegen |
| **Pull Request (PR)** | Änderungsvorschlag auf GitHub, der geprüft und dann gemergt wird |
| **RLS** | *Row Level Security*: der Zeilenschutz der Datenbank, die eigentliche Sicherheitsgrenze |
| **Runbook** | Schritt-für-Schritt-Anleitung für den Betrieb unter `docs/runbooks/` ([Liste](wiki:ref-runbooks)) |
| **SDK** | `@mininode/sdk`: die Bibliothek, mit der Apps Daten, Dateien, KI und mehr nutzen ([App-Kit und SDK](wiki:app-kit-sdk)) |
| **Slug** | Der kurze Name einer App, zugleich ihre Adresse: `rezepte` → `rezepte.mininode.app` |
| **Step-up** | Erneute Bestätigung deiner Identität (Passkey/Passwort) vor heiklen Aktionen |
| **Supabase** | Der Dienst für Datenbank, Login und Dateispeicher |
| **trusted** | Rolle für vertraute Personen, die mit deinem Konto arbeiten dürfen ([Rollen](wiki:rollen-zugriff)) |
| **Wine** | Windows-Programme unter Linux, ohne Windows-VM |
| **Worker** | Ein Programm bei Cloudflare, das eine App oder einen Dienst ausführt |
| **Workflow** | Ein automatischer Ablauf bei GitHub ([Liste](wiki:ref-workflows)) |
