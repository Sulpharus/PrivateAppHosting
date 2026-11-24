---
id: places
title: Orte und Karten
summary: Adressen, Karte mit Pins, Wege und Entfernungen
when: Nimm das, wenn Adressen und Orte vorkommen, die auf einer Karte erscheinen oder für Wege und Entfernungen gebraucht werden.
order: 40
group: anbindungen
---

## Feature: places and maps

- Store a place as columns or a `jsonb` value `{ name, address, lat, lng }` on the row. The
  browser's own location (`navigator.geolocation`) is blocked by the platform: the person types
  or picks the place.
- **Find coordinates** (geocoding) through `mn.api`, never directly (the page may not call other
  hosts). Free OpenStreetMap Nominatim needs no key:
  `"apis": [{ "id": "nominatim", "name": "OpenStreetMap Nominatim", "baseUrl":
  "https://nominatim.openstreetmap.org", "auth": { "type": "none" }, "docs":
  "https://operations.osmfoundation.org/policies/nominatim/", "reason": "Orte auf der Karte
  finden" }]`, then `mn.api('nominatim').json('/search?format=jsonv2&limit=5&q=' +
  encodeURIComponent(text))`. At most one search per second and only after the person stops
  typing (500 ms, at least 3 characters); store the result on the row, never search again for the
  same place. For heavier use declare a keyed provider (e.g. `geoapify`) like the Kalender app.
- **Show a map** with OpenStreetMap tiles (`https://tile.openstreetmap.org/{z}/{x}/{y}.png`; images
  from https hosts are allowed). Bundle a small map library (Leaflet or MapLibre GL from npm) or
  draw the tiles yourself; never load a map script from a CDN. Show "© OpenStreetMap-Mitwirkende"
  linked to `https://www.openstreetmap.org/copyright`. Pins use `--mn-accent`; a list of the same
  places next to or below the map keeps it usable with keyboard and screen readers.
- **Routes and travel times** through `mn.api` with the free OSRM service of FOSSGIS
  (`id: "routing"`, `baseUrl: "https://routing.openstreetmap.de"`, `auth: { "type": "none" }`), or
  a link that opens directions elsewhere:
  `https://www.google.com/maps/dir/?api=1&destination=<encoded address>`.
- Distances between stored coordinates use the haversine formula; show kilometres with one
  decimal, formatted for the language.
- Handle `ExternalApiError` like any external API (module *Externe APIs*): keep what is shown and
  offer to type the address.
