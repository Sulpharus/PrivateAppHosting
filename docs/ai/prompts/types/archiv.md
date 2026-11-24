---
id: archiv
title: Archiv und Sammlung
summary: Bücher, Filme, Serien, Spiele, Rezepte, Sammlungen mit Bewertung
when: Nimm das, wenn du Dinge sammelst und wiederfinden willst, zum Beispiel gelesene Bücher, gesehene Filme, Rezepte oder Platten, mit Bewertung und Notizen.
accent: violet
audience: me
modules: tables, files, search, stats
order: 20
---

## App type: archive and collection

A personal catalogue of things read, watched, played, cooked or collected, with status,
rating and notes.

- **Views:** *Start* (tiles "Am Lesen/Schauen", "Zuletzt beendet", "Wunschliste"), *Sammlung*
  (search, filter chips by status and genre, `mn-list` rows with cover thumbnails, sorting),
  *Statistik* (KPIs per year, a heat grid of finished days, bars per genre).
- **Data:** a table `works` (`id`, `title text not null`, `creator` (author, director, studio),
  `year integer`, `kind text check (kind in ('book','film','series','game',…))`, `genres text[]`,
  `status text check (status in ('wishlist','active','done','dropped'))`, `rating smallint check
  (rating between 1 and 5)`, `started date`, `finished date`, `progress integer`, `notes text`,
  `cover text` (a file path)); index `status` and `finished`. Re-reads and re-watches go into a
  second table `sessions` (`work_id … references works on delete cascade`, `started`, `finished`).
- **Covers:** uploaded images via `mn.files`, shown as 4:3 tile photos or 56 px thumbnails;
  without a cover show initials. Never hotlink covers from third-party sites; to take a picture
  from a shop or database page use `mn.image(url)` and upload the blob (module *Bilder aus dem Netz*).
- **Rating** uses five toggle buttons with `aria-pressed` and a label ("4 von 5"), never
  colour alone.
- **Detail sheet:** cover hero, title, chips (kind, year, genres), progress meter, facts,
  notes, and the list of sessions (re-reads, re-watches).
- **Import:** offer CSV import (Goodreads, Letterboxd exports) when the import-export module
  is chosen.
