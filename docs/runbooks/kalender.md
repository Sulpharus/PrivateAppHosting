# Kalender and Google Calendar sync

The Kalender (`hosted/kalender`) shows your own and shared calendars plus every dated record of
other apps (ADR 0002). Its Google sync runs in the API Worker (ADR 0010).

## After the first deploy

1. The deploy registers what the Kalender asks for (`suite.uses` in its `mininode.json`).
   Approve it under **Verwaltung → Gemeinsame Daten**: events with "Löschen", the other types
   with "Lesen". Without approval the Kalender shows nothing and cannot save.
2. Other apps appear as sources once they write suite records and their own requests are
   approved there.

## Google Calendar

Prerequisites: the API has `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GOOGLE_TOKEN_KEY`
(ADR 0004), and the API Worker's second cron trigger (`2-59/5 * * * *` in
`apps/api/wrangler.jsonc`) is deployed.

1. Each person connects Google under **Dein Konto** in the portal, with full Calendar access.
2. In the Kalender: **Google Kalender** (header) → switch on, choose what appears in Google.
   The sync creates the Google calendar "MiniNode" and brings the Google calendars in.
3. It runs every five minutes, when the Kalender opens and after each change.

## When something is off

| Symptom | Check |
|---|---|
| "Verbinde zuerst dein Google-Konto" / "Zugriff" | Reconnect Google under Dein Konto (the grant lacks the calendar scope or was revoked). |
| Status "Fehler" for a while | API logs: `gcal_sync_failed` names the reason; failed runs retry after an hour. |
| Sync slow on a big calendar | `gcal_sync_paused` in the logs is normal: runs continue page by page (Workers Free budget). |
| An event from Google is missing | API logs: `gcal_apply_failed` lists events the data schema refused. |
| A Google calendar should not come in | Switch it off in the Google Kalender sheet; its events go to the bin, nothing changes in Google. |

Switching the sync off (or disconnecting Google) leaves "MiniNode" in Google as it is and
removes the Google calendars from MiniNode.
