// ── Porch Builder — pricing engine ───────────────────────────────────────────
// Pure functions, no React. The rules come from docs/PORCH_BUILDER_SPEC.md;
// every number here is a DEFAULT the office edits in Item Catalog → Formulas
// (stored per org as `porchBuildRates`). Cost is unknown for now and starts at 0.
//
//   computePorchBuild(inputs, rates) → { lines, groups, total, cost, area, layout }
//
// Quantities that follow decking-board logic (porch floor upgrades, steps,
// landings) are linear feet of board, exactly like the deck tool, because
// per-SF pricing drifts from the boards actually bought on a deep porch.

export const BOARD_FACE_IN  = 5.5    // 1×6 decking face width → 12/5.5 LF of board per SF
export const RISER_MAX_IN   = 8.25   // max riser → step count from deck height
export const LANDING_SF     = 16     // one landing = 4′×4′ of decking

// ── Groups shown to the customer (one line each on the proposal) ─────────────
export const PORCH_BUILD_GROUPS = [
  { key: 'structure',   label: 'Porch structure' },
  { key: 'enclosure',   label: 'Enclosure' },
  { key: 'roofceiling', label: 'Roof & ceiling options' },
  { key: 'finishes',    label: 'Walls & finishes' },
  { key: 'flooring',    label: 'Flooring' },
  { key: 'stepsrail',   label: 'Steps, landings & railing' },
  { key: 'electrical',  label: 'Electrical' },
]

// ── Rate table defaults (sell price; cost 0 until the office fills it in) ────
const R = (label, unit, rate, group, extra = {}) => ({ label, unit, rate, cost: 0, group, ...extra })

