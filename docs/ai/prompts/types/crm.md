---
id: crm
title: Kontakte und CRM
summary: Personen, Firmen, Gespräche, Geburtstage, Nachfassen
accent: rose
order: 40
---

## App type: contacts and CRM

People and organisations, what was discussed, and what to follow up on.

- **Views:** *Heute* (follow-ups due, birthdays this week), *Kontakte* (search, filter chips
  by tag or company, rows with initials thumbnails, alphabetical sections), *Verlauf*
  (recent interactions), optionally *Pipeline* (columns per stage as `mn-list` groups).
- **Data:** `person:<id>` (`name`, `emails[]`, `phones[]`, `company`, `role`, `tags[]`,
  `birthday` as `MM-DD` or `YYYY-MM-DD`, `notes`), `org:<id>`, and `note:<personId>:<date>:<id>`
  for interactions (`kind`: call, meeting, mail, message; `text`; `followUp` date).
- **Detail sheet:** name as title, chips for tags, facts (contact data as links:
  `mailto:`, `tel:`), a timeline of interactions (newest first) and "Nachfassen am …".
- **Privacy:** contacts are personal data. Use `private` data mode unless the user asked for
  a shared team CRM; never send contact data to AI without an explicit button.
- **Import:** vCard (`.vcf`) and CSV when the import-export module is chosen.
