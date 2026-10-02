---
id: app-icon
title: App-Logo
summary: Ein quadratisches SVG-Logo, das beim Deploy automatisch als Kachel-Symbol erscheint
group: qualitaet
order: 95
---

## Feature: app logo

Create the logo of the app as a file `icon.svg` next to `mininode.json` (apps with a build step:
`public/icon.svg`). The deploy puts it on the app's tile on the start page, in Verwaltung and in the
Remote-Apps list; nothing else is needed. A logo that an admin uploaded by hand is never replaced.

Requirements for the SVG:

- **One file, square:** `viewBox="0 0 512 512"`, `xmlns="http://www.w3.org/2000/svg"`, no `width` or
  `height` attributes, a `<title>` with the app's name as the first child, at most 12 KB. No script, no `<foreignObject>`, no external images or fonts,
  no `<image>` with a link; paths and basic shapes only.
- **Background:** one filled rounded square (`rx="112"`) in the app's accent colour from the
  design system (the `--mn-accent` value of `data-accent`), so the logo looks right on a light and
  on a dark start page. No gradients, no shadows, no outer margin.
- **Symbol:** one simple white glyph, centred, filling roughly 55 % of the square, that stands for
  what the app does (a calendar grid for a calendar, a coin for a budget, a dumbbell for sport). Draw
  it with 2–6 shapes, solid or with a stroke of 28–36 units and round line caps. No text, or at most
  one or two letters set as paths, never as `<text>` (fonts are not available).
- **Reads at 32 px:** if the glyph loses its meaning at that size, simplify it.
- **Contrast:** the white glyph on the accent colour meets 4.5:1; pick a darker shade of the accent
  where it does not.

Alternatives, if an SVG is not possible: `icon.png` or `icon.webp`, square, 256 × 256 px,
at most 256 KB.

Also tell the person that Verwaltung → Apps → "Logo hochladen" replaces the logo at any time.
