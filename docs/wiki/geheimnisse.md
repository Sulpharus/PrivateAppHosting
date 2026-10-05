---
title: Geheimnisse und Schlüsselwechsel
category: betrieb
order: 30
summary: Welche Geheimnisse es gibt, wo sie liegen und was passiert, wenn man sie verliert
---

Geheimnisse (Schlüssel, Token, Passwörter) stehen **nie im Repository** (eine Prüfung mit gitleaks läuft bei jedem Pull Request). Sie liegen in der **GitHub-Umgebung**
(`production`/`staging`), werden beim Deploy als **Worker-Geheimnisse** hochgeladen und sind sonst in deinem Passwortmanager. Die Tabelle aller Geheimnisse mit Fundort und
Wechselweg ist das Runbook `key-rotation.md` (einmal im Jahr wechseln, sofort bei Verdacht).

## Nicht verlieren

| Geheimnis | Warum |
| --- | --- |
| `BACKUP_PASSPHRASE` | ohne sie ist keine Sicherung lesbar ([Sicherung](wiki:sicherung)) |
| `VAULT_KEY` | verschlüsselt die API-Schlüssel; verloren heißt: jeden Schlüssel neu eintragen ([API-Schlüssel](wiki:api-schluessel)) |
| `GOOGLE_TOKEN_KEY` | verschlüsselt die gespeicherten Google-Verbindungen ([Google](wiki:google)) |
| `SUPABASE_SECRET_KEY`, `SUPABASE_DB_URL` (mit Passwort) | Zugang zu Datenbank und Speicher |
| `VAPID_*` | Wechsel heißt: jedes Gerät schaltet Push neu ein ([Push](wiki:push-offline)) |
| `RESTIC_PASSWORD`, SOPS-age-Schlüssel | Backups der NucBox und ihre Geheimnisse |

## Die wichtigsten Familien

- **Cloudflare:** `CLOUDFLARE_API_TOKEN` (Deploys); Access-Token der NucBox.
- **Supabase:** Zugriffs-Token (`SUPABASE_ACCESS_TOKEN`), Secret Key, DB-URL, JWT-Signierschlüssel.
- **GitHub-Token:** `LIBRARY_DISPATCH_TOKEN` (Workflows starten), `INTEGRATE_TOKEN` (Pull Requests für Einbau und Löschen), `EXPORT_REPO_TOKEN`, `CATALOG_TOKEN` (NucBox).
- **KI:** `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `AI_GATEWAY_TOKEN`.
- **NucBox:** `NUCBOX_CONTROL_TOKEN`, `GUACAMOLE_JSON_SECRET`, SSH-Deploy-Schlüssel, R2-Zugänge, Proxmox-Token, Windows-RDP-Passwort.

## Regeln

- Ein **GitHub-Geheimnis zu entfernen** löscht es nicht beim Worker: dafür `pnpm exec wrangler secret delete <NAME>` im Ordner des Workers.
- Nach dem Wechsel von **Worker-Geheimnissen** braucht es keinen neuen Deploy; GitHub-Geheimnisse gelten ab dem nächsten Lauf.
- Fake-Schlüssel in Tests werden **zur Laufzeit** zusammengesetzt (`['eyJ…', '…'].join('.')`), damit kein Fund in der Geheimnissuche entsteht.
- Ein echter Schlüssel im Chat oder Terminal gilt als verbrannt: widerrufen und neu erstellen.
