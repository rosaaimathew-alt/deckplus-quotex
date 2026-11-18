// ── A drawing writes the whole quote ─────────────────────────────────────────
// When the quote itself is linked to a drawing (Build Quote's "Draw it", or a
// customer's "Start with a drawing"), every deck (one per height) and every
// porch in the drawing is its own priced line, made with the same Deck Builder
// and Porch Builder pricing (lib/builderLines.js). Each line remembers which
// part of the drawing it came from (builder.state.drawKey), so changing the
// drawing re-prices that line and keeps the rep's own picks on it (decking,
// railing, options); deleting a part removes its line. Lines the rep built in a
// builder before the drawing existed are taken over by the drawing's parts of
// the same kind, in order, so nothing is quoted twice. Porch conversions and
// patios show in the drawing but stay priced by their own builders.
import { autoStairSteps, matchCollection } from './deckPricing'
import { PORCH_BUILD_INPUT_DEFAULTS } from '../porchBuild'
import { DECK_STATE_DEFAULTS, deckLine, porchLine } from './builderLines'
import { deckGroups, porchFromDrawing } from './drawingLink'

const SKIRT = { horizontal: 'Trex skirt', pt: 'PT skirt (stained)', lattice: 'Lattice (stained)' }
const newId = () => Date.now() + Math.random()

// A deck's builder settings from the drawing, on top of what the line already had.
export function deckStateFromDrawing(g, build, prev) {
  const base = prev || {
    ...DECK_STATE_DEFAULTS,
    collKey: matchCollection(build?.decking) || DECK_STATE_DEFAULTS.collKey,
    rail: g.height >= 2 ? (build?.rail === 'aluminum' ? 'Trex Select Alum. Railing' : 'Hybrid Railing / trex cap') : 'None',
    skirt: SKIRT[build?.skirt] || 'None',
  }
  return {
    ...base,
    sizeMode: g.sizeMode, width: g.width, depth: g.depth, areaSF: g.areaSF, openEdgeLF: g.openEdgeLF, height: g.height,
    sections: [], freestanding: g.freestanding, border: g.border || base.border, landings: g.landings, stairs: autoStairSteps(g.stairs, g.height, g.landings), qtyOv: {},
  }
}

// A porch's builder inputs from the drawing, on top of what the line already had.
export function porchInputFromDrawing(p, prevInp) {
  const inp = { ...PORCH_BUILD_INPUT_DEFAULTS, ...(prevInp || {}), ...p.patch }
  if (p.stairWidthFt) inp.steps = { ...(inp.steps || {}), stairWidthFt: p.stairWidthFt }
  inp.landings = { ...(inp.landings || {}), count: p.landings }
  return inp
}

// The drawing's parts that price as quote lines.
export function drawingParts(d) {
  return [
    ...deckGroups(d).map(g => ({ key: g.key, tool: 'deck', g })),
    ...(d?.porches || []).filter(p => !p.conv).map(p => ({ key: `porch:${p.id}`, tool: 'porchbuild', p: porchFromDrawing(d, p.id) })),
  ]
}

// The quote's lines after a drawing change. `ctx`: catalog, customComponents, scopeTemplate
// (decks); savedRates, scopes (porches). `skipId`: a line open in a builder right now.
export function syncLinesFromDrawing(lines, d, link, ctx, skipId) {
  const parts = drawingParts(d)
  const byKey = new Map(parts.map(x => [x.key, x]))
  const keyOf = (l) => (l.builder?.state?.drawLink === link ? l.builder.state.drawKey : null)
  const make = (part, prev) => {
    const tag = { drawLink: link, drawKey: part.key }
    if (part.tool === 'deck') {
      const st = deckStateFromDrawing(part.g, d.build, prev?.builder?.state)
      return { ...(prev || {}), ...deckLine({ ...st, ...tag }, ctx, prev?.id ?? newId()) }
    }
    const prevSt = prev?.builder?.state || {}
    const inp = porchInputFromDrawing(part.p, prevSt.inp || prev?.porchBuild)
    return { ...(prev || {}), ...porchLine(inp, { ...ctx, jic: prevSt.jic, extraState: tag }, prev?.id ?? newId()) }
  }
  const seen = new Set()
  let out = lines.flatMap(l => {
    const k = keyOf(l)
    if (!k) return [l]
    if (!byKey.has(k)) return l.id === skipId ? [l] : []        // gone from the drawing
    seen.add(k)
    return l.id === skipId ? [l] : [make(byKey.get(k), l)]
  })
  // New parts: take over an unlinked builder line of the same kind, else add a line.
  for (const part of parts) {
    if (seen.has(part.key)) continue
    const i = out.findIndex(l => l.builder?.tool === part.tool && !keyOf(l) && l.id !== skipId)
    if (i >= 0) out = out.map((l, j) => (j === i ? make(part, l) : l))
    else out = [...out, make(part, null)]
  }
  return out
}

// "2 decks · 1 porch" for the quote's drawing line.
export function drawingSummary(d) {
  const decks = deckGroups(d).length, porches = (d?.porches || []).filter(p => !p.conv).length
  return [decks && `${decks} deck${decks > 1 ? 's' : ''}`, porches && `${porches} porch${porches > 1 ? 'es' : ''}`].filter(Boolean).join(' · ')
}
