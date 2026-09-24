# @mininode/ui

Design tokens (`tokens.css`) and self-hosted fonts (`fonts.css`) shared by the portal and platform
pages. Import both once at the app root:

```ts
import '@mininode/ui/fonts.css';
import '@mininode/ui/tokens.css';
```

Theme: light by default, dark via `prefers-color-scheme`, overridable with
`<html data-theme="light|dark">`.
