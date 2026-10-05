# Aether Notes

Achtsames CRM für Kontakte, Notizen, Routinen und Aufgaben auf der MiniNode-Plattform.

## Funktionen

- **Dashboard**: Übersicht über anstehende Erinnerungen und Wiedervorlagen, heutige Rituale und kürzliche Notizen.
- **Notizbibliothek**: Gedanken, Checklisten und persönliches Tagebuch mit Tag-Filterung und Volltextsuche.
- **Rhythmen & Routinen**: Strukturierte Morgen-, Nachmittags- und Abendroutinen mit Serien-Tracker (Streak) und Feier-Modal.
- **Kontakte & Netzwerk**:
  - Detaillierte Dossiers für Kontakte (Firma, Rolle, Kontaktdaten, Vorlieben, Notizen).
  - Interaktive **Obsidian-Netzwerkkarte** mit physikalischer Beziehungs-Visualisierung und Schnellverknüpfung.
  - Treffen-Planer mit Vorbereitungsnotizen und Kontaktverknüpfung.
- **CRM & Wiedervorlagen**:
  - Gesetzte Nachfass-Termine mit Statusanzeige (Überfällig, Heute, Morgen, In X Tagen).
  - Ein-Klick-Aktion zum Abschließen und Zurücksetzen erledigter Erinnerungen.
  - Interaktionsprotokoll für Anrufe, Treffen, E-Mails und Nachrichten.
- **Aufgaben (Kanban-Board)**:
  - Spalten für *Zu tun*, *In Bearbeitung*, *Überprüfung* und *Abgeschlossen*.
  - Meilenstein-Checklisten mit direktem Fortschrittsbalken und Abhaken auf der Karte.
  - Prioritätsstufen und Fälligkeitstermine.
- **Daten & Sicherung**:
  - Vollständige JSON-Sicherung nach MiniNode-Spezifikation (Export und Import mit ID-Zusammenführung).
  - CSV-Export der Kontakte (deutsch, Semikolon-getrennt mit UTF-8 BOM).

## Datenspeicherung & MiniNode

- **Modus**: `private` (jeder Benutzer hat seine eigenen, isolierten Daten).
- **SDK**: Nutzt `mn.kv` zur Speicherung aller Einträge und `mn.push` / `mn.notify` für Erinnerungen.
- **Offline-Fähigkeit**: Unterstützt lokales Caching und nahtlosen Betrieb ohne aktive Internetverbindung.
