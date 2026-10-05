---
title: NucBox und Hardware-Server
category: betrieb
order: 40
summary: Der Heimserver: was darauf läuft, wie er erreichbar ist und wie er gesichert wird
---

Die **NucBox** (NucBox G9, 16 GB) ist dein Heimserver. Er läuft mit **Proxmox VE** und trägt:

| Teil | Speicher | Verhalten |
| --- | --- | --- |
| Proxmox-Host | 1 GB | immer |
| **Linux-VM** (Docker) | 6 GB | immer: `cloudflared`, Traefik, Forward-Auth, Guacamole, `nucbox-control`, Container-Apps |
| **Windows-11-VM** | 0 oder 6 GB | schläft nach Leerlauf, wacht bei Verbindung auf |
| Wine-Sitzungen | 0–2 GB | starten bei Verbindung, stoppen im Leerlauf |
| Redroid (Android) | optional | standardmäßig aus; schließt die Windows-VM aus |

## Erreichbar nur über den Tunnel

Es gibt **keine offenen Ports**. Ein **Cloudflare-Tunnel** verbindet die NucBox mit Cloudflare; Verwaltungsflächen (Proxmox, SSH, Guacamole-Admin) liegen hinter
**Cloudflare Access** (nur du und der CI-Dienst). Container-Apps hängen hinter dem MiniNode-Login (Forward-Auth).

## Wie Dinge dorthin kommen

- **Container-Apps und Bibliothek:** CI baut/zieht das Image, ein SSH-Schlüssel mit erzwungenem Befehl ruft `nucbox-deploy <name> <digest>`: es prüft die
  Beglaubigung, startet mit Gesundheitsprüfung und rollt bei Fehlern zurück.
- **Programme:** Installer in R2, `nucbox-control` macht einen VM-Snapshot, prüft die Prüfsumme und installiert still ([App-Bibliothek und Programme](wiki:app-bibliothek-programme)).

## In der Verwaltung

Hardware-Server → **Auslastung** (Prozessor, Speicher, Laufwerke, Container; alle 15 s), **Remote-Apps** (Sitzungen, Warteschlange, Installation), **App-Bibliothek**.

## Einrichten und Sichern

Einrichtung: Runbook `nucbox-install.md` (Proxmox, Linux-VM, Windows-VM, Prüfung), Tunnel/Access mit `infra/cloudflare/bootstrap.sh`; danach die GitHub-Variable `NUCBOX_TUNNEL_ID`
setzen. **Nachts** sichert die NucBox Datenbank, Apps und Wine-Daten mit restic auf NVMe und verschlüsselt nach R2 (7 täglich, 4 wöchentlich, 6 monatlich); ein monatlicher
**Wiederherstellungstest** beweist, dass die R2-Kopie funktioniert; die Windows-VM sichert Proxmox selbst. Wiederherstellen: Runbook `restore.md`. Die Verwaltungs-Sicherung
([Sicherung](wiki:sicherung)) ist davon unabhängig.

## Ressourcen und Grenzen

Die Windows-VM und Android schließen sich aus (Speicher). Mehrere Personen am selben Windows-Programm gehen nicht gleichzeitig; es gibt eine Warteschlange.
Die Wine- und Android-Wege sind optional und nicht auf echter Hardware geprüft.
