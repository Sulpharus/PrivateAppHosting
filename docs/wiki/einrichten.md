---
title: Einrichten: drei Varianten
category: einstieg
order: 4
summary: Cloudflare, Desktop oder beides: welche Variante passt und welche Schritte sie braucht
---

MiniNode läuft auf drei Arten. Such dir eine aus, folge ihrer Anleitung von Anfang bis zur ersten Anmeldung und mach dann mit dem [Startup-Guide](/admin/guide) weiter. Die ausführlichen Anleitungen
liegen als Runbooks im Repository (`docs/runbooks/`, englisch); hier steht, worauf es ankommt (ADR 0026).

| Variante | Was läuft wo | Du brauchst | Runbook |
| --- | --- | --- | --- |
| **1. Nur Cloudflare** | Portal, API, KI-Proxy und jede App auf Cloudflare Workers, Daten bei Supabase | Cloudflare-Konto mit Domain, Supabase-Projekt, GitHub-Konto | `setup-cloudflare.md` |
| **2. Nur Desktop** | alles auf einem Computer in Docker, nichts in der Cloud | ein Computer mit Docker (Windows, macOS, Linux; Intel/AMD oder ARM) | `setup-desktop.md` |
| **3. Beides** | Variante 1, dazu ein Heimserver für Container, Jellyfin, n8n und Windows-Programme | Variante 1 und ein Linux-Rechner mit Docker | `setup-both.md` |

Die Varianten sind **getrennte Installationen**: die Desktop-Version ist kein Abbild einer Cloud-Installation, Konten und Daten werden nicht geteilt ([Desktop-Version](wiki:desktop-version)).

## Variante 1: Nur Cloudflare

1. **Code**: das Starter-ZIP entpacken, ein *privates* GitHub-Repository anlegen und den Ordner hochschieben.
2. **Supabase**: ein Projekt anlegen; Projekt-Referenz (20 Buchstaben), *Publishable Key* und *Secret Key* notieren; die JWT-Schlüssel auf asymmetrisch (ES256) umstellen; einen Zugriffs-Token anlegen.
3. **Cloudflare**: Konto-ID notieren; API-Token „Edit Cloudflare Workers“ mit Workers *Admin* und Zone *DNS Edit* für deine Zone anlegen. Die Domain muss bei Cloudflare aktiv sein (beliebig: Apex oder Unterdomain).
4. **Instanz einrichten**: `pnpm install`, dann `pnpm mininode init`. Das fragt Domain, Konto-ID, Supabase-Referenz, Publishable Key und Repository und schreibt `mininode.config.json` (nur öffentliche Kennungen)
   und die Worker-Konfiguration. Committen und pushen.
5. **GitHub-Geheimnisse** in der Umgebung `production`: `CLOUDFLARE_API_TOKEN`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_SECRET_KEY`, `VAULT_KEY` und was du nutzen willst ([Geheimnisse](wiki:geheimnisse)).
6. **Deploy** starten (Actions → Deploy). Er legt Datenbank, Anmelde-Einstellungen, Worker und Domains an.
7. **Erstes Konto** in Supabase anlegen (Authentication → Users → Add user, *Auto confirm*, mindestens 12 Zeichen): es wird Admin. Anmelden, Passkey einrichten.

## Variante 2: Nur Desktop

1. **Docker** installieren und starten (Docker Desktop auf Windows und macOS, Docker Engine auf Linux).
2. **Installer** im entpackten Ordner starten: `./infra/desktop/install.sh` (Linux, macOS) oder `infra\desktop\install.ps1` (Windows). Er baut alles, erzeugt die Geheimnisse auf deinem Rechner und legt das erste Konto an.
3. **Anmelden** unter `http://mininode.localhost:8787/login`, Passkey einrichten.
4. **Apps** mit `mininode-desktop add <Ordner oder ZIP>` installieren, dann unter Verwaltung → Apps freigeben.
5. Für andere Geräte oder das Internet: [Desktop-Version](wiki:desktop-version), Abschnitt „Andere Geräte und Internet“.

## Variante 3: Beides

1. Variante 1 fertig einrichten.
2. Auf dem Heimserver `infra/cloudflare/bootstrap.sh` laufen lassen (Tunnel, Access, R2).
3. Den Heimserver nach `nucbox-install.md` aufsetzen: **„Plain Docker host“** auf beliebiger Linux-Hardware, oder Proxmox mit Windows-VM für Windows-Programme ([NucBox und Hardware-Server](wiki:nucbox)).
4. Die Variable `NUCBOX_TUNNEL_ID` und die Zugangs-Geheimnisse in GitHub eintragen und neu deployen.

## Danach

Der [Startup-Guide](/admin/guide) führt durch Rundgang, Sicherung, Einladungen und Freigaben. Etwas schiefgegangen? [Fehlerbehebung](wiki:fehlerbehebung).
