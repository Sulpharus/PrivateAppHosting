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
| 06.10. | **Bill the Splitter übersichtlicher**: Rechnung mit wählbarem Zahler und Teilnehmern, Aufteilung gleich/Prozent/Beträge/Anteile mit Vorschau, Rechnungen bearbeiten und Löschen mit „Rückgängig“, Vorschläge „So gleicht ihr aus“ mit einem Tipp als bezahlt buchen, Zahlen und Daten im Format der Sprache | Bill the Splitter → Gruppe |
| 06.10. | **Aether Notes: Geburtstag bei jedem Kontakt und jeder Person** (Tag, Monat, Jahr freiwillig) mit Schalter „für andere Apps freigeben“; die Wunschliste plant Erinnerungen pro Person ohne Doppelte | Aether Notes → Kontakte / Personen; Wissen → Gemeinsame Daten |
| 06.10. | **Geburtstage in der Wunschliste**: neuer Tab mit Countdown für Personen auf MiniNode (wenn sie ihren Geburtstag im Konto freigegeben haben), Kontakte aus Aether Notes und selbst eingetragene Personen; Geschenkideen mit Stand und Budget, Erinnerung vor dem Geburtstag (Standard 14 Tage, 9 Uhr). **Aether Notes** zeigt die Geburtstage seiner Kontakte jetzt im Kalender (Einstellungen → Geburtstage; Admin-Freigabe `event` nötig, die Wunschliste braucht Lesen) | Wunschliste → Geburtstage; Aether Notes → Einstellungen |
| 06.10. | **Fertige App-Aufträge** (`docs/ai/briefs/`) für Projekte (Teams), Fahrzeuge (mit KI-Websuche) und Geburtstage; `scripts/compose-brief.ts` baut daraus den vollständigen Prompt für AI Studio | Wissen → KI-Werkstatt |
| 06.10. | **Geburtstag im Konto** (ADR 0025, freiwillig, nur für Personen derselben Apps sichtbar, wenn du es erlaubst) mit `mn.birthdays()` für Apps; **KI mit Websuche und Quellen** (ADR 0024, `mn.ai.search`, Manifest `ai.search`) | Dein Konto → Geburtstag; Wissen → KI-Proxy |
| 06.10. | **Teams für Apps** (ADR 0023): neuer Datenmodus `team`, `mn.team` (Teams, Rollen Ansehen/Bearbeiten/Verwalten, Hinweise an Mitglieder), Dateien je Team, Google-Drive-Bereich `drive.file` für Apps; Grundlage für einen Projektmanager | Wissen → Daten speichern, Google |
| 06.10. | **Sportplaner und Haushalt speichern in Tabellen** statt in einem kv-Eintrag je Buchung/Aktivität (ADR 0022): beim ersten Öffnen nach dem Update werden die alten Einträge einmal kopiert (nichts wird überschrieben, die alten Einträge bleiben als Sicherung); Auswertungen und Prüfregeln (Beträge, Datum, Art) liegen jetzt in der Datenbank, die Apps arbeiten weiter offline | Sportplaner, Haushalt; Wissen → Daten speichern |
| 06.10. | **Listen sind Tabellen, kv ist für Einstellungen** (ADR 0022): neues `mn.table` (Tabellen mit Offline-Warteschlange wie kv), Regel in Spezifikation, Prompts und Einbau-Skript, `mininode doctor` warnt bei einem kv-Schlüssel je Eintrag; Sportplaner: geplante Punkte im Kalender haben jetzt einen sichtbaren Rand | Wissen → Daten speichern, App-Kit und SDK |
| 06.10. | **Kalender: Bild links im Eintrag** (Tagesansicht, eine Stunde hoch); **Punkte am ausgewählten Tag der Monatsansicht behalten ihre Farbe** (vorher wurden sie weiß) | Kalender → Tag, Monat |
| 06.10. | **Kalender: Bilder, Farben pro App, Kartenpins**: kleine Bilder in Listen- und Tagesansicht (Schalter „Bilder“), Farbe pro App unter „Quellen verwalten“, auf der Karte Pins mit Anzahl und Liste bei gleicher Adresse, Bild als Pin bei einzelnen Einträgen; der Sportplaner schickt sein Titelbild mit | Kalender → Liste / Tag / Karte, Quellen verwalten |
| 06.10. | **Deploy vergleicht jede App mit ihrem zuletzt ausgelieferten Stand** statt mit dem vorigen Push: Änderungen aus einem fehlgeschlagenen Lauf gehen nicht mehr verloren (`mininode deploy --since-deployed`) | GitHub → Actions → Deploy |
| 06.10. | **Deploy wiederholt `supabase link`** bei einem Fehler der Supabase-Berechtigungsprüfung („FGA“) bis zu 5-mal und zeigt sonst die Ursache | GitHub → Actions → Deploy |
| 06.10. | **Wunschliste lädt wieder**: das Schema der Daten-Schnittstelle wird nach dem Foto-Update neu geladen; bei einem Ladefehler steht jetzt die Ursache in der Meldung | App Wunschliste |
| 06.10. | **Karte zeigt wieder Kacheln**: die Stile „Hell“ und „Dunkel“ nutzten CARTO, das jetzt einen API-Schlüssel verlangt; sie laufen nun über OpenStreetMap (Dunkel per Farbfilter) | Kalender → Karte, Aether Notes → Karte |
| 05.10. | **Karten-Dienst mit Schlüssel**: Kalender und Aether Notes melden Geoapify (Adressen, Wege) bei den API-Schlüsseln an; ohne Schlüssel laufen die freien OpenStreetMap-Dienste weiter | Verwaltung → API-Schlüssel |
| 05.10. | **Kalender: Karte** mit Terminen, Wegen und Fahrzeiten (Warnung bei zu knapper Zeit, Startpunkt, Auto/Fahrrad/zu Fuß, mehrere Kartenstile); **Aether Notes: Karte** der Wohnorte als Markierungen, Heatmap und Orte, „Wer wohnt in der Nähe?“ (auch um den Ort eines Treffens), Treffen mit Ort erscheinen im Kalender; „CRM“ und „Karte“ jetzt auch auf dem Handy erreichbar | Kalender → Karte, Aether Notes → Karte |
| 05.10. | **Aether Notes folgt der Sprache** aus dem Konto (Deutsch/Englisch, Sprachpakete in `public/i18n/`), alle Texte inklusive Kontakte-Formular sind übersetzt, die eigenen Sprachschalter sind weg | App Aether Notes |
| 05.10. | **App-Menü: bis zu drei Kacheln pro Reihe** und vier Ansichten zur Wahl (Kacheln, Groß, Liste, Kompakt) | Startseite |
| 05.10. | **Aether Notes und Bill the Splitter: „← Alle Apps“** führt zurück ins App-Menü; Aether: das Mond-Symbol der Abend-Rhythmen wird wieder gezeichnet (der Icon-Zuschnitt `scripts/subset-icons.py` fand Icons nicht, deren Glyphe anders heißt als der Icon-Name); Bill the Splitter: ein fehlender Import ließ die App nach dem Start abstürzen | Apps Aether Notes, Bill the Splitter |
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
