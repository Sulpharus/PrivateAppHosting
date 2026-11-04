---
title: MuseScore Studio im Browser
category: apps
order: 75
summary: Das Notensatzprogramm MuseScore Studio als App: Partituren in MiniNode, Plugins und Klänge für alle, was im Browser geht und was nicht
---

**MuseScore Studio** (`musescore.<deine Domain>`) ist das ganze Desktop-Programm zum Notensatz, im Browser: Paletten, Inspektor, Mischpult, Arbeitsbereiche, Einstellungen und alle Importe und Exporte. Es ist MuseScore 4.7.6, für den Browser übersetzt (WebAssembly), ohne Werbung, ohne Bezahlangebote und ohne Online-Dienste von MuseScore.com. Wie es gebaut wird, steht in `hosted/musescore/README.md`.

## Was du brauchst

- **Chrome oder Edge ab Version 137** auf einem Computer (Windows, macOS, Linux). Firefox und Safari können es noch nicht (es braucht die Browser-Funktion JSPI für Dialoge). Handys und Tablets sind kein Ziel.
- Am besten als **installierte App** (im Browser: „App installieren“), dann bekommt das Programm ein eigenes Fenster und alle Tastenkürzel.
- Der erste Start lädt rund 25 MB (das Programm) und im Hintergrund den Klang „MS Basic“; danach kommt beides aus dem Browser-Speicher.

## Partituren öffnen und speichern

- **Öffnen** und **Speichern unter** zeigen den Dateidialog von MiniNode: deine Dateien in MiniNode (privat, nur für dich) oder eine Datei auf dem Gerät.
- **Speichern** schreibt dorthin zurück, woher die Partitur kam, wie auf dem Desktop.
- **Exportieren** (PDF, PNG, SVG, MusicXML, MIDI, MEI, Braille, Audio als WAV, MP3, OGG, FLAC oder AAC …) geht genauso; Stimmen eines Exports landen nebeneinander. Audio rechnet der Browser selbst aus, das dauert bei langen Partituren etwas.
- **Drucken** erzeugt ein PDF und öffnet es im PDF-Betrachter des Browsers; dort druckst du.
- **Zuletzt geöffnet**: Partituren aus MiniNode öffnen sich auch nach einem Neuladen wieder. Dateien vom Gerät musst du nach einem Neuladen neu öffnen.
- **Tab schließen oder neu laden** gilt als normales Beenden. Wie MuseScore danach startet (leer, mit der letzten Sitzung …), stellst du unter Bearbeiten → Einstellungen → Allgemein → Programmstart ein. Nur wenn eine Partitur ungesicherte Änderungen hatte, fragt MuseScore, ob es sie wiederherstellen soll.
- **Kopieren und Einfügen** von Noten geht innerhalb des Editors wie auf dem Desktop. Wechselst du zwischen Kopieren und Einfügen in ein anderes Fenster oder einen anderen Tab, fügt MuseScore danach den Inhalt der Zwischenablage des Computers ein (z. B. Text von dort); kopiere die Noten dann noch einmal.
- **Abspielen** startet beim ersten Mal erst nach einem Klick in die Seite (der Browser verlangt das); die Wiedergabe nutzt „MS Basic“ und die Klänge deiner Ordner.

## Einstellungen und Datensicherung

- Einstellungen, Arbeitsbereiche, Paletten und die Liste der zuletzt geöffneten Dateien bleiben im Browser und folgen dir in andere Browser (eine versteckte Sicherung in deinen MiniNode-Dateien).
- **Daten** in der MiniNode-Leiste oben: alle Partituren und Einstellungen als **eine ZIP-Datei exportieren** oder eine solche Datei wieder **importieren** (auch auf einem anderen Gerät). Partituren mit gleichem Namen werden dabei ersetzt.

## Plugins für alle

MuseScore-Plugins sind kleine Programme (`.qml`), die im Editor laufen. Hier liegen sie in MiniNode und stehen **allen** zur Verfügung, die MuseScore nutzen.

1. **Plugins** in der MiniNode-Leiste (oder „Plugins verwalten …“ auf MuseScores Plug-In-Seite) → **Plugin hinzufügen …** → eine `.qml`-Datei oder einen gezippten Plugin-Ordner wählen (eine ZIP-Datei je Plugin).
2. In MuseScore unter **Startseite → Plug-Ins** auf **Plug-Ins neu laden** klicken.
3. Jede Person schaltet die Plugins, die sie will, dort selbst ein; neue Plugins sind zunächst aus.

- Es laufen Plugins für **MuseScore 4.4 und neuer** (Qt 6). Ältere Plugins (Qt 5) oder solche, die Programme auf dem Computer aufrufen, laufen nicht: Das Plugin-Fenster hat dafür einen **KI-Prompt**, den du mit den Plugin-Dateien in ein KI-Werkzeug gibst; das Ergebnis fügst du hier hinzu.
- Plugins, die Schriften brauchen, die man auf dem Computer installieren müsste (z. B. „MN Create Title Page“ der MN Better Notation Plugins), nutzen im Browser Ersatzschriften.
- Jeder mit Zugriff auf die App kann Plugins hinzufügen und entfernen, und ein Plugin läuft im Editor aller, die es einschalten. Füge nur Plugins hinzu, denen du vertraust.

## Klänge (SoundFonts und Effekte)

**Klänge** in der MiniNode-Leiste verwaltet Ordner mit Klängen, privat (nur du) oder geteilt (alle).

- **SoundFonts** (`.sf2`, `.sf3`) erscheinen im Mischpult als Instrumentenklang. Große Dateien werden in Teilen gespeichert und im Browser wieder zusammengesetzt.
- **Geräusche** (WAV, MP3, OGG, FLAC …): Aus den Dateien eines Ordners baut der Browser einen SoundFont mit dem Namen des Ordners, ein Klang je Taste ab C4. Das Fenster zeigt, welcher Klang auf welcher Taste liegt.
- Welche Ordner geladen werden, stellt jede Person für sich ein. Einschalten wirkt sofort, Ausschalten oder Löschen beim nächsten Start.

## Was im Browser nicht geht

- **MIDI-Keyboards** (noch nicht), VST-Instrumente und -Effekte, Muse Sounds und andere Inhalte aus Muse Hub, Video-Export, mehrere Fenster (eine zweite Partitur ersetzt die erste).
- Konto, Cloud und Veröffentlichen bei MuseScore.com sind entfernt.
- Oberfläche auf Deutsch und Englisch (folgt der Sprache von MiniNode).

## Bauen und Bereitstellen

Das Programm wird aus dem Quellcode gebaut, zuerst Qt (die Bibliothek der Oberfläche), dann MuseScore. GitHub Actions (`musescore.yml`, aufgerufen von CI und Deploy) speichert beides zwischen:

- Der **erste Bau** in einem Zweig dauert rund zwei Stunden (Qt etwa anderthalb, MuseScore etwa eine halbe); danach nimmt jeder Lauf Qt und das fertige Programm aus dem Zwischenspeicher und braucht Minuten.
- Ein Pull Request kann den Zwischenspeicher von `main` lesen, aber nicht umgekehrt. Nach dem ersten Bau auf `main` sind also auch neue Pull Requests schnell.
- Ein Push bricht einen laufenden Bau desselben Zweigs ab. Schlägt nur der MuseScore-Bau fehl, laufen die anderen Apps trotzdem durch; MuseScore bleibt dann in der vorigen Version.

Was zuletzt geprüft wurde und was noch offen ist, steht in `docs/STATUS.md`.
