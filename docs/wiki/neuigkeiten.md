---
title: Neuigkeiten
category: entwicklung
order: 70
summary: Was zuletzt neu im System ist, mit Datum und Fundort (neueste zuerst)
---

Jede Änderung am System bekommt hier eine Zeile (siehe [Wissen aktuell halten](wiki:wissen-pflegen)). Neueste zuerst.

## Oktober 2026

| Datum | Neu | Wo |
| --- | --- | --- |
| 05.10. | **Aether Notes: Name aus dem MiniNode-Konto**: die Begrüßung nutzt deinen Kontonamen, Profilbild und die Felder Benutzername und Bereichs-Titel sind entfernt; die Warnung „Speicher eingeschränkt“ bei den Kontakten ist weg, die App nutzt jetzt direkt das SDK (kein Ersatz-Client mehr), und eigene Kategorien und Treffen liegen im Konto statt im Browser | App Aether Notes |
| 05.10. | **Sportplaner: Credits und Kontingente** für Mitgliedschaften wie Urban Sports Club oder ClassPass: Credits pro Monat oder maximale Besuche (pro Monat/Tag) beim Tarif, Kosten bzw. Monatslimit je Aktivität beim Verknüpfen, Hinweis bei Überschreitung und Verbrauch des Monats in Statistik und Details | App Sportplaner |
| 05.10. | **Wunschliste**: Fotos direkt hochladen (nicht nur per Link) und die Liste als schön gestaltetes **PDF mit Bildern** exportieren („Als PDF“) | App Wunschliste |
| 05.10. | **Sportplaner**: bei *Sportart* mehrere Sportarten mit Komma eintragen („Schwimmen, Sauna“); Filter, Chips und Statistik zählen jede einzeln | App Sportplaner |
| 05.10. | **Einheitlicher Startbildschirm** für alle Apps (statt nur dem Buchstaben-Icon): Zeichen, Name, Fortschritt, hell/dunkel, DE/EN | [Benachrichtigungen, Push und Offline](wiki:push-offline) |
| 05.10. | **Einbau-Skript und KI-Prompt lernen aus den Prüf-Issues**: unbekannte Manifest-Schlüssel, Platzhalter-Namen, Beispiel-E-Mails, fremde Schriften/Icons und eigene SDK-Ersatzdateien werden behoben oder gemeldet; der Prompt nennt diese Fallen. Neue Apps: Haushaltsinventar (Steward), Bill the Splitter; Aether Notes wieder ordentlich dargestellt | [Fehlerbehebung](wiki:fehlerbehebung), [Hochladen](wiki:hochladen) |
| 05.10. | **App löschen: Entfernen-Pull-Request besteht CI**: er nimmt auch den e2e-Test der App mit, e2e startet nur noch vorhandene Apps | [App löschen](wiki:app-loeschen) |
| 05.10. | **Sprachpakete nachrüsten**: fertiger Prompt in der KI-Werkstatt für Apps ohne Pakete; „Bestehende App übernehmen“ verlangt sie jetzt auch | Verwaltung → KI-Werkstatt, [Sprache und Formate](wiki:sprachen-formate) |
| 05.10. | **Wissen**: Wiki und Startup-Guide in der Verwaltung; Regel und Test, dass sie mit dem System mitwachsen (ADR 0021) | Verwaltung → Wissen, [Wissen aktuell halten](wiki:wissen-pflegen) |
| 05.10. | **Apps löschen**: Deaktivieren, Löschen ohne/mit Daten, Code-Entfernung per Pull Request; Kalender geschützt (ADR 0020) | Verwaltung → Apps → Löschen, [App löschen](wiki:app-loeschen) |
| 05.10. | **Sicherung** der ganzen Plattform als verschlüsselte Datei, mit Wiederherstellung (ADR 0019) | Verwaltung → Sicherung, [Sicherung](wiki:sicherung) |
| 05.10. | **Haushaltsinventar** aus dem Upload eingebaut und für Handys beschleunigt (Fotos verkleinert, träge Bilder, schnelle Listen) | [Apps im System](wiki:ref-apps) |
| 05.10. | **Sportplaner**: ausgefallene Einheiten sind im Kalender rot | Sportplaner → Kalender |
| 05.10. | **Einbau-Skript** prüft wie CI; Upload-Status „Pull Request offen“, erst nach dem Merge „Eingebaut“ | [Hochladen](wiki:hochladen), `pr-merged.yml` |
| 04.10. | Startfehler des Einbaus nennen GitHubs Status und Grund (Ursache war der Standard-Branch des Repositorys) | [Hochladen](wiki:hochladen) |
| 03.10. | Logos im Gaming Hub; offene Schritte des Eigentümers stehen in `docs/STATUS.md` | [Gaming Hub](wiki:gaming-hub) |
| 02.10. | **Sprachumschaltung** Deutsch/English in jeder App (ADR 0017) | [Sprache und Formate](wiki:sprachen-formate) |
| 02.10. | **App-Logos** (ADR 0018), Kacheln mit eigener Knopfzeile | Verwaltung → Apps, [Apps verstehen](wiki:apps-verstehen) |
| 02.10. | Verwaltungsmenü aufgeräumt (Hardware-Server, Gaming-Hub-Ansicht), KI-Werkstatt mit 19 neuen Bausteinen | [Verwaltung](wiki:verwaltung-rundgang), [KI-Werkstatt](wiki:ki-werkstatt) |
| 01.10. | **Uploads** von ZIP und Programmen mit Skript-Einbau und KI-Prüfung (ADR 0013) | [Hochladen](wiki:hochladen) |
| 01.10. | **Persönliche API-Schlüssel** (ADR 0014), eigene **Schubladen** (ADR 0015), **Release-Editionen** (ADR 0016), **Apps als GitHub-Projekt** (ADR 0012) | [API-Schlüssel](wiki:api-schluessel), [Startseite](wiki:startseite), [Releases](wiki:apps-exportieren-releases) |
| 01.10. | Kalender mit Quellen, ICS und geteilten Kalendern; Sportplaner-Karte und Kursmodus | [Gemeinsame Daten](wiki:gemeinsame-daten) |

