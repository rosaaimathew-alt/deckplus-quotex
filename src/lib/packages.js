// ── Good / Better / Best packages ────────────────────────────────────────────
// Three complete versions of the same project, side by side on the proposal,
// each with its own total; the customer picks one. Our quote is always the
// middle one (Better). Good steps every deck's decking (and railing) one rung
// down the ladders below, Best one rung up, and each is re-priced with the same
// price list (deckLine). The rep can change any pick. Separate from Optional
// upgrades, which are single add-ons under the total.
import { deckLine } from './builderLines'
import { DECK_COLLECTIONS, DECK_RAILS } from './deckPricing'

// Decking ladders, cheapest first. A collection between rungs has its own [down, up].
const DECK_LADDERS = [
  ['PT', 'Trex ENHANCE', 'Trex TRANSCEND', 'Trex SIGNATURE'],
  ['PT', 'TimberTech PRIME/+', 'TimberTech RESERVE', 'TimberTech LANDMARK PVC', 'TimberTech VINTAGE PVC'],
]
const DECK_BETWEEN = {
  'Trex SELECT': ['Trex ENHANCE', 'Trex TRANSCEND'],
  'Trex LINEAGE': ['Trex ENHANCE', 'Trex SIGNATURE'],
  'TimberTech TERRAIN/+': ['TimberTech PRIME/+', 'TimberTech RESERVE'],
  'TimberTech HARVEST PVC': ['TimberTech RESERVE', 'TimberTech VINTAGE PVC'],
  'TimberTech PVC MULTI WIDTH 7.25"/3.5"': ['TimberTech VINTAGE PVC', null],
  'TimberTech PVC 2" MAX': ['TimberTech VINTAGE PVC', null],
  'TimberTech PVC 3.5" (NARROW)': ['TimberTech VINTAGE PVC', null],
  'TimberTech PVC 7.25" (WIDE)': ['TimberTech VINTAGE PVC', null],
  'TimberTech VINTAGE T&G': ['TimberTech VINTAGE PVC', null],
}
// Railing: [down, up]. No railing stays no railing; a rail with no rung keeps itself.
const RAIL_STEPS = {
  '2x2 pickets wood rail': [null, 'Hybrid Railing / trex cap'],
  'Hybrid Railing / wood cap': ['2x2 pickets wood rail', 'Hybrid Railing / trex cap'],
  'Hybrid Railing / trex cap': ['Hybrid Railing / wood cap', 'Trex Select Alum. Railing'],
  'Trex Select Alum. Railing': ['Hybrid Railing / trex cap', 'Trex SIGNATURE Alum. Railing'],
  'Trex SIGNATURE Alum. Railing': ['Trex Select Alum. Railing', null],
  'Trex Select Alum. Railing BETWEEN POSTS ONLY': [null, 'Trex SIGNATURE Alum. Railing BETWEEN POSTS ONLY'],
  'Trex SIGNATURE Alum. Railing BETWEEN POSTS ONLY': ['Trex Select Alum. Railing BETWEEN POSTS ONLY', null],
  'Trex Select Railing WHITE ONLY': [null, 'Trex Transcend Railing'],
  'Trex Transcend Railing': ['Trex Select Railing WHITE ONLY', null],
  'TimberTech Railing BETWEEN POSTS ONLY': [null, 'TimberTech Alum. Railing'],
  'TimberTech Alum. Railing': ['TimberTech Railing BETWEEN POSTS ONLY', null],
}
export const DECKING_CHOICES = DECK_COLLECTIONS.map(c => c.key)
export const RAIL_CHOICES = DECK_RAILS.filter(r => r.key !== 'None' && !r.custom).map(r => r.key)

const RAIL_NAMES = {
  '2x2 pickets wood rail': 'Wood railing, 2×2 pickets', 'Hybrid Railing / wood cap': 'Hybrid railing, wood cap',
  'Hybrid Railing / trex cap': 'Hybrid railing, Trex cap', 'Trex Transcend Railing': 'Trex Transcend railing',
  'Trex Select Railing WHITE ONLY': 'Trex Select railing (white)', 'Trex Select Alum. Railing': 'Trex Select aluminum railing',
  'Trex Select Alum. Railing BETWEEN POSTS ONLY': 'Trex Select aluminum railing (between posts)', 'Trex SIGNATURE Alum. Railing': 'Trex Signature aluminum railing',
  'Trex SIGNATURE Alum. Railing BETWEEN POSTS ONLY': 'Trex Signature aluminum railing (between posts)', 'TimberTech Alum. Railing': 'TimberTech aluminum railing',
  'TimberTech Railing BETWEEN POSTS ONLY': 'TimberTech railing (between posts)', 'TimberTech IRX Cable Rail': 'TimberTech IRX cable railing', 'Iron Rod Railing LF': 'Iron rod railing',
}
export const deckName = (k) => k === 'PT' ? 'Pressure-treated wood'
  : String(k || '').replace(/\b([A-Z]{2,})\b/g, (w) => w[0] + w.slice(1).toLowerCase()).replace(/\/\+$/, '').replace(/ Pvc\b/, ' PVC').replace(/ T&g$/, ' T&G')
