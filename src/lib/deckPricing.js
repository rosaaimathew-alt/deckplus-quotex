// ── Deck pricing — the Deck Plus price list ("Deck" tab), line for line ──────
// Every price is the catalog item of the same name (so the office changes a
// price in one place); the numbers here are the price-list values, used only
// when the catalog has no such item. Areas follow the sheet's columns:
//   L/F Out × L/F Across = Total S/F × $ per S/F = Price
// Steps are Out × Across × 1.5 (the sheet's step factor — risers + treads).

export const STEP_FACTOR = 1.5
export const RISER_MAX_IN = 7.5          // riser height → suggested step count
export const TREAD_IN = 11               // tread depth → suggested run-out

// Collections: catalog family + which pieces the price list sells + $/SF.
// `redeck` is the Re-Deck item (includes demo / reset of existing joists).
export const DECK_COLLECTIONS = [
  { key: 'PT',                       group: 'Wood',            fam: 'PT',                                 rate: 33,   steps: true,  landing: true,  redeck: { item: 'PT Re-Deck (includes demo only)', rate: 18 },  fascia: null },
  { key: 'Trex ENHANCE',             group: 'Trex',            fam: 'Trex ENHANCE',                       rate: 48.4, steps: true,  landing: true,  redeck: { item: 'Trex Enhance Re-Deck', rate: 31.9 },          fascia: 'trex' },
  { key: 'Trex TRANSCEND',           group: 'Trex',            fam: 'Trex TRANSCEND',                     rate: 61.6, steps: true,  landing: true,  redeck: { item: 'Trex Transcend Re-Deck', rate: 42.9 },        fascia: 'trex' },
  { key: 'Trex LINEAGE',             group: 'Trex',            fam: 'Trex LINEAGE',                       rate: 61.6, steps: true,  landing: true,  redeck: { item: 'Trex Lineage Re-Deck', rate: 47.3 },          fascia: 'trex' },
  { key: 'Trex SIGNATURE',           group: 'Trex',            fam: 'Trex SIGNATURE',                     rate: 73.7, steps: true,  landing: true,  redeck: null,                                                    fascia: 'trexsig' },
  { key: 'TimberTech PRIME/+',       group: 'TimberTech',      fam: 'TimberTech PRIME/+',                 rate: 48.4, steps: true,  landing: true,  redeck: { item: 'TimberTech Prime+ Re-Deck', rate: 35.2 },     fascia: 'ttc' },
  { key: 'TimberTech TERRAIN/+',     group: 'TimberTech',      fam: 'TimberTech TERRAIN/+',               rate: 52.8, steps: true,  landing: true,  redeck: { item: 'TimberTech Terrain+ Re-Deck', rate: 37.4 },   fascia: 'ttc' },
  { key: 'TimberTech RESERVE',       group: 'TimberTech',      fam: 'TimberTech RESERVE',                 rate: 56.1, steps: true,  landing: true,  redeck: { item: 'TimberTech Reserve Re-Deck', rate: 42.9 },    fascia: 'ttc' },
  { key: 'TimberTech HARVEST PVC',   group: 'TimberTech PVC',  fam: 'TimberTech HARVEST PVC',             rate: 62.7, steps: true,  landing: true,  redeck: null, fascia: 'ttp' },
  { key: 'TimberTech LANDMARK PVC',  group: 'TimberTech PVC',  fam: 'TimberTech LANDMARK PVC',            rate: 62.7, steps: true,  landing: true,  redeck: null, fascia: 'ttp' },
  { key: 'TimberTech VINTAGE PVC',   group: 'TimberTech PVC',  fam: 'TimberTech VINTAGE PVC',             rate: 66,   steps: true,  landing: true,  redeck: null, fascia: 'ttp' },
  { key: 'TimberTech PVC MULTI WIDTH 7.25"/3.5"', group: 'TimberTech PVC', fam: 'TimberTech PVC MULTI WIDTH 7.25"/3.5"', rate: 70, steps: false, landing: true,  redeck: null, fascia: 'ttp' },
  { key: 'TimberTech PVC 2" MAX',    group: 'TimberTech PVC',  fam: 'TimberTech PVC 2" MAX',              rate: 78,   steps: true,  landing: false, redeck: null, fascia: 'ttp' },
  { key: 'TimberTech PVC 3.5" (NARROW)', group: 'TimberTech PVC', fam: 'TimberTech PVC 3.5" (NARROW)',    rate: 78,   steps: false, landing: true,  redeck: null, fascia: 'ttp' },
  { key: 'TimberTech PVC 7.25" (WIDE)',  group: 'TimberTech PVC', fam: 'TimberTech PVC 7.25" (WIDE)',     rate: 80,   steps: false, landing: true,  redeck: null, fascia: 'ttp' },
  { key: 'TimberTech VINTAGE T&G',   group: 'TimberTech PVC',  fam: 'TimberTech VINTAGE T&G',             rate: 80.3, steps: true,  landing: true,  redeck: null, fascia: 'ttp' },
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
  { key: 'TimberTech Alum. Railing',                        rate: 145.2 },
  { key: 'TimberTech Railing BETWEEN POSTS ONLY',           rate: 78.1 },
  { key: 'Iron Rod Railing LF',                             rate: 0, custom: true },   // "Custom" on the sheet
]
export const BRONZE_BALUSTERS = { item: 'BRONZE balusters (special order) ADD LF', rate: 6 }