## Ende September 2026

| Datum | Neu | Wo |
| --- | --- | --- |
| 30.09. | **Gaming Hub** (ADR 0009), **Google-Kalender-Sync** (ADR 0010), **App-Bibliothek** (ADR 0011), Haushalt mit PDF-Auszügen | [Gaming Hub](wiki:gaming-hub), [Google](wiki:google), [App-Bibliothek](wiki:app-bibliothek-programme) |
| 29.09. | **API-Schlüssel** (ADR 0006), **Kategorien, Favoriten, Pakete, Link-Kacheln** (ADR 0007), **Personen zum Teilen** (ADR 0008) | [API-Schlüssel](wiki:api-schluessel), [Startseite](wiki:startseite) |
| 28.09. | **Gemeinsame Daten (Suite)** (ADR 0002), **App-Kit und Konstruktions-Prompts** (ADR 0003), **Google-Dienste für Apps** (ADR 0004), **Push und Offline** (ADR 0005), zweiter Faktor, App-Identität an der Adresse | [Gemeinsame Daten](wiki:gemeinsame-daten), [App-Kit und SDK](wiki:app-kit-sdk), [KI-Werkstatt](wiki:ki-werkstatt), [Google](wiki:google), [Push und Offline](wiki:push-offline), [Anmeldung](wiki:anmeldung) |
| 23.–24.09. | **Fundament**: Plattform-Datenbank, zentraler Login mit Passkeys (ADR 0001), Portal, Apps, Deploy | [Was ist MiniNode?](wiki:ueberblick) |

Die vollständige technische Geschichte steht in Git; neue Entscheidungen in [Entscheidungen (ADR)](wiki:ref-entscheidungen).
