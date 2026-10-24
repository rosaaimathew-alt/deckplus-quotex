// ── Deck price-list rows — the Deck Builder's math, shared ───────────────────
// One row per price-list line in use, exactly as the Deck Builder shows them.
// The builder and the job price list both call this, so they always agree.
import {
  DECK_COLLECTIONS, DECK_RAILS, BRONZE_BALUSTERS, DECK_FASCIA, DECK_SKIRT_OPTIONS, DECK_PAINT_OPTIONS, DECK_ITEMS,
  catalogPrice, deckTakeoff, STEP_FACTOR,
} from './deckPricing'

const n = (v) => Number(v) || 0

// state = the Deck Builder's saved settings (line.builder.state).
export function deckPriceRows(state = {}, catalog = [], customComponents = []) {
  const {
    jobType = 'New deck', collKey, width = 0, depth = 0, height = 0, sections = [], stairs = [], landings = [],
    rail = 'None', bronze = false, fascia = 'None', border = 'None', cortex = 'None', skirt = 'None', paint = 'None',
    freestanding = false, extras = {}, qtyOv = {}, rateOv = {},
  } = state
  const coll = DECK_COLLECTIONS.find(c => c.key === collKey) || DECK_COLLECTIONS[0]
  const redeck = jobType === 'Re-deck'
  const canRedeck = !!coll.redeck
  const t = deckTakeoff({ width, depth, height, sections, stairs, landings })
  const W = n(width), D = n(depth), H = n(height)
    const out = []
    const price = (item, fallback) => catalogPrice(catalog, item, fallback)
    const push = (key, label, item, unit, autoQty, fallbackRate, extra = {}) => {
      const p = price(item, fallbackRate)
      const qty  = qtyOv[key] ?? autoQty
      const rate = rateOv[key] ?? p.rate
      out.push({ key, label, item, unit, qty, autoQty, rate, cost: p.cost, line: n(qty) * n(rate), lineCost: n(qty) * n(p.cost), ...extra })
    }

    // Deck surface: the collection's Deck $/SF, or its Re-Deck $/SF.
    if (redeck && canRedeck) push('deck', `${coll.redeck.item}`, coll.redeck.item, 'SF', t.deckSF, coll.redeck.rate, { calc: `${W}×${D}${t.sectionSF ? ` + ${t.sectionSF} bump-outs` : ''}` })
    else push('deck', `${coll.fam} Deck`, `${coll.fam} Deck`, 'SF', t.deckSF, coll.rate, { calc: `${W}×${D}${t.sectionSF ? ` + ${t.sectionSF} bump-outs` : ''}` })

    if (t.stepSF > 0) {
      const item = coll.steps ? `${coll.fam} Steps` : `${coll.fam} Deck`
      push('steps', `${coll.fam} Steps${coll.steps ? '' : ' (deck rate)'}`, item, 'SF', t.stepSF, coll.rate,
        { calc: stairs.filter(s => n(s.steps) * n(s.across) > 0).map(s => `${n(s.steps)} steps × ${n(s.across)}′ across × ${STEP_FACTOR}`).join(' + ') })
    }
    if (t.landingSF > 0) {
      const item = coll.landing ? `${coll.fam} Landing` : `${coll.fam} Deck`
      push('landing', `${coll.fam} Landing${coll.landing ? '' : ' (deck rate)'}`, item, 'SF', t.landingSF, coll.rate,
        { calc: landings.map(l => `${n(l.width)}×${n(l.depth)}`).join(' + ') })
    }
    const boxRuns = stairs.filter(s => s.style === 'Box' && n(s.steps) > 0)
    if (boxRuns.length) push('boxstep', 'Box steps — add per step', DECK_ITEMS.boxstep.item, 'EA', boxRuns.reduce((a, s) => a + n(s.steps), 0), DECK_ITEMS.boxstep.rate,
      { calc: boxRuns.map(s => `stairs ${stairs.indexOf(s) + 1}: ${n(s.steps)} steps`).join(' + ') })

    const railOpt = DECK_RAILS.find(r => r.key === rail)
    const railLF  = t.openLF + t.stairRailLF + t.landingRailLF
    if (railOpt && railOpt.rate != null) {
      push('rail', railOpt.key, railOpt.key, 'LF', railLF, railOpt.rate, { calc: `3 sides ${t.openLF}${t.stairRailLF ? ` + stairs ${t.stairRailLF}` : ''}${t.landingRailLF ? ` + landings ${t.landingRailLF}` : ''}` })
      if (bronze) push('bronze', 'Bronze balusters (add)', BRONZE_BALUSTERS.item, 'LF', qtyOv.rail ?? railLF, BRONZE_BALUSTERS.rate)
    }

    const fasciaOpt = fascia === 'PVC white' ? DECK_FASCIA.pvcwhite : fascia === 'Matching' && coll.fascia ? DECK_FASCIA[coll.fascia] : null
    if (fasciaOpt) {
      const fasciaLF = t.openLF + t.stairFasciaLF + t.landingFasciaLF
      const calc = [`deck 3 open sides ${t.openLF}`, t.stairFasciaLF ? `stair sides ${t.stairFasciaLF}` : '', t.landingFasciaLF ? `landings ${t.landingFasciaLF}` : ''].filter(Boolean).join(' + ')
      push('fascia', fasciaOpt.item.replace(/ LF$/, ''), fasciaOpt.item, 'LF', fasciaLF, fasciaOpt.rate, { calc })
    }

    if (border !== 'None') {
      const b = border === '2-board' ? DECK_ITEMS.border2 : DECK_ITEMS.border1
      push('border', b.item.replace(/ SF$/, ''), b.item, 'SF', t.deckSF + t.landingSF, b.rate, { calc: `deck ${t.deckSF}${t.landingSF ? ` + landings ${t.landingSF}` : ''}` })
    }
    if (cortex !== 'None') {
      const c = cortex === 'PVC' ? DECK_ITEMS.cortexPvc : DECK_ITEMS.cortexComp
      push('cortex', c.item, c.item, 'EA', Math.max(1, Math.ceil(t.stepCount / 15)), c.rate)
    }

    const sk = DECK_SKIRT_OPTIONS[skirt]
    if (sk) {
      const skirtSF = Math.round(t.openLF * H + t.landingSkirtSF)
      push('skirt', sk.item, sk.item, sk.unit, sk.sheetSF ? Math.ceil(skirtSF / sk.sheetSF) : skirtSF, sk.rate,
        { calc: `${t.openLF} LF × ${H}′${t.landingSkirtSF ? ` + landings ${Math.round(t.landingSkirtSF)} SF` : ''}${sk.sheetSF ? ` = ${skirtSF} SF ÷ 32` : ''}` })
    }
    const pt = DECK_PAINT_OPTIONS[paint]
    if (pt) {
      const paintSF = Math.round(t.deckSF + t.stepSF + t.landingSF)
      push('paint', pt.item, pt.item, 'SF', paintSF, pt.rate, { calc: `deck${t.stepSF ? ' + steps' : ''}${t.landingSF ? ' + landings' : ''}` })
    }

    const highSF = (H > 8 ? t.deckSF : 0) + t.landingHighSF
    if (highSF > 0) push('high', DECK_ITEMS.high.item, DECK_ITEMS.high.item, 'SF', highSF, DECK_ITEMS.high.rate,
      { calc: [H > 8 ? `deck ${H}′ high` : '', t.landingHighSF ? `landings over 8′ ${t.landingHighSF}` : ''].filter(Boolean).join(' + ') })
    if (freestanding) push('freestand', DECK_ITEMS.freestand.item, DECK_ITEMS.freestand.item, 'SF', t.deckSF, DECK_ITEMS.freestand.rate)

    // Add-ons the rep counts on site.
    const addOn = (key, unit) => { const q = n(extras[key]); if (q > 0) push(key, DECK_ITEMS[key].item, DECK_ITEMS[key].item, unit, q, DECK_ITEMS[key].rate) }
    addOn('demoDeck', 'SF'); addOn('demoConc', 'SF'); addOn('footings', 'EA')
    addOn('lvl', 'LF'); addOn('hottub', 'EA'); addOn('bracePlate', 'EA'); addOn('braceLetter', 'EA'); addOn('posts8x8', 'EA')
    addOn('gate', 'EA'); addOn('privacy', 'SF')

    // The manager's own saved components (Catalog → Builder rates).
    for (const c of customComponents) {
      const key = `c:${c.id}`
      const qty = qtyOv[key] ?? 0
      const rate = rateOv[key] ?? n(c.rate)
      out.push({ key, label: c.label, item: null, unit: c.unit, qty, autoQty: 0, rate, cost: n(c.cost), line: n(qty) * n(rate), lineCost: n(qty) * n(c.cost), custom: true })
    }
    return out
}
