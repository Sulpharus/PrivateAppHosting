# Haushaltsinventar

Household inventory for homes and collections: every item with photo, room, owner, purchase
price, warranty, receipt and service dates. The overview shows the total value, warranties that
end soon and services that are due; the inventory can be searched and filtered by room,
category, warranty state and owner; the Excel report lists everything.

## Origin

A Google AI Studio export ("Steward" / "HomePal", 4,263 lines in one `App.tsx`) that ran on its
own `window.MiniNode` shim with a local sign-in form. The script cannot finish such a project,
so it was rebuilt on the platform with the same features (`ai-studio` playbook, review queue
`ee7721bb`). Only the export's domain rules stayed: warranty states, the service-interval table
and the Excel report.

## Data

Data mode `shared-account`: trusted people work on the owner's data. Everything is in `mn.kv`
(works offline and syncs later):

| Key | Content |
| --- | --- |
| `item:<id>` | one item |
| `rooms` | room names (the four defaults are stored as `@kitchen` and so on and shown in the active language) |
| `households` | households and their people |
| `backup:<id>` | a named copy of items, rooms and households |
| `settings` | the insured sum |
| `prefs:<userId>` | the household and view a person last used |

Photos and receipts go to `mn.files` under `items/<id>/`, at most 4 MB each. A file is deleted
only when no item and no backup uses it any more. Reminders go through `mn.push`
(warranty: 30 days before the end, service: 7 days before the date) and work with the app
closed.

Reminders belong to the person who saves the item (the platform delivers a reminder to the
account that scheduled it), so other members of a shared account do not get them unless they
save the item themselves; restoring a backup plans them for the person restoring. An item whose
warranty ends in less than 30 days (or whose service is due in less than 7) gets no reminder,
because that moment has passed; the overview and the inventory filter show it instead.

Restoring a backup first saves the current state as its own backup ("Vor dem Wiederherstellen
von …"), so nothing is lost; deleting a household moves its items to the next one.

## What changed against the export

- **Gone:** the sign-in and guest forms, the language and dark-mode buttons in the header (the
  portal switches language, the kit follows the theme), the local notification tray (the portal
  bell and push replace it), the "simulated total system load" figure, the "Verifiziertes
  Dokument" label and every invented default (store "Best Buy #442", "Visa ending in 4492",
  warranty provider "Samsung Platinum Care", receipt scan prefilled with "MediaMarkt, 249.00").
- **Rebuilt:** backups really restore (the export only loaded them into memory); the
  household roles `admin/editor/viewer` are gone because nothing enforced them (access is
  decided by the platform); "scan receipt" opens the editor at the receipt upload, since there
  is no text recognition; the insured sum starts empty instead of 50,000 €; amounts are always
  euros (the export showed dollars in English).
- **Fixed:** service keywords such as `ac` and `pc` matched inside other words ("Mac", "Backofen");
  adding months to a date no longer overflows (31 January plus one month is 28 February).
- **New:** German and English language packages, the App Kit look (rose accent, light and dark),
  sheets with focus trap and `Escape`, 44 px targets, destructive actions ask for a second tap.

## Speed on phones

- Photos are scaled before they are stored (1280 px for the detail view, 480 px for tiles and
  lists; receipts up to 2400 px). A phone photo of 4 MB becomes about 150 KB, so scrolling does not
  decode huge pictures. Older items without a thumbnail fall back to their photo.
- A picture asks for its signed address only when it comes near the screen, not all at once.
- Tiles and rows are drawn again only when their own item changes; the search follows the text a
  moment later (`useDeferredValue`); off-screen tiles are not laid out (`content-visibility`).
- Coming back to the tab reloads only after a minute away, and a reload that finds the same data
  keeps the state, so a short app switch does not redraw the list.
- The editor and the household page load when first opened, the Excel library when exporting.

## Develop

```bash
pnpm --filter @mininode-hosted/haushalts-inventar test
scripts/with-local-supabase.sh pnpm mininode dev hosted/haushalts-inventar
```
