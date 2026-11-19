// ── A builder's quote line, without its panel ────────────────────────────────
// The Deck Builder and the Porch Builder each turn their settings into ONE
// quote line (price with the JIC built in, scope in the catalog's wording, the
// office's itemized breakdown, and the settings to reopen it). The panels and a
// drawing that writes the quote by itself (lib/drawingQuote.js) both use these,
// so a deck or porch is priced the same way whichever path made it.
import { scopeFor, countWords } from './scopeText'
import { JIC_DEFAULT, jicAmount } from './jic'
import { DECK_COLLECTIONS, DECK_ITEMS, deckTakeoff } from './deckPricing'
import { deckPriceRows } from './deckRows'
import { toBreakdown } from './priceList'
import {
  PORCH_BUILD_DEFAULTS, PORCH_BUILD_INPUT_DEFAULTS, PORCH_TYPES, PORCH_BUILD_GROUPS, computePorchBuild, buildPorchScope,
} from '../porchBuild'

const n = (v) => Number(v) || 0
const ft = (v) => `${n(v)}’`

// What a fresh Deck Builder starts from.
export const DECK_STATE_DEFAULTS = {
  jobType: 'New deck', collKey: 'Trex ENHANCE', width: 20, depth: 16, height: 3, sizeMode: 'dims', areaSF: '', openEdgeLF: '',
  sections: [], stairs: [], landings: [], rail: 'None', bronze: false, fascia: 'None', border: 'None', cortex: 'None',
  skirt: 'None', paint: 'None', freestanding: false, extras: {}, qtyOv: {}, rateOv: {}, jic: JIC_DEFAULT,
}

// The deck's scope, in the catalog's own wording.
export function deckScope(st, rows, catalog, scopeTemplate) {
  const { jobType, collKey, width, depth, sections = [], stairs = [], landings = [], rail, border } = st
  const coll = DECK_COLLECTIONS.find(c => c.key === collKey) || DECK_COLLECTIONS[0]
  const redeck = jobType === 'Re-deck', canRedeck = !!coll.redeck
  const t = deckTakeoff(st)
  const W = n(width), D = n(depth)
  const row = (k) => rows.find(r => r.key === k)
  const lines = (scopeTemplate || '').split('\n').map(s => s.trim()).filter(Boolean)
  const fb = (r, text) => r ? scopeFor(catalog, r.item, { sqft: r.qty, lf: r.qty, count: r.qty }, text) : null
  // An irregular deck (total SF) is sized by its square feet, not W × D.
  const size = t.bySF ? `${t.deckSF} SF` : `${ft(W)}x${ft(D)}`
  const sized = (text) => (t.bySF ? text.replace(/__’x__’/g, size) : text)
  if (redeck && canRedeck) lines.push(sized(scopeFor(catalog, coll.redeck.item, { size: t.bySF ? null : [W, D], sqft: t.deckSF },
    `Remove the existing decking and install new ${coll.key} decking on the existing joists, approximately ${size}.`)))
  else lines.push(sized(scopeFor(catalog, `${coll.fam} Deck`, { size: t.bySF ? null : [W, D] },
    `Build a pressure treated wood deck platform approximately ${size}.\n• ${coll.key} decking as flooring, installed with hidden fasteners.`)))
  if (t.bySF || sections.length) lines.push('Deck layout as per drawing.')
  if (row('border')) lines.push(fb(row('border'), `${border} border.`))
  if (row('fascia')) lines.push(fb(row('fascia'), `${row('fascia').label} around the deck.`))
  for (const s of stairs) {
    const steps = n(s.steps)
    if (steps <= 0) continue
    const text = s.style === 'Box'
      ? scopeFor(catalog, DECK_ITEMS.boxstep.item, { count: steps, width: s.across }, `Approximately ${countWords(steps)} ${ft(s.across)} wide BOX steps to grade.`)
      : scopeFor(catalog, coll.steps ? `${coll.fam} Steps` : null, { count: steps, width: s.across }, `Approximately ${countWords(steps)} ${ft(s.across)} wide steps to grade.`).replace(/^__’x__’ landing and a/, 'A')
    // Runs that meet a landing say so instead of "to grade".
    const toLanding = landings.some(l => l.id === s.to), fromLanding = landings.some(l => l.id === s.from)
    lines.push(toLanding ? text.replace(/ to grade/, fromLanding ? ' down to the next landing' : ' down to the landing')
      : fromLanding ? text.replace(/ to grade/, ' from the landing to grade') : text)
  }
  for (const l of landings) lines.push(scopeFor(catalog, coll.landing ? `${coll.fam} Landing` : null, { size: [l.width, l.depth] }, `${ft(l.width)}x${ft(l.depth)} landing.`))
  if (row('rail')) lines.push(fb(row('rail'), `Install ${rail}.`))
  if (row('bronze')) lines.push(fb(row('bronze'), 'Bronze balusters (special order).'))
  for (const k of ['cortex', 'skirt', 'paint', 'high', 'freestand', 'demoDeck', 'demoConc', 'footings', 'lvl', 'hottub', 'bracePlate', 'braceLetter', 'posts8x8', 'gate', 'privacy']) {
    const r = row(k)
    if (r) lines.push(fb(r, `${r.label}.`))
  }
  return lines.filter(Boolean).join('\n')
}

