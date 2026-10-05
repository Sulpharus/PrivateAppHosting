# Integration von upload.zip

**Braucht eine Prüfung:** das Skript hat die App nicht fertig integriert.

Projektform: `mininode`

## Warum das Skript gestoppt hat

- `doctor_export-scan` (src/App.tsx:3147): contains email address max@beispiel.de; remove it or use an @example.com address, otherwise the app cannot be exported
- `doctor_export-scan` (src/translations.ts:244): contains email address max@beispiel.de; remove it or use an @example.com address, otherwise the app cannot be exported
- `doctor_sdk-required`: data mode "group" needs @mininode/sdk (import it or load /_mininode/sdk.js)

## Nächster Schritt

Ein Claude-Code-Lauf öffnet das ZIP mit dem Skill `integrate-app` und bearbeitet genau diese Punkte (`docs/ai/playbooks/`).
