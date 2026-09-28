# @mininode/ui

Design tokens (`tokens.css`) and self-hosted fonts (`fonts.css`) shared by the portal and platform
pages. Import both once at the app root:

```ts
import '@mininode/ui/fonts.css';
import '@mininode/ui/tokens.css';
```

Theme: light by default, dark via `prefers-color-scheme`, overridable with
`<html data-theme="light|dark">`.

## App kit (`kit/`)

The design system for hosted apps, extracted from the Sportplaner rework. Deploys copy it into
every app next to the SDK:

| File | Served as | Content |
|---|---|---|
| `kit/ui.css` | `/_mininode/ui.css` | `--mn-*` tokens (light, dark, six accents), fonts, all `mn-*` components |
| `kit/ui.js` | `/_mininode/ui.js` | `window.mnui`: dialogs with focus trap, toasts, theme switch, selection |
| fonts from `@fontsource-variable/*` | `/_mininode/fonts/*.woff2` | Bricolage Grotesque, Instrument Sans, JetBrains Mono |
| `kit/preview.html` | not served | every component in an example app; open it from a static server in `kit/` with the fonts copied to `kit/fonts/` |

The spec for AI tools and humans is [`docs/ai/DESIGN-SYSTEM.md`](../../docs/ai/DESIGN-SYSTEM.md).
The portal keeps its own palette (`tokens.css`); apps use the kit, so the two can evolve
separately. Changing `kit/` redeploys every app.
