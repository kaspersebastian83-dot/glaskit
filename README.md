# GlasKit

Das Gebäude aus Glas – Teil der Spektron-Suite.

GlasKit liest eine PlanKit-Datei (`*.probenplan`) **nur lesend** und zeigt die Geschosse als gestapeltes Modell – als weißes Kartonmodell („Modell“, Standard) oder als Glasplatten („Glas“, „Papier“). Jede Probe leuchtet an ihrer Stelle: Form nach Probenart (Kreis PAK, Quadrat Chlorid, Raute Asbest), Farbe nach derselben Bewertung wie PlanKits Ergebniskarte, Höhe nach Oberflächenart (Aufsicht unten, Ansicht Mitte, Untersicht oben).

![Vorschau](docs/vorschau.png)

Aktuelle Version: **1.4.0** (steht oben neben dem Namen).

## Benutzen

Aus der **Projektzentrale**: Projekt wählen → „Mehr zum Projekt …“ → **„GlasKit öffnen“**. GlasKit öffnet dann `#projekt=<Ordnername>` direkt. Fragt der Browser nach dem Zugriff, steht ein Knopf „Projekt … öffnen“ da – ein Klick reicht. Gibt es im Projekt noch keinen Plan, sagt GlasKit das und bietet PlanKit an.

Oder `index.html` in Edge oder Chrome öffnen (oder über GitHub Pages) → „Projektordner öffnen“ oder „Plan-Datei öffnen …“. Ohne Projekt: „Beispielgebäude ansehen“ (alle Werte frei erfunden).

- Ziehen = drehen · Umschalt + Ziehen = verschieben · Mausrad = Zoom
- **Darstellung** unten: **Modell · Glas · Papier**. „Modell“ (Standard) ist ein helles Architekturmodell aus weißem Karton: Platten mit Dicke und weichem Schatten, der Plan als feine Bleistiftlinien, Wände als Karton auf gut ⅓ Geschosshöhe (wie ein Schnittmodell), Proben als flache Marken mit weißem Ring; die ganze Seite wird hell. „Glas“ und „Papier“ sind unverändert wie bis 1.3.0. Die Wahl merkt sich der Browser.
- Im Modell sind Platten und Wände undurchsichtig. Damit dabei keine Probe verschwindet, stehen die Geschosse weiter auseinander (1,35 × – „Abstand“ wirkt zusätzlich), die Kamera blickt flacher, und eine verdeckte Probe (unter dem Geschoss darüber oder hinter einer Wand) erscheint als **gestrichelter Umriss** in ihrer Farbe. Klick darauf = wie bei jeder Probe: die Geschosse darüber blassen aus, die Wände des Geschosses werden durchscheinend.
- Klick auf eine Probe: Karte mit dem Wert wie im Prüfbericht, Geschosse darüber werden durchsichtig
- **Wände** (nur bei Plänen, die in PlanKit als Skizze gezeichnet sind): in „Glas“/„Papier“ Wände als Glas bis knapp unter das nächste Geschoss, Türen offen (mit Sturz), Fenster mit Brüstung und Glasscheibe, der Brandraum vom Boden her warm angeleuchtet. Schalter „Wände“ unten. PDF- und Bildpläne bleiben flache Platten.
- **Wischfelder** (ab 1.5.0): Jede Probe mit Oberflächenart ist ein farbiges Feld auf der Fläche, von der gewischt wurde – auf dem Boden (Aufsicht), stehend an der Wand (Ansicht), schwebend/unter der Decke (Untersicht). Proben ohne Oberflächenart bleiben die Kugel am gestrichelten Stiel.
- **Fotowände** (ab 1.5.0, nur Pläne mit Skizze, Projekt als Ordner geöffnet): Knopf „Fotowände (n)“ hängt die FotoKit-Fotos eines Raums an seine Wände. Klick auf ein Foto öffnet die Großansicht mit allen Fotos des Raums.
- **Fotos aus FotoKit** in der Probenkarte (nur wenn das Projekt als Ordner geöffnet ist): großes Bild mit FotoKits Beschreibung, darunter alle Fotos der Probe; Klick = Großansicht (Pfeiltasten, Esc). Aussortierte Fotos fehlen, Drehung wie in FotoKit, HEIC-Fotos bekommen einen ruhigen Hinweis. Proben mit Fotos tragen ein kleines Kamera-Zeichen.
- „Rundgang“: Kamerafahrt von Probe zu Probe, das Foto erscheint mit der Karte (Leertaste = Pause, Pfeiltasten, Esc)
- „Bild speichern“: PNG der aktuellen Ansicht als Download, in der Darstellung, die gerade zu sehen ist (Fußzeile im Modell hell mit dunkler Schrift)

