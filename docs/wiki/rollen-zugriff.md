---
title: Rollen, Zugriff und Freigaben
category: einstieg
order: 30
summary: Wer was sehen und tun darf, und wie du Zugriff vergibst
---

## Die drei Rollen

| Rolle | Für wen | Darf |
| --- | --- | --- |
| `admin` | du, der Eigentümer | Alles in der Verwaltung: Apps, Nutzer, Server, KI-Budget, Sicherung, Löschen |
| `trusted` | vertraute Personen (Partner:in, Familie) | Apps im **gemeinsamen Konto**-Modus mit deinem Konto nutzen, ohne deine Zugangsdaten zu sehen; Remote-Apps in deinem Namen |
| `user` | alle anderen Eingeladenen | Freigegebene Apps mit **eigenen, privaten Daten** |

Die Rolle steht in `platform.profiles` und wird mit jedem Anmelde-Token (`mn_role`) mitgeschickt, damit Schranken und
API nicht jedes Mal die Datenbank fragen müssen.

## Zugriff auf eine App: die Freigabe

Eine Person kann eine App nur öffnen, wenn sie eine **Freigabe** (*Grant*) dafür hat. Sie entsteht auf drei Wegen:

1. **Standard-App:** Apps mit „Für alle neuen Nutzer“ (`access.default` im Manifest, Schalter in Verwaltung → Apps)
   werden jeder neuen Person automatisch freigegeben.
2. **Bei der Einladung:** In Verwaltung → Nutzer & Rollen wählst du Rolle und zusätzliche Apps.
3. **Von Hand** in Verwaltung → Apps → *Zugriff* einer App. Dort gibt es auch die **Nur-ausgewählte-Personen**-Liste
   (*Whitelist*): dann sehen nur du und die Gewählten die App, alle anderen verlieren den Zugriff.

Eine neue App hat zunächst für niemanden Zugriff, außer sie ist eine Standard-App. Nach dem [Hochladen](wiki:hochladen)
musst du sie also freigeben.

## Wer eine App wirklich "aufruft"

Ein App-Aufruf der Datenbank wird doppelt geprüft (ADR 0002): hat die Person eine Freigabe, **und** kommt die Anfrage von
der Adresse dieser App (`Origin`)? Dafür sorgt die Funktion `platform.app_access('<name>')` in jeder Zeilenschutz-Regel.
Eine App kann deshalb nie Daten einer anderen lesen, selbst wenn dieselbe Person beide nutzt.

## Gemeinsames Konto

Bei Apps im Modus **gemeinsames Konto** (`shared-account`) arbeiten `trusted`-Personen auf den Daten des Eigentümers
(`platform.effective_owner(<app>)`). Jede Änderung steht mit der echten Person im Protokoll (`audit_log`). Eine solche App
braucht deshalb einen Admin als Besitzer. Mehr: [Daten speichern](wiki:daten-speichern).

## Erneute Bestätigung (Step-up)

Heikle Aktionen (Apps ändern, Nutzer löschen, Schlüssel setzen, Sicherung herunterladen, App löschen) verlangen eine
Anmeldung in den letzten 10 Minuten (der Sicherungs-Download: 5 Minuten). Das Portal fragt dann kurz nach Passkey/Passwort oder, wenn eingerichtet, dem Code
der Authenticator-App. Siehe [Anmeldung](wiki:anmeldung).

## Nutzer einladen

Verwaltung → **Nutzer & Rollen** → Abschnitt *Neue Einladung*: Rolle wählen, Apps wählen, **Einladungslink erstellen** und den Link der Person schicken
(Messenger). Der Link öffnet eine Seite mit einem **Weiter**-Knopf; erst der Klick löst den Link ein, damit Mail-Scanner ihn
nicht verbrauchen. E-Mail-Versand ist aus, solange Cloudflare Email Sending nicht eingeschaltet ist (`first-setup.md`).
Rollen ändern und Nutzer löschen geht auf derselben Seite.
