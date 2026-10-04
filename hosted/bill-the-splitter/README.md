# Bill the Splitter

Smart group bill splitting with deadlines, receipt management, direct PayPal and SEPA bank payment links, and push remi…

Integriert aus `upload.zip` mit `mininode integrate` (automatisch, ohne KI-Prüfung).
Der Zugriff ist nicht freigegeben, bis der Admin ihn unter Verwaltung → Apps vergibt.

## Was das Skript geändert hat

- vite.config.ts neu geschrieben (ohne Entwicklungs-Einstellungen und Schlüssel)
- package.json: Server- und KI-Pakete entfernt, @mininode/sdk ergänzt, Skripte dev/build
- src/mininode-boot.ts: Anmeldung vor dem Start, window.MiniNode (Konto, Daten, KI) über die Plattform, localStorage mit dem Konto synchronisiert
- 4 externe Schrift-/Style-Einbindung(en) entfernt (die Sicherheitsregeln erlauben nur eigene Dateien)
- mininode.json: Single-Page-App, Daten privat, KI mit Monatsbudget 3 €, Zugriff nicht automatisch

## Auf einen Blick

- Externe Schriften (z. B. Google Fonts) entfallen; es gilt die Ersatzschrift.
