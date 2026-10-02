---
id: places
title: Orte und Karte
summary: Adressen, Orte, Links zu Karten, Entfernung
order: 40
group: anbindungen
---

## Feature: places and maps

- Store places as `{ name, address, lat?, lng? }`. Do not call geocoding or map APIs from the
  browser (no keys in the client, the CSP blocks third-party scripts).
- Open a place in maps with a plain link:
  `https://www.google.com/maps/search/?api=1&query=<encoded address>`.
- For a visual overview without a map provider, list places grouped by city, or draw a simple
  SVG of points from stored coordinates using the tokens for colours.
- Distances between stored coordinates use the haversine formula; show kilometres with one
  decimal.
- If the user wants real maps, say in the README that a map provider needs a proxy through the
  platform and leave it out of the first version.
