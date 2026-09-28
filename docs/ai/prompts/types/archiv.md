---
id: archiv
title: Archiv und Sammlung
summary: Bücher, Filme, Serien, Spiele, Rezepte, Sammlungen mit Bewertung
accent: violet
order: 20
---

## App type: archive and collection

A personal catalogue of things read, watched, played, cooked or collected, with status,
rating and notes.

- **Views:** *Start* (tiles "Am Lesen/Schauen", "Zuletzt beendet", "Wunschliste"), *Sammlung*
  (search, filter chips by status and genre, `mn-list` rows with cover thumbnails, sorting),
  *Statistik* (KPIs per year, a heat grid of finished days, bars per genre).
- **Data:** one kv key per work (`work:<id>`) with `title`, `creator` (author, director,
  studio), `year`, `kind` (`book`, `film`, `series`, `game`, …), `genres[]`, `status`
  (`wishlist`, `active`, `done`, `dropped`), `rating` (1 to 5, optional), `started`,
  `finished`, `progress` (pages, episodes, percent), `notes`, `cover` (file path).
- **Covers:** uploaded images via `mn.files`, shown as 4:3 tile photos or 56 px thumbnails;
  without a cover show initials. Never hotlink covers from third-party sites.
- **Rating** uses five toggle buttons with `aria-pressed` and a label ("4 von 5"), never
  colour alone.
- **Detail sheet:** cover hero, title, chips (kind, year, genres), progress meter, facts,
  notes, and a history of re-reads/re-watches.
- **Import:** offer CSV import (Goodreads, Letterboxd exports) when the import-export module
  is chosen.