## Grundsätze

- Eine Datei, offline, keine Abhängigkeiten, kein WebGL (läuft auch über RDP). Die weichen Schatten im Modell werden je Geschoss einmal vorberechnet und danach nur noch hingelegt.
- GlasKit schreibt nie in den Projektordner.
- Werte und Bezeichnungen stehen so da wie im Prüfbericht. Es wird nichts interpoliert. Ohne Bewertungsskala im Projekt bleibt eine Probe grau.
- Der Rauch am Brandherd ist reine Dekoration, keine Berechnung.
- Sind nicht alle Pläne kalibriert, ist die Darstellung nicht maßstäblich; Geschosse werden mittig gestapelt.

## Wände aus der Skizze

`plan.sketch` (PlanKit `src/sketch.ts`, cm): Raumrechtecke und freie Wände; gemeinsame Kanten benachbarter Räume werden zu einer Wand zusammengelegt, Türen/Fenster schneiden sie (gleiche Lage-Regel wie PlanKit: parallel, auf der Linie). Höhen als Anteil des Geschossabstands (Wand 0,94 · Sturz 0,72 · Brüstung 0,30), daher passen Proben (Decke 0,9) immer unter die Wandkrone. Wände und Proben werden gemeinsam von hinten nach vorn gezeichnet (Wände dafür in Stücke ≤ 0,45 Welteinheiten geteilt). Passt die Skizze nicht zur Plangröße oder ist der Plan gedreht/zugeschnitten, bleibt er flach.

## Darstellung „Modell“ (1.4.0)

Eigene Zeichenwege (`platteModell`, `wandModell`, `probeModell`, `brandModell`, `brandraumModell`) – „Glas“ und „Papier“ laufen weiter über die alten Funktionen und sind pixelgleich mit 1.3.0. Gleiche Geometrie, gleiche Tiefensortierung von Wänden und Proben, gleiche Formen und Bewertungsfarben. Platte 0,16 Welteinheiten dick (Oberseite `#fdfcf9`, sichtbare Seiten `#d9d6ce`/`#c9c5bc` stufenlos nach Blickrichtung, Kanten `#3a3833`), Plan multipliziert mit 50 %. Schatten: je Geschoss eine weichgezeichnete Vorlage (Boden: unterstes Geschoss, rgba(70,60,40,.28); Platte auf Platte, auf die untere Platte zugeschnitten), Zähler `SCHATTEN.gebaut`. Wandhöhe 0,34 der echten Geschosshöhe (ohne den Modell-Abstand), Brüstung 0,16; Türen offen; Fenster mit hellerer Scheibe. Brandraum: warmer Ton auf dem Boden, kein Leuchten. Brandherd gedämpftes Orange ohne additives Mischen, Rauch als grauer Ruß – weiterhin reine Dekoration. Verdeckte Proben: Alles Undurchsichtige, das nach einer Probe gezeichnet wird und ihre Mitte überdeckt (Platte oder Wand mit Deckkraft > 0,5), löst den Umriss aus. Wahl in `localStorage` `glaskit-stil` (in try/catch).

## Wischfelder und Fotowände (1.5.0)

**Wischfelder** (`feldGeo`, `feldZeichnen`): Gefärbt ist nur das Feld der Probe – Farbe = Bewertung wie bisher, Form = Probenart wie in PlanKit. Dazwischen wird nichts eingefärbt; die Feldgröße ist ein Zeichen, keine Flächenangabe. Ansicht-Proben richten sich nach der nächsten Wand der Skizze (höchstens 1 m entfernt, Türen zählen nicht); ohne Skizze oder ohne Wand in der Nähe steht das Feld zum Betrachter gedreht und bekommt einen Stiel – die Wandrichtung ist dann nicht bekannt. Im „Modell“ ist das Geschoss auf Wandhöhe geschnitten: Ansicht-Felder stecken oben auf der Wand, Untersicht-Felder schweben auf halber Geschosshöhe (in „Glas“ unter der Decke).

