---
id: comments
title: Kommentare und Erwähnungen
summary: Kommentare an Einträgen, Namen aus der Personenliste, Hinweise ohne fremde Push-Nachricht
group: teilen
order: 84
---

## Feature: comments and mentions

- Store comments as small items (`comment:<itemId>:<id>` in kv, or a table when the app is
  shared): `{ id, itemId, by, at, text }`. Show the author from the platform's people list
  (`mn.people()`), never from the text, and show the time as relative text with the date on
  hover.
- Mentions: typing `@` opens a list of `mn.people()`; store the person's id with the comment, not
  the typed name. Render mentions as text with weight, not colour only.
- `mn.notify` and `mn.push` reach only the **current** user. A mention cannot push to another
  person from the browser. Show it inside the app instead: a badge "2 neue Erwähnungen" and an
  inbox view that lists comments mentioning the person since they last looked
  (`seen:<userId>` timestamp in kv). Do not promise a notification the platform cannot send.
- Editing and deleting only for the author (and admins); show "bearbeitet".
- Render comment text as plain text with line breaks; never as HTML.