export const PORCH_BUILD_DEFAULTS = {
  // Base matrix — $/SF of floor area. Eze-Breeze porches use the OPEN rows.
  base_screen_wall_deck:  R('ScreenEze porch · wall tie · on new PT deck',  'SF', 80, 'structure', { base: true }),
  base_screen_roof_deck:  R('ScreenEze porch · roof tie · on new PT deck',  'SF', 90, 'structure', { base: true }),
  base_screen_wall_patio: R('ScreenEze porch · wall tie · on patio',        'SF', 72, 'structure', { base: true }),
  base_screen_roof_patio: R('ScreenEze porch · roof tie · on patio',        'SF', 80, 'structure', { base: true }),
  base_open_wall_deck:    R('Open porch · wall tie · on new PT deck',       'SF', 77, 'structure', { base: true }),
  base_open_roof_deck:    R('Open porch · roof tie · on new PT deck',       'SF', 87, 'structure', { base: true }),
  base_open_wall_patio:   R('Open porch · wall tie · on patio',             'SF', 67, 'structure', { base: true }),
  base_open_roof_patio:   R('Open porch · roof tie · on patio',             'SF', 77, 'structure', { base: true }),

  // Structural add-ons
  freestanding_add:   R('Freestanding structure add',                      'SF', 7,    'structure'),
  deck_over_8:        R('Deck above 8′ high add',                          'SF', 5,    'structure'),
  pt_lvl:             R('PT LVL framing (porch depth)',                     'LF', 150,  'structure'),
  lvl_engineering:    R('LVL engineering (every LVL project)',              'LS', 1000, 'structure'),
  gable_over_19:      R('Gable / semi-vaulted wider than 19′ add',         'LS', 1000, 'structure'),
  hip_roof:           R('Hip roof',                                         'LS', 3000, 'structure'),
  hot_tub_reinforce:  R('Reinforce deck for hot tub / porch',               'LS', 2000, 'structure'),
  bracing_plate:      R('Engineered metal bracing plate (per post)',        'EA', 750,  'structure'),
  bracing_letter:     R('Engineered metal bracing letter',                  'LS', 1250, 'structure'),
  porch_wrap:         R('Open porch wrap / LVL engineer charge',            'LS', 3000, 'structure'),
  roof_cricket:       R('Roof cricket',                                     'LS', 865,  'structure'),
  seed_straw:         R('Seed and straw',                                   'LS', 250,  'structure'),

  // Enclosure
  screeneze_upcharge: R('ScreenEze screens',                               'SF', 3,    'enclosure'),
  lam_column_pkg:     R('6×6 laminated column package',                     'LS', 2000, 'enclosure'),
  eze_window:         R('Eze-Breeze window unit',                           'EA', 700,  'enclosure'),
  eze_transom:        R('Eze-Breeze transom (wall over 105″)',              'EA', 130,  'enclosure'),
  door_tradewinds:    R('Larsen Tradewinds door',                           'EA', 750,  'enclosure', { door: true }),
  door_tradewinds_premium: R('Larsen Tradewinds Premium door',              'EA', 850,  'enclosure', { door: true }),
  door_savannah:      R('Larsen Savannah door',                             'EA', 650,  'enclosure', { door: true }),
  door_savannah_pet:  R('Larsen Savannah Pet door',                         'EA', 815,  'enclosure', { door: true }),
  glass_gable_end:    R('Glass in gable end (gable roofs only)',            'EA', 975,  'enclosure'),

  // Roof & ceiling options
  roof_membrane:      R('Roof membrane / flat roof',                        'SF', 10.5, 'roofceiling', { option: true }),
  metal_roof:         R('Metal roof',                                       'SF', 13,   'roofceiling', { option: true }),
  tg_ceiling:         R('T&G ceiling 1×6',                                  'SF', 12,   'roofceiling', { option: true }),
  flat_ceiling:       R('Flat ceiling',                                     'SF', 5,    'roofceiling', { option: true }),
  coffered_ceiling:   R('Coffered ceiling',                                 'SF', 18,   'roofceiling', { option: true }),
  corbels:            R('Corbels',                                          'EA', 500,  'roofceiling', { option: true }),
  gable_trim:         R('Wagon-wheel gable trim',                           'LS', 800,  'roofceiling', { option: true }),
  skylight:           R('Skylight 4′×2′',                                   'EA', 1250, 'roofceiling', { option: true }),
  faux_beam:          R('Faux beam',                                        'LF', 28,   'roofceiling', { option: true }),
  gable_dormer:       R('Gable dormer',                                     'LS', 3200, 'roofceiling', { option: true }),

  // Walls & finishes
  shiplap_wood:       R('Shiplap wood 1×6 wall',                            'SF', 12,   'finishes', { option: true }),
  shiplap_mdf:        R('Shiplap MDF 1×6 wall',                             'SF', 10,   'finishes', { option: true }),
  knee_wall:          R('Knee wall, Hardie / ply-beaded',                   'SF', 29,   'finishes', { option: true }),
  tv_wall:            R('TV wall, shiplap / siding / paint (5′×9′)',        'LS', 2700, 'finishes', { option: true }),
  paint_porch_patio:  R('Paint/stain porch on patio',                       'SF', 12,   'finishes'),
  paint_porch_composite: R('Paint/stain porch on composite / PVC deck',     'SF', 14,   'finishes'),
  paint_porch_deck:   R('Paint/stain porch on PT deck',                     'SF', 15,   'finishes'),
  paint_pt_deck:      R('Paint/stain PT deck',                              'SF', 13,   'finishes', { option: true }),
  paint_trex_hybrid_rail: R('Paint/stain Trex deck, hybrid rail',           'LF', 8.12, 'finishes', { option: true }),
  paint_trex_rail:    R('Paint/stain Trex deck, Trex rail',                 'LF', 6.16, 'finishes', { option: true }),

  // Flooring (Trex porch-floor upgrades are per LF of board over the PT floor)
  floor_trex_enhance:   R('Trex Enhance porch floor upgrade',               'LF', 3.85, 'flooring', { floor: true }),
  floor_trex_transcend: R('Trex Transcend porch floor upgrade',             'LF', 8.8,  'flooring', { floor: true }),
  pt_plywood:           R('PT plywood',                                     'SF', 4.5,  'flooring', { floor: true }),
  lvt:                  R('LVT flooring only',                              'SF', 26,   'flooring', { floor: true }),
  lvt_concrete:         R('LVT on concrete',                                'SF', 23,   'flooring', { floor: true }),
  tile:                 R('Tile flooring only',                             'SF', 29,   'flooring', { floor: true }),
  tile_deck:            R('Tile flooring on deck',                          'SF', 36,   'flooring', { floor: true }),
  tile_membrane:        R('Tile with plywood / membrane upgrade',           'SF', 44,   'flooring', { floor: true }),
  concrete_4:           R('Concrete 4″',                                    'SF', 17,   'flooring', { concrete: true }),
  concrete_small:       R('Concrete slab under 200 SF',                     'SF', 30,   'flooring', { concrete: true }),
  concrete_reinforced:  R('Reinforced concrete 4″ (mesh / underlayment)',   'SF', 20,   'flooring', { concrete: true }),
  concrete_access:      R('Concrete + hill / driveway / house access',      'SF', 20,   'flooring', { concrete: true }),

  // Steps & landings — per LF of decking board
  steps_pt:               R('PT steps',                        'LF', 17.5,  'stepsrail', { steps: 'PT wood' }),
  landing_pt:             R('PT landing',                      'LF', 17.5,  'stepsrail', { landing: 'PT wood' }),
  steps_trex_enhance:     R('Trex Enhance steps',              'LF', 24.2,  'stepsrail', { steps: 'Trex Enhance' }),
  landing_trex_enhance:   R('Trex Enhance landing',            'LF', 24.2,  'stepsrail', { landing: 'Trex Enhance' }),
  steps_trex_transcend:   R('Trex Transcend steps',            'LF', 17.6,  'stepsrail', { steps: 'Trex Transcend' }),
  landing_trex_transcend: R('Trex Transcend landing',          'LF', 30.8,  'stepsrail', { landing: 'Trex Transcend' }),
  steps_trex_lineage:     R('Trex Lineage steps',              'LF', 30.8,  'stepsrail', { steps: 'Trex Lineage' }),
  landing_trex_lineage:   R('Trex Lineage landing',            'LF', 30.8,  'stepsrail', { landing: 'Trex Lineage' }),
  steps_trex_signature:   R('Trex Signature steps',            'LF', 30.8,  'stepsrail', { steps: 'Trex Signature' }),
  landing_trex_signature: R('Trex Signature landing',          'LF', 36.85, 'stepsrail', { landing: 'Trex Signature' }),
  steps_tt_prime:         R('TimberTech Prime/Prime+ steps',   'LF', 24.2,  'stepsrail', { steps: 'TimberTech Prime' }),
  landing_tt_prime:       R('TimberTech Prime/Prime+ landing', 'LF', 24.2,  'stepsrail', { landing: 'TimberTech Prime' }),
  steps_tt_terrain:       R('TimberTech Terrain/+ steps',      'LF', 26.4,  'stepsrail', { steps: 'TimberTech Terrain' }),
  landing_tt_terrain:     R('TimberTech Terrain/+ landing',    'LF', 26.4,  'stepsrail', { landing: 'TimberTech Terrain' }),
  steps_tt_reserve:       R('TimberTech Reserve steps',        'LF', 28.05, 'stepsrail', { steps: 'TimberTech Reserve' }),
  landing_tt_reserve:     R('TimberTech Reserve landing',      'LF', 28.05, 'stepsrail', { landing: 'TimberTech Reserve' }),
  steps_tt_harvest:       R('TimberTech Harvest PVC steps',    'LF', 29.5,  'stepsrail', { steps: 'TimberTech Harvest PVC' }),
  landing_tt_harvest:     R('TimberTech Harvest PVC landing',  'LF', 29.5,  'stepsrail', { landing: 'TimberTech Harvest PVC' }),
  steps_tt_landmark:      R('TimberTech Landmark PVC steps',   'LF', 31.35, 'stepsrail', { steps: 'TimberTech Landmark PVC' }),
  landing_tt_landmark:    R('TimberTech Landmark PVC landing', 'LF', 31.35, 'stepsrail', { landing: 'TimberTech Landmark PVC' }),
  steps_tt_vintage_pvc:   R('TimberTech Vintage PVC steps',    'LF', 33,    'stepsrail', { steps: 'TimberTech Vintage PVC' }),
  landing_tt_vintage_pvc: R('TimberTech Vintage PVC landing',  'LF', 33,    'stepsrail', { landing: 'TimberTech Vintage PVC' }),
  steps_tt_vintage_tg:    R('TimberTech Vintage T&G steps',    'LF', 40.15, 'stepsrail', { steps: 'TimberTech Vintage T&G' }),
  landing_tt_vintage_tg:  R('TimberTech Vintage T&G landing',  'LF', 40.15, 'stepsrail', { landing: 'TimberTech Vintage T&G' }),

  // Railing — per LF
  rail_wood_2x2:            R('2×2 pickets wood rail',                       'LF', 17,    'stepsrail', { rail: true }),
  rail_hybrid_wood:         R('Hybrid railing, wood cap',                    'LF', 19,    'stepsrail', { rail: true }),
  rail_hybrid_trex:         R('Hybrid railing, Trex cap',                    'LF', 30.8,  'stepsrail', { rail: true }),
  rail_trex_transcend:      R('Trex Transcend railing',                      'LF', 170.5, 'stepsrail', { rail: true }),
  rail_trex_select:         R('Trex Select railing (white only)',            'LF', 121,   'stepsrail', { rail: true }),
  rail_trex_signature:      R('Trex Signature aluminum railing',             'LF', 142,   'stepsrail', { rail: true }),
  rail_trex_signature_between: R('Trex Signature aluminum, between posts',   'LF', 86,    'stepsrail', { rail: true }),
  rail_tt_alum:             R('TimberTech aluminum railing',                 'LF', 145.2, 'stepsrail', { rail: true }),
  rail_tt_between:          R('TimberTech railing, between posts',           'LF', 78.1,  'stepsrail', { rail: true }),

  // Deck fascia — per LF
  fascia_pvc:            R('PVC white fascia',                           'LF', 13,   'stepsrail', { fascia: true }),
  fascia_trex:           R('Trex Enhance / Transcend / Lineage fascia',  'LF', 27.5, 'stepsrail', { fascia: true }),
  fascia_trex_signature: R('Trex Signature fascia',                      'LF', 35.2, 'stepsrail', { fascia: true }),
  fascia_tt_composite:   R('TimberTech composite fascia',                'LF', 22,   'stepsrail', { fascia: true }),
  fascia_tt_pvc:         R('TimberTech PVC fascia',                      'LF', 33,   'stepsrail', { fascia: true }),

  // Deck upgrades
  box_step:      R('Box steps',                                 'EA', 100,  'stepsrail', { option: true }),
  post_8x8:      R('8×8 solid posts',                           'EA', 350,  'stepsrail', { option: true }),
  trex_gate:     R('Trex aluminum gate',                        'EA', 1375, 'stepsrail', { option: true }),
  privacy_wall:  R('Privacy wall',                              'SF', 21,   'stepsrail', { option: true }),
  lattice_sheet: R('Engineered lattice, stained (4×8 sheet)',   'EA', 270,  'stepsrail', { option: true }),
  skirt_pt:      R('PT skirt, stained',                         'SF', 10,   'stepsrail', { option: true }),
  skirt_trex:    R('Trex skirt',                                'SF', 33,   'stepsrail', { option: true }),
  border_1:      R('1-board border',                            'LF', 3,    'stepsrail', { option: true }),
  border_2:      R('2-board border',                            'LF', 6,    'stepsrail', { option: true }),

  // Electrical — packages (pick one) from the Porch price list
  elec_simple:   R('SIMPLE electric package (1 fan / 1 flood / 1 outlet)',                       'LS', 1850, 'electrical', { elecPkg: true }),
  elec_standard: R('STANDARD electric package (1 fan / 4 lights / 1 flood / 1 outlet)',          'LS', 3150, 'electrical', { elecPkg: true }),
  elec_3s_min:   R('3-SEASON MINIMUM electric package (1 fan / 1 flood / 5 outlets)',            'LS', 2250, 'electrical', { elecPkg: true }),
  elec_3s_gold:  R('3-SEASON GOLD electric package (1 fan / 1 flood / 4 lights / dimmer / 5 outlets)', 'LS', 3500, 'electrical', { elecPkg: true }),
  elec_12v:      R('Outdoor electric package 12v (1 fan / 4 lights)',                            'LS', 3900, 'electrical', { elecPkg: true }),
  // Electrical — extras (quantity)
  elec_trench:        R('Trench power line',                  'LF', 30,   'electrical', { option: true }),
  elec_arc:           R('Extra ARC fault circuit',            'EA', 500,  'electrical', { option: true }),
  elec_pavilion_panel:R('Pavilion extra panel',               'EA', 1900, 'electrical', { option: true }),
  elec_fan:           R('Extra ceiling fan',                  'EA', 300,  'electrical', { option: true }),
  elec_outlet:        R('Extra outlet',                       'EA', 180,  'electrical', { option: true }),
  elec_gfi:           R('GFI outlet',                         'EA', 250,  'electrical', { option: true }),
  elec_30amp:         R('30 AMP outlet (home run)',           'EA', 800,  'electrical', { option: true }),
  elec_flood:         R('Extra flood light',                  'EA', 350,  'electrical', { option: true }),
  elec_can:           R('Extra can light',                    'EA', 240,  'electrical', { option: true }),
  elec_can_bronze:    R('Can light bronze upgrade',           'EA', 40,   'electrical', { option: true }),
  elec_switch:        R('Extra switch',                       'EA', 125,  'electrical', { option: true }),
  elec_dimmer:        R('Dimmer switch',                      'EA', 170,  'electrical', { option: true }),
  elec_sconce:        R('Sconce / pendant light wiring',      'EA', 240,  'electrical', { option: true }),
  elec_crown:         R('3 5/8″ inverted crown molding',      'LF', 17,   'electrical', { option: true }),
  elec_rope:          R('Rope lighting',                      'LF', 12.5, 'electrical', { option: true }),
  elec_tv:            R('TV / cable jack',                    'EA', 200,  'electrical', { option: true }),
  elec_cat5:          R('Cat 5 internet cable',               'EA', 425,  'electrical', { option: true }),
  elec_lv_transformer:R('Low-voltage transformer / outlet',   'EA', 750,  'electrical', { option: true }),
  elec_riser_stair:   R('Riser stair light',                  'EA', 125,  'electrical', { option: true }),
  elec_post_light:    R('Post light, moon-shape LED',         'EA', 200,  'electrical', { option: true }),
  elec_cap_light:     R('Cap light for sleeved post',         'EA', 380,  'electrical', { option: true }),
  elec_lv_dimmer:     R('Dimmer for low voltage',             'EA', 330,  'electrical', { option: true }),
  elec_riser:         R('Riser light',                        'EA', 125,  'electrical', { option: true }),
  elec_heater_black:  R('Infratech heater 5000W 40″ SS, black',    'EA', 2500, 'electrical', { option: true }),
  elec_heater_recess: R('Infratech heater 5000W 40″ SS, recessed', 'EA', 5000, 'electrical', { option: true }),
  elec_heater_color:  R('Infratech custom color add',         'EA', 1000, 'electrical', { option: true }),
  elec_fan_ucs:       R('Fan with switch (pergola / UCS system)', 'EA', 1500, 'electrical', { option: true }),
  elec_can_ucs:       R('Can lights for UCS system',          'EA', 310,  'electrical', { option: true }),
  elec_coach:         R('Coach light replacement',            'EA', 75,   'electrical', { option: true }),
  elec_fan_replace:   R('Fan replacement',                    'EA', 215,  'electrical', { option: true }),
}

