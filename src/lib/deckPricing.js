// ── Deck pricing — the Deck Plus price list ("Deck" tab), line for line ──────
// Every price is the catalog item of the same name (so the office changes a
// price in one place); the numbers here are the price-list values, used only
// when the catalog has no such item. Areas follow the sheet's columns:
//   L/F Out × L/F Across = Total S/F × $ per S/F = Price
// Steps are # of steps × Across × 1.5 (the sheet's step factor — risers + treads).

export const STEP_FACTOR = 1.5
export const RISER_MAX_IN = 8.25         // riser height → suggested step count
export const TREAD_IN = 11               // tread depth → run-out for the stair rail

// Collections: catalog family + which pieces the price list sells + $/SF.
// `redeck` is the Re-Deck item (includes demo / reset of existing joists).
export const DECK_COLLECTIONS = [
  { key: 'PT',                       group: 'Wood',            fam: 'PT',                                 rate: 33,   steps: true,  landing: true,  redeck: { item: 'PT Re-Deck (includes demo only)', rate: 18 },  fascia: null },
  { key: 'Trex ENHANCE',             group: 'Trex',            fam: 'Trex ENHANCE',                       rate: 48.4, steps: true,  landing: true,  redeck: { item: 'Trex Enhance Re-Deck', rate: 31.9 },          fascia: 'trex' },
  { key: 'Trex TRANSCEND',           group: 'Trex',            fam: 'Trex TRANSCEND',                     rate: 61.6, steps: true,  landing: true,  redeck: { item: 'Trex Transcend Re-Deck', rate: 42.9 },        fascia: 'trex' },
  { key: 'Trex LINEAGE',             group: 'Trex',            fam: 'Trex LINEAGE',                       rate: 61.6, steps: true,  landing: true,  redeck: { item: 'Trex Lineage Re-Deck', rate: 47.3 },          fascia: 'trex' },
  { key: 'Trex SIGNATURE',           group: 'Trex',            fam: 'Trex SIGNATURE',                     rate: 73.7, steps: true,  landing: true,  redeck: null,                                                    fascia: 'trexsig' },
  { key: 'TimberTech PRIME/+',       group: 'TimberTech',      fam: 'TimberTech PRIME/+',                 rate: 50.82, steps: true,  landing: true,  redeck: { item: 'TimberTech Prime+ Re-Deck', rate: 36.96 },     fascia: 'ttc' },
  { key: 'TimberTech TERRAIN/+',     group: 'TimberTech',      fam: 'TimberTech TERRAIN/+',               rate: 55.44, steps: true,  landing: true,  redeck: { item: 'TimberTech Terrain+ Re-Deck', rate: 39.27 },   fascia: 'ttc' },
  { key: 'TimberTech RESERVE',       group: 'TimberTech',      fam: 'TimberTech RESERVE',                 rate: 58.91, steps: true,  landing: true,  redeck: { item: 'TimberTech Reserve Re-Deck', rate: 45.05 },    fascia: 'ttc' },
  { key: 'TimberTech HARVEST PVC',   group: 'TimberTech PVC',  fam: 'TimberTech HARVEST PVC',             rate: 65.84, steps: true,  landing: true,  redeck: null, fascia: 'ttp' },
  { key: 'TimberTech LANDMARK PVC',  group: 'TimberTech PVC',  fam: 'TimberTech LANDMARK PVC',            rate: 65.84, steps: true,  landing: true,  redeck: null, fascia: 'ttp' },
  { key: 'TimberTech VINTAGE PVC',   group: 'TimberTech PVC',  fam: 'TimberTech VINTAGE PVC',             rate: 69.3,   steps: true,  landing: true,  redeck: null, fascia: 'ttp' },
  { key: 'TimberTech PVC MULTI WIDTH 7.25"/3.5"', group: 'TimberTech PVC', fam: 'TimberTech PVC MULTI WIDTH 7.25"/3.5"', rate: 73.5, steps: false, landing: true,  redeck: null, fascia: 'ttp' },
  { key: 'TimberTech PVC 2" MAX',    group: 'TimberTech PVC',  fam: 'TimberTech PVC 2" MAX',              rate: 81.9,   steps: true,  landing: false, redeck: null, fascia: 'ttp' },
  { key: 'TimberTech PVC 3.5" (NARROW)', group: 'TimberTech PVC', fam: 'TimberTech PVC 3.5" (NARROW)',    rate: 81.9,   steps: false, landing: true,  redeck: null, fascia: 'ttp' },
  { key: 'TimberTech PVC 7.25" (WIDE)',  group: 'TimberTech PVC', fam: 'TimberTech PVC 7.25" (WIDE)',     rate: 84,   steps: false, landing: true,  redeck: null, fascia: 'ttp' },
  { key: 'TimberTech VINTAGE T&G',   group: 'TimberTech PVC',  fam: 'TimberTech VINTAGE T&G',             rate: 84.32, steps: true,  landing: true,  redeck: null, fascia: 'ttp' },
]

