---
title: Verwaltung: jede Seite erklärt
category: betrieb
order: 10
summary: Ein Rundgang durch alle Seiten der Verwaltung und wofür man sie braucht
---

Die Verwaltung erreichst du über `mininode.app/admin` (nur Admins; heikle Aktionen verlangen eine frische Anmeldung, siehe [Rollen](wiki:rollen-zugriff)).
Links in der Seitenleiste:

| Seite | Wofür |
| --- | --- |
| **Übersicht** | Kennzahlen: Apps (mit Problemen), Nutzer (Einladen), KI-Kosten diesen Monat gegen die Grenze |
| **Apps** | Alle Apps: Status, Version, Kategorie, Zugriff, Logo, Deaktivieren, Löschen, Export; Link-Kacheln anlegen; Umschalter Apps / Gaming Hub; **Hochladen** |
| **Kategorien & Pakete** | Kategorien mit Stichwörtern pflegen; Pakete (Gruppen von Apps) für die Startseite |
| **Nutzer & Rollen** | Einladen (Rolle, Apps, Link), Rollen ändern, Nutzer löschen |
| **Hardware-Server** | Auslastung der NucBox (Host, VMs, Speicher, Container), **Remote-Apps** (Programme im Browser), **App-Bibliothek** (Ein-Klick-Installation) |
| **KI-Proxy** | Kosten, Anfragen, Budgets je App, Rolle und Person |
| **API-Schlüssel** | Schlüssel für externe APIs eintragen; Modus „für alle“ oder „persönlich“ |
| **Gemeinsame Daten** | Welche App welche Datentypen lesen oder schreiben darf; Priorität |
| **KI-Werkstatt** | Prompt-Ersteller und Vorgaben zum Bauen neuer Apps |
| **Sicherung** | Vollständige Sicherung erstellen und herunterladen |
| **Wissen: Wiki, Startup-Guide** | Dieses Wissen und die erste-Schritte-Liste |
| **Weitere Dashboards** | Links zu Cloudflare (Deploys, DNS, Logs), Supabase (Datenbank) und GitHub Actions |

Ausführlicher zu den Themen: [Apps verstehen](wiki:apps-verstehen), [Hochladen](wiki:hochladen), [App löschen](wiki:app-loeschen),
[KI-Proxy](wiki:ki-proxy), [API-Schlüssel](wiki:api-schluessel), [Gemeinsame Daten](wiki:gemeinsame-daten),
[KI-Werkstatt](wiki:ki-werkstatt), [Sicherung](wiki:sicherung), [NucBox](wiki:nucbox).

## Gut zu wissen

- **Admin-Daten sind live**: die Listen laden aus der Datenbank, nicht aus dem Repository. Nur *Apps im System* im Wiki kommt aus dem Repository.
- Nach einem Deploy sieht man neue Seiten erst, wenn der **PWA-Cache** erneuert ist: Seite neu laden oder die App neu öffnen.
- **Rote Zähler** neben „API-Schlüssel“ zählen fehlende Schlüssel.
- Alles Heikle schreibt eine Zeile in das **Protokoll** (`platform.audit_log`: wer, was, wann), etwa Löschen, Sicherungs-Download, Schlüsseländerungen.
