# ASL Scenario Card Maker

A single-page web app for making 8.5 × 11 scenario cards for **Advanced Squad Leader (ASL)** and mission cards for **Solitaire ASL (SASL)**. Open `ASL_Scenario_Card_Maker.html` in a browser — no install, no server.

> **This template is for personal use only.** Every card page carries that notice. ASL, SASL and their artwork are the property of Multi-Man Publishing; nothing from their products is included in this repository.

## What it does

- **Two templates:** ASL scenario card and SASL mission card (switch with *Template*); each keeps its own autosaved card.
- **Editable everything:** text, images, turn record chart, OB panels with counter rows, special rules, Mission Tables, outline bullets, tables pasted from Word or built in place.
- **Counter palette from VASL:** load your own VASL module (`.vmod`) once; counters are listed by nationality and drawn front-side only.
- **Board layout from VASL:** load your VASL `boards` folder (with its `overlays`) once; lay boards out, rotate/reverse, snap, add overlays, shade out-of-play areas in red, and place the result on the card.
- Undo/redo (kept across reloads), fit check, Save/Open card (`.json`), Export PNG/PDF.

VASL files are read **in your browser** and kept in its storage — they are never uploaded and never added to this repository.

## Files

| Path | What it is |
|---|---|
| `ASL_Scenario_Card_Maker.html` | The app — open this. Always the latest build. |
| `dist/ASL_Scenario_Card_Maker_vX.Y.html` | Build of each release. |
| `CHANGELOG.md` | What changed in each release. |
| `src/template.html` | App source (HTML, CSS, JS). |
| `src/vasl.js` | Reads a VASL module and draws counter fronts. |
| `src/boards.js` | Reads VASL boards/overlays and the board layout editor. |
| `src/VERSION` | Current version number. |
| `src/build.py` | Builds the app from the source files. |

## Building

```
python3 src/build.py
```

This writes `ASL_Scenario_Card_Maker.html` and `dist/ASL_Scenario_Card_Maker_v<VERSION>.html`. The page loads html2canvas, jsPDF and JSZip from cdnjs, so exporting and reading VASL files need an internet connection.

## Releases

Bump `src/VERSION`, add a `CHANGELOG.md` entry, build, commit, and tag the commit `vX.Y`. Small fixes that don't need a new number are committed without a tag.