// Rails — $ per LF.
export const DECK_RAILS = [
  { key: 'None' },
  { key: '2x2 pickets wood rail',                           rate: 17 },
  { key: 'Hybrid Railing / wood cap',                       rate: 19 },
  { key: 'Hybrid Railing / trex cap',                       rate: 30.8 },
  { key: 'Trex Transcend Railing',                          rate: 170.5, trex: true },
  { key: 'Trex Select Railing WHITE ONLY',                  rate: 121,   trex: true },
  { key: 'Trex SIGNATURE Alum. Railing',                    rate: 142,   trex: true },
  { key: 'Trex SIGNATURE Alum. Railing BETWEEN POSTS ONLY', rate: 86,    trex: true },
  { key: 'TimberTech Alum. Railing',                        rate: 152.46 },
  { key: 'TimberTech Railing BETWEEN POSTS ONLY',           rate: 82.01 },
  { key: 'Iron Rod Railing LF',                             rate: 0, custom: true },   // "Custom" on the sheet
]
export const BRONZE_BALUSTERS = { item: 'BRONZE balusters (special order) ADD LF', rate: 6 }

// Fascia — $ per LF. "Matching" picks the collection's own fascia.
export const DECK_FASCIA = {
  pvcwhite: { item: 'PVC WHITE FASCIA LF',                     rate: 13 },
  trex:     { item: 'TREX ENHANCE/TRANSCEND/LINEAGE FASCIA LF', rate: 27.5 },
  trexsig:  { item: 'TREX SIGNATURE FASCIA LF',                rate: 35.2 },
  ttc:      { item: 'TimberTech COMPOSITE FASCIA LF',          rate: 23.1 },
  ttp:      { item: 'TimberTech PVC FASCIA LF',                rate: 34.65 },
}

// Skirting (3 open sides × height). Lattice is sold per 4×8 sheet.
export const DECK_SKIRT_OPTIONS = {
  'None': null,
  'Trex skirt':         { item: 'TREX vertical/horizontal skirt SF',      unit: 'SF', rate: 33 },
  'PT skirt (stained)': { item: 'PT vertical/horizontal skirt STAINED SF', unit: 'SF', rate: 10 },
  'Lattice (stained)':  { item: 'Eng. Lattice STAINED/ per 4x8 sheet',    unit: 'EA', rate: 270, sheetSF: 32 },
}

// Painting — the sheet's three deck rows, $ per SF of deck + steps + landings.
export const DECK_PAINT_OPTIONS = {
  'None': null,
  'PT deck':                  { item: 'Paint/Stain on PT Deck (Deck)',           rate: 10 },
  'Trex deck · hybrid rail':  { item: 'Paint/Stain on TREX Deck HYBRID RAIL SF',  rate: 8.12 },
  'Trex deck · Trex rail':    { item: 'Paint/Stain on TREX Deck TREX RAIL SF',    rate: 6.16 },
}

// Everything else on the sheet, by catalog name.
export const DECK_ITEMS = {
  // Border: no extra material — the price is the extra blocking and labor,
  // $3 per SF of the deck (1- or 2-board alike).
  border1:     { item: '1-Board border SF',                                   rate: 3 },
  border2:     { item: '2-boards border SF',                                  rate: 3 },
  boxstep:     { item: 'Box steps PER STEP',                                  rate: 100 },
  cortexComp:  { item: 'TimberTech COMPOSITE cortex (UP TO 15 STEPS)',        rate: 577.5 },
  cortexPvc:   { item: 'TimberTech PVC cortex (UP TO 15 STEPS)',              rate: 693 },
  high:        { item: "Deck above 8' high - add",                            rate: 5 },
  freestand:   { item: 'Free standing deck',                                  rate: 5 },
  lvl:         { item: 'PT LVL (Framing) LF',                                 rate: 50 },
  hottub:      { item: 'Reinforce deck for hot tub/porch',                    rate: 2000 },
  bracePlate:  { item: 'Engineered metal bracing plate/per post (add letter)', rate: 750 },
  braceLetter: { item: 'Engineered metal bracing LETTER',                     rate: 1250 },
  posts8x8:    { item: '8x8 solid posts',                                     rate: 350 },
  gate:        { item: 'Trex Aluminum Gate',                                  rate: 1375 },
  privacy:     { item: 'Privacy wall SF',                                     rate: 21 },
  demoDeck:    { item: 'Demo Deck and Steps',                                 rate: 6.5 },
  demoConc:    { item: 'Demo concrete',                                       rate: 11 },
  footings:    { item: 'Undermined footings (extra concrete /soil removal)',  rate: 750 },
}

