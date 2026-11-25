# CAD

Construction plans and 3D models for 3D printing and CNC machining, with an AI assistant that
works on the same project. Static HTML with ES modules, no build step and no libraries; the look is
the MiniNode App Kit with the amber accent. Built on MiniNode (not ported from an export).

## What it does

- **Projekte:** a list with a drawing thumbnail, search, filters (category, purpose), multi-select
  (checkboxes, Shift ranges, a sticky bar to move or delete), a context menu (right-click or "…")
  and keyboard shortcuts (`n`, `/`, `j`/`k`, `x`, `e`, `Delete`, `?`).
- **Editor, Zeichnung (2D):** line, polyline, rectangle, circle, arc (three points), dimension
  (horizontal, vertical, aligned) and text. Grid and point snapping (end, middle, centre, quadrant),
  Shift for horizontal/vertical, pan and zoom with mouse, touch or space-drag. Exact input in the
  coordinate field (`x,y`, `@dx,dy`, `length<angle`, a bare length along the cursor; a semicolon
  allows a decimal comma: `12,5;4`) and in the properties panel (every value, shown in mm or inches).
  Line styles (solid, centre, hidden, construction), move/rotate/mirror/array with exact values,
  duplicate, undo/redo (100 steps).
- **Editor, 3D-Modell:** box, cylinder, sphere, cone and extrusions of closed sketch shapes, each as
  material or as a hole (subtracted with CSG, `js/solid.js`). WebGL view with orbit, pan, zoom,
  presets and picking. Model facts: size, volume, weight from the density, a build-volume check,
  open edges of imported meshes and overhangs over 45°.
- **Gewinde:** true ISO 68-1 metric threads (60° flanks, crest P/8, root P/4, minor d − 1.0825·P)
  modelled as a helix, not a texture: external (bolt) or internal (subtracted, a tapped hole),
  ISO coarse pitches M2–M36 or any custom size and pitch, left-hand, a print clearance (bolts get
  thinner, holes wider; pitch 0.2 mm up to a quarter of the diameter, at most 400,000 triangles),
  run-out over half a turn at both ends. As many segments per turn as keep the chord error under
  0.002 mm, so slicers and CAM get the real flanks. The thread mesh is closed with every vertex
  shared exactly (each edge used twice, checked for 40 size, length, hand and clearance
  combinations in `test/solid.test.js`); after CSG (a thread cut into a block) the STL can contain
  T-junctions, which slicers weld as usual.
- **Darstellung Schnell / Realistisch:** "Schnell" is smooth shading in the material colour.
  "Realistisch" (`js/view3d.js`, WebGL 1) is physically based lighting (GGX), soft shadows from a
  2048² shadow map (16 samples), reflections of a studio environment on metal and gloss, a
  mirroring floor, tone mapping, and procedural surfaces: layer lines at the layer height for
  printed plastics, brushed or milled metal, grain, wood. 14 materials (PLA, PETG, ABS, TPU, resin,
  aluminium milled/anodised, steel, stainless, brass, copper, wood, acrylic) with a free colour per
  solid; hole walls take the material of the part they cut. Materials only change the look, never
  STL or G-code.
- **Zeichnung aus 3D:** front, top, left/right and isometric views with hidden edges dashed
  (software depth buffer), first- or third-angle placement, overall dimensions and centre lines of
  holes along Z (`js/projection.js`). Generated lines are tagged and replaced when made again.
- **Import:** STL (binary/ASCII) and OBJ as meshes, DXF R12 (lines, circles, arcs, polylines, text)
  into the drawing, G-code (G0–G3, G20/G21, G90/G91) as a toolpath that can be copied into the drawing.
- **Export:** STL (binary, mm) and OBJ of the combined model; DXF and SVG of the drawing; G-code for
  contours (outside/inside/on the line, step-downs, circles up to the cutter size drilled); PDF through
  the print view.
- **Drucken:** `?drucken=<id>`: the sheet at its real size (A4–A2, portrait/landscape, standard scales,
  "Einpassen"), frame and title block, `@page` margin 16 mm.
