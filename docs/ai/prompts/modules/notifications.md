---
id: notifications
title: Erinnerungen
summary: Fällige Einträge in der App und in der Glocke des Portals
when: Nimm das, wenn die App an fällige Dinge erinnern soll, in der App und in der Glocke des Portals.
order: 60
group: offline
---

## Feature: reminders

- `mn.notify(title, body, path)` puts a notification into the portal's bell for the current
  person (and pushes it to devices with notifications on); `path` is the app route to open
  ("/heute").
- For reminders at a set time while the app is closed, use `mn.push.schedule` (push module).
  Without it, create reminders when the app is opened (for today and anything overdue) and
  remember on the row what was sent (`notified_on date`), so nothing is sent twice.
- Keep titles short ("Müll rausbringen"), the body optional, and at most a few per day.
  Texts come from the language packages.
- In the app itself, show due items at the top of the first view; the bell is an extra.
