// ── Good / Better / Best: suggested upgrade packages ─────────────────────────
// The quote as built is "Good". For every deck on it (a Deck Builder line), the
// Better and Best packages step the decking and the railing up the ladders
// below, re-price the deck with the same price list (deckLine), and offer the
// difference as an optional upgrade under the total. They follow the quote:
// change the deck and they re-price; a rep can edit one (it then stays as
// typed) or delete it (it stays gone on this quote).
import { deckLine } from './builderLines'

// Decking: [Better, Best] for each collection, within its brand.
export const DECKING_TIERS = {
  'PT': ['Trex ENHANCE', 'Trex TRANSCEND'],
  'Trex ENHANCE': ['Trex TRANSCEND', 'Trex SIGNATURE'],
  'Trex SELECT': ['Trex TRANSCEND', 'Trex SIGNATURE'],
  'Trex TRANSCEND': ['Trex SIGNATURE', null],
  'Trex LINEAGE': ['Trex SIGNATURE', null],
  'TimberTech PRIME/+': ['TimberTech RESERVE', 'TimberTech VINTAGE PVC'],
  'TimberTech TERRAIN/+': ['TimberTech RESERVE', 'TimberTech VINTAGE PVC'],
  'TimberTech RESERVE': ['TimberTech LANDMARK PVC', 'TimberTech VINTAGE PVC'],
  'TimberTech HARVEST PVC': ['TimberTech VINTAGE PVC', null],
  'TimberTech LANDMARK PVC': ['TimberTech VINTAGE PVC', null],
}
// Railing: [Better, Best]. No railing stays no railing.
export const RAIL_TIERS = {
  '2x2 pickets wood rail': ['Hybrid Railing / trex cap', 'Trex Select Alum. Railing'],
  'Hybrid Railing / wood cap': ['Hybrid Railing / trex cap', 'Trex Select Alum. Railing'],
  'Hybrid Railing / trex cap': ['Trex Select Alum. Railing', 'Trex SIGNATURE Alum. Railing'],
  'Trex Select Railing WHITE ONLY': ['Trex Transcend Railing', null],
  'Trex Select Alum. Railing': ['Trex SIGNATURE Alum. Railing', null],
  'Trex Select Alum. Railing BETWEEN POSTS ONLY': ['Trex SIGNATURE Alum. Railing BETWEEN POSTS ONLY', null],
  'TimberTech Railing BETWEEN POSTS ONLY': ['TimberTech Alum. Railing', null],
}
const RAIL_NAMES = {
  '2x2 pickets wood rail': 'wood railing with 2×2 pickets', 'Hybrid Railing / wood cap': 'hybrid railing with a wood cap',
  'Hybrid Railing / trex cap': 'hybrid railing with a Trex cap', 'Trex Transcend Railing': 'Trex Transcend railing',
  'Trex Select Railing WHITE ONLY': 'Trex Select white railing', 'Trex Select Alum. Railing': 'Trex Select aluminum railing',
  'Trex Select Alum. Railing BETWEEN POSTS ONLY': 'Trex Select aluminum railing (between posts)', 'Trex SIGNATURE Alum. Railing': 'Trex Signature aluminum railing',
  'Trex SIGNATURE Alum. Railing BETWEEN POSTS ONLY': 'Trex Signature aluminum railing (between posts)', 'TimberTech Alum. Railing': 'TimberTech aluminum railing',
  'TimberTech Railing BETWEEN POSTS ONLY': 'TimberTech railing (between posts)', 'TimberTech IRX Cable Rail': 'TimberTech IRX cable railing', 'Iron Rod Railing LF': 'iron rod railing',
}
const DECK_NAMES = { 'PT': 'pressure-treated' }
const deckName = (k) => DECK_NAMES[k] || k.replace(/\b([A-Z]{2,})\b/g, (w) => w[0] + w.slice(1).toLowerCase()).replace(/\/\+$/, '').replace(/ Pvc$/, ' PVC')
const railName = (k) => RAIL_NAMES[k] || k

