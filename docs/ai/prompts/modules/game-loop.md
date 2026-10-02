---
id: game-loop
title: Spielschleife und Steuerung
summary: Echtzeit-Spiele mit Canvas, fester Takt, Pause, Tastatur, Touch und Gamepad
order: 102
group: spiele
---

## Feature: real-time game loop

- One `requestAnimationFrame` loop with a fixed update step (e.g. 1/60 s) and an accumulator;
  render with interpolation. Cap the frame delta at 250 ms, so a stalled tab does not jump.
- Pause automatically on `visibilitychange` (hidden) and on blur; show a pause overlay with
  "Weiter". `Escape` or `P` pauses; the pause menu is a real dialog.
- Canvas: size it to its container with a `ResizeObserver`, scale by `devicePixelRatio`
  (max 2) and keep the game's own coordinate system independent of the pixel size. Colours come
  from `getComputedStyle(document.documentElement)` (`--mn-*` tokens), read again when the theme
  changes.
- Input:
  - keyboard: arrow keys and WASD, Space or Enter for the main action; `keydown`/`keyup` state
    map, never act on key repeat for single actions;
  - touch: on-screen buttons of at least 44 px (hold to move) or swipe with a 24 px threshold;
    `touch-action: none` on the canvas only;
  - gamepad: poll `navigator.getGamepads()` in the loop when a pad is connected (standard
    mapping: stick/dpad, button 0 = action, 9 = pause).
- Show the controls on a start screen; start on an explicit "Spielen" so audio may start.
- Accessibility: describe the goal and the controls in text; offer a slower speed setting;
  honour `prefers-reduced-motion` (no screen shake, no flashing; nothing flashes more than
  3 times per second).
- Performance: no allocations in the hot loop (reuse objects and arrays); draw static layers
  once to an offscreen canvas.
