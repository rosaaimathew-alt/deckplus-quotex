# Porch Builder — working spec

Notes captured while Deck Plus explains how porches are priced. Rules here are
the source of truth for the porch tool; the code follows this file. Anything
marked **?** is still an open question. All rates are sell price unless noted.

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
| Gable wider than 19′ add                            | fixed    |  1000 |
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

**?** Which base SF rate does the structure use: the Open porch rows, the
ScreenEze rows, or its own column in the matrix?
**?** The structure base already includes columns; the conversion tool also
prices a column line. Count columns once (structure) and price only windows,
transoms, doors and finishing on top — or keep the column line?

## Doors, windows, glass (per unit)

| Item                                         | Each |
| -------------------------------------------- | ---: |
| Larsen Tradewinds door                       |  750 |
| Larsen Tradewinds Premium door               |  850 |
| Larsen Savannah door                         |  650 |
| Larsen Savannah Pet door                     |  815 |
| Glass in openings — **gable porches only**   |  975 |
| Eze-Breeze window unit                       |  750 |
| Transom                                      |  130 |

- The rep picks a **door model** and a count; each door is one line.
- Eze-Breeze unit 750 and transom 130 replace the conversion tool's
  placeholder rates (650 / 300) in Settings → Formulas.
- "Glass in openings" is only offered when the roof is gable. **?** what an
  "opening" is here (the gable-end triangles?) and how the count is chosen.
- **?** Are the Larsen doors the door choices for ScreenEze porches, Eze-Breeze
  porches, or both? Does the conversion tool's generic "exit / storm door"
  (900) get replaced by this list?

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

## ScreenEze shown separately
The ScreenEze upcharge ($3/SF) is a **presentation option**: when the customer
wants to see the screen cost on its own line, price the porch as an Open porch
and add a "ScreenEze screens" line at $3/SF. Note: the matrix difference
screen − open is $3/SF except Wall tie on Patio, where it is $5/SF (72 vs 67).
**?** which number wins in that one case.

## Dependency rules
- Any PT LVL line → LVL engineering (1000 LS) added automatically.
- Metal bracing plates → bracing letter (1250 LS) required.
- Hip roof → flat ceiling required.
- Freestanding → gable roof forced → LVL + engineering.
- Gable wider than 19′ (dimension along the house) → +1000 LS.

## What the base rate includes (drives proposal scope text)
Two different inclusion lists, one for **open porch** and one for **ScreenEze
porch**. **Deferred**: the real bullets come later; the builder ships with
placeholder scope text that the office edits in Settings → Formulas, the same
way the deck and porch-conversion scope templates work today.

## Open questions
- Doors: which porch types use the Larsen list; what "glass in openings" counts.
- Floor type "composite / PVC deck": base rate?
- Eze-Breeze: base SF rate row, and whether columns are priced again (see above).
- Pavilion / freestanding "extra electrical": which item and price?
- Hip: confirm LVL + engineering are on top of the 3000; flat ceiling price.
- ScreenEze separate line on Wall tie / Patio: $3 or $5 per SF?
- Inclusion lists for open vs ScreenEze porches (for scope text).
- Which items does the customer see vs internal only?
- Cost side: internal cost per line for margin tracking, or sell price only?
