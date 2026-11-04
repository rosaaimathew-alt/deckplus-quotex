// ── Designs: floor plans and 3D renderings straight from a proposal ──────────
// Every builder line on a proposal already carries the inputs it was priced
// from: Porch Builder lines keep `porchBuild`, deck lines `builder.state`,
// hardscape lines `builder.state.inp.patio`. The 3D builder
// (public/porch-3d.html) reads them from the `design` query parameter and
// draws the same build in 3D or as a 2D plan, with no re-entry.

const n = (v) => Number(v) || 0

export function designParts(lines = []) {
  const porches = [], decks = [], patios = []
  for (const l of lines) {
    const pb = l.porchBuild || (l.builder?.tool === 'porchbuild' ? l.builder.state?.inp : null)
    if (pb && n(pb.width) > 0 && n(pb.depth) > 0) {
      porches.push({
        name: l.name || '', type: pb.type, width: n(pb.width), depth: n(pb.depth), tie: pb.tie, roof: pb.roof,
        floor: pb.floor, deckHeightFt: pb.deckHeightFt, wallHeightIn: pb.wallHeightIn, glassEnds: pb.glassEnds,
        flooring: pb.flooring, railing: { product: pb.railing?.product || '' },
      })
      continue
    }
    const st = l.builder?.state
    if (l.builder?.tool === 'deck' && st && n(st.width) > 0 && n(st.depth) > 0) {
      decks.push({ name: l.name || '', width: n(st.width), depth: n(st.depth), height: n(st.height), collKey: st.collKey || '', rail: st.rail || '' })
      continue
    }
    const patio = l.builder?.tool === 'hardscape' ? st?.inp?.patio : null
    // Irregular patios are priced on total SF (sizeMode 'sf'); draw them as a square of that area.
    if (patio?.sizeMode === 'sf' && n(patio.areaSF) > 0) {
      const side = Math.max(4, Math.round(Math.sqrt(n(patio.areaSF))))
      patios.push({ name: l.name || '', width: side, depth: side, surface: patio.surface || '', irregular: true })
    } else if (patio && n(patio.width) > 0 && n(patio.depth) > 0) {
      patios.push({ name: l.name || '', width: n(patio.width), depth: n(patio.depth), surface: patio.surface || '' })
    }
  }
  return { porches, decks, patios }
}

export const hasDesign = (p) => {
  const d = designParts(p?.lines)
  return d.porches.length + d.decks.length + d.patios.length > 0
}

// One line per part, for lists: "Eze-Breeze porch 14′×14′ · Deck 20′×16′"
const TYPE = { open: 'Open porch', screen: 'Screen porch', ezebreeze: 'Eze-Breeze porch', sunroom: 'Sunroom' }
export function designSummary(p) {
  const d = designParts(p?.lines)
  return [
    ...d.porches.map(x => `${TYPE[x.type] || 'Porch'} ${x.width}′×${x.depth}′`),
    ...d.decks.map(x => `Deck ${x.width}′×${x.depth}′`),
    ...d.patios.map(x => `Patio ${x.width}′×${x.depth}′`),
  ].join(' · ')
}

export function designUrl(p, mode = '3d') {
  const d = designParts(p?.lines)
  const payload = { client: p?.client || '', address: p?.address || '', phone: p?.phone || '', email: p?.email || '', contractNum: p?.contractDraft?.contractNum || '', ...d }
  return `/porch-3d.html?design=${encodeURIComponent(JSON.stringify(payload))}${mode === '2d' ? '&mode=2d' : ''}`
}
