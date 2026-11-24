---
id: crm
title: Kontakte und CRM
summary: Personen, Firmen, Gespräche, Geburtstage, Nachfassen
when: Nimm das, wenn du Personen oder Firmen verwalten und festhalten willst, worüber ihr gesprochen habt und wann du dich wieder melden solltest.
accent: rose
audience: me
modules: tables, search, dates, privacy
order: 40
---

## App type: contacts and CRM

People and organisations, what was discussed, and what to follow up on.

- **Views:** *Heute* (follow-ups due, birthdays this week), *Kontakte* (search, filter chips
  by tag or company, rows with initials thumbnails, alphabetical sections), *Verlauf*
  (recent interactions), optionally *Pipeline* (columns per stage as `mn-list` groups).
- **Data:** three tables:
  - `orgs` (`id`, `name text not null`, `notes`);
  - `people` (`id`, `name text not null`, `emails text[]`, `phones text[]`, `org_id uuid
    references orgs on delete set null`, `role`, `tags text[]`, `birthday_month smallint`,
    `birthday_day smallint`, `birthday_year smallint` (optional), `notes`);
  - `interactions` (`id`, `person_id uuid not null references people on delete cascade`,
    `kind text check (kind in ('call','meeting','mail','message'))`, `happened_on date not null`,
    `text`, `follow_up date`); index `follow_up` and `person_id`.
- **Detail sheet:** name as title, chips for tags, facts (contact data as links:
  `mailto:`, `tel:`), a timeline of interactions (newest first) and "Nachfassen am …".
- **Birthdays** of people who use MiniNode come from `mn.birthdays()` (module *Geburtstage*);
  store birthdays only for contacts outside MiniNode.
- **Privacy:** contacts are personal data. Use the `private` data mode unless the brief asks for
  a shared CRM; never send contact data to AI without an explicit button.
- **Import:** vCard (`.vcf`) and CSV when the import-export module is chosen.
