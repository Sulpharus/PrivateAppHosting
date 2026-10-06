---
name: Projekte
type: organisation
audience: team
accent: violet
builder: ai-studio
modules: teams, tables, offline, files, google, editor, dragsort, calendar, dates, suite, push, notifications, comments, search, undo, stats, import-export, keyboard, accessibility, onboarding, errors, performance
ai: false
---
A project manager for friends and small work groups (2 to 6 people per project), where people on
MiniNode work together on shared projects. Think a calm mix of Trello (Kanban), a project wiki and a
small dashboard. Everything is in German and English (language packages), mobile first, light and
dark.

## Teams, people and roles

- Everything belongs to a **team** (data mode `team`, module "Teams und Projekte"). Someone creates a
  team ("Bandprojekt", "Umzug", "Bachelorarbeit"), becomes its owner and adds people from
  `mn.people()`. Roles: **Ansehen** (viewer), **Bearbeiten** (editor), **Verwalten** (owner). A team
  needs at least one owner. The same person can be in several teams; a team switcher sits in the
  header, the last team is remembered per device in `mn.kv`.
- A "Team verwalten" sheet (owners only) lists the members with role pickers, adds people, removes
  people, renames and deletes the team (typed confirmation, says that all boards, pages and files go
  too). Anyone can leave a team (not the last owner).
- Show the role everywhere it matters: a viewer sees no edit controls, drag handles, "+" buttons or
  editors, only a calm "Nur Ansehen" chip. The database enforces it anyway, so also handle a refused
  write with a clear message and a reload of that item.

## Boards (Kanban)

- A team has several **workspaces** (boards: "Songs", "Auftritte", "Organisation"). A workspace has
  **custom lists** (columns): add, rename, reorder by dragging, colour, optional WIP limit (shown red
  when exceeded, never blocks), mark one or more lists as "Erledigt" (cards that land there count as
  done and get a completion time), archive a list. New workspaces start from a template: "Einfach"
  (Offen / In Arbeit / Erledigt), "Scrum" (Backlog / Sprint / In Arbeit / Review / Erledigt) or
  "Leer".
- **Cards**: title, description (Markdown, same editor as the wiki, short preview on the card),
  assignee (exactly one person of the team, or nobody), **story points** (0, 1, 2, 3, 5, 8, 13, 21 as
  a chip row, or none), labels (per workspace, with colour and name), due date, optional **time of
  day** ("timed tasks": 14:30, shown on the card and the calendar, with a reminder 15 min / 1 h /
  1 day before via `mn.push`), checklist items (progress "2/5" on the card), attachments (see below),
  comments (see below), created by / created at, completed at.
- **Recurring tasks**: daily, weekly (weekdays), monthly (day of month or "last weekday"), yearly,
  with an interval and an optional end date. When a recurring card is completed (moved into a done
  list or ticked), the app creates the next occurrence (copy of title, description, checklist,
  labels, assignee, points) with the next due date. Idempotent: store `series_id` and
  `occurrence_date` and make the pair unique so two devices completing at once never create two. Show
  a repeat icon on the card; "Nur diese" / "Diese und folgende" when editing a recurring card.
