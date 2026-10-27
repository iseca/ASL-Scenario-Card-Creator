# ASL Scenario Card Maker — change log

Each release is kept as its own file in `versions/` (for example `ASL_Scenario_Card_Maker_v1.0.html`).
The version number shows next to the title in the app's toolbar, and cards saved with **Save card** record the version that saved them.

Numbering: the second number goes up for each set of changes (1.0 → 1.1 → 1.2 …); the first number goes up for a big change such as a new template.

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