const norm = (x) => String(x || '').toLowerCase().replace(/\s+/g, ' ').trim()

// Price (and cost, for margin) of a catalog item by exact name; the price-list
// value when the catalog doesn't have it.
export function catalogPrice(catalog, name, fallbackRate) {
  const hit = (catalog || []).find(c => norm(c.name) === norm(name))
  const rate = hit && hit.unitPrice != null && hit.unitPrice !== '' ? Number(hit.unitPrice) || 0 : fallbackRate
  const cost = (Number(hit?.costMaterials) || 0) + (Number(hit?.costSub) || 0) || +(rate * 0.62).toFixed(2)
  return { rate, cost }
}

// Spoken / old collection names → a collection key ("trex enhance naturals" →
// "Trex ENHANCE", "pressure treated" → "PT").
export function matchCollection(label) {
  const l = String(label || '').toLowerCase()
  if (!l.trim()) return null
  const rules = [
    [/vintage.*(t&g|tongue)/, 'TimberTech VINTAGE T&G'], [/multi/, 'TimberTech PVC MULTI WIDTH 7.25"/3.5"'],
    [/2"? ?max|\bmax\b/, 'TimberTech PVC 2" MAX'], [/narrow|3\.5/, 'TimberTech PVC 3.5" (NARROW)'], [/wide|7\.25/, 'TimberTech PVC 7.25" (WIDE)'],
    [/transcend/, 'Trex TRANSCEND'], [/lineage/, 'Trex LINEAGE'], [/signature/, 'Trex SIGNATURE'], [/enhance/, 'Trex ENHANCE'],
    [/prime/, 'TimberTech PRIME/+'], [/terrain/, 'TimberTech TERRAIN/+'], [/reserve/, 'TimberTech RESERVE'],
    [/harvest/, 'TimberTech HARVEST PVC'], [/landmark/, 'TimberTech LANDMARK PVC'], [/vintage/, 'TimberTech VINTAGE PVC'],
    [/pressure|pine|\bpt\b|2x6|wood/, 'PT'],
  ]
  const hit = rules.find(([re]) => re.test(l))
  return hit ? hit[1] : null
}

// Collection label → catalog family and its matching fascia item (used by the
// porch tools too).
export function deckFamily(label) {
  const key = matchCollection(label)
  const c = DECK_COLLECTIONS.find(x => x.key === key)
  return c ? { fam: c.fam, fascia: c.fascia ? DECK_FASCIA[c.fascia].item : null } : { fam: null, fascia: null }
}

const num = (v) => Number(v) || 0

// Suggested steps for a height in feet (deck height ÷ 8.25" risers, rounded up).
export const stepsForHeight = (heightFt) => num(heightFt) > 0 ? Math.ceil((num(heightFt) * 12) / RISER_MAX_IN) : 0
// Suggested run-out (ft, rounded up to the half foot) for that many steps.
export const runOutForSteps = (steps) => steps > 0 ? Math.ceil((steps * TREAD_IN) / 6) / 2 : 0

// Fascia down one side of a stair run, along the stringer: each step adds the
// diagonal of an 11″ tread and an 8¼″ riser (13¾″); rounded up to the half foot.
export const STEP_DIAGONAL_IN = Math.hypot(TREAD_IN, RISER_MAX_IN)
export const stairSideFt = (steps) => steps > 0 ? Math.ceil((steps * STEP_DIAGONAL_IN) / 6) / 2 : 0
// Fascia around a landing: its three open sides (front + two sides); the fourth
// side meets the deck or the stairs.
export const landingFasciaFt = (width, depth) => (num(width) > 0 && num(depth) > 0 ? num(width) + 2 * num(depth) : 0)

// A landing's height above grade (ft): what the rep typed, else halfway down
// from the deck (to the half foot).
export const landingHeight = (l, deckH) => (l?.height != null && l.height !== '' ? num(l.height) : Math.round(num(deckH)) / 2)

// A stair run goes from the deck or a landing (`from`: 'deck' | landing id) down
// to grade or a landing (`to`: 'grade' | landing id); its rise is the drop
// between the two. Older runs have neither and go from the deck to grade.
export function stairRise(s, deckH, landings = []) {
  const at = (id) => landings.find(l => l.id === id)
  const top    = s?.from && s.from !== 'deck' && at(s.from) ? landingHeight(at(s.from), deckH) : num(deckH)
  const bottom = s?.to && s.to !== 'grade' && at(s.to) ? landingHeight(at(s.to), deckH) : 0
  return Math.max(0, top - bottom)
}
export const stepsForRun = (s, deckH, landings) => stepsForHeight(stairRise(s, deckH, landings))
// Re-count every run that follows the heights (the rep hasn't typed its steps).
export const autoStairSteps = (stairs, deckH, landings) => stairs.map(s => {
  const steps = s.auto ? stepsForRun(s, deckH, landings) : 0
  return steps > 0 ? { ...s, steps } : s
})
// A new landing goes into the stairs: the lowest run to grade now stops at the
// landing (set halfway down that run unless the rep gave a height), and a run
// of the same width carries on from the landing to grade.
export function linkLanding(stairs, landing, newId, deckH, landings = []) {
  const run = [...stairs].reverse().find(s => !s.to || s.to === 'grade')
  if (!run) return { stairs, landing }
  const top = stairRise({ from: run.from }, deckH, landings)
  const placed = landing.height != null && landing.height !== '' ? landing : { ...landing, height: Math.round(top) / 2 }
  return {
    landing: placed,
    stairs: [
      ...stairs.map(s => (s === run ? { ...s, from: s.from || 'deck', to: landing.id, auto: true } : s)),
      { id: newId, across: run.across, steps: 0, style: run.style || 'Regular', auto: true, from: landing.id, to: 'grade' },
    ],
  }
}
// A landing is removed: runs from it go with it, and runs down to it carry on
// to wherever it led (the next landing, or grade).
export function unlinkLanding(stairs, landingId) {
  const onward = stairs.find(s => s.from === landingId)?.to || 'grade'
  return stairs
    .filter(s => s.from !== landingId)
    .map(s => (s.to === landingId ? { ...s, to: onward === landingId ? 'grade' : onward } : s))
}

// The measurements the price is built from.
//   deck: W × D × H ft, plus bump-outs [{ width, depth }] (width = side on the deck)
//   stairs: [{ across, steps, from, to }]   landings: [{ width, depth, height }]
//   Irregular decks (sizeMode 'sf'): the rep types the total SF and the open
//   edge (LF, every edge not on the house); left blank, the open edge is
//   estimated as three sides of a square of that area.
export function deckTakeoff({ width, depth, height = 0, sections = [], stairs = [], landings = [], sizeMode, areaSF, openEdgeLF }) {
  const bySF = sizeMode === 'sf'
  const W = num(width), D = num(depth)
  const sectionSF = bySF ? 0 : sections.reduce((s, x) => s + num(x.width) * num(x.depth), 0)
  const deckSF    = bySF ? num(areaSF) : W * D + sectionSF
  // Open sides: the two sides and the front — not the house side — plus the two
  // sides of each bump-out (its front replaces deck edge it covers).
  const openLFEstimated = bySF && !(num(openEdgeLF) > 0)
  const openLF    = bySF
    ? (openLFEstimated ? (deckSF > 0 ? Math.round(3 * Math.sqrt(deckSF)) : 0) : num(openEdgeLF))
    : (W > 0 || D > 0 ? 2 * D + W : 0) + sections.reduce((s, x) => s + 2 * num(x.depth), 0)
  const stepSF    = stairs.reduce((s, x) => s + num(x.steps) * num(x.across) * STEP_FACTOR, 0)
  // Rail down both sides of the run (steps × 11″ treads).
  const stairRailLF = stairs.reduce((s, x) => s + 2 * runOutForSteps(num(x.steps)), 0)
  const stepCount = stairs.reduce((s, x) => s + num(x.steps), 0)
  const landingSF = landings.reduce((s, x) => s + num(x.width) * num(x.depth), 0)
  // Fascia beyond the deck: both sides of every stair run, and each landing's open sides.
  const stairFasciaLF   = stairs.reduce((s, x) => s + 2 * stairSideFt(num(x.steps)), 0)
  const landingFasciaLF = landings.reduce((s, x) => s + landingFasciaFt(x.width, x.depth), 0)
  // Landings take railing on the same three open sides, skirting from their own
  // height down to grade, and the over-8′ add when they sit above 8′.
  const landingRailLF  = landingFasciaLF
  const landingSkirtSF = landings.reduce((s, x) => s + landingFasciaFt(x.width, x.depth) * landingHeight(x, height), 0)
  const landingHighSF  = landings.reduce((s, x) => s + (landingHeight(x, height) > 8 ? num(x.width) * num(x.depth) : 0), 0)
  return { bySF, openLFEstimated, deckSF, sectionSF, openLF, stepSF, stairRailLF, stepCount, landingSF, stairFasciaLF, landingFasciaLF, landingRailLF, landingSkirtSF, landingHighSF }
}
