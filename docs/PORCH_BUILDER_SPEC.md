# Porch Builder — working spec

Notes captured while Deck Plus explains how porches are priced. Rules here are
the source of truth for the porch tool; the code follows this file. Anything
marked **?** is still an open question. All rates are sell price unless noted.

## Where it lives in the code
- `src/porchBuild.js` — rate defaults, Eze-Breeze layout math, `computePorchBuild()`, `buildPorchScope()`.
- `src/components/PorchBuildPanel.jsx` — the builder the rep uses (Build Quote → catalog → "Porch — Build to Spec").
- `src/components/PorchBuildFormulas.jsx` — Item Catalog → Tools: every rate with price/cost, lock, per-type scope text.
- Store slices `porchBuildRates` (only edited keys), `porchBuildLocked`, `porchBuildScopes`; persisted in `org_settings`.

## Primary cost drivers (in order)
1. **Size** — SF = floor area, width × depth. No minimum size or minimum job.
2. **Roof connection** — wall tie vs roof tie into the house, or freestanding.
3. **Structure / floor** — what the porch sits on. **"On PT deck" includes
   building a new pressure-treated deck** under the porch. "On patio" is an
   existing slab.

## Base rate matrix ($/SF of porch floor area)

| Porch type              | Tie-in    | Floor    | $/SF |
| ----------------------- | --------- | -------- | ---: |
| Screen porch (ScreenEze)| Wall tie  | PT deck  |   80 |
| Screen porch (ScreenEze)| Roof tie  | PT deck  |   90 |
| Screen porch (ScreenEze)| Wall tie  | Patio    |   72 |
| Screen porch (ScreenEze)| Roof tie  | Patio    |   80 |
| Open porch              | Wall tie  | PT deck  |   77 |
| Open porch              | Roof tie  | PT deck  |   87 |
| Open porch              | Wall tie  | Patio    |   67 |
| Open porch              | Roof tie  | Patio    |   77 |
| Pavilion (freestanding) | none      | Patio    |   67 |

Observed pattern: roof tie is +$10/SF over wall tie; PT deck is +$8/SF (screen)
or +$10/SF (open) over patio.

**Pavilion rule:** a pavilion on patio must also add an extra LVL and extra
electrical (see add-ons). **?** which LVL length / which electrical item.

## Add-ons

Every add-on is a **fixed amount** except the three per-SF adders, the LVL
(per linear foot) and the bracing plate (per post).

| Add-on                                              | Unit     | Price |
| --------------------------------------------------- | -------- | ----: |
| ScreenEze upcharge                                  | per SF   |     3 |
| Freestanding structure add                          | per SF   |     7 |
| Deck above 8′ high add                              | per SF   |     5 |
| PT LVL (framing)                                    | per LF   |   150 |
| Engineered metal bracing plate (per post; add letter)| per post|   750 |
| 6×6 laminated column package                        | fixed    |  2000 |
| Gable / semi-vaulted wider than 19′ add             | fixed    |  1000 |
| Reinforce deck for hot tub / porch                  | fixed    |  2000 |
| LVL engineering (required on every LVL project)     | fixed    |  1000 |
| Engineered metal bracing letter                     | fixed    |  1250 |
| Open porch wrap / LVL engineer charge               | fixed    |  3000 |
| Hip roof (must add flat ceiling)                    | fixed    |  3000 |
| Roof cricket                                        | fixed    |   865 |
| Seed and straw                                      | fixed    |   250 |

## Roof style rules (confirmed)

| Roof  | Price                                                                  |
| ----- | ---------------------------------------------------------------------- |
| Shed  | base SF rate only (the standard roof)                                  |
| Gable | base + **PT LVL × porch depth** (150/LF) + LVL engineering (1000 LS); if wider than 19′ (along the house wall) also +1000 LS |
| Semi Vaulted | base; if wider than 19′ (along the house wall) +1000 LS — the same flat fee as a gable |
| Hip   | base + 3000 LS + **PT LVL × porch depth** (150/LF) + LVL engineering (1000 LS) + **required flat ceiling** |

Hip: the LVL and engineering are in addition to the 3000 (to be double-checked).
**?** flat ceiling price.