// Scope-of-work starting text per porch type. Placeholders until Deck Plus
// supplies the real inclusion lists; the office edits these in Formulas.
export const PORCH_BUILD_SCOPE_DEFAULTS = {
  open: [
    'Set concrete footings and 6×6 pressure-treated support posts.',
    'Frame the porch roof and tie it into the house as specified.',
    'Install roof sheathing, synthetic underlayment and shingles to match the house.',
  ].join('\n'),
  screen: [
    'Set concrete footings and 6×6 pressure-treated support posts.',
    'Frame the porch roof and tie it into the house as specified.',
    'Install roof sheathing, synthetic underlayment and shingles to match the house.',
    'Enclose the porch with the ScreenEze screen system.',
  ].join('\n'),
  ezebreeze: [
    'Set concrete footings and laminated 6×6 support columns.',
    'Frame the porch roof and tie it into the house as specified.',
    'Install roof sheathing, synthetic underlayment and shingles to match the house.',
    'Enclose the porch with Eze-Breeze 4-track vinyl window units.',
  ].join('\n'),
}

export const PORCH_TYPES = [
  { key: 'open',      label: 'Open porch',       category: 'Open Porches' },
  { key: 'screen',    label: 'ScreenEze porch',  category: 'Screen Porches' },
  { key: 'ezebreeze', label: 'Eze-Breeze porch', category: 'Eze-Breeze Porches' },
]
export const PORCH_TIES   = [
  { key: 'wall', label: 'Wall tie' },
  { key: 'roof', label: 'Roof tie' },
  { key: 'free', label: 'Freestanding (gable only)' },
]
export const PORCH_FLOORS = [
  { key: 'deck',  label: 'New PT deck (included)' },
  { key: 'patio', label: 'Patio / slab' },
]
export const PORCH_ROOFS  = [
  { key: 'shed',  label: 'Shed (standard)' },
  { key: 'gable', label: 'Gable' },
  { key: 'semivault', label: 'Semi Vaulted' },
  { key: 'hip',   label: 'Hip' },
]