- **KI-Assistent:** the person describes a change; `mn.ai.json` returns a reply and a list of
  operations (the same ones the editor uses, `js/model.js`), validated, previewed in green and applied
  only on "Übernehmen" (one undo step). It sees the project as compact JSON with ids, the selection,
  printer and CNC settings. Model: "Genau" = `claude-sonnet` (default, because exact numbers matter),
  "Schnell" = `gemini-flash`; budget 5 € a month.
- **First start:** an empty state with "Erstes Projekt anlegen" and "Mit Beispieldaten ausprobieren"
  (a bracket for 3D printing with generated views and a cover plate for the CNC router, chip
  "Beispiel", removable in one step), three one-time tips in the editor, "?" help sheets.
- **Undo and history:** single deletes undo from the toast; projects go to the Papierkorb for 30 days
  (purged on start); a version snapshot when the editor is left and every ten minutes, last 20 kept,
  restorable from "Verlauf".
- **Settings:** units, grid, projection method, paper, printer build volume and density, CNC
  defaults, AI model, categories (rename, colour, order, archive), backup export/import, Papierkorb,
  delete all (type "löschen"), account link and sign-out, reset tips.

## Performance (without losing quality)

- The CSG, smooth normals and model facts are built in a Web Worker (`js/worker.js`, `js/scene.js`),
  so the page never freezes; results are cached by geometry (undo, redo, materials are instant), and
  material changes only recolour.
- CSG works on islands: a union or a hole only touches the parts it overlaps (a separate bolt never
  goes through the BSP with a block), which gives the same mesh in a fraction of the time.
- The 3D view draws only on change (no render loop); the shadow map is made only when the geometry
  changes. While the view is dragged in "Realistisch", shadows take one sample and the floor mirror
  pauses; 150 ms after the last movement the full-quality picture is drawn. Exports always use the
  full model.
- Procedural detail finer than about two pixels fades into the roughness it causes instead of
  shimmering, so a part looks the same from afar as it would in reality.
- The 2D canvas draws only what is on screen (bounds cached per entity); placed meshes for picking are
  cached and tested against their bounding box first.
- WebGL contexts and buffers are released when the editor is left.

## Data

`db/001_init.sql`, all private per person:

- `projects`: name, notes, category, purpose (`print`/`cnc`/`drawing`), units, `model` (jsonb: the
  drawing entities, the solids and the sheet; read and written as a whole by the editor), `sample`,
  `deleted_at` (soft delete).
- `categories`: name, colour (`data-cat` names), position, archived, sample.
- `history`: `item_id → projects on delete cascade`, `at`, `by`, `changes` (summary and model snapshot).

`mn.kv`: `settings`, `version`, `seen:<hint>` (three tip flags). `mn.files`:
`projects/<project id>/<solid id>.stl|.nc` for imported meshes (stored as binary STL) and G-code;
removed when the project is purged. Imports need a connection; drawing and editing work offline.

## Code

`js/geom.js` (2D geometry, snapping, typed coordinates), `js/solid.js` (primitives, CSG, volume),
`js/projection.js` (views and hidden lines), `js/io.js` (STL, OBJ, DXF, SVG, G-code), `js/model.js`
(model and operations), `js/ai.js` (prompt, schema, validation) are pure and tested in `test/`.
`js/materials.js` (materials), `js/scene.js` (scene for the view), `js/sketch.js` (2D canvas), `js/view3d.js` (WebGL), `js/worker.js`, `js/editor.js`, `js/print.js`, `js/store.js`
and `js/app.js` are the UI. Imported meshes above 20,000 triangles are not cut by holes (CSG would
freeze the page); they are shown and exported as they are.

## Try it

`pnpm mininode dev hosted/cad --port 8808`, sign in, then "Mit Beispieldaten ausprobieren".
Unit tests: `pnpm --filter @mininode-hosted/cad test`. End to end: `pnpm e2e e2e/cad.spec.ts`.
