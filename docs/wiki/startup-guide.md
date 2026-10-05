---
title: Startup-Guide
category: einstieg
order: 5
summary: Die ersten Schritte als Checkliste
---

Dieser Guide führt dich vom ersten Login bis zu deinem ersten laufenden System, Schritt für Schritt. Hake ab, was du erledigt hast; der Fortschritt bleibt in diesem Browser.
Zu jedem Schritt gibt es im [Wiki](/admin/wiki) mehr. Du musst nicht alles an einem Tag machen: die Schritte 1 bis 5 reichen für ein sicheres Fundament.

## Verstehen, was MiniNode ist

Lies in fünf Minuten den Überblick: [Was ist MiniNode?](wiki:ueberblick). Merke dir drei Dinge:

- Eine App ist ein Ordner mit `mininode.json`; sie läuft unter `<name>.mininode.app` hinter einem gemeinsamen Login.
- Die **Datenbank** schützt die Daten, nicht die App ([Daten speichern](wiki:daten-speichern)).
- **Alles** geht über Git: ein Merge in `main` bringt eine Änderung live ([Deploy](wiki:deploy-workflows)).

Die Begriffe stehen in [Begriffe von A bis Z](wiki:begriffe).

## Anmelden und einen Passkey einrichten

1. Öffne `https://mininode.app/login` und melde dich an (das erste Konto des Projekts ist Admin).
2. Öffne **Dein Konto** (Menü oben rechts) und lege einen **Passkey** an (Fingerabdruck, Gesicht oder Windows Hello).
3. Lege einen **zweiten Passkey** auf einem anderen Gerät an: so bist du nicht ausgesperrt, wenn ein Gerät verloren geht.
4. Optional: koppel eine **Authenticator-App** als zweiten Faktor ([Anmeldung](wiki:anmeldung)).

## Die Verwaltung kennenlernen

Öffne die [Verwaltung](/admin) und schau dir jede Seite der Seitenleiste einmal an: **Übersicht**, **Apps**, **Kategorien & Pakete**, **Nutzer & Rollen**, **Hardware-Server**,
**KI-Proxy**, **API-Schlüssel**, **Gemeinsame Daten**, **KI-Werkstatt**, **Sicherung**. Was jede Seite tut: [Verwaltung: jede Seite erklärt](wiki:verwaltung-rundgang).

## Geheimnisse in den Passwortmanager legen

Lege diese Schlüssel jetzt in einen **Passwortmanager** (nicht nur in GitHub): `BACKUP_PASSPHRASE`, `VAULT_KEY`, `GOOGLE_TOKEN_KEY`, die Supabase-Zugänge und die GitHub-Token.
Ohne `VAULT_KEY` und `GOOGLE_TOKEN_KEY` sind gespeicherte API-Schlüssel und Google-Verbindungen nach einer Wiederherstellung unlesbar. Die Liste mit Wechselwegen:
[Geheimnisse und Schlüsselwechsel](wiki:geheimnisse).

## Die erste Sicherung erstellen

1. In GitHub (Settings → Environments → `production`) das Geheimnis **`BACKUP_PASSPHRASE`** anlegen (24+ zufällige Zeichen, dieselbe Zeile im Passwortmanager) und die Umgebung auf den
   Branch `main` beschränken.
2. [Verwaltung → Sicherung](/admin/backups) → **Sicherung erstellen**, nach einigen Minuten **Herunterladen**.
3. Datei **außerhalb von GitHub und Supabase** ablegen (externe Platte, Cloud-Laufwerk) und mit `pnpm mininode backup verify <entpackter ordner>` prüfen. Wie das Wiederherstellen geht: [Sicherung](wiki:sicherung).

## Verbindliche Prüfungen auf main einschalten

Damit niemand (auch kein automatischer Pull Request) etwas Rotes mergen kann: GitHub → Settings → Rules → Rulesets → neuer Branch-Ruleset für `main` mit „Require status checks to pass“:
*Lint, typecheck, test*; *Database, integration and e2e*; *Infra scripts and images*; *Secret scan*. Unter Settings → General „Allow auto-merge“ einschalten, wenn du `INTEGRATE_AUTOMERGE` nutzen willst.
Mehr: [Tests und CI](wiki:tests-ci).

## Eine Person einladen