## Freestanding
- Freestanding is a tie-in choice: type/floor base rate + **$7/SF**.
- **Freestanding porches can only have a gable roof**, so the gable rules
  apply: PT LVL × porch depth + LVL engineering (+1000 if wider than 19′).
- The "Pavilion on patio" row (67/SF) = Open / Patio base; a pavilion is
  Open + Patio + Freestanding (+ gable rules). "Extra electrical" **?** which item.

## Eze-Breeze porch (third porch type)
A new-build porch enclosed with Eze-Breeze window units. The structure is
priced like the other porch types (base SF rate × floor area, tie-in, roof and
add-on rules all apply); the enclosure follows **the same reasoning as the
porch-conversion calculator** already in the quote builder:

- Window unit max 54″ wide, 2.5″ frame grab on each column, 6×6 columns 5.5″
  wide → each window+column module fills 54.5″ of wall.
- Fewest windows that fit per wall, all sized equally; a column bounds every
  opening, so N openings need N+1 columns; corner columns are shared.
- Wall height over 105″ → one transom per window.
- 36″ exit doors, on the front wall; rep chooses the count.
- Enclosed walls: Front + 2 sides (default), All 4 walls, or Front only.
- Per-unit rates come from Settings → Formulas (window, transom, door), the
  same slice the conversion tool reads. **No "paint, seal & refinish" line** on
  a new-build Eze-Breeze porch (that line stays on the conversion tool only).

**Columns (confirmed):** in the **porch builder** (new build), every Eze-Breeze
porch automatically adds the **6×6 laminated column package (2000 LS)** and has
**no per-column line**; the layout math still counts columns to size the
windows, but only windows, transoms and doors are priced on top of the structure.
The existing **porch-conversion tool is unchanged**: it keeps calculating and
pricing columns individually, because on a conversion the columns are new work.

**Base rate (confirmed):** the structure uses the **Open porch rows** of the
matrix for its tie-in and floor. The Eze-Breeze items are added on top:
window units (700 each), transoms (130 each, when wall height > 105″), Larsen
doors (per model), and the 6×6 laminated column package (2000 LS).

## Doors, windows, glass (per unit)

| Item                                         | Each |
| -------------------------------------------- | ---: |
| Larsen Tradewinds door                       |  750 |
| Larsen Tradewinds Premium door               |  850 |
| Larsen Savannah door                         |  650 |
| Larsen Savannah Pet door                     |  815 |
| Glass in openings — **gable porches only**   |  975 |
| Eze-Breeze window unit                       |  700 |
| Transom                                      |  130 |

- The rep picks a **door model** and a count; each door is one line.
- Eze-Breeze unit **700** (was quoted 750, changed to 700 going forward) and
  transom 130 replace the conversion tool's placeholder rates (650 / 300).
- **"Glass in openings" = glazing the gable ends.** Offered only when the roof
  is gable; the rep enters the count of gable ends to glaze (typically 1 or 2).
  The actual glass size depends on roof pitch but the price is a flat 975 per
  end regardless — pitch is not an input.
- **Confirmed:** the Larsen door list is the door choice for **both** ScreenEze
  and Eze-Breeze porches. The porch-conversion tool's generic "exit / storm
  door" (900) is replaced by the same list.

## Painting / staining

| Item                                           | Unit   | Price |
| ---------------------------------------------- | ------ | ----: |
| Paint/stain porch on patio                     | per SF |    12 |
| Paint/stain porch on upgraded composite/PVC deck | per SF |  14 |
| Paint/stain porch on PT deck                   | per SF |    15 |
| Paint/stain PT deck (deck only)                | per SF |    13 |
| Paint/stain Trex deck, hybrid rail             | per LF |  8.12 |
| Paint/stain Trex deck, Trex rail               | per LF |  6.16 |

- Porch painting is an optional add-on; the rate follows the **floor type**
  automatically (patio / composite-PVC deck / PT deck) × porch floor SF.
- **?** "Upgraded composite or PVC deck" appears here as a floor type but not
  in the base rate matrix — is it a third floor option, and what is its base
  rate (or is it PT deck rate + a decking upgrade line)?
- **?** Trex rail painting per LF: LF of railing? Applies to the deck tool too?

## Price catalog (as supplied; units verbatim)

Items marked ⚠ have a unit that looks off — see the note under each table.

