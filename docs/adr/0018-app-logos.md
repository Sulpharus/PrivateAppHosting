# ADR 0018: App logos

- Status: accepted
- Date: 2026-10-02

## Context

Every tile showed a coloured monogram. The owner wants real logos, uploaded from Verwaltung, and a
prompt block so apps built with AI bring a matching logo themselves. The tile's favourite and drawer
buttons also overlapped the description text.

## Decision

- **Storage.** Public bucket `app-icons` (PNG, WebP, SVG, 256 KB at most); `platform.apps.icon_path`
  names the file. Only admins write to the bucket; `platform.admin_set_app_icon(slug, path)` sets or
  clears the path (recent sign-in required, audit-logged). Reading is public: logos are not secret.
- **Verwaltung → Apps.** "Logo hochladen / ändern / entfernen" per app. Pictures are cropped to a
  centred 256 px WebP in the browser; an SVG (128 KB at most) is stored as it is. An `<img>` never
  runs script in an SVG.
- **Deploy.** An `icon.svg`, `icon.webp` or `icon.png` next to `mininode.json` (build apps:
  `public/`) is uploaded on every deploy as `<slug>-app.<hash>.<ext>`. A logo an admin set by hand is
  never replaced; a failing upload does not undo the deploy.
- **Prompt block.** KI-Werkstatt module "App-Logo" (`docs/ai/prompts/modules/app-icon.md`) tells the
  AI how to draw the SVG (accent-coloured rounded square, one white glyph, no text, `<title>`).
  All hosted apps ship one.
- **Tile layout.** The start page tile is a box with the link on top and a row of buttons
  (drawers, favourite) below, so text never runs under them.

## Consequences

One column, one RPC, one bucket; the portal shows the logo in tiles, Remote-Apps, Verwaltung and the Gaming Hub.
