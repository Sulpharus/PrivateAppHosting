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
`js/sketch.js` (2D canvas), `js/view3d.js` (WebGL), `js/editor.js`, `js/print.js`, `js/store.js`
and `js/app.js` are the UI. Imported meshes above 20,000 triangles are not cut by holes (CSG would
freeze the page); they are shown and exported as they are.

## Try it

`pnpm mininode dev hosted/cad --port 8808`, sign in, then "Mit Beispieldaten ausprobieren".
Unit tests: `pnpm --filter @mininode-hosted/cad test`. End to end: `pnpm e2e e2e/cad.spec.ts`.