### Porch extras
| Item | Unit | Price |
| --- | --- | ---: |
| Roof membrane / flat roof | per SF | 10.50 |
| Metal roof | per SF | 13 |
| T&G ceiling 1×6 | per SF | 12 |
| Flat ceiling | per SF | 5 |
| Coffered ceiling | per SF | 18 |
| Corbels ⚠ | per SF (sheet) | 500 |
| Wagon-wheel gable trim | LS | 800 |
| Skylight 4′×2′ | each | 1250 |
| Faux beam | per LF | 28 |
| Gable dormer | LS | 3200 |
| Shiplap wood 1×6 wall | per SF | 12 |
| Shiplap MDF 1×6 wall | per SF | 10 |
| Knee wall, Hardie / ply-beaded | per SF | 29 |
| TV wall, shiplap/siding/paint, 5′×9′ | LS | 2700 |

⚠ Corbels at 500/SF is almost certainly **per each** (or per pair). **?**
Flat ceiling at $5/SF is the line the hip roof requires; roof SF vs floor SF **?**
(assume porch floor SF unless told otherwise).

### Flooring upgrades
| Item | Unit | Price |
| --- | --- | ---: |
| Trex Enhance porch floor upgrade | per LF | 3.85 |
| Trex Transcend porch floor upgrade | per LF | 8.80 |
| PT plywood | per SF | 4.50 |
| LVT flooring only | per SF | 26 |
| LVT on concrete | per SF | 23 |
| Tile flooring only | per SF | 29 |
| Tile flooring on deck | per SF | 36 |
| Tile with plywood / membrane upgrade | per SF | 44 |

Trex porch-floor upgrades are per LF of decking board over the PT floor
included in the "on PT deck" base, matching how the deck tool prices decking
collections.

### Concrete
| Item | Unit | Price |
| --- | --- | ---: |
| Concrete + hill / driveway / house access | per SF | 20 |
| Reinforced concrete 4″ (mesh / flooring underlayment) | per SF | 20 |
| Concrete 4″ | per SF | 17 |
| Concrete slab less than 200 SF | per SF | 30 |

Rule: slab under 200 SF → 30/SF instead of 17/SF.

### Steps and landings (per LF)
| Product | Steps | Landing |
| --- | ---: | ---: |
| PT wood | 17.50 | 17.50 |
| Trex Enhance | 24.20 | 24.20 |
| Trex Transcend ⚠ | 17.60 | 30.80 |
| Trex Lineage | 30.80 | 30.80 |
| Trex Signature | 30.80 | 36.85 |
| TimberTech Prime / Prime+ ⚠ | 24.20 (sheet says SF) | 24.20 (sheet says SF) |
| TimberTech Terrain / Terrain+ | 26.40 | 26.40 |
| TimberTech Reserve | 28.05 | 28.05 |
| TimberTech Harvest PVC | 29.50 | 29.50 |
| TimberTech Landmark PVC | 31.35 | 31.35 |
| TimberTech Vintage PVC | 33 | 33 |
| TimberTech Vintage T&G | 40.15 | 40.15 |

**Why LF, not SF (confirmed):** steps, landings and porch floors follow the
deck tool's **decking-board logic** — quantities are linear feet of board from
the takeoff (board lengths, no butt joints, spline rules), not area. Per-SF
pricing rounds differently from the boards actually bought, and over a deep
porch the gap grows to hundreds or thousands of dollars. So:
- Porch floor upgrades, steps and landings are priced per **LF of decking board**
  produced by the same takeoff the deck tool uses (treads = risers × stair width
  × 2 boards; landings from their board layout, not a flat 16 SF).
- The deck tool's current landing math (count × 16 SF) must move to LF too.

⚠ Trex Transcend steps (17.60) are far below its landing (30.80) and below
Enhance steps (24.20) — **?** typo for 30.80?
⚠ TimberTech Prime is the only SF row; every other row is LF — **?** typo?

### Railing (per LF)
| Item | Price |
| --- | ---: |
| 2×2 pickets wood rail | 17 |
| Hybrid railing, wood cap | 19 |
| Hybrid railing, Trex cap | 30.80 |
| Trex Transcend railing | 170.50 |
| Trex Select railing (white only) | 121 |
| Trex Signature aluminum railing | 142 |
| Trex Signature aluminum, between posts only | 86 |
| TimberTech aluminum railing | 145.20 |
| TimberTech railing, between posts only | 78.10 |

