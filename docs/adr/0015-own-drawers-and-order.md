# ADR 0015: Own drawers and order

- Status: accepted
- Date: 2026-10-01

## Context

Sets (ADR 0007) are the admin's grouping and the sorts are fixed. People want their own groups of
the apps they use together, and their own order, on every device.

## Decision

**Drawers ("Schubladen")** are per account (`platform.user_drawers`, `user_drawer_items`, RLS on
the owner). A drawer belongs to an area, `apps` (start page) or `games` (Gaming Hub), and holds
apps the user may open (the policy checks `has_grant`). Limits: 30 drawers per area, 200 entries per
drawer. On the start page a drawer is a filter chip next to the categories ("+ Schublade" creates
one); on the tiles a drawer button picks the drawers of an app; in a drawer the toolbar fills,
renames and deletes it. The Gaming Hub has the same chips and dialogs for games.

**Own order** is saved per account and per screen (`platform.user_app_order`, scope plus a list of
addresses): `all`, `favorites`, `shared`, `cat:<id>`, `drawer:<id>` on the start page and
`games:<genre>` and `drawer:<id>` in the Gaming Hub. It applies when the sort is "Eigene
Reihenfolge" on the start page, and always in the hub. Apps the list does not mention follow in the
screen's usual order, entries that vanished are ignored. "Anordnen" switches edit mode: tiles
can be dragged and each has "nach vorn" / "nach hinten" buttons (keyboard, touch, screen reader
announcement); tiles do not open while arranging. Changes show at once and are saved in the
background; a failed save reloads the saved state and says so.

## Consequences

- Orders are per screen on purpose: a favourite order does not disturb the order of "Alle".
- Drawers and orders are not shared and not part of the offline copy of the start page.
- Removing an app's grant hides it from the user's drawers without deleting the entry.
