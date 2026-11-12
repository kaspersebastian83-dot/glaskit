# GlasKit

Das Gebäude aus Glas – Teil der Spektron-Suite.

GlasKit liest eine PlanKit-Datei (`*.probenplan`) **nur lesend** und zeigt die Geschosse als gestapelte Glasplatten. Jede Probe leuchtet an ihrer Stelle: Form nach Probenart (Kreis PAK, Quadrat Chlorid, Raute Asbest), Farbe nach derselben Bewertung wie PlanKits Ergebniskarte, Höhe nach Oberflächenart (Aufsicht unten, Ansicht Mitte, Untersicht oben).

![Vorschau](docs/vorschau.png)

Aktuelle Version: **1.2.0** (steht oben neben dem Namen).

## Benutzen

Aus der **Projektzentrale**: Projekt wählen → „Mehr zum Projekt …“ → **„GlasKit öffnen“**. GlasKit öffnet dann `#projekt=<Ordnername>` direkt. Fragt der Browser nach dem Zugriff, steht ein Knopf „Projekt … öffnen“ da – ein Klick reicht. Gibt es im Projekt noch keinen Plan, sagt GlasKit das und bietet PlanKit an.

Oder `index.html` in Edge oder Chrome öffnen (oder über GitHub Pages) → „Projektordner öffnen“ oder „Plan-Datei öffnen …“. Ohne Projekt: „Beispielgebäude ansehen“ (alle Werte frei erfunden).

- Ziehen = drehen · Umschalt + Ziehen = verschieben · Mausrad = Zoom
- Klick auf eine Probe: Karte mit dem Wert wie im Prüfbericht, Geschosse darüber werden durchsichtig
- **Wände** (nur bei Plänen, die in PlanKit als Skizze gezeichnet sind): Wände als Glas bis knapp unter das nächste Geschoss, Türen offen (mit Sturz), Fenster mit Brüstung und Glasscheibe, der Brandraum vom Boden her warm angeleuchtet. Schalter „Wände“ unten. PDF- und Bildpläne bleiben flache Platten.
- „Rundgang“: Kamerafahrt von Probe zu Probe (Leertaste = Pause, Pfeiltasten, Esc)
- „Bild speichern“: PNG der aktuellen Ansicht als Download

## Grundsätze

- Eine Datei, offline, keine Abhängigkeiten, kein WebGL (läuft auch über RDP).
- GlasKit schreibt nie in den Projektordner.
- Werte und Bezeichnungen stehen so da wie im Prüfbericht. Es wird nichts interpoliert. Ohne Bewertungsskala im Projekt bleibt eine Probe grau.
- Der Rauch am Brandherd ist reine Dekoration, keine Berechnung.
- Sind nicht alle Pläne kalibriert, ist die Darstellung nicht maßstäblich; Geschosse werden mittig gestapelt.

## Wände aus der Skizze

`plan.sketch` (PlanKit `src/sketch.ts`, cm): Raumrechtecke und freie Wände; gemeinsame Kanten benachbarter Räume werden zu einer Wand zusammengelegt, Türen/Fenster schneiden sie (gleiche Lage-Regel wie PlanKit: parallel, auf der Linie). Höhen als Anteil des Geschossabstands (Wand 0,94 · Sturz 0,72 · Brüstung 0,30), daher passen Proben (Decke 0,9) immer unter die Wandkrone. Wände und Proben werden gemeinsam von hinten nach vorn gezeichnet (Wände dafür in Stücke ≤ 0,45 Welteinheiten geteilt). Passt die Skizze nicht zur Plangröße oder ist der Plan gedreht/zugeschnitten, bleibt er flach.

## Projektübergabe (`#projekt=`)

Wie PlanKit und FotoKit: Archivordner aus IndexedDB `mosaik-suite`, Store `kv`, Schlüssel `archiv`; dann den Projektordner per Name. GlasKit fragt **nur nach Leserecht** (`{mode:'read'}`). Wo die PlanKit-Datei und `_Projekt.json` liegen (`_Spektron/…` oder früher `Pläne/`), entscheidet `spektron-ordner.js` – eine byte-gleiche Kopie der Vorlage aus der Projektzentrale steht als eigener `<script>`-Block in `index.html` und wird nur ohne `anlegen` benutzt.

## Pflege

Die Bewertungsregeln (VdS-2357-Referenzen, KORROSION-CHLORID v2, Asbest-Befund, Hauptwert je Probenart) sind aus `Probenplan/src/results.ts` übernommen. Ändert sich dort etwas, hier mitändern. Ändert sich `spektron-ordner.js` in der Projektzentrale, den Block in `index.html` ersetzen.

## Prüfen

`tests/glaskit-check.cjs` (Playwright, erfundene Daten, Bildschirmfotos nach `tests/out/`): `node tests/glaskit-check.cjs a|b|c|alle`. Kein Testgerüst, keine CI.
