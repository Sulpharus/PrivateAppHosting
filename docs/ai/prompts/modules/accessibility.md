---
id: accessibility
title: Barrierefreiheit
summary: Screenreader, Tastatur, Kontrast, Bewegung und Beschriftungen prüfen
group: qualitaet
order: 92
---

## Feature: accessibility pass

The App Kit already gives focus styles and dialogs. Check what only the app can get right:

- **Names:** every button, link and field has a visible or `aria-label` text that says what it
  does ("Eintrag Rezepte löschen", not "Löschen" in twelve rows). Icon-only buttons need a label.
- **Structure:** one `h1` per view, headings in order, landmarks (`header`, `nav`, `main`). Lists
  are `ul/ol`, tables are `table` with `th scope`, not div grids, unless the widget is a real grid.
- **Keyboard:** everything works with Tab, Enter, Space and Escape; the focus order follows the
  visual order; custom widgets use roving `tabindex` with arrow keys; focus is never lost when a
  list item disappears (move it to the next item or the list heading).
- **Not by colour alone:** state (error, done, selected, overdue) also has text, an icon shape
  or a pattern. Contrast is at least 4.5:1 for text and 3:1 for controls, in light and dark.
- **Live changes:** toasts and results are announced with `aria-live="polite"`; errors next to
  fields use `role="alert"` and `aria-describedby`.
- **Motion:** honour `prefers-reduced-motion` (no movement, instant state changes) and never
  flash.
- **Touch:** targets at least 44×44 px with space between them; no gesture is the only way to
  do something.
- **Zoom:** the layout works at 200 % text size and at 360 px width without horizontal scroll.
