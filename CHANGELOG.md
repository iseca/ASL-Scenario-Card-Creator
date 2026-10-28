# ASL Scenario Card Maker — change log

Each release is kept as its own file in `versions/` (for example `ASL_Scenario_Card_Maker_v1.0.html`).
The version number shows next to the title in the app's toolbar, and cards saved with **Save card** record the version that saved them.

Numbering: the second number goes up for each set of changes (1.0 → 1.1 → 1.2 …); the first number goes up for a big change such as a new template.

## v1.3 — 2026-10-28
- **Board layout from your VASL boards.** Click **Board layout** in the toolbar (or hover the board box on the card and click **Board layout…**). The first time, click **Load boards folder…** and choose your VASL `boards` folder; each board's picture is read in your browser and kept in its storage (nothing is uploaded). Load the folder again whenever you get new or updated boards.
  - Board list with pictures and a search box (240 board files: geomorphic, Action Pack, HASL maps, bundles such as Festung Budapest).
  - Click a board to add it beside the others, or drag it into place. Boards snap edge to edge.
  - **Rotate 90°** (R) and **Reverse** (end for end); **Remove** (Delete).
  - **+ Shaded area** darkens part of the layout to show it is out of play; drag it and drag its corner to size it. It snaps to half hexes and only darkens the boards.
  - **Board numbers** printed on the boards (on/off). The bar along the bottom lists the boards in use, e.g. "Boards in use: 24, 3 (reversed), 44"; **Put list in board note** copies it into the ASL card's board note.
  - **Place on card** draws the layout into the ASL board configuration box or the SASL Initial Mapboard Configuration. The layout is saved with the card, so the button reopens it for changes. Undo works on it.
- Board names drop leading zeros ("01" shows as "1").

## v1.2 — 2026-10-28
- **Counter palette from VASL.** Load your VASL module (.vmod) once with **Counter palette → Load VASL module…**; it is read in your browser and kept in the browser's storage (nothing is uploaded, and the counter art is not built into this file).
  - Counters are listed by nationality (the 20 VASL O/B tabs) and VASL's own groups (SQ, HS, SMC, SW, Gun, Veh, Air, Other), with a search box.
  - Counter fronts only, drawn the way VASL layers them (e.g. squad face + class badge; guns unlimbered; broken sides, backs and play markers left out).
  - Hover any OB counter row (ASL panels and SASL OB sections) and click **Counters…**: the palette opens on that side's nationality. Click a counter to fill the row's next empty box, or drag it onto any row. ⅝″ counters go into large boxes automatically.
  - Counters placed on a card are copied into the card, so loading a newer VASL later never changes existing cards. To update the palette for a new VASL release, load the new .vmod the same way.
- The card moves left while the palette is open so the two don't overlap.

## v1.1 — 2026-10-27
- Every card page (ASL front and back page, SASL mission) now carries a small grey notice centred along the bottom edge: "This template is for personal use only." It appears in PDF and PNG exports.

## v1.0 — 2026-10-25
First version-controlled release. Everything built so far:

**ASL scenario card (8.5 × 11)**
- Editable title, scenario ID, designer, history, Victory Conditions, Balance, Special Rules and Aftermath; logo, photo and board images.
- Nationality symbols (built-in, plus your own images, which can be deleted); multi-symbol images widen up to a fixed limit while the OB stays put.
- Turn Record Chart with reinforcement marks, shading and half-turn end; defaults "DEFENDER Sets up First" / "ATTACKER Moves First".
- OB panels with counter rows, quantities, ½″ / ⅝″ counters, drag to reorder, side art; optional back page.
- Mini-map sizing rules (largest square to the TRC, right-justified, tall maps centred, sideways boards 0.5″ tall, N arrow tucks in beside the map).
- Special Rules can continue in the right column from a chosen rule; Aftermath can start in the right column.
- OB boxes keep at least 4 px of padding on every side.

**SASL mission card**
- Template picker (ASL / SASL); each template keeps its own saved card.
- Header with logo, badge, Mission number, Ⓟ mark, title and rule; optional photo.
- Two-column sections that can be added, removed, reordered and started in the right column; Mission Tables with added columns (new sub-heading defaults to "Level"), rows, and centred text.
- Order of battle sections below SEQUENCE with nationality symbols and counter rows.
- Initial Mapboard Configuration with the N arrow pointing up or right (the diagram moves over to fit).
- Outline bullets (• – ◦ ▪) in any text, with Tab / Shift+Tab.
- Tables in text: paste from Word / Excel / another card, or build one (Grid… with rows, columns, heading row, shading, centring, side box, and an Activation table layout); Shade, Center, Top, Lines, Merge, Unmerge, Head row, +R / −R / +C / −C. A table belongs to the rule above it and never gets its own number.

**Both templates**
- Undo / Redo (⌘Z, ⇧⌘Z / Ctrl+Y), kept across reloads.
- Fit check names the section that is cut off.
- Save / Open card (.json), Export PNG and PDF.
- Header stays fixed at the top of the window; instruction text spans the full width.