export const railName = (k) => !k || k === 'None' ? 'No railing' : RAIL_NAMES[k] || k

export const PACKAGES = [
  { key: 'good', label: 'Good', tag: 'Lowest price' },
  { key: 'better', label: 'Better', tag: 'Your quote' },
  { key: 'best', label: 'Best', tag: 'Top of the line' },
]
const STEP = { good: 0, best: 1 }

function deckStep(collKey, i) {
  if (DECK_BETWEEN[collKey]) return DECK_BETWEEN[collKey][i]
  for (const lad of DECK_LADDERS) {
    const at = lad.indexOf(collKey)
    if (at > 0 || (at === 0 && i === 1)) return lad[at + (i ? 1 : -1)] || null
  }
  return null
}
// What a package suggests for a deck: { collKey, rail } (null collKey = no rung that way)
export function suggestedPick(st = {}, key) {
  const i = STEP[key]
  if (i == null) return { collKey: st.collKey, rail: st.rail }
  const rail = st.rail && st.rail !== 'None' ? (RAIL_STEPS[st.rail]?.[i] || st.rail) : st.rail
  return { collKey: deckStep(st.collKey, i), rail }
}
// The deck's settings in a package: the rep's picks over the suggestion. null = not offered.
export function packageState(st = {}, key, pick = {}) {
  if (key === 'better') return st
  const sug = suggestedPick(st, key)
  const collKey = pick.collKey !== undefined ? pick.collKey : sug.collKey
  if (!collKey) return null
  const rail = st.rail && st.rail !== 'None' ? (pick.rail || sug.rail) : st.rail
  return { ...st, collKey, rail }
}

const isDeck = (l) => l?.builder?.tool === 'deck' && l.builder.state
const sumOf = (ls) => Math.round(ls.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unitPrice) || 0), 0) * 100) / 100

// The quote lines in a package (null when a deck has no rung that way). A deck line
// keeps the rep's own price plus the price-list difference between the two decks,
// so a hand-adjusted price stays adjusted.
export function applyPackage(lines = [], key, ctx = {}, pick = {}) {
  let ok = true
  const out = lines.map(l => {
    if (!isDeck(l)) return l
    const st = l.builder.state, nx = packageState(st, key, pick)
    if (!nx) { ok = false; return l }
    if (nx === st) return l
    const up = deckLine(nx, ctx, l.id), add = up.unitPrice - deckLine(st, ctx, l.id).unitPrice
    return { ...l, ...up, qty: l.qty || 1, section: l.section, mergeInto: l.mergeInto ?? null, hidden: l.hidden,
      unitPrice: Math.round(((Number(l.unitPrice) || 0) + add) * 100) / 100 }
  })
  return ok ? out : null
}
// Each deck in a package, in the customer's words → [{ name, decking, railing }]
export function packageDecks(lines = []) {
  const decks = lines.filter(isDeck)
  return decks.map((l, i) => ({
    name: decks.length > 1 ? `Deck ${i + 1}` : 'Deck',
    decking: deckName(l.builder.state.collKey),
    railing: railName(l.builder.state.rail),
  }))
}

// Good / Better / Best for a quote with a deck on it →
//   [{ key, label, tag, total, decks, lines? }]   (Good and Best carry their own full
//   quote lines, for the contract; Better is the quote itself)
// `finish` adds what sits on top of the lines (permit fees, the discount). `picks` are
// the rep's changes ({ good: { collKey, rail }, best: {…} }). Good is offered only when
// it costs less than the quote and Best only when it costs more; empty when neither is.
export function packageOptions(lines = [], ctx = {}, finish = (ls) => ls, picks = {}) {
  if (!lines.some(isDeck)) return []
  const better = { ...PACKAGES[1], total: sumOf(finish(lines)), decks: packageDecks(lines) }
  const make = (p) => {
    const ls = applyPackage(lines, p.key, ctx, picks[p.key] || {})
    if (!ls) return null
    const full = finish(ls)
    return { ...p, total: sumOf(full), decks: packageDecks(ls), lines: full }
  }
  const good = make(PACKAGES[0]), best = make(PACKAGES[2])
  const out = [good && good.total < better.total ? good : null, better, best && best.total > better.total ? best : null].filter(Boolean)
  return out.length > 1 ? out : []
}

// What the customer's copy carries: no quote lines, only names and totals.
export const customerPackages = (pkgs) => (pkgs || []).filter(p => p && p.key && Number(p.total) > 0)
  .map(p => ({ key: p.key, label: p.label, tag: p.tag || '', total: Number(p.total), decks: p.decks || [] }))
