---
id: game-sound
title: Sound und Vibration
summary: Kurze Soundeffekte, Musik und haptisches Feedback, jederzeit stumm schaltbar
order: 105
group: spiele
---

## Feature: sound and haptics

- Web Audio: one `AudioContext`, created on the first user gesture ("Spielen"). Generate short
  effects with oscillators and gain envelopes, or ship small `.mp3`/`.ogg` files from the app
  itself (no third-party hosts).
- A mute toggle in the top bar (icon button with `aria-pressed` and label "Ton") and separate
  volumes for effects and music in the settings; store them in `mn.kv` (`settings`). Browsers
  cannot see the phone's silent switch, so default to effects on and music off.
- Haptics: `navigator.vibrate?.(15)` for hits and matches, only when enabled in the settings;
  never for every frame.
- Every sound has a visual counterpart (a flash of the score, a text line), so the game works
  without sound and for deaf players.
- Stop all audio on `visibilitychange` (hidden) and on pause.