// ── Eze-Breeze layout (same reasoning as the porch-conversion tool) ──────────
export const PORCH_WINDOW_MAX_W = 54    // Eze-Breeze unit max width (in)
export const PORCH_WINDOW_GRAB  = 2.5   // frame overlap onto each column (in)
export const PORCH_COL_W        = 5.5   // 6×6 column width (in)
export const PORCH_WINDOW_MAX_H = 105   // over this wall height → transom per window
export const PORCH_DOOR_W       = 36    // exit-door opening (in)
const PORCH_CLEAR_SPAN = PORCH_WINDOW_MAX_W - 2 * PORCH_WINDOW_GRAB   // 49″ of wall per window
const PORCH_MODULE     = PORCH_CLEAR_SPAN + PORCH_COL_W               // 54.5″ per window+column

// Windows + columns on a wall of length L (inches). A column bounds every opening
// (window OR door) on both ends, so N openings need N+1 columns. Fewest windows
// that fit (each ≤ 49″), all sized equally.
export function porchWall(Lin, doorCount = 0) {
  const L = Math.max(0, Lin)
  const avail = L - PORCH_DOOR_W * doorCount - PORCH_COL_W * (doorCount + 1)
  const windows = avail > 0 ? Math.ceil(avail / PORCH_MODULE) : 0
  const columns = windows + doorCount + 1
  const winSpan = L - PORCH_DOOR_W * doorCount - PORCH_COL_W * columns
  const winWidth = windows > 0 ? winSpan / windows : 0
  return { windows, columns, winWidth }
}