// Fascia — $ per LF. "Matching" picks the collection's own fascia.
export const DECK_FASCIA = {
  pvcwhite: { item: 'PVC WHITE FASCIA LF',                     rate: 13 },
  trex:     { item: 'TREX ENHANCE/TRANSCEND/LINEAGE FASCIA LF', rate: 27.5 },
  trexsig:  { item: 'TREX SIGNATURE FASCIA LF',                rate: 35.2 },
  ttc:      { item: 'TimberTech COMPOSITE FASCIA LF',          rate: 22 },
  ttp:      { item: 'TimberTech PVC FASCIA LF',                rate: 33 },
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
  border1:     { item: '1-Board border SF',                                   rate: 3 },
  border2:     { item: '2-boards border SF',                                  rate: 6 },
  boxstep:     { item: 'Box steps PER STEP',                                  rate: 100 },
  cortexComp:  { item: 'TimberTech COMPOSITE cortex (UP TO 15 STEPS)',        rate: 550 },
  cortexPvc:   { item: 'TimberTech PVC cortex (UP TO 15 STEPS)',              rate: 660 },
  high:        { item: "Deck above 8' high - add",                            rate: 5 },
  freestand:   { item: 'Free standing deck',                                  rate: 5 },
  lvl:         { item: 'PT LVL (Framing) LF',                                 rate: 150 },
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

// Suggested steps for a height in feet (7.5" max riser).
export const stepsForHeight = (heightFt) => num(heightFt) > 0 ? Math.ceil((num(heightFt) * 12) / RISER_MAX_IN) : 0
// Suggested run-out (ft, rounded up to the half foot) for that many steps.
export const runOutForSteps = (steps) => steps > 0 ? Math.ceil((steps * TREAD_IN) / 6) / 2 : 0

// The measurements the price is built from.
//   deck: W × D ft, plus bump-outs [{ width, depth }] (width = side on the deck)
//   stairs: [{ out, across, steps }]   landings: [{ width, depth }]
export function deckTakeoff({ width, depth, sections = [], stairs = [], landings = [] }) {
  const W = num(width), D = num(depth)
  const sectionSF = sections.reduce((s, x) => s + num(x.width) * num(x.depth), 0)
  const deckSF    = W * D + sectionSF
  // Open sides: the two sides and the front — not the house side — plus the two
  // sides of each bump-out (its front replaces deck edge it covers).
  const openLF    = (W > 0 || D > 0 ? 2 * D + W : 0) + sections.reduce((s, x) => s + 2 * num(x.depth), 0)
  const stepSF    = stairs.reduce((s, x) => s + num(x.out) * num(x.across) * STEP_FACTOR, 0)
  const stairRailLF = stairs.reduce((s, x) => s + 2 * num(x.out), 0)   // rail down both sides
  const stepCount = stairs.reduce((s, x) => s + num(x.steps), 0)
  const landingSF = landings.reduce((s, x) => s + num(x.width) * num(x.depth), 0)
  return { deckSF, sectionSF, openLF, stepSF, stairRailLF, stepCount, landingSF }
}