[Verwaltung → Nutzer & Rollen](/admin/users) → Abschnitt *Neue Einladung*: Rolle wählen (`user` für eigene Daten, `trusted` für gemeinsame Konten), Apps wählen, **Einladungslink erstellen** und den Link der Person per Messenger schicken.
Die Person öffnet den Link, klickt **Weiter**, legt ein Passwort und einen Passkey an. Wer was darf: [Rollen, Zugriff und Freigaben](wiki:rollen-zugriff).

## Apps freigeben

Neue Apps sind für niemanden sichtbar. Unter [Verwaltung → Apps](/admin/apps): **Für alle neuen Nutzer** einschalten, wo es passt, und bei einzelnen Apps **Zugriff** vergeben. Prüfe die **Kategorie**
(automatisch oder von Hand) und setze ein **Logo**. Siehe [Apps verstehen](wiki:apps-verstehen).

## Eine eigene App hinzufügen

1. Idee beschreiben in der [KI-Werkstatt](/admin/workshop): Prompt zusammenstellen, in Claude oder AI Studio einfügen, ZIP herunterladen ([KI-Werkstatt](wiki:ki-werkstatt)).
2. [Verwaltung → Apps → Hochladen](/admin/upload): das ZIP hinein; das Skript baut es ein und öffnet einen Pull Request ([Hochladen](wiki:hochladen)).
3. **Auf grüne Prüfungen warten, dann mergen.** Nach dem Deploy steht die App unter [Apps](/admin/apps); gib sie frei.
4. Geht das Skript nicht weiter („Braucht Prüfung“), sag Claude Code: „arbeite die ai-review-Issues ab“ ([Mit Claude Code arbeiten](wiki:claude-code)).

## Gemeinsame Daten genehmigen

Apps wie der Kalender, der Sportplaner oder der Haushalt tauschen Termine und Verträge. Genehmige ihre Anfragen unter [Gemeinsame Daten](/admin/suite): Kalender „Löschen“ bei Terminen und „Lesen“ bei
den übrigen Typen; Sportplaner `activity` und Haushalt `contract` „Bearbeiten“. Ohne Genehmigung zeigt der Kalender nichts ([Gemeinsame Daten](wiki:gemeinsame-daten)).

## API-Schlüssel und KI-Budget prüfen

Rote Zahl neben [API-Schlüssel](/admin/api-keys): für jede genannte API einen Schlüssel eintragen, oder auf „persönlich“ stellen. Unter [KI-Proxy](/admin/ai) ein Monatsbudget
festlegen, das du dir leisten willst ([API-Schlüssel](wiki:api-schluessel), [KI-Proxy](wiki:ki-proxy)).

## Push und Sprache einstellen

In **Dein Konto**: *Benachrichtigungen* je Gerät einschalten (nötig für Erinnerungen aus Apps) und die **Sprache** wählen. Beides gilt für alle Apps ([Push und Offline](wiki:push-offline),
[Sprache und Formate](wiki:sprachen-formate)).

## Google verbinden (optional)

Für „Mit Google anmelden“, Gmail/Kalender in Apps und den Kalender-Sync: OAuth-Client einrichten, Geheimnisse setzen, danach unter *Dein Konto* Google verbinden ([Google](wiki:google)).

## Den Heimserver anschließen (optional)

Container-Programme (Jellyfin, n8n, Windows-Programme) brauchen die NucBox: Proxmox, Linux-VM, Tunnel. Danach geht die [App-Bibliothek](/admin/hardware/library) mit einem Klick
([NucBox](wiki:nucbox), [App-Bibliothek und Programme](wiki:app-bibliothek-programme)).

## Wenn etwas schiefgeht

Schau in die [Fehlerbehebung](wiki:fehlerbehebung): sie nennt die häufigsten Fälle mit der schnellsten Prüfung. Deploy-Läufe und Protokolle stehen unter GitHub → Actions
(Link in der Seitenleiste unter „Weitere Dashboards“).

## Das Wissen aktuell halten

Wenn du oder Claude etwas Neues baut, wächst dieses Wiki mit: jede sichtbare Änderung trägt ihr Wissen im selben Commit mit, und ein Test sichert die Grundlagen ab. Die Regel und was
wann zu tun ist: [Wissen aktuell halten](wiki:wissen-pflegen). Und schau gelegentlich in die [Neuigkeiten](wiki:neuigkeiten).
