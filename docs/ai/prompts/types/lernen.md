---
id: lernen
title: Lernen und Wissen
summary: Karteikarten, Vokabeln, Lernpläne, Kurse, Quiz mit Wiederholung
when: Nimm das für Karteikarten, Vokabeln oder ein Quiz, bei dem die App sich merkt, was du wann wiederholen solltest.
accent: violet
audience: me
modules: tables, stats
order: 55
---

## App type: learning

Short daily sessions; the app decides what to repeat next.

- **Views:** *Heute lernen* (cards due today, a start button, streak), *Stapel* (decks with
  progress), *Karte bearbeiten*, *Statistik* (cards learned per day, retention).
- **Data:** tables `decks` (`id`, `title`) and `cards` (`id`, `deck_id … references decks on
  delete cascade`, `front text not null`, `back text not null`, `image text`, and the review state
  `due date`, `interval_days integer`, `ease real`, `reps integer`, `lapses integer`); index
  `due`. The review state follows a simple SM-2 variant with the answers "Nochmal", "Schwer",
  "Gut", "Leicht"; answers per day go to `reviews` (`card_id`, `reviewed_on`, `grade`) for the
  statistics.
- **Session:** one card at a time, full width, flip on tap or space, answer buttons large and at
  the bottom; show how many are left. Keyboard 1–4 on desktop.
- **AI (optional):** generate cards from a pasted text with `mn.ai.json`, always shown for
  review before saving.
- Import and export as CSV (front;back) for decks from other tools.