export function porchLayout(Wft, Dft, { doors = 0, sides = 'Front + 2 sides' } = {}) {
  const wallSet = sides === 'All 4 walls' ? [Wft, Dft, Wft, Dft] : sides === 'Front only' ? [Wft] : [Wft, Dft, Dft]
  const layout = wallSet.map((ln, i) => porchWall(ln * 12, i === 0 ? doors : 0))
  const totalWindows = layout.reduce((s, w) => s + w.windows, 0)
  const rawColumns   = layout.reduce((s, w) => s + w.columns, 0)
  const sharedCorners = sides === 'All 4 walls' ? 4 : Math.max(0, wallSet.length - 1)
  return { totalWindows, totalColumns: Math.max(0, rawColumns - sharedCorners), walls: layout }
}

// ── Inputs ───────────────────────────────────────────────────────────────────
export const PORCH_BUILD_INPUT_DEFAULTS = {
  width: 16, depth: 14,                 // ft; width runs along the house wall
  type: 'screen', tie: 'wall', floor: 'deck', roof: 'shed',
  deckHeightFt: 3,                      // only when floor = deck
  wallHeightIn: 96, sides: 'Front + 2 sides',   // Eze-Breeze layout
  doors: {},                            // { door_key: qty }
  glassEnds: 0,                         // gable roofs only
  hotTub: false, wrap: false, cricket: false, seedStraw: false, bracingPosts: 0,
  paintPorch: false,
  flooring: null,                       // one flooring key or null
  concrete: null,                       // one concrete key or null (patio only)
  steps: { product: '', stairWidthFt: 4 },
  landings: { product: '', count: 0 },
  railing: { product: '', lf: 0 },
  fascia:  { product: '', lf: null },   // null = auto: the deck's exposed perimeter
  extras: {},                           // { key: qty } for any option: true item
  elecPackage: null,                    // one elecPkg key or null
}

