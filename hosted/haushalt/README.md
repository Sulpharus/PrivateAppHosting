# Haushalt

Household budget book with automatic transfer into the German income tax return. Private per
user (`data.mode: private`). Static HTML with ES modules, no build.

The look is the MiniNode App Kit (`/_mininode/ui.css`, `docs/ai/DESIGN-SYSTEM.md`) with the
amber accent: side navigation from 960 px, bottom tabs on phones, month and year steppers in
the header, dialogs through `mnui.sheet`. `style.css` only adds what the kit lacks (year chart,
tax form tables, budget inputs, print).

## What it does

- **Buchungen:** expenses, income and transfers (savings, not counted as spending), with
  category, payee, an optional receipt (image or PDF in `mn.files`, `belege/<year>/…`) and an
  optional tax override per booking.
- **Kontoauszug importieren:** as PDF (the statement from the online bank; pdf.js in
  `vendor/pdfjs` reads it in the browser, `statement.js` finds the bookings: dates without a
  year, continuation lines, trailing signs, S/H marks, Soll/Haben columns) or as CSV (semicolon,
  `1.234,56`, `24.09.2026`, account info above the header, UTF-8 or Windows-1252). Columns are
  detected and can be corrected. Rules ("contains REWE|EDEKA → Lebensmittel") assign
  categories. Re-importing the same file skips what is already there: every imported booking has
  a key derived from its content. Scanned PDFs have no text; use the CSV export then.
- **Planung → Fixkosten:** rent, subscriptions, insurance, savings, donations, loans and regular
  income, grouped, with the monthly equivalent of quarterly or yearly amounts. Each has a first
  and a last payment (cancelled or limited), price changes that apply from a month on, and words
  that recognise its payments in a bank import. A recognised payment replaces the automatic
  booking of that month; a different amount is flagged (Übersicht and Planung) and can be
  adopted as the new price. Due payments are booked when the app opens, back to the first month
  if needed; ids are deterministic, so two devices never book twice.
- **Planung → Budgets:** monthly budget per category with spent, remaining and overspending.
- **Dein Monat (Übersicht):** income (booked, or at least the regular income) minus fixed costs
  and savings is what is free this month; a bar shows what is spent against where it should be
  by today, and what is still free per day. Without income it uses the budgets.
- **Kalender:** the payments of fixed costs from last month to twelve months ahead are shared
  `contract` records (due date, amount, kind, interval; source key `<fixed cost>#<month>`),
  so they appear in the Kalender. Ended or deleted fixed costs leave it from this month on. Needs
  the admin's approval of `suite.uses`.
- **Statistik:** per year: average income and spending, fixed-cost and savings rate, income next
  to fixed and other spending per month (with a table), categories against the year before,
  fixed costs by kind, largest payees. Colours are the kit's `--mn-chart-*` series.
- **Übersicht:** income, expenses, surplus, savings rate, spending by category, year chart.
- **Steuer:** every booking whose category (or override) has a tax field lands in a filled
  form view, one card per form: Anlage N (Werbungskosten, plus Entfernungspauschale and
  Homeoffice-Pauschale from the yearly details), Sonderausgaben, Vorsorgeaufwand, Anlage Kind,
  Haushaltsnahe Aufwendungen (§ 35a, with the 20 % reduction) and Außergewöhnliche Belastungen
  (with the zumutbare Belastung once the income is entered). Each amount has a copy button in
  the format ELSTER expects; the forms print as PDF and export as CSV with every booking.
  The app files nothing and is not tax advice.

Tax parameters per year live in `tax.js` (Arbeitnehmer-Pauschbetrag, Homeoffice 6 €/day up to
210 days, distance allowance 30/38 ct and 38 ct from the first kilometre from 2026,
Kinderbetreuung 80 % up to 4,800 € from 2025, § 35a caps). Check them each year before filing.
The 4,500 € cap on the distance allowance is skipped for commuting by one's own car (checkbox
in the yearly details).

## Tests

`pnpm --filter @mininode-hosted/haushalt test` runs the unit tests of the pure modules
(`test/`, not deployed); `e2e/haushalt.spec.ts` covers the app end to end.

## Data

`mn.kv`, private: `settings` (categories, budgets, rules), `tx:<date>:<id>` per booking,
`rec:<id>` per fixed cost, `profile:<year>` for the tax details. *Einstellungen → Daten*
exports and imports a JSON backup (receipts are not included) and a CSV per year.

## Check

Import a bank CSV, assign a craftsman's invoice to *Handwerker* with the labour part as the
deductible amount, then open *Steuer*: it appears under Haushaltsnahe Aufwendungen with the
reduction.
