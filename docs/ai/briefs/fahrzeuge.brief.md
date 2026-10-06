---
name: Fahrzeuge
type: tracker
audience: me
accent: amber
builder: ai-studio
modules: tables, offline, files, ai, ai-vision, scanning, notifications, push, dates, money, suite, stats, search, undo, import-export, print, errors, onboarding
ai: true
---
A vehicle and maintenance log. The special part: you type in the model of your car and the app uses
AI with web search to find exactly what is needed to tell you **when to maintain what** and **which
parts you need for which job**. German and English, mobile first, light and dark.

## Vehicles

- Several vehicles (car, motorbike, van, bicycle/e-bike as a simpler kind): nickname, make, model,
  generation/code (e.g. "Golf VIII"), model year, **engine/variant** (e.g. "2.0 TDI 110 kW, DSG"),
  fuel/drive (petrol, diesel, hybrid, electric), gearbox, **HSN/TSN** (German key numbers, optional),
  VIN (optional, last 8 characters are enough), first registration date, purchase date and price,
  current odometer, number plate (optional, only shown to the owner), photo, colour accent.
- Odometer: manual entries with date (module "Eigene Tabellen": `odometer_readings`); every
  service/fuel entry with an odometer value adds one. Average km per month is computed from the
  last 12 months of readings and drives all predictions. Never accept a reading lower than the last
  one without a confirm ("Tacho zurückgesetzt/getauscht?").

## The AI research (the core feature)

Flow "Wartungsplan erstellen" for a vehicle, a stepper with a clear cost hint ("Nutzt die KI-Suche,
ca. 5 bis 15 Cent"):
1. **Identify the exact variant.** Search with `mn.ai.search` using make, model, year and engine (or
   HSN/TSN); show the variant the AI found, its sources, and ask the person to confirm or correct it
   ("Ist das dein Auto?"). Offer an optional photo of the registration papers (`mn.ai` with vision):
   read only HSN (field 2.1), TSN (2.2), first registration and engine power from the image, tell the
   person to cover name and address before taking the photo, and never store the image.
2. **Research the service plan.** Search for the manufacturer's service schedule and common
   additions for that variant: engine oil and filter (spec/viscosity and amount), air/cabin/fuel
   filters, spark plugs, brake fluid, coolant, gearbox/DSG oil, timing belt or chain, brake pads and
   discs (typical wear), tyres rotation/age, battery, belts, HU/AU (TÜV) interval, plus known
   weak points of that engine/gearbox. Then call `mn.ai.json` with the found text to turn it into
   rows (search and JSON schema do not work in one call). Each item: `name`, `category`,
   `interval_km` (nullable), `interval_months` (nullable), `first_due_km`, `notes`, `source_urls`,
   `confidence` ("herstellerplan", "mehrfach bestätigt", "forum/erfahrung", "geschätzt").
3. **Parts per job.** For each item search the parts needed: OEM part numbers, trustworthy aftermarket
   alternatives (brand and number), quantity, fluid specification/approval (e.g. VW 507 00),
   capacity, tools, torque values only when a source states them, difficulty (1 to 5) and typical
   time for a home mechanic vs a workshop. Store as `parts` rows linked to the item.
4. **Review before saving.** Show every item as a card with its sources as links and a confidence
   chip; the person ticks what to adopt, edits intervals and parts, and may delete items. Mark
   everything "KI-Vorschlag mit Quellen" until accepted. Show an unobtrusive but clear note: "Prüfe
   Angaben im Handbuch deiner Fahrzeugs; bei Bremsen, Airbag und Lenkung lieber eine Werkstatt." Never
   present a number without its source link.
5. **Cache.** Store the research (`research_runs`: vehicle, query, text, sources, model, fetched_at)
   so the same question is not asked twice; "Neu recherchieren" is an explicit button.

A second tool, **"Reparatur-Assistent"**: the person describes a job or a symptom ("Bremsen vorne
quietschen", "Zahnriemen wechseln", "Motorkontrollleuchte, Fehlercode P0299"). The app searches for
likely causes (clearly worded as hints), the **parts and tools needed** with numbers and sources, the
steps in short, difficulty, time and a rough price range, and offers "Zur Teileliste" and "Als
Wartungspunkt anlegen". Marked as KI-Hinweis, always with a safety line for brakes, airbags, high
voltage (hybrid/EV: only a qualified workshop).

## Maintenance tracking

- **Items** (from the AI, a built-in list of defaults, or typed in) with intervals in km and/or
  months; **status** per item: ok, bald fällig (within 1000 km or 30 days, configurable), überfällig;
  the **next due** date is computed from the last service of that item and your average km per month
  ("voraussichtlich Mai 2027 oder bei 84.000 km"), shown on the vehicle page as a sorted list and a
  traffic-light summary.
- **Service log** entries: date, odometer, items done (several at once), workshop or "selbst",
  total cost with a split (parts / labour / other), invoice photo or PDF (`mn.files`, up to 20 MB,
  thumbnail), notes, parts used (from the parts list, with price paid). Marking an item done
  creates a log entry in two taps ("Heute erledigt, bei aktuellem Tachostand").
- **Fuel/charging log** (optional per vehicle): date, litres/kWh, price, full tank flag, odometer;
  consumption per fill-up and average.
- **Costs and statistics** (module "Statistiken"): cost per year, per category, per km, fuel
  consumption trend, a simple "Kosten pro 100 km" figure; charts as hand-drawn SVG with text
  alternatives, no chart library.
- **Documents** per vehicle: registration, insurance policy, TÜV report, manuals (files up to 20 MB;
  list with type, expiry date).
- **Fixed dates:** HU/TÜV, insurance renewal and notice deadline, road tax, tyre change (summer/winter
  seasons), each with a reminder (push + bell) 30 and 7 days before (module "Push-Benachrichtigungen"),
  and published as suite `event` records so they appear in the Kalender (stable `sourceKey`; declare
  `suite.uses` with a clear `why`). Insurance and tax amounts may also be published as suite
  `contract` records for the Haushalt app (ask the person once).

## Parts list and shopping

A per-vehicle **Teileliste**: parts with number, brand, shop link (plain URL typed or pasted; no
scraping), price, quantity, "bestellt / vorhanden", and a "Einkaufsliste" view that sums what you
still need for the next due items. No affiliate links, no shop integration.

## Data and AI settings

- Tables (module "Eigene Tabellen", data mode `private`): `vehicles`, `odometer_readings`,
  `maintenance_items`, `parts`, `service_log`, `service_log_items`, `fuel_log`, `documents`,
  `research_runs`, `fixed_dates`. Real column types, checks (km ≥ 0, cents as integers), foreign keys
  with `on delete cascade`, indexes on `vehicle_id` and dates. Money as integer cents. Everything via
  `mn.table` (offline); `mn.db` for statistics.
- `mininode.json`: `"ai": { "models": ["gemini-flash", "claude-sonnet"], "monthlyBudgetEur": 3,
  "maxOutputTokens": 4000, "search": true }`; default `gemini-flash` for research and
  `claude-sonnet` as an optional "Genauer recherchieren" button. Handle `budget_exceeded` and
  `search_not_allowed` with clear texts and keep manual entry fully usable without AI.
- Settings: units (km/mi is not needed: km and litres only), warn thresholds, currency EUR, default
  reminder times.
- Import/export: JSON backup of everything (without files), CSV of the service log and fuel log.
- Onboarding: "Fahrzeug anlegen" → "Wartungsplan mit KI erstellen" (skippable, with a manual list of
  common items as the fallback); a sample vehicle can be created and deleted.