export const PACKAGES = [['better', 'Better', 0], ['best', 'Best', 1]]
// A deck's settings stepped up to a package ('better' | 'best'); null when nothing steps up.
// Best falls back to Better's step when a ladder has no third rung.
export function packageState(st = {}, key) {
  const tier = key === 'best' ? 1 : 0
  const dk = DECKING_TIERS[st.collKey]?.[tier] || DECKING_TIERS[st.collKey]?.[0] || null
  const rl = st.rail && st.rail !== 'None' ? (RAIL_TIERS[st.rail]?.[tier] || RAIL_TIERS[st.rail]?.[0] || null) : null
  return dk || rl ? { ...st, ...(dk ? { collKey: dk } : {}), ...(rl ? { rail: rl } : {}) } : null
}
// The quote lines with a package taken: each deck re-priced with its stepped-up decking and railing.
export function applyPackage(lines = [], key, ctx = {}) {
  return lines.map(l => {
    if (l?.builder?.tool !== 'deck' || !l.builder.state) return l
    const st = packageState(l.builder.state, key)
    return st ? { ...deckLine(st, ctx, l.id), qty: l.qty || 1, section: l.section, mergeInto: l.mergeInto ?? null, hidden: l.hidden } : l
  })
}
const list = (xs) => xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs[0]

// The suggested packages for these quote lines → [{ auto: 'better'|'best', name, description, qty, unit, unitPrice }]
export function suggestPackages(lines = [], ctx = {}) {
  const decks = (lines || []).filter(l => l?.builder?.tool === 'deck' && l.builder.state)
  if (!decks.length) return []
  const out = []
  PACKAGES.forEach(([key, label]) => {
    let add = 0; const gets = [], was = []
    decks.forEach(l => {
      const st = l.builder.state, qty = Number(l.qty) || 1, nx = packageState(st, key)
      if (!nx) return
      const dk = nx.collKey !== st.collKey ? nx.collKey : null, rl = nx.rail !== st.rail ? nx.rail : null
      const base = deckLine(st, ctx).unitPrice, up = deckLine(nx, ctx).unitPrice
      if (!(up > base)) return
      add += (up - base) * qty
      if (dk) { gets.push(`${deckName(dk)} decking`); was.push(`${deckName(st.collKey)} decking`) }
      if (rl) { gets.push(railName(rl)); was.push(railName(st.rail)) }
    })
    if (add <= 0 || !gets.length) return
    const uniq = (xs) => [...new Set(xs)]
    out.push({ auto: key, name: `${label}: ${list(uniq(gets))}`, description: `Instead of ${list(uniq(was))}. Added to the price above.`, qty: 1, unit: 'EA', unitPrice: Math.round(add) })
  })
  // Best only when it differs from Better
  if (out.length === 2 && out[0].name.slice(out[0].name.indexOf(':')) === out[1].name.slice(out[1].name.indexOf(':'))) out.pop()
  return out
}

// The upgrades list with the suggested packages brought up to date: hand-made upgrades
// stay as they are; a package the rep turned off is left out. Same array when nothing changed.
export function withPackages(upgrades = [], suggested = [], off = []) {
  const keep = upgrades.filter(u => !u.auto)
  const next = [...keep]
  suggested.filter(p => !off.includes(p.auto)).forEach(p => {
    const had = upgrades.find(u => u.auto === p.auto)
    next.push(had ? { ...had, name: p.name, description: p.description, qty: 1, unit: 'EA', unitPrice: p.unitPrice } : { id: `pkg-${p.auto}-${Date.now()}`, ...p })
  })
  const same = next.length === upgrades.length && next.every((u, i) => upgrades[i] && ['id', 'auto', 'name', 'description', 'unitPrice'].every(k => u[k] === upgrades[i][k]))
  return same ? upgrades : next
}
