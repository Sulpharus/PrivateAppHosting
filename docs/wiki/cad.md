---
title: CAD
category: apps
order: 78
summary: Konstruktionspläne und 3D-Modelle für 3D-Druck und CNC, mit Gewinden, realistischer Ansicht, Baugruppen und KI-Assistent
---

**CAD** (`cad.<deine Domain>`) zeichnet Konstruktionspläne (2D) und baut 3D-Modelle für den 3D-Druck und die CNC-Fräse. Jedes Projekt hat eine Zeichnung und ein 3D-Modell; alles ist privat. Wie es gebaut ist, steht in `hosted/cad/README.md`.

## Zeichnen und modellieren

- **Zeichnung:** Linie, Polylinie, Rechteck, Kreis, Bogen, Maß und Text. Exakte Werte tippst du unten ein (`50,20` ist ein Punkt, `@40,0` geht 40 mm nach rechts, `30<45` geht 30 mm im 45°-Winkel) oder rechts unter *Eigenschaften*.
- **3D-Modell:** Quader, Zylinder, Kugel, Kegel, Extrusionen von Skizzen und Bohrungen. **Gewinde** sind echte ISO-Gewinde (Schraubenlinie mit 60°-Flanken), als Bolzen oder Gewindeloch, mit Spiel für den Druck.
- **Darstellung:** *Schnell* oder *Realistisch* (Materialien wie PLA mit Schichtlinien, Aluminium, Stahl, Messing, Holz; Schatten und Spiegelungen). Das Material ändert nur das Aussehen, nicht die Exporte.
- **Zeichnung aus 3D** erzeugt Vorder-, Drauf- und Seitenansicht mit verdeckten Kanten und Maßen; **Drucken** gibt sie im Maßstab mit Schriftfeld aus, auch als PDF.

## Baugruppen

Eine Baugruppe besteht aus **Teilen**. Die Bohrungen eines Teils schneiden nur dieses Teil, so steckt zum Beispiel ein Bolzen in der Bohrung eines anderen Teils, ohne angeschnitten zu werden.

- **Mehrere Dateien importieren** (STL/OBJ auf einmal): Jede Datei wird ein Teil. *Wie in den Dateien* lässt die Teile an ihrer Position (für Baugruppen, die zusammen exportiert wurden); *Nebeneinander* stellt sie einzeln auf die Platte.
- **Projekt einfügen** kopiert die Körper eines anderen Projekts als bearbeitbare Teile hinein; das andere Projekt bleibt unverändert.
- Ein Klick auf ein Teil wählt es aus: verschieben (exakt in ΔX, ΔY, ΔZ), drehen, Material, ausblenden, auflösen, löschen oder **als STL exportieren**. Ist ein Teil ausgewählt, kommen neue Körper und Bohrungen in dieses Teil.
- **Passung prüfen** zeigt, wo sich Teile überschneiden, mit dem Volumen, und markiert die Stellen rot. Sehr große Netze (über 20.000 Flächen) werden dabei als „nicht geprüft“ gemeldet.

## Import und Export

- Import: STL, OBJ (Teile), DXF (in die Zeichnung), G-Code (als Werkzeugbahn).
- Export: STL und OBJ (geschlossen, ohne Löcher im Netz), DXF, SVG, G-Code für die Fräse (außen, innen oder auf der Linie, Zustellung, Bohrungen) und PDF über *Drucken*.

## KI-Assistent

Unter *KI-Assistent* beschreibst du, was du bauen oder ändern möchtest. Die KI schlägt Schritte vor, die grün in der Vorschau erscheinen; geändert wird erst mit **Übernehmen** (rückgängig machbar). Standard ist das genaue Modell (Claude Sonnet), umschaltbar in den Einstellungen; das Budget sind 5 € im Monat.
