// ── Under-deck ceiling tool — pricing ────────────────────────────────────────
// Rows 111–126 of the Deck sheet in the Deck Plus price list: the Dry under-deck
// ceiling (UDC) priced per SF, plus the electrical that goes with it. Each rate
// is read from the catalog item of the same name (so the office edits prices in
// the Catalog); these numbers are only the fallback.

export const UDC_STYLES = [
  { key: 'flat',  label: 'Flat / smooth', catalogName: 'Under Deck Ceiling (UDC) FLAT/SMOOTH (Porch & Deck)', rate: 41.44 },
  { key: 'bead',  label: 'Bead board',    catalogName: 'Under Deck Ceiling (UDC) BEAD BOARD (Porch & Deck)',  rate: 44.8 },
  { key: 'faux',  label: 'Faux wood',     catalogName: 'Under Deck Ceiling (UDC) FAUX WOOD (Porch & Deck)',   rate: 49.28 },
]

export const UDC_ELECTRICAL = [
  { key: 'pkg12v',     label: '12v electric package (fan + 4 lights)', catalogName: 'Outdoor Electric Package 12v (1 fan/4 lights)', rate: 3900 },
  { key: 'fan',        label: 'Fan with switch (UCS system)',                     catalogName: 'Fan w/ switch for pergola/UCS system',          rate: 1500 },
  { key: 'can',        label: 'Can lights (UCS system)',                          catalogName: 'Can lights for UCS system',                     rate: 310 },
  { key: 'lvTrans',    label: 'Low-voltage transformer / outlet',                 catalogName: 'Low Voltage transformer/outlet',                rate: 750 },
  { key: 'riser',      label: 'Riser light',                                      catalogName: 'Riser light',                                   rate: 125 },
  { key: 'step',       label: 'Step light',                                       catalogName: 'Step light',                                    rate: 150 },
  { key: 'postMoon',   label: 'Post light, moon-shape LED',                       catalogName: 'Post light moon shape LED',                     rate: 200 },
  { key: 'capLight',   label: 'Cap light for sleeved post',                       catalogName: 'Cap light for sleeved post',                    rate: 380 },
  { key: 'lvDimmer',   label: 'Dimmer for low voltage',                           catalogName: 'Dimmer for Low Voltage',                        rate: 330 },
  { key: 'heaterBlk',  label: 'Infratech heater, black',           catalogName: 'Infratech Heater 5000w 40inch SS BLACK',        rate: 2500 },
  { key: 'heaterRec',  label: 'Infratech heater, recessed',          catalogName: 'Infratech Heater 5000w 40inch SS RECESSED',     rate: 5000 },
]

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()

// Current rate + cost for a row: the catalog item with the same name wins.
export function rateFor(row, catalog = []) {
  const hit = catalog.find(c => norm(c.name) === norm(row.catalogName))
  if (!hit) return { rate: row.rate, cost: 0, fromCatalog: false }
  return {
    rate: Number(hit.unitPrice) || 0,
    cost: (Number(hit.costMaterials) || 0) + (Number(hit.costSub) || 0),
    fromCatalog: true,
  }
}

export const UDC_INPUT_DEFAULTS = { width: 16, depth: 12, style: 'flat', electrical: {} }

export function computeUnderDeck(input, catalog) {
  const inp = { ...UDC_INPUT_DEFAULTS, ...(input || {}) }
  const n = (v) => Number(v) || 0
  const area = Math.round(n(inp.width) * n(inp.depth) * 100) / 100
  const style = UDC_STYLES.find(s => s.key === inp.style) || UDC_STYLES[0]
  const sr = rateFor(style, catalog)
  const ceiling = { key: style.key, label: `Dry under-deck ceiling — ${style.label}`, unit: 'SF', qty: area,
                    rate: sr.rate, cost: sr.cost, total: area * sr.rate, costTotal: area * sr.cost }
  const electrical = UDC_ELECTRICAL
    .map(e => ({ e, qty: n(inp.electrical?.[e.key]) }))
    .filter(x => x.qty > 0)
    .map(({ e, qty }) => {
      const r = rateFor(e, catalog)
      return { key: e.key, label: e.label, unit: 'EA', qty, rate: r.rate, cost: r.cost, total: qty * r.rate, costTotal: qty * r.cost }
    })
  const lines = [ceiling, ...electrical]
  return {
    area, style, lines, ceiling, electrical,
    total: lines.reduce((s, l) => s + l.total, 0),
    cost: lines.reduce((s, l) => s + l.costTotal, 0),
  }
}
