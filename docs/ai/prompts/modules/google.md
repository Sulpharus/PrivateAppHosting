---
id: google
title: Gmail und Google Kalender
summary: Mails und Termine des angemeldeten Nutzers lesen und schreiben
order: 35
---

## Feature: Gmail and Google Calendar

- The user connected Google once on MiniNode. Never build a Google sign-in, never load Google's
  JavaScript libraries and never use a Google client ID or API key. Declare what the app needs in
  `mininode.json`, e.g. `"google": { "gmail": "write", "calendar": "write" }` (`read` if it only
  shows data), and call the REST APIs with `mn.google.fetch(url, init)`, which attaches a
  short-lived token for exactly those scopes.
- Calendar: `https://www.googleapis.com/calendar/v3/…` (`calendars/primary/events` with
  `timeMin`, `timeMax`, `singleEvents=true`, `orderBy=startTime`; `POST` to create, `PATCH` to
  change, `DELETE` to remove). Send `timeZone: 'Europe/Berlin'` with `dateTime` values.
- Gmail: `https://gmail.googleapis.com/gmail/v1/users/me/…` (`messages?q=…&maxResults=20`, then
  `messages/{id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From` for lists and
  `format=full` for one mail; `messages/send` with a base64url-encoded RFC 822 `raw` body;
  `messages/{id}/modify` for labels such as `UNREAD`). Decode base64url bodies with
  `TextDecoder`, prefer `text/plain` parts and never render mail HTML with `innerHTML`: show it
  in a sandboxed `<iframe srcdoc>` or as text.
- Before the first call check `await mn.google.connected()`. If it is false, show an empty state
  with a button "Google verbinden" that opens `mn.google.connectUrl()`, not an error.
- Errors: `GoogleError.code` `google_not_connected` / `google_scope_missing` → the connect state
  above; HTTP 429 or 5xx from Google → "Google ist gerade nicht erreichbar", keep what is shown.
- Load lists page by page (`pageToken`), show skeletons while loading, and cache the last result
  in `mn.kv` only if the app must work offline; otherwise always read fresh from Google.
- Sending a mail or deleting an event always goes through a confirmation sheet that shows what
  will happen.