// The deck's quote line (the Deck Builder's "Add deck to quote").
export function deckLine(state, { catalog = [], customComponents = [], scopeTemplate = '' } = {}, id) {
  const st = { ...DECK_STATE_DEFAULTS, ...state }
  const rows = deckPriceRows(st, catalog, customComponents)
  const price = rows.reduce((s, r) => s + r.line, 0)
  const cost = rows.reduce((s, r) => s + r.lineCost, 0)
  const total = price + jicAmount(st.jic, price)
  const coll = DECK_COLLECTIONS.find(c => c.key === st.collKey) || DECK_COLLECTIONS[0]
  const redeck = st.jobType === 'Re-deck' && !!coll.redeck
  const t = deckTakeoff(st)
  return {
    id, catalogId: null,
    name: `${coll.key} ${redeck ? 'Re-Deck' : 'Open Deck'} — ${t.bySF ? `${t.deckSF} SF` : `${n(st.width)}′×${n(st.depth)}′ (${t.deckSF} SF)`}`,
    section: 'Deck', description: deckScope(st, rows, catalog, scopeTemplate),
    unit: 'EA', qty: 1, unitPrice: Math.round(total), category: 'Decks', costMaterials: Math.round(cost), costSub: 0,
    breakdown: toBreakdown(rows, { jic: st.jic }),
    builder: { tool: 'deck', state: st },
  }
}

// The porch's quote line (the Porch Builder's "Add porch to quote").
export function porchRates(savedRates = {}) {
  const out = {}
  for (const k of Object.keys(PORCH_BUILD_DEFAULTS)) out[k] = { ...PORCH_BUILD_DEFAULTS[k], ...(savedRates[k] || {}) }
  return out
}
export function porchLine(inpIn, { savedRates = {}, scopes, catalog = [], jic = JIC_DEFAULT, extraState = {} } = {}, id) {
  const inp = { ...PORCH_BUILD_INPUT_DEFAULTS, ...inpIn }
  const result = computePorchBuild(inp, porchRates(savedRates))
  const total = result.total + jicAmount(jic, result.total)
  const typeMeta = PORCH_TYPES.find(t => t.key === inp.type) || PORCH_TYPES[0]
  return {
    id, catalogId: null,
    name: `${typeMeta.label} — ${n(inp.width)}′×${n(inp.depth)}′ (${result.area} SF)`,
    section: 'Porch', description: buildPorchScope(inp, result, scopes, catalog).text,
    unit: 'EA', qty: 1, unitPrice: Math.round(total), category: typeMeta.category, costMaterials: Math.round(result.cost), costSub: 0,
    porchBuild: inp,
    breakdown: toBreakdown(result.lines, { jic, groups: PORCH_BUILD_GROUPS }),
    builder: { tool: 'porchbuild', state: { inp, jic, ...extraState } },
  }
}