- **Drag and drop** between lists and inside a list, with mouse, touch and keyboard (module "Sortieren
  per Ziehen"). Store the order as `position double precision` (midpoint between neighbours); when
  the gap becomes tiny, renumber that list. Moving a card also changes `list_id` and writes an
  activity entry.
- Quick add at the end of each list (Enter adds the next), a card sheet for details, a filter bar:
  assignee (including "Ich" and "Nicht zugewiesen"), label, due (overdue / today / this week /
  none), text search, "Nur meine Karten". The filter is remembered per workspace and device.
- Bulk: multi-select cards (long press or checkbox mode) to move, assign, set points or delete.
- Delete goes to a trash for 30 days with "Rückgängig" (module "Rückgängig und Papierkorb").

## Sprints and story points

- Optional sprints per workspace: name, start, end, goal. Cards can be assigned to a sprint;
  the board can show "Alle Karten" or "Aktueller Sprint". Starting a sprint snapshots the committed
  points (`committed_points`); closing it moves unfinished cards back to the backlog or into the next
  sprint (one question, defaults to the next).
- Points per card are free to change; the dashboard uses the points of cards that are in a done list.

## Calendar

- A calendar view (month, week, agenda) of the team: cards by due date, timed tasks at their time,
  sprint start/end, wiki "Meilensteine". Own colour per workspace, filter by person/workspace.
  Dragging a card to another day changes its due date (editors only). The week starts on Monday.
- Publish the tasks assigned to the **signed-in person** as suite `task` records
  (`due_at`, `status`, `data.project` = team and workspace name) so they appear in the Kalender app
  next to everything else: stable `sourceKey` = card id, update on change, delete when done or
  reassigned (module "Gemeinsame Daten"; declare `suite.uses` with a clear `why`). Each person
  publishes their own assignments only.

## Project knowledge base (wiki)

- Per team, a tree of **pages** (parent, title, icon emoji is NOT allowed: use a small neutral SVG),
  drag to reorder and nest, breadcrumb, a side outline of the page's headings, full-text search
  across title and body, "zuletzt bearbeitet von / am".
- A **good Markdown editor**: split view (editor | live preview) on wide screens, tabs on phones;
  toolbar with real buttons (Überschrift, fett, kursiv, Code, Zitat, Liste, Checkliste, Tabelle,
  Link, Bild, Trenner), keyboard shortcuts (Ctrl+B/I/K, Tab indents lists), live word count,
  auto-save as draft after 800 ms and a visible "Gespeichert / Speichert…" state, tables,
  task lists that can be ticked in the preview, fenced code blocks with a copy button, `[[Seitenname]]`
  links between pages with a backlinks list, `#KARTE-12` style references that link a card.
  Render with a small bundled parser and escape everything (module "Notizen und Texteditor"): no
  raw HTML, no `javascript:` links.
- **Page history:** every save that changes the text by more than a few characters (at most one per
  2 minutes per person) writes a version row; a history sheet lists versions with author and time,
  shows a diff against the current text and restores one (as a new version). Concurrent editing is
  last-write-wins per page; when someone saved while you were editing, show "Marie hat gerade
  gespeichert" with "Meine Version behalten" / "Neu laden und vergleichen" instead of silently
  overwriting.
- Templates for new pages: Protokoll, Entscheidung (ADR-light), Anleitung, Leer.

## Files and links

- Attachments on cards and pages, up to **5 MB each**, through `mn.files.upload(path, blob,
  { team })`; images get a thumbnail. Show type icon, name, size, who and when; download and delete
  (editors). Never trust the original file name as the path (use uuids).
- **Larger files and existing documents: links.** An attachment can be a plain link (any URL). Links
  to Google Drive files show a Drive label.
- **Google Drive linking** (module "Gmail und Google Kalender", manifest `"google": { "drive": "file" }`,
  the least access): a team owner can click "Mit Google Drive verbinden" which creates a folder
  "Projekte – <Team>" in their own Drive with `mn.google.fetch` (the app only ever sees files it
  created), stores `drive_folder_id` and `drive_folder_url` in the team settings, and offers
  "In Drive hochladen" for larger files (resumable upload via the Drive API) and "Drive-Ordner
  öffnen". Sharing the folder with teammates is Drive's own sharing: show a hint and the folder link;
  the app does not manage Drive permissions. If Google is not connected, show the normal "Google
  verbinden" empty state. Drive must never be required to use the app.
- Large-file storage on the household server comes later: leave a clearly separate, disabled
  section "Server-Speicher (kommt später)" in the team settings with one sentence explaining it, but
  no code behind it.

## Comments, assignments, notifications

- Comments on cards and wiki pages (module "Kommentare und Erwähnungen"): Markdown-light, `@name`
  mentions from the member list. A mention, an assignment ("Anna hat dir 'Songs auswählen'
  zugewiesen") and a due reminder notify the person with `mn.team.notify` / `mn.push` (never the
  author about their own action). Notification settings per person: assigned to me, mentions, due
  soon, daily digest at 08:00.
- An **activity feed** per workspace and per team ("Ben hat 'Setlist' nach Erledigt verschoben"):
  store small rows (`actor_id`, `verb`, `card_id`, `meta jsonb`), show the last 100, group by day.

## Dashboard (project overview)

The home screen of a team, all numbers computed on the server with `mn.db` (online) and cached for
offline view:
- Cards per status (list) as a stacked bar, open vs done this week, **overdue** and **due this week**
  as tappable counters that open the filtered board.
- **Burndown** for the current sprint (remaining points per day vs ideal line) and **velocity**
  (points completed per closed sprint, last 6), as small hand-drawn SVG charts with real labels
  (no chart library, tokens for colours, readable in dark mode, with a text alternative table).
- **Workload per person:** open cards and open points per assignee as horizontal bars; click to filter.
- A "Meine Aufgaben" strip (assigned to me, sorted by due), the latest activity, recently edited wiki
  pages, and the next milestones. Empty states explain the next step ("Lege deine erste Liste an").
- Export: board as CSV (title, list, assignee, points, due, labels), team backup as JSON (module
  "Import und Export") incl. wiki pages as Markdown; import from the same JSON; print view of the
  dashboard.

## Data (tables, module "Eigene Tabellen", data mode `team`)

Every table has `team_id uuid not null` (the platform adds the foreign key and the policies with
`platform.secure_table('projekte', '<table>', 'team')`), `id uuid primary key` made by the app,
`created_by uuid`, `created_at`/`updated_at`; real column types and checks; indexes on `team_id` plus
what is filtered or sorted by. Suggested tables: `team_settings` (team_id primary key, drive_folder_id,
drive_folder_url, week_start, digest_at), `workspaces`, `lists` (workspace_id, name, color,
position, wip_limit, is_done boolean, archived), `labels`, `sprints`, `cards` (workspace_id, list_id,
sprint_id, title, description, assignee_id, points smallint check in the allowed set, due_on date,
due_time time, completed_at, position, recurrence jsonb, series_id, occurrence_date, deleted_at;
unique (series_id, occurrence_date)), `card_labels`, `checklist_items`, `comments` (target_type,
target_id, body), `attachments` (target_type, target_id, kind 'file' or 'link' or 'drive', path/url,
name, size, content_type), `wiki_pages` (parent_id, title, body, position, updated_by), `wiki_versions`,
`activity`. Foreign keys with `on delete cascade` between them; `assignee_id` is a plain uuid (a user
of the platform), checked in the app against the member list. Use `mn.table` for reading and
writing (offline-capable) and `mn.db` for the dashboard queries.

## Real-time and offline

- After a change broadcast `{ type: 'changed', table, id }` on `mn.realtime('team:<id>')` and reload
  that item on receipt; reload when the tab becomes visible (at most every 30 s). Never broadcast
  content. Changes made offline are queued (`mn.offline`), the header shows "3 Änderungen warten".

## Onboarding and empty states

First start: "Neues Team anlegen" with a one-line explanation and a sample board option ("Mit
Beispielen starten": three lists, five cards, one wiki page, easy to delete). An invitation is just
the owner adding the person; show in the team sheet "Personen, die du hinzufügen kannst" from
`mn.people()`.