### Deck fascia (per LF)
**Quantity rule (confirmed):** fascia LF auto-populates from the deck's exposed
perimeter — width + 2 × depth (the house side has none), or the full perimeter
2 × (width + depth) when freestanding. Only offered when the porch sits on a
deck. The rep can type an override.

| Item | Price |
| --- | ---: |
| PVC white fascia | 13 |
| Trex Enhance / Transcend / Lineage fascia | 27.50 |
| Trex Signature fascia | 35.20 |
| TimberTech composite fascia | 22 |
| TimberTech PVC fascia | 33 |

### Deck upgrades
| Item | Unit | Price |
| --- | --- | ---: |
| Box steps | per step | 100 |
| 8×8 solid posts | each | 350 |
| Trex aluminum gate | each | 1375 |
| Privacy wall | per SF | 21 |
| Engineered lattice, stained, 4×8 sheet | each | 270 |
| PT skirt, vertical/horizontal, stained | per SF | 10 |
| Trex skirt, vertical/horizontal | per SF | 33 |
| 1-board border | per LF | 3 |
| 2-board border | per LF | 6 |

Most of the steps, railing, fascia and deck-upgrade prices also belong to the
**deck tool**, whose Formulas rates are still placeholders. Plan: load them
into one shared price list both tools read, so a number is entered once.

## ScreenEze screens
**Confirmed:** a ScreenEze porch is priced at the Screen porch base rate above
**plus** a separate "ScreenEze screens" line at $3/SF of porch floor area,
always shown on its own line. (This replaced the earlier "shown separately"
option, which re-priced the porch as an Open porch + screens.)

## Dependency rules
- Any PT LVL line → LVL engineering (1000 LS) added automatically.
- Metal bracing plates → bracing letter (1250 LS) required.
- Hip roof → flat ceiling required.
- Freestanding → gable roof forced → LVL + engineering.
- Eze-Breeze porch → 6×6 laminated column package (2000 LS) added automatically.
- Gable or Semi Vaulted wider than 19′ (dimension along the house) → +1000 LS.

## What the base rate includes (drives proposal scope text)
Two different inclusion lists, one for **open porch** and one for **ScreenEze
porch**. **Deferred**: the real bullets come later; the builder ships with
placeholder scope text that the office edits in Settings → Formulas, the same
way the deck and porch-conversion scope templates work today.

## What the customer sees (confirmed)
The proposal shows a **short list of grouped lines**, not every internal rule:

| Group | Contains |
| --- | --- |
| Porch structure | base SF rate × area, freestanding add, deck-height add, roof-style adders (LVL, engineering, hip, gable > 19′), reinforce / bracing / wrap / cricket / seed & straw |
| Enclosure | ScreenEze screens line, Eze-Breeze windows, transoms, doors, glass in gable ends, 6×6 lam column package |
| Roof & ceiling options | metal roof / membrane, T&G / flat / coffered ceiling, skylights, faux beams, dormer, gable trim, corbels |
| Walls & finishes | shiplap, knee wall, TV wall, paint / stain |
| Flooring | Trex porch floor upgrades, LVT, tile, PT plywood, concrete |
| Steps, landings & railing | steps, landings, railing, fascia, deck upgrades |

Each group is one line with one price on the proposal; the itemized detail
stays in the builder for the office. Empty groups are omitted. The existing
itemized / lump-sum display toggle still applies on top of this.

## Internal cost (confirmed)
Every rate carries a **cost field next to the sell price**, like the deck tool,
so the office sees margin per line. Costs are **not known yet**: all cost
fields start at 0 and the office fills them in Settings → Formulas later.
Margin displays read "cost not set" rather than 100% while a cost is 0.

## Open questions
- Catalog ⚠ units: corbels (500/SF?), Trex Transcend steps (17.60?), TimberTech Prime (SF vs LF); what LF measures on steps/landings.
- Flat ceiling: roof SF or floor SF?
- Floor type "composite / PVC deck": base rate?
- Pavilion / freestanding "extra electrical": which item and price?
- Hip: confirm LVL + engineering are on top of the 3000; flat ceiling price.
- Inclusion lists for open vs ScreenEze porches (for scope text).
