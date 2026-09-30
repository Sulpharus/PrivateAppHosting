# ADR 0010: Google Calendar sync for the Kalender

- Status: accepted
- Date: 2026-09-30

## Context

The Kalender (`hosted/kalender`) shows own events and every dated record of other apps. People
also live in Google Calendar: they want chosen MiniNode dates on their phone's calendar, and
their Google events in MiniNode, changes going both ways. Google access already exists per user
(ADR 0004: an encrypted refresh token with full Calendar scope), but app tokens are short-lived
and the sync has to run while the app is closed.

## Decision

**The API Worker syncs, not the app.** The Kalender only switches it on and off and says what to
send (`/google/calendar`, `mn.google.calendarSync`). Only the Kalender's origin may call it.

- **Push**: the chosen sources (own calendars `col:<id>`, other apps' types `app:<slug>:<type>`)
  are mirrored into one Google calendar "MiniNode" that the sync creates. Each event carries the
  record id in `extendedProperties.private.mn`. Own events edited or deleted in Google change the
  record; other apps' records are restored on the next push (their app decides). Events created
  directly in "MiniNode" land in "Meine Termine", which then stays mirrored.
- **Pull**: every Google calendar in the user's list becomes a collection of the family
  `kalender` (read-only calendars with a viewer membership). Records come in with
  `source_app = 'google'`; edits and deletes in MiniNode go back to Google. Calendars can be
  switched off one by one (their records go to the bin).
- **Conflicts**: `gcal_links` stores the record version Google has and the event's etag. A
  record changed in MiniNode after Google's change wins; otherwise Google's version wins. An
  etag we wrote ourselves is ignored when it comes back.
- **Recurrence**: series travel as RRULE plus EXDATE. A moved or cancelled occurrence in Google
  becomes an exclusion of its series plus a single event, as in the Kalender. Local occurrence
  keys use the event's time zone (Europe/Berlin by default).
- **Budget**: Workers Free allows 50 subrequests per invocation. Every run counts Google and
  database calls and stops cleanly when its share is used: status `paused`, and the next cron
  run continues. Each page of events is applied as it arrives and its page token saved, so long
  listings finish over several runs. Order per run: changes made in "MiniNode", MiniNode's
  changes, then the Google calendars, longest waiting first. Runs: a second cron trigger
  (`2-59/5 * * * *`, the most overdue user, an hour's pause after a failed run), and the
  Kalender asks for a sync when opened and a few seconds after each change (at most every 30
  seconds). PATCHes carry `If-Match`, so a change made in Google meanwhile is pulled first.
- **Security**: tables `gcal_*` have RLS on and no grants to users; the SQL functions are
  service-role only. The routes check the Kalender's origin and `has_grant('kalender')` (app
  grant plus second factor), as `/google/token` does; the cron skips users who lost the grant.
  Google edits change only records the user may edit (own events, editor or owner); records of
  other apps or of calendars they only view are restored. Deleting or leaving a Google calendar
  in MiniNode switches it off and never deletes anything in Google. Disconnecting Google
  (`DELETE /google`) switches the sync off. The refresh token never leaves the API.

## Consequences

- Google holds a copy of the chosen dates; switching off keeps "MiniNode" in Google as it is
  and removes the Google calendars from MiniNode.
- Initial pulls list whole calendars; events that ended over a year ago (and are not series)
  are skipped. A very full calendar may take several runs to arrive.
- Only records that end within the last 30 days or later (and all series) are mirrored into
  "MiniNode"; older ones are removed there.
- Attendees, conference links and Google colours per event are not synced; MiniNode colours
  map to Google event colours. "Abgesagt" travels as a title prefix, since Google has no
  cancelled-but-visible state.
- Reminders of events changed by the sync while the Kalender is closed follow on its next start.
- At most 50 Google calendars come in; the rest stay switched off.
