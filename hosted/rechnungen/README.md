# Rechnungen

Invoicing for freelancers and small businesses in Germany and Austria. Private per user
(`data.mode: private`): nobody else on MiniNode sees another person's customers, invoices or
payments (RLS through `platform.secure_table`). Static HTML with ES modules, no build step, no
third-party libraries.

The look is the MiniNode App Kit with the blue accent. `style.css` only adds what the kit lacks
(multi-select, Markdown field, chart, year heat grid, print).

## What it does

- **Übersicht:** open, overdue and received amounts, invoices due in the next 7 days (with
  "Bezahlt" in one tap), recently edited invoices.
- **Rechnungen:** list with search, status chips, sort and year filter (kept in the URL and in kv
  `settings.views`), multi-select on desktop (Shift for ranges: mark paid, CSV, delete drafts), and
  a calendar of due and issue dates.
- **Invoice editor** in four steps (customer, items, details, check). Items come from
  *Bausteine* (services and products) or are typed in. Tax treatments: standard VAT, small
  business (§ 19 UStG / § 6 Abs. 1 Z 27 UStG), reverse charge, intra-community supply, export.
  The rates follow the seller's country (DE 19/7 %, AT 20/13/10 %). `js/rules.js` checks the
  required details of § 14 UStG (DE) and § 11 UStG (AT) before an invoice can be issued
  (small-amount invoices: 250 € DE, 400 € AT; customer UID above 10,000 € in AT).
- **Issuing** assigns the next number from the format in the company profile
  (`RE-{YYYY}-{NNNN}` by default; the counter restarts per year), freezes a snapshot of seller and
  customer on the row and stores the PDF in `mn.files` under `rechnungen/<year>/`. Issued invoices
  are never edited or deleted; *Stornieren* creates a cancellation invoice with its own number.
- **PDF** (`js/invoice-pdf.js` on the small PDF writer `js/pdf.js` from the Wunschliste app): three
  layouts, *DIN 5008* (form B, address window, fold and punch marks), *Modern* and *Kompakt*, in
  German or English, with an EPC/GiroCode payment QR code (`js/qr.js`, our own encoder, checked
  against a decoder in the tests). Everything is laid out for one A4 page; long invoices continue
  on further pages with the table header repeated, never with smaller type.
- **Payments:** partial payments, overdue status, and reminders: one bell message per overdue
  invoice when the app opens (`reminded_on`), and a scheduled push the morning after the due date
  (`mn.push.schedule`, key `due:<id>`, neutral text without amounts or names).
- **E-mail:** send the invoice (and its attachments) or a payment reminder through the user's
  Gmail (`google.gmail: write`, `messages/send`), always through a confirmation sheet.
- **Kunden** with address, VAT ID, payment terms, Markdown notes with checklists, revenue, open
  amount and all their invoices. **Bausteine** with net price, unit and VAT rate.
- **Statistik** per business year (start month in settings): estimated net invoiced vs. actual
  gross received, monthly chart with table, top customers, totals by VAT rate, year heat grid.
- **Jahresexport:** ZIP with every invoice PDF plus CSV sales ledger, payments received and totals
  per VAT rate; separate CSVs; a printable annual report (`?view=print`).
- **Einstellungen:** company profile (with logo, bank, number format, default texts), reminders,
  business year, hide amounts, JSON backup and import, CSV import of customers and building blocks
  with column mapping, bin (30 days), sample data, delete everything.

## Data

`db/001_init.sql`: `customers`, `items`, `invoices` (lines as `jsonb`, seller and customer
snapshots, totals in cents), `payments` and `history` (last 20 events per invoice). Children
reference their parent together with `owner_id`. kv: `company`, `settings`, `draft:invoice`,
`seen:<hint>`. Files: `rechnungen/…` (issued PDFs), `anhaenge/<invoice>/…`, `logo/…`.

## Try it

`pnpm --filter @mininode-hosted/rechnungen test` runs the unit tests (money, rules, numbering, QR,
PDF, CSV, ZIP, mail, Markdown). `pnpm mininode dev hosted/rechnungen` serves it behind the local
gate; "Mit Beispieldaten ausprobieren" fills it with marked sample data.

Not included: e-invoice formats (XRechnung/ZUGFeRD), which German B2B invoices need from 2027/2028.
