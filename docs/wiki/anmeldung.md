---
title: Anmeldung, Passkeys und zweiter Faktor
category: einstieg
order: 40
summary: Wie man sich anmeldet, Passkeys einrichtet und was bei verlorenem Handy zu tun ist
---

## Eine Anmeldung für alles

Alle Anmelde-Seiten liegen auf **`https://mininode.app/login`** (ADR 0001). Apps haben kein eigenes Login: sie rufen
`mn.auth.requireLogin()` auf und werden dorthin geschickt, mit `?next=` für den Rückweg. Die Kennung für Passkeys
(*RP ID*) ist `mininode.app` und gilt als dauerhaft: würde sie sich ändern, wären alle Passkeys ungültig.

Die Anmeldung gilt für alle Unterseiten (`*.mininode.app`); jede App-Schranke prüft sie selbst. Ist die Sitzung abgelaufen,
leitet die Schranke kurz zu `mininode.app/auth/refresh` und wieder zurück.

## Wege der Anmeldung

| Weg | Hinweis |
| --- | --- |
| **Passkey** | Hauptweg: Fingerabdruck, Gesicht, Windows Hello. Einrichten unter *Dein Konto* |
| **E-Mail und Passwort** | Rückfall für Geräte ohne Passkey; mindestens 10 Zeichen |
| **Mit Google anmelden** | Optional (`first-setup.md` §3.1); die Google-Adresse muss zum Konto passen, es werden keine neuen Konten angelegt |

Neue Konten entstehen **nur über Einladungen** ([Rollen](wiki:rollen-zugriff)). Das erste Konto des Projekts wird Admin.

## Zweiter Faktor (Authenticator-App)

Unter *Dein Konto* kannst du eine Authenticator-App koppeln. Danach fragen Passwort- und Google-Anmeldung nach dem Code;
ein Passkey nicht (er ist selbst schon zwei Faktoren). Die Datenbank erzwingt das (`platform.mfa_ok`), also folgen Apps,
Schranken und API automatisch.

**Handy verloren?** Ein Passkey auf einem anderen Gerät meldet dich weiter an. Den alten Faktor entfernst du in
Supabase → Authentication → Users → *Benutzer* → MFA factors, dann koppelst du das neue Handy. Darum: Passkey auf einem
**zweiten Gerät** einrichten.

## Dein Konto

Die Seite *Dein Konto* (Menü oben rechts) bündelt:

- Name, Rolle, Passwort ändern;
- **Passkeys** und Authenticator-App;
- **Google** verbinden (für Kalender-Sync und Apps, die Gmail/Kalender nutzen; ADR 0004), mit Widerruf;
- **Sprache** (Deutsch/English; gilt für alle Apps, ADR 0017, siehe [Sprache und Formate](wiki:sprachen-formate));
- **Benachrichtigungen:** Push je Gerät einschalten ([Push und Offline](wiki:push-offline));
- **Persönliche API-Schlüssel**, wenn ein Admin eine API auf „persönlich“ gestellt hat ([API-Schlüssel](wiki:api-schluessel)).

## Abmelden

Abmelden läuft über das Portal (`/logout`) und schaltet Push auf diesem Gerät aus, damit ein geteiltes Gerät nicht Meldungen
der falschen Person bekommt.
