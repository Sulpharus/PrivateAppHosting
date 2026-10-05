---
title: Gaming Hub und Spiele
category: apps
order: 70
summary: Wie Spiele funktionieren, was der Hub speichert und wie man ein Spiel hinzufügt
---

Spiele erscheinen **nur im Gaming Hub** (`mininode.app/games`), nicht auf der Startseite zwischen den Apps (ADR 0009).

## Was der Hub zeigt

Spiele nach Art gruppiert (Puzzle, Arcade, Karten, Brett, Quiz, Wort, Strategie, Sonstiges), je Person: Spielzeit, gespielte Runden,
Siege, Serien, persönliche Bestwerte, Aktivität pro Tag, **Bestenlisten** je Wert und die letzten Runden. Den **Spielernamen**
(3–20 Zeichen, eindeutig) legt jede Person im Portal fest; ohne Namen erscheint sie in keiner Bestenliste. Wer den Namen entfernt,
verschwindet aus allen Listen. Unter `/games/<name>` steht das Profil eines Spiels.

## Ein Spiel ist eine App mit `game`-Block

```json
"game": {
  "genre": "puzzle",
  "players": "solo",
  "stats": [{ "id": "time_leicht", "label": "Zeit Leicht", "better": "lower", "format": "seconds", "min": 1, "max": 7200 }]
}
```

Bis zu sechs Werte (`stats`); `better` ist `higher` oder `lower`, `format` ist `number` oder `seconds`. Über das Hilfsskript `game.js` und
`mn.game` meldet das Spiel Zeit (`track()` alle 30 s, nur bei sichtbarer Seite) und Runden (`result('win', { … }, Sekunden)`).

## Sicherheit

Ein Spiel schreibt **nur für sich**: die Datenbankfunktionen erkennen das Spiel an der Adresse (`calling_game()`), nie an einem
Parameter. Werte müssen deklariert sein und in `min`..`max` liegen; Rate-Limits begrenzen Missbrauch (höchstens 300 Runden pro Stunde
und Spiel, 240 Sitzungsstarts pro Stunde).

## Mitgelieferte Spiele

Memory, Minensucher (3 Stufen), Sudoku (eigener Generator, 5 Stufen nach Lösungstechnik), Solitär (Klondike), 2048 und Codeknacker
(Mastermind). Die aktuelle Liste steht unter [Apps im System](wiki:ref-apps) (Spalte „Besonderes“: Spiel).

## Ein neues Spiel

Mit der KI-Werkstatt (Funktionsgruppe „Spiele“: Speichern, Steuerung per Touch, Level, Generatoren, Kit) bauen und
[hochladen](wiki:hochladen). Das gemeinsame Hilfsskript heißt `packages/ui/kit/game.js`.
