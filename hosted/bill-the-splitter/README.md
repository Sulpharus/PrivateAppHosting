# Bill the Splitter

Gruppenabrechnung: Gruppen, Ausgaben mit Belegfoto und Zahlungsfrist, Ausgleichszahlungen,
Push-Erinnerungen, Orte, PDF-Export und Direct Pay (PayPal-Link, SEPA-Überweisung mit EPC-QR-Code).

## Herkunft

Ein Google-AI-Studio-Export („lumina-ledger.zip“, Prüf-Issue #29). Er sprach mit einem erfundenen
`window.MiniNode`-Objekt und speicherte fast alles nur in `localStorage`; die Plattform kennt
dieses Objekt nicht, nichts wäre bei anderen Personen angekommen.

## Was für MiniNode geändert wurde

- `src/mininode.ts` nutzt jetzt `@mininode/sdk`. Gruppen, Ausgaben, Ausgleiche, Aktivitäten und
  Mitglieder liegen **je Eintrag** in `mn.kv` (geteilt: Datenmodus `group`), damit zwei Personen
  gleichzeitig arbeiten können, ohne Listen zu überschreiben. Änderungen werden über einen
  Realtime-Kanal gemeldet, die anderen offenen Apps laden neu (auch nach einer Offline-Phase).
  Einstellungen (Zahlungsdaten, Sprache) bleiben persönlich.
- Der selbstgebaute „Multiplayer-Raum“ (`MN.mp`) ist entfernt; „Gruppe beitreten“ trägt die Person
  in die vorhandene Gruppe ein, statt sie zu überschreiben.
- KI (Ausgaben aus einem Satz lesen) läuft über `mn.ai` (`gemini-flash`, 2 € im Monat) mit einem
  lokalen Leser als Rückfall.
- Icons: Teilmenge der Material-Symbols-Schrift (`public/fonts`, 150 kB, `scripts/subset-icons.py`),
  Schriften Inter und Geist aus npm-Paketen, nichts von Google.
- Sprachpakete `public/i18n/de.json` und `en.json` (aus der bisherigen Tabelle); die Texte der App
  lesen sie, die Sprachwahl des Portals gilt.
- Beispiel-E-Mail-Adressen sind `@example.com`; `mininode.json` ohne die ungenutzten Blöcke
  `suite` und `google` (der Code trägt keine Fristen in den Kalender ein).

## Offene Punkte

- „Kalender-Events“ aus der Beschreibung des Exports sind nicht umgesetzt.
- Avatare kommen von dicebear.com (Bilder von dort sind erlaubt, übertragen aber den Namen).
- Die Zahlungsdaten (IBAN) liegen im persönlichen `prefs`-Eintrag, nicht in der Gruppe.
