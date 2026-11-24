---
id: finanzen
title: Finanzen
summary: Budget, Ausgaben, Verträge, Abos, Sparziele, Belege
when: Nimm das für alles mit Geld, etwa Haushaltsbuch, Budget, Verträge, Abos oder Sparziele. Beträge werden dann genau in Cent gerechnet.
accent: amber
audience: me
modules: tables, money, dates, stats, privacy
order: 30
---

## App type: finance

Money in and out, budgets, contracts and savings goals. Correctness beats cleverness.

- **Money:** store integer cents (`amount_cents integer not null`), never floats (module *Geld
  und Beträge*). Show amounts with `Intl.NumberFormat(mnI18n.locale, { style: 'currency',
  currency: 'EUR' })`, tabular figures (`mn-num`), income with `+`, expenses with `−`. Parse
  input that accepts `12,50`, `12.50` and `1.234,50`.
- **Views:** *Übersicht* (month stepper in the header tools, KPIs income/expenses/surplus,
  bars per category, a year chart), *Buchungen* (grouped by day, search and category filter),
  *Budget* (per category, meter turns `mn-bad` when exceeded), *Verträge* or *Abos* (next due
  date, yearly cost), *Einstellungen* (categories, rules, backup).
- **Data:** tables `bookings` (`id`, `booked_on date not null`, `amount_cents integer not null`,
  `category_id … references categories`, `note`, `contract_id`), `categories`, `contracts`
  (`amount_cents`, `every text`, `starts_on`, `ends_on`) and `budgets`; index `booked_on`. A
  month loads with `mn.db.from('bookings').select('*').gte('booked_on', '2026-09-01').lt('booked_on',
  '2026-10-01')` online, or `mn.table('bookings').list()` filtered in memory offline. Standing
  orders get a deterministic id per contract and month, so two devices never book twice.
- **Colour:** income `--mn-ok`, overspending `--mn-bad`, everything else neutral; the accent
  marks actions and the current month, not money.
- **Receipts** go to `mn.files` under `belege/<year>/`; the booking keeps the path.
- Never give financial or tax advice; label estimates as such.
