---
id: notifications
title: Erinnerungen
summary: Hinweise in der Glocke des Portals, fällige Einträge
order: 60
---

## Feature: reminders

- `mn.notify(title, body, path)` puts a notification into the portal's bell for the current
  user; `path` is the app route to open ("/heute").
- The app has no background process: create reminders when the app is opened (for today and
  anything overdue) and remember what was sent in kv (`notified:<id>:<date>`) so nothing is
  sent twice.
- Keep titles short ("Müll rausbringen"), the body optional, and at most a few per day.
- In the app itself, show due items at the top of the first view; the bell is an extra.