const n = (v) => Number(v) || 0
export const boardLF = (sf) => sf * (12 / BOARD_FACE_IN)

// Exposed deck perimeter: the house side has no fascia, so front + two sides;
// a freestanding porch is open on all four sides.
export function exposedPerimeterFt(inp) {
  const W = n(inp.width), D = n(inp.depth)
  return inp.tie === 'free' ? 2 * (W + D) : W + 2 * D
}

// Build the priced line list from the rep's inputs and the org's rate table.
export function computePorchBuild(input, ratesIn) {
  const inp   = { ...PORCH_BUILD_INPUT_DEFAULTS, ...(input || {}) }
  const rates = { ...PORCH_BUILD_DEFAULTS, ...(ratesIn || {}) }
  const W = n(inp.width), D = n(inp.depth)
  const area = W * D
  const lines = []
  const add = (key, qty, note) => {
    const r = rates[key] || PORCH_BUILD_DEFAULTS[key]
    if (!r || !(qty > 0)) return
    const q = Math.round(qty * 100) / 100
    // Labels aren't editable in Formulas — always use the current wording
    lines.push({ key, label: PORCH_BUILD_DEFAULTS[key]?.label || r.label, unit: r.unit, qty: q, rate: n(r.rate), cost: n(r.cost),
                 total: q * n(r.rate), costTotal: q * n(r.cost), group: r.group, note })
  }

  // Freestanding forces a gable roof (confirmed rule).
  const tie  = inp.tie
  const roof = tie === 'free' ? 'gable' : inp.roof
  const typeForBase = inp.type === 'ezebreeze' ? 'open' : inp.type
  const tieForBase  = tie === 'free' ? 'wall' : tie
  add(`base_${typeForBase}_${tieForBase}_${inp.floor}`, area)

  if (tie === 'free') add('freestanding_add', area)
  if (inp.floor === 'deck' && n(inp.deckHeightFt) > 8) add('deck_over_8', area)

  // Roof style
  if (roof === 'gable' || roof === 'hip') {
    add('pt_lvl', D, 'porch depth')
    add('lvl_engineering', 1)
  }
  // Same over-19′ flat fee for gable and semi-vaulted roofs
  if ((roof === 'gable' || roof === 'semivault') && W > 19) add('gable_over_19', 1)
  if (roof === 'hip') {
    add('hip_roof', 1)
    add('flat_ceiling', area, 'required with hip roof')
  }

  // Enclosure
  const doorQty = Object.values(inp.doors || {}).reduce((s, q) => s + n(q), 0)
  let layout = null
  // ScreenEze porches: screens are charged on their own line, on top of the
  // screen-porch base rate
  if (inp.type === 'screen') add('screeneze_upcharge', area)
  if (inp.type === 'ezebreeze') {
    layout = porchLayout(W, D, { doors: doorQty, sides: inp.sides })
    add('lam_column_pkg', 1)
    add('eze_window', layout.totalWindows)
    if (n(inp.wallHeightIn) > PORCH_WINDOW_MAX_H) add('eze_transom', layout.totalWindows)
  }
  if (inp.type !== 'open') for (const [k, q] of Object.entries(inp.doors || {})) if (rates[k]?.door) add(k, n(q))
  if (roof === 'gable' && n(inp.glassEnds) > 0) add('glass_gable_end', n(inp.glassEnds))

  // Structural toggles
  if (inp.hotTub) add('hot_tub_reinforce', 1)
  if (n(inp.bracingPosts) > 0) { add('bracing_plate', n(inp.bracingPosts)); add('bracing_letter', 1) }
  if (inp.wrap) add('porch_wrap', 1)
  if (inp.cricket) add('roof_cricket', 1)
  if (inp.seedStraw) add('seed_straw', 1)

  // Flooring (one choice) — Trex upgrades are LF of board over the included PT floor
  const fl = inp.flooring
  if (fl && rates[fl]?.floor) add(fl, rates[fl].unit === 'LF' ? boardLF(area) : area)
  const compositeFloor = fl === 'floor_trex_enhance' || fl === 'floor_trex_transcend'
  if (inp.concrete && inp.floor === 'patio' && rates[inp.concrete]?.concrete) {
    const key = inp.concrete === 'concrete_4' && area < 200 ? 'concrete_small' : inp.concrete
    add(key, area)
  }

  // Painting follows the floor type
  if (inp.paintPorch) {
    add(inp.floor === 'patio' ? 'paint_porch_patio' : compositeFloor ? 'paint_porch_composite' : 'paint_porch_deck', area)
  }

  // Steps & landings — LF of decking board, deck-tool logic
  const risers = inp.floor === 'deck' && n(inp.deckHeightFt) > 0 ? Math.ceil(n(inp.deckHeightFt) * 12 / RISER_MAX_IN) : 0
  if (inp.steps?.product && risers > 0) {
    const key = Object.keys(rates).find(k => rates[k].steps === inp.steps.product)
    if (key) add(key, risers * n(inp.steps.stairWidthFt || 4) * 2, `${risers} risers × ${n(inp.steps.stairWidthFt || 4)}′ × 2 boards`)
  }
  if (inp.landings?.product && n(inp.landings.count) > 0) {
    const key = Object.keys(rates).find(k => rates[k].landing === inp.landings.product)
    if (key) add(key, boardLF(n(inp.landings.count) * LANDING_SF), `${n(inp.landings.count)} × ${LANDING_SF} SF of board`)
  }
  if (inp.railing?.product && n(inp.railing.lf) > 0 && rates[inp.railing.product]?.rail) add(inp.railing.product, n(inp.railing.lf))
  // Fascia follows the deck's exposed perimeter unless the rep overrides the LF.
  const fasciaLF = inp.fascia?.lf == null || inp.fascia.lf === '' ? exposedPerimeterFt(inp) : n(inp.fascia.lf)
  if (inp.floor === 'deck' && inp.fascia?.product && fasciaLF > 0 && rates[inp.fascia.product]?.fascia)
    add(inp.fascia.product, fasciaLF, inp.fascia?.lf == null || inp.fascia.lf === '' ? 'exposed perimeter' : undefined)

  // Electrical package (one choice)
  if (inp.elecPackage && rates[inp.elecPackage]?.elecPkg) add(inp.elecPackage, 1)

  // Manual-qty options (ceilings, trim, walls, deck upgrades, electrical extras…). Hip already added the flat ceiling.
  for (const [k, q] of Object.entries(inp.extras || {})) {
    if (!rates[k]?.option) continue
    if (k === 'flat_ceiling' && roof === 'hip') continue
    add(k, n(q))
  }

  const groups = PORCH_BUILD_GROUPS
    .map(g => {
      const gl = lines.filter(l => l.group === g.key)
      return { ...g, lines: gl, total: gl.reduce((s, l) => s + l.total, 0), cost: gl.reduce((s, l) => s + l.costTotal, 0) }
    })
    .filter(g => g.lines.length)
  const total = lines.reduce((s, l) => s + l.total, 0)
  const cost  = lines.reduce((s, l) => s + l.costTotal, 0)
  return { lines, groups, total, cost, area, roof, layout, risers, fasciaLF: exposedPerimeterFt(inp) }
}

