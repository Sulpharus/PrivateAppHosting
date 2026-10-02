---
id: dienst
title: Server-Dienst
summary: Eigener Server-Prozess mit Weboberfläche, läuft als Container auf dem Hardware-Server
accent: blue
order: 85
---

## App type: server process with a web interface

Only for things a browser app cannot do: WebSockets, schedulers, heavy server work, an existing
server program with its own UI. Build the smallest server that does that job and keep the
interface a normal MiniNode view.

- **Shape:** a container (`kind: "container"`, `target: "nucbox"`) with one port and a health
  path; see the module *Server-Dienst als Container*. Do not add a login, user table or API-key
  handling: the platform has done the login before a request reaches the app.
- **Views:** a status view first (running, last run, last error), then the settings, then the
  data. Long jobs show progress and can be stopped; the result stays visible after a reload.
- **Data:** per user through Supabase with the user's token; shared state in app tables. Files
  the service creates are downloads, not a public folder.
- **Operation:** log one line per event to stdout, answer the health path quickly, restart
  cleanly after a crash, and keep memory within `memoryMb`.
