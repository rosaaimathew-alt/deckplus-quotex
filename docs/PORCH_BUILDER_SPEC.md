# Porch Builder — working spec

Notes captured while Deck Plus explains how porches are priced. Rules here are
the source of truth for the porch tool; the code follows this file. Anything
marked **?** is still an open question. All rates are sell price unless noted.

## Primary cost drivers (in order)
1. **Size** — width × depth of the porch, priced per square foot (SF).
2. **Roof connection** — wall tie vs roof tie into the house.
3. **Structure / floor** — what the porch sits on: PT deck vs patio (slab).

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

| Add-on                                              | Unit     | Price |
| --------------------------------------------------- | -------- | ----: |
| ScreenEze upcharge                                  | per SF   |     3 |
| 6×6 laminated column package                        | flat     |  2000 |
| Freestanding structure add                          | per SF   |     7 |
| Deck above 8′ high add                              | per SF   |     5 |
| PT LVL (framing)                                    | per LF   |   150 |
| Gable wider than 19′ add                            | flat     |  1000 |
| Reinforce deck for hot tub / porch                  | flat     |  2000 |
| LVL engineering (required on every LVL project)     | flat     |  1000 |
| Engineered metal bracing plate (per post; add letter)| per post|   750 |
| Engineered metal bracing letter                     | flat     |  1250 |
| Open porch wrap / LVL engineer charge               | flat     |  3000 |
| Hip roof (must add flat ceiling)                    | flat     |  3000 |
| Roof cricket                                        | flat     |   865 |
| Seed and straw                                      | flat     |   250 |

Units above are my reading of the sheet (small numbers = per SF, 150 = per LF,
750 = per post, the rest flat). **?** confirm.

### Dependency rules implied by the sheet
- Any PT LVL line → add LVL engineering ($1000) automatically.
- Metal bracing plates → require the bracing letter ($1250).
- Hip roof → require a flat ceiling. **?** is the flat ceiling its own priced line.
- Pavilion → extra LVL + extra electrical.
- Gable width > 19′ → +$1000. **?** "wide" = dimension along the house wall.

## Open questions
- Does "on PT deck" **include building a new PT deck**, or is it a porch on an
  existing deck? If new, how is deck height handled beyond the 8′ adder?
- Is SF the porch **floor area** (width × depth)? Any minimum SF or minimum job?
- What is in the base rate: roofing, ceiling, standard electrical, screen,
  doors, columns, footings, permit? What is always extra?
- ScreenEze upcharge: the screen rows already say ScreenEze — is the $3/SF for
  ScreenEze over a standard spline screen, or something else?
- Freestanding add ($7/SF) vs Pavilion row ($67/SF): when does each apply?
- Roof style: gable vs shed vs hip — is gable/shed a choice with no price
  difference, and hip the only priced one?
- Which items does the **customer see** vs internal only?
- Cost side: do you want internal cost (materials/sub) per line for margin
  tracking, like the deck builder has?
