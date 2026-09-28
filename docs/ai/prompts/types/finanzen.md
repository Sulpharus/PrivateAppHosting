---
id: finanzen
title: Finanzen
summary: Budget, Ausgaben, Verträge, Abos, Sparziele, Belege
accent: amber
order: 30
---

## App type: finance

Money in and out, budgets, contracts and savings goals. Correctness beats cleverness.

- **Money:** store integer cents (`cents: 1234`), never floats. Show amounts with
  `Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })`, tabular figures
  (`mn-num`), income with `+`, expenses with `−`. Parse input that accepts `12,50`, `12.50`
  and `1.234,50`.
- **Views:** *Übersicht* (month stepper in the header tools, KPIs income/expenses/surplus,
  bars per category, a year chart), *Buchungen* (grouped by day, search and category filter),
  *Budget* (per category, meter turns `mn-bad` when exceeded), *Verträge* or *Abos* (next due
  date, yearly cost), *Einstellungen* (categories, rules, backup).
- **Data:** one kv key per booking, ordered by date (`tx:<YYYY-MM-DD>:<id>`), so a month loads
  with `mn.kv.list('tx:2026-09')`. Standing orders get deterministic ids per month, so two
  devices never book twice.
- **Colour:** income `--mn-ok`, overspending `--mn-bad`, everything else neutral; the accent
  marks actions and the current month, not money.
- **Receipts** go to `mn.files` under `belege/<year>/`.
- Never give financial or tax advice; label estimates as such.