// Customer-facing scope: the office's template for the type, then the lines
// this quote adds automatically (size, tie-in, floor, roof, enclosure counts).
export function buildPorchScope(input, result, templates) {
  const inp = { ...PORCH_BUILD_INPUT_DEFAULTS, ...(input || {}) }
  const tpl = (templates || {})[inp.type] ?? PORCH_BUILD_SCOPE_DEFAULTS[inp.type] ?? ''
  const typeLabel = PORCH_TYPES.find(t => t.key === inp.type)?.label || 'Porch'
  const out = []
  out.push(`Build a ${n(inp.width)}′ × ${n(inp.depth)}′ ${typeLabel.toLowerCase()} (${result.area} SF)${inp.floor === 'deck' ? ` on a new pressure-treated deck${n(inp.deckHeightFt) ? ` approximately ${n(inp.deckHeightFt)}′ above grade` : ''}` : ' on the existing patio'}.`)
  out.push(inp.tie === 'free'
    ? 'Freestanding structure with a gable roof.'
    : `${PORCH_ROOFS.find(r => r.key === result.roof)?.label.replace(/ \(.*\)$/, '') || 'Shed'} roof, ${inp.tie === 'roof' ? 'tied into the existing house roof' : 'tied to the house wall'}.`)
  out.push(...String(tpl).split('\n').map(s => s.trim()).filter(Boolean))
  if (result.layout) {
    out.push(`Enclose with ${result.layout.totalWindows} Eze-Breeze window unit${result.layout.totalWindows !== 1 ? 's' : ''} between ${result.layout.totalColumns} laminated 6×6 columns.`)
    if (n(inp.wallHeightIn) > PORCH_WINDOW_MAX_H) out.push(`Install transom units above the windows to fill the ${n(inp.wallHeightIn)}″ wall height.`)
  }
  for (const l of result.lines) {
    if (l.group === 'structure' || l.key === 'eze_window' || l.key === 'eze_transom' || l.key === 'lam_column_pkg' || l.key === 'screeneze_upcharge') continue
    out.push(`${l.label}${l.unit === 'EA' && l.qty > 1 ? ` (${l.qty})` : ''}.`)
  }
  return out.join('\n')
}
