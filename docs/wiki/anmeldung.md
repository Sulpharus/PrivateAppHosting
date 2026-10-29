---
title: Anmeldung, Passkeys und zweiter Faktor
category: einstieg
order: 40
summary: Wie man sich anmeldet, Passkeys einrichtet und was bei verlorenem Handy zu tun ist
---

## Eine Anmeldung für alles

Alle Anmelde-Seiten liegen auf **`https://{{domain}}/login`** (ADR 0001). Apps haben kein eigenes Login: sie rufen
`mn.auth.requireLogin()` auf und werden dorthin geschickt, mit `?next=` für den Rückweg. Die Kennung für Passkeys
(*RP ID*) ist `{{domain}}` und gilt als dauerhaft: würde sie sich ändern, wären alle Passkeys ungültig.

Die Anmeldung gilt für alle Unterseiten (`*.{{domain}}`); jede App-Schranke prüft sie selbst. Ist die Sitzung abgelaufen,
leitet die Schranke kurz zu `{{domain}}/auth/refresh` und wieder zurück.

## Wege der Anmeldung

| Weg | Hinweis |
| --- | --- |
| **Passkey** | Hauptweg: Fingerabdruck, Gesicht, Windows Hello. Einrichten unter *Dein Konto* |
| **E-Mail und Passwort** | Rückfall für Geräte ohne Passkey; mindestens 12 Zeichen |
| **Mit Google anmelden** | Optional (`setup-cloudflare.md` (section 9, Google)); die Google-Adresse muss zum Konto passen, es werden keine neuen Konten angelegt |

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
- **Geburtstag** (ADR 0025): Tag, Monat, Jahr freiwillig; erst wenn du „Für andere Personen sichtbar“ einschaltest, sehen ihn Personen, die dieselben Apps nutzen (für alle Apps gleich; Admins sehen alle Profile) (zum Beispiel die Wunschliste für Geschenke); jederzeit wieder entfernbar;
- **Sprache** (Deutsch/English; gilt für alle Apps, ADR 0017, siehe [Sprache und Formate](wiki:sprachen-formate));
- **Benachrichtigungen:** Push je Gerät einschalten ([Push und Offline](wiki:push-offline));
- **Persönliche API-Schlüssel**, wenn ein Admin eine API auf „persönlich“ gestellt hat ([API-Schlüssel](wiki:api-schluessel)).

## Abmelden

Abmelden läuft über das Portal (`/logout`) und schaltet Push auf diesem Gerät aus, damit ein geteiltes Gerät nicht Meldungen
der falschen Person bekommt.

## Das Sicherheitsmodell in Kürze

Das Login ist sorgfältig gebaut, aber **kein System ist „undurchdringlich“**; das ist ehrlich, was es leistet und was nicht:

- **Wer rein darf:** nur eingeladene Konten (Anmeldung für Fremde ist aus). Passwörter haben mindestens 12 Zeichen, Anmeldeversuche pro Adresse sind begrenzt; Passkeys und Authenticator-App schützen zusätzlich.
- **Wie geprüft wird:** die Schranke jeder App und die API prüfen bei jeder Seite die Signatur der Sitzung (nur asymmetrische Verfahren), die Freigabe der App und den zweiten Faktor; die Datenbank erzwingt die Rechte selbst (Zeilen-Sicherheit).
  Weiterleitungen nach der Anmeldung gehen nur auf die eigene Domain.
- **Was bleibt:** die Sitzung steckt in einem Cookie, das JavaScript lesen kann (nötig, weil alle Apps auf Unterdomains sie teilen). Darum laufen Apps mit strenger Inhaltsrichtlinie (kein fremdes Skript), und nur Apps, die du prüfst, kommen auf die Plattform.
  Eine gestohlene Sitzung gilt bis zu einer Stunde, auch nach dem Abmelden. Schütze Konten mit Passkeys, halte Geräte aktuell und lade nur Personen ein, denen du vertraust.
- **Selbst prüfen:** `docs/runbooks/getting-started.md` hat fünf kurze Prüfungen nach jeder Installation.
