# Haushaltsinventar (Steward)

Garantien, Kaufbelege und Wert des Haushalts: Gegenstände mit Foto und Beleg (`mn.files`),
Garantie und Geltungsbereich, mehrere Haushalte mit Mitgliedern und Rollen, Besitzerzuweisung,
Papierkorb mit Rückgängig, JSON-Sicherung, CSV-Export und -Import, Druckansicht.

## Herkunft

Ein Google-AI-Studio-Export („steward.zip“, Prüf-Issue #30) mit eigener `mininode.json`.
Datenmodus `shared-account`.

## Was für MiniNode geändert wurde

- `src/mininode.ts` ist jetzt der echte `@mininode/sdk`. Der Export brachte einen eigenen
  „Stellvertreter“ mit, der bei jedem Problem still auf den Browser-Speicher zurückfiel: Daten wären
  nie im Konto angekommen.
- `mininode.json`: ohne den unbekannten Schlüssel `accent` (er hätte die Prüfung gestoppt), Name und
  Adresse `haushalts-inventar` statt „Neue App“, Build-Befehl `pnpm build`, Zugriff nicht für alle.
- `package.json`: Name je App, Server- und KI-Pakete (`express`, `@google/genai`, `dotenv`, `tsx`)
  entfernt; `vite.config.ts` ohne die Entwicklungs-Einstellungen von AI Studio.
- Titel und Kopfzeile heißen „Haushaltsinventar“.

## Offene Punkte

- Keine Sprachpakete (Doctor-Warnung `i18n-missing`): Prompt zum Nachrüsten in der KI-Werkstatt.
- `data-accent="beige"` ist eine eigene Farbwelt der App (in `src/index.css`), kein Kit-Akzent.
