# ADR 0025: Birthdays in the account, shared with people of the same apps

- Status: accepted
- Date: 2026-10-06

## Context

The Wunschliste should count down to the birthdays of the people you give presents to. Contacts
that are not on MiniNode are in Aether Notes; people on MiniNode could enter their own birthday,
but the platform has no place for it.

## Decision

1. **A birthday is part of the profile:** `birthday_month`, `birthday_day`, optional `birthday_year`
   (a person who does not want their age known leaves it out), and `birthday_shared`, off by
   default. A check constraint refuses impossible dates (30 February, 29 February in a non-leap
   year).
2. **Written only through `platform.set_my_birthday`** and read through `platform.my_birthday`
   ("Dein Konto → Geburtstag"); the table grant stays as it was. Clearing the birthday also stops
   sharing.
3. **Apps get others' birthdays through `mn.birthdays()`** (`platform.app_birthdays(slug)`): only
   people who allowed it, only people who can use that same app (the `mn.people()` list), only from
   the app's own page, never the caller's own. No app can list birthdays of people it shares
   nothing with.
4. **Contacts stay in Aether Notes.** An app that wants them reads them through the suite or its own
   export; birthdays of people outside MiniNode are not copied into the platform.

## Consequences

- Admins can read every profile row (including a birthday that is not shared), like names and roles;
  "private" means private from other users and from apps. The sharing switch is global: it is not
  per app, anyone who can use the same app sees a shared birthday.

- Nothing is revealed by default, and sharing can be switched off at any time.
- The Wunschliste can combine three sources: people on MiniNode (`mn.birthdays()`), contacts from
  Aether Notes, and entries typed in the app itself.