**Fotowände** (`fotoWaendeBauen`, `fotoPanel`): Zuordnung nur über FotoKits „Raum / Abschnitt“ = Raumname der PlanKit-Skizze (Groß-/Kleinschreibung und Leerzeichen egal; auch „<Geschoss> <Raum>“). Gibt es den Raumnamen in mehreren Geschossen und nennt FotoKit kein Geschoss, wird nicht geraten – das Foto bleibt weg. Aussortierte Fotos zählen nicht. Reihenfolge wie in FotoKit, im Uhrzeigersinn um den Raum verteilt, höchstens 8 je Raum. **An welcher Wand ein Foto hängt, ist nicht belegt** (FotoKit kennt keine Blickrichtung) – so steht es am Knopf. Gezeigt werden nur Wände, auf deren Innenseite man schaut; beim Drehen kommen die anderen. In echten Projekten erst nach Klick (die Fotos werden dafür einmal klein eingelesen, 420 px), im Beispielgebäude mit gezeichneten Beispielfotos gleich an. PDF-/Bildpläne haben keine Räume und darum keine Fotowände.

**Dazu in 1.5.0:** Der Brandherd bekommt im „Modell“ ein Flammenzeichen obenauf, wenn eine Wand oder Platte ihn verdeckt. Wände im Modell auf gut ⅙ der Geschosshöhe (vorher ⅓). Verdeckte Proben zeichnen keinen Stiel mehr. Rauch ist im „Modell“ anfangs aus (Knopf „Rauch“ gilt je Darstellung) und liegt dort als eine Fahne über dem Modell.

## Fotos (FotoKit)

`_Bildumbenenner.json` am Ort nach `spektron-ordner.js` (`_Spektron/FotoKit`, früher `Fotos/`): `bilder[<Dateiname>] = {beschreibung, abschnitt, probe, drehung, aussortiert, …}` – die Bilder selbst liegen in `Fotos/<Dateiname>`. Gleiche Regel wie PlanKits „Anlage Probenahme“ (`annex-run.ts`): aussortierte und Fotos ohne Probe-Nr. zählen nicht, Reihenfolge `reihenfolge`, Probe-Nr. wie `photoLabels()` („P1, p 2; Probe 3“, Bohrkern-IDs über die LabelKit-Datei des Projekts). Bilder werden erst beim Öffnen der Karte gelesen, nacheinander, mit EXIF-Ausrichtung und FotoKit-Drehung auf 720 px (Karte) bzw. bis 2400 px (Großansicht) verkleinert und nur im Speicher gehalten.

## Projektübergabe (`#projekt=`)

Wie PlanKit und FotoKit: Archivordner aus IndexedDB `mosaik-suite`, Store `kv`, Schlüssel `archiv`; dann den Projektordner per Name. GlasKit fragt **nur nach Leserecht** (`{mode:'read'}`). Wo die PlanKit-Datei und `_Projekt.json` liegen (`_Spektron/…` oder früher `Pläne/`), entscheidet `spektron-ordner.js` – eine byte-gleiche Kopie der Vorlage aus der Projektzentrale steht als eigener `<script>`-Block in `index.html` und wird nur ohne `anlegen` benutzt.

## Pflege

Die Bewertungsregeln (VdS-2357-Referenzen, KORROSION-CHLORID v2, Asbest-Befund, Hauptwert je Probenart) sind aus `Probenplan/src/results.ts` übernommen. Ändert sich dort etwas, hier mitändern. Ändert sich `spektron-ordner.js` in der Projektzentrale, den Block in `index.html` ersetzen.

## Prüfen

`tests/glaskit-check.cjs` (Playwright, erfundene Daten, Bildschirmfotos nach `tests/out/`): `node tests/glaskit-check.cjs a|b|c|d|alle` (d = Darstellungen: je eine Prüfung für Modell, Glas, Papier, gewählte Probe im Modell, „Bild speichern“, gesperrter Speicher). Kein Testgerüst, keine CI.
