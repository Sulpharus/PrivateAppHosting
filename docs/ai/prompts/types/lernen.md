---
id: lernen
title: Lernen und Wissen
summary: Karteikarten, Vokabeln, Lernpläne, Kurse, Quiz mit Wiederholung
accent: violet
order: 55
---

## App type: learning

Short daily sessions; the app decides what to repeat next.

- **Views:** *Heute lernen* (cards due today, a start button, streak), *Stapel* (decks with
  progress), *Karte bearbeiten*, *Statistik* (cards learned per day, retention).
- **Data:** decks and cards in kv (`deck:<id>`, `card:<id>` with `front`, `back`, `deck`,
  optional `image`); the review state per card (`due`, `interval`, `ease`, `reps`, `lapses`)
  follows a simple SM-2 variant with the answers "Nochmal", "Schwer", "Gut", "Leicht".
- **Session:** one card at a time, full width, flip on tap or space, answer buttons large and at
  the bottom; show how many are left. Keyboard 1–4 on desktop.
- **AI (optional):** generate cards from a pasted text or a photo of a page with `mn.ai.json`,
  always shown for review before saving.
- Import and export as CSV (front;back) for decks from other tools.
