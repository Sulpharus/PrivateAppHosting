---
id: comments
title: Kommentare und Erwähnungen
summary: Kommentare an Einträgen, Namen aus der Personenliste, Hinweise ohne fremde Push-Nachricht
when: Nimm das, wenn Leute an Einträgen kommentieren und einander mit @ erwähnen sollen.
group: teilen
order: 84
---

## Feature: comments and mentions

- Store comments in a table `comments` (`id`, `item_id uuid not null references <items> on delete
  cascade`, `author_id uuid not null`, `text text not null check (char_length(text) <= 4000)`,
  `mentions uuid[] not null default '{}'`, `edited boolean not null default false`, timestamps);
  index `item_id`. Show the author from the platform's people list (`mn.people()`), never from the
  text, and show the time as relative text with the date on hover.
- Mentions: typing `@` opens a list of `mn.people()`; store the person's id in `mentions`, not the
  typed name. Render mentions as text with weight, not colour only.
- `mn.notify` and `mn.push` reach only the **current** person. A mention cannot push to someone
  else from the browser (in data mode `team`, `mn.team.notify` can). Otherwise show it inside the
  app: a badge "2 neue Erwähnungen" and an inbox view that lists comments mentioning the person
  since they last looked (the timestamp in `mn.kv` under `settings`). Do not promise a notification
  the platform cannot send.
- Editing and deleting only for the author (and admins); show "bearbeitet".
- Render comment text as plain text with line breaks; never as HTML.
