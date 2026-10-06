# ADR 0023: Teams, data shared with chosen people

- Status: accepted
- Date: 2026-10-06

## Context

The data modes so far share too much or too little: `private` shares with nobody, `shared-account`
works on one owner's data (a household), `group` shares everything with everyone who has the app.
A project manager, a shared trip plan or a band's setlist needs the middle: several projects side
by side, each seen only by the 2 to 6 people in it, with different rights (someone may only read).

## Decision

1. **A new data mode `team`.** Tables of such an app carry `team_id uuid not null`; the platform
   adds the foreign key to `platform.teams` (rows go with the team) and the policies:
   `platform.secure_table(slug, table, 'team')`. Every policy still calls `platform.app_access`
   (user grant and calling app, ADR 0002) and additionally `platform.team_can(team_id, role)`.
2. **Roles** `viewer` < `editor` < `owner`. Viewers read, editors write rows and files and notify
   members, owners also rename and delete the team and manage its people. A team always has an
   owner; the last owner cannot leave or be demoted.
3. **Two platform tables, no direct access.** `platform.teams` and `platform.team_members` are
   locked (RLS on, nothing granted). Apps use the functions through `mn.team`: `list`, `create`,
   `members`, `setMember`, `removeMember` (also "leave"), `rename`, `remove`, `notify`. All of them
   only answer from the app's own page, and a team belongs to one app.
4. **Who can join:** only people who may use the app (the list of `mn.people()`); owners add them
   by id. There are no invitation links, since the platform is invite-only anyway.
5. **Files:** `mn.files.upload(path, body, { team })` stores under `<slug>/team-<id>/…`; the same
   membership check applies (viewers read, editors write and delete).
6. **Live updates:** Realtime does not carry the app's origin (ADR 0002 §1), so `postgres_changes`
   on team tables delivers nothing. Apps broadcast a small signal on the channel `team:<id>`
   (`{ type: 'changed', id }`, never data) and the receivers reload; a visibility reload covers the
   gaps. The channel name is guessable only by members in practice (ids are random uuids), and the
   signal carries no content.
7. **Google Drive linking** is a Google block of its own: `"google": { "drive": "file" }` asks for
   `drive.file` only (files the app created, never all of Drive), so no Google review is needed.
   Apps call the Drive REST API through `mn.google.fetch`. Without the Google Picker (its script is
   blocked by the CSP) the app creates its own folder and files, and shares them with Drive's own
   sharing; any other Drive file is attached as a plain link.
8. **Large files** (videos, design files) are not stored in Supabase's bucket (Free: 1 GB, 50 MB
   per file). They go to the NucBox once an app has a connected server (a later ADR); until then
   apps limit attachments to 5 MB and link the rest.

## Consequences

- Several apps can offer "projects" or "groups" without touching RLS. The pgTAP meta-test
  (`app_access` in every policy) still holds, and `104_teams.test.sql` covers roles, other apps,
  files and the last owner.
- A removed person keeps nothing: rows and files are checked live. Content they wrote stays.
- Teams of an app are deleted with the app (cascade) and with their owner's decision, including
  all rows in the app's tables.
- Suite records (`task`, `project`, ADR 0002) stay per person and collection; an app publishes the
  tasks assigned to a person into that person's own collection so they show in the Kalender.

- Files of a deleted team stay in the storage bucket (unreachable, but they count toward the quota
  and the backups); an app removes them with `mn.files.remove(path, { team })` before deleting the
  team, and a later cleanup job may sweep orphans.
- Notifications through `mn.team.notify` carry only a path on this site as link; the portal also
  refuses other links when it shows them. An editor can still send many notifications to a member;
  there is no rate limit yet (teams are 2 to 6 trusted friends), and at most 50 teams per person.

## Alternatives considered

- *`group` with a `project_id` column and policies in the app:* apps may not write policies, and
  one mistake would show a project to everyone.
- *A generic `members` jsonb array on each row:* no index, no foreign key, rights per row drift.
- *Drive as the primary file store:* permissions would live in two systems.
