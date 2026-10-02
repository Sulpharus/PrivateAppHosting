---
id: game-touch
title: Touch, Wischen und Tastatur im Spiel
summary: Eingaben für Handy und Desktop gleichwertig bauen
group: spiele
order: 107
---

## Feature: touch, swipe and keyboard controls

- Use pointer events for everything (`pointerdown/move/up/cancel`), not separate mouse and touch
  code. Set `touch-action: none` on the play area (or `manipulation` on buttons) so the page does
  not scroll or zoom while playing.
- Swipes: ignore moves under 24 px; decide the direction by the larger axis; one swipe is one move.
- Long press (about 450 ms) is the touch version of a right click: set a timer on `pointerdown`,
  cancel it on `pointerup`, `pointerleave` and `pointercancel`, and suppress the click that follows.
  Handle `contextmenu` too, but do not repeat the action when a long press already did it.
- Every action also works with the keyboard: arrows or WASD to move, Enter/Space to act, one key
  for each tool, Escape to let go. Use a roving `tabindex` on boards with many cells.
- Offer on-screen buttons for moves as an alternative to gestures.
- Cells and buttons are at least 44 px on touch screens (`@media (pointer: coarse)`); a wide board
  scrolls sideways inside its own container.
- Never rely on hover. Never use colour alone for a game state; add a symbol or text.
