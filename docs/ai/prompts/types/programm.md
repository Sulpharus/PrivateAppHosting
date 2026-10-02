---
id: programm
title: Programm für PC/Server
summary: Vorhandenes Desktop-Programm im Browser nutzen, ohne es neu zu schreiben
accent: violet
order: 86
---

## App type: an existing program used through the browser

The program is not rewritten. The deliverable is the manifest and the notes needed to install
and use it; see the module *Programm für PC/Server*.

- **Decide the runtime first:** Windows (VM, RemoteApp), `wine` for simple `.exe` programs, or
  `android`. A Linux program is no remote app: it belongs in the App-Bibliothek.
- **Installer:** never in the repository. Name where it is uploaded, its SHA-256, and the silent
  arguments to use.
- **Use on a phone:** say what to expect (window size, keyboard, clipboard, files) and what the
  program should be set to (language, window mode). Data lives inside the program, so name where
  and say how to back it up.
- **Access:** who may use it (data mode `shared-account` when it runs as the owner).
- **Checks:** install on a test copy, connect, work, disconnect, reconnect; check that it sleeps
  after the idle limit.
