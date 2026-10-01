// ── Hardscape tool — pricing ─────────────────────────────────────────────────
// Rows 34–89 of the Hardscape sheet in the Deck Plus price list: concrete,
// pavers, retaining walls, patio accessories, outdoor kitchen and granite.
// Every rate is read from the catalog item of the same name (so the office
// edits prices in the Catalog); the numbers here are only the fallback.
//
// Rules carried over from the sheet:
//   • Concrete 4″ under 200 SF is priced as "Concrete slab LESS THAN 200SF".
//   • A paver patio under 200 SF adds "PATIO LESS THAN 200sf ADD" per SF.
//   • Hill / driveway / house access: +$1,000 for a pump truck.
//   • Backfill per yard = (L × D × H) / 27.
//   • Granite: 30 SF minimum slab order; add 1′ to the width and 1′ to the length.

const I = (key, catalogName, label, unit, rate) => ({ key, catalogName, label, unit, rate })

export const HS_CONCRETE = [
  I('concrete4',  'Concrete 4"',                                          'Concrete 4″',                              'SF', 17),
  I('reinforced', 'Reinforced Concrete 4" (mesh/flooring underlayment)',  'Reinforced concrete 4″ (mesh)',           'SF', 20),
  I('hill',       'CONCRETE + HILL DRIVEWAY HOUSE',                       'Concrete — hill / driveway / house access', 'SF', 20),
]
export const HS_CONCRETE_SMALL = I('concreteSmall', 'Concrete slab LESS THAN 200SF', 'Concrete slab (under 200 SF)', 'SF', 30)
export const HS_PUMP_TRUCK_FEE = 1000   // sheet header: "ADD +$1000 FOR PUMP TRUCK"

export const HS_PAVERS = [
  I('flagConcrete',  'Flagstone standard + concrete',               'Flagstone, standard + concrete',            'SF', 55),
  I('flagExisting',  'Flagstone std on existing concrete',          'Flagstone, standard on existing concrete',  'SF', 41.8),
  I('travStd',       'Travertine tile standard',                    'Travertine tile, standard',                 'SF', 35),
  I('travPrem',      'Travertine tile premium',                     'Travertine tile, premium',                  'SF', 35),
  I('plaza2',        'Keystone Plaza 2-piece SF',                   'Keystone Plaza 2-piece',                    'SF', 22),
  I('plaza3',        'Keystone Plaza 3-piece SF',                   'Keystone Plaza 3-piece',                    'SF', 25.3),
  I('panorama',      'Keystone Panorama Demi/Supra SF',             'Keystone Panorama Demi / Supra',            'SF', 26.4),
  I('brick',         'Brick paver + sealant',                       'Brick paver + sealant',                     'SF', 30.8),
  I('tbManchester',  'Techo Bloc paver Manchester/Antika/Eva',      'Techo Bloc Manchester / Antika / Eva',      'SF', 27.5),
  I('tbPara',        'Techo Bloc paver Para',                       'Techo Bloc Para',                           'SF', 34.1),
  I('tbBlu',         'Techo Bloc paver Blu 60 Slate/Smooth/Grande', 'Techo Bloc Blu 60 Slate / Smooth / Grande', 'SF', 28.6),
]
export const HS_SMALL_PATIO = I('smallPatio', 'PATIO LESS THAN 200sf ADD', 'Patio under 200 SF add', 'SF', 6)
export const HS_STEPPING   = I('stepping', 'Techo Bloc paver Stepping Slabs Maya/Borealis per step', 'Techo Bloc stepping slabs (Maya / Borealis)', 'EA', 110)

export const HS_WALLS = [
  I('wallStd',   'Retaining Wall',               'Retaining wall',           'SF', 49.5),
  I('wallTecho', 'Techo Bloc retaining wall SF', 'Techo Bloc retaining wall', 'SF', 66),
]
export const HS_BACKFILL = I('backfill', 'Backfill PER YARD (L*D*H)/27', 'Backfill', 'YD', 165)

export const HS_ACCESSORIES = [
  I('sitVeneer',    'Sitting wall veneer wrapped',                          'Sitting wall, veneer wrapped',           'EA', 275),
  I('sitKeystone',  'Keystone sitting wall SF',                             'Keystone sitting wall',                  'SF', 130),
  I('sitTecho',     'Techo Bloc sitting wall SF',                           'Techo Bloc sitting wall',                'SF', 154),
  I('planter',      'Techo Bloc Planter SF',                                'Techo Bloc planter',                     'SF', 66),
  I('firepitKit',   'Techo Bloc Firepit Kit',                               'Techo Bloc fire pit kit',                'EA', 1705),
  I('firepitVen',   'fire pit veneer wrapped',                              'Fire pit, veneer wrapped',               'EA', 1980),
  I('firepitStone', 'fire pit natural stone',                               'Fire pit, natural stone',                'EA', 2750),
  I('stoneStep',    'Stone step + sqft of paver',                           'Stone step (+ SF of paver)',             'SF', 220),
  I('brickBench',   'Brick Bench (seat 22-24" H 16" W / 18" benchback) LF', 'Brick bench (22–24″ seat, 18″ back)',    'LF', 968),
  I('stoneBench',   'Natural Stone Bench LF',                               'Natural stone bench',                    'LF', 583),
  I('col18',        'Stone Columns up 18x18x36"',                           'Stone column, up to 18×18×36″',          'EA', 1045),
  I('col24',        'Stone Columns up 24x24x36"',                           'Stone column, up to 24×24×36″',          'EA', 1320),
  I('downspout',    'Re-route house downspout',                             'Re-route house downspout',               'EA', 250),
  I('buriedDs',     'Buried downspout LF',                                  'Buried downspout',                       'LF', 20),
  I('frenchDrain',  'French drain LF',                                      'French drain',                           'LF', 38.5),
  I('ndsDrain',     '4" NDS DRAIN LINE',                                    '4″ NDS drain line',                      'LF', 50),
]

export const HS_KITCHEN = [
  I('kitchenLF',  'Outdoor kitchen LF veneer',                         'Outdoor kitchen, veneer',                    'LF', 550),
  I('backsplash', '8" backsplash LF',                                  '8″ backsplash',                              'LF', 165),
  I('overhang',   'Countertop overhang LF',                            'Countertop overhang',                        'LF', 66),
  I('stoneWall',  'Stone/Brick wall',                                  'Stone / brick wall',                         'SF', 27.5),
  I('kOutlet',    'Outdoor kitchen outlet',                            'Outdoor kitchen outlet',                     'EA', 350),
  I('pizzaOven',  'Pizza Oven / Fireplace ( client to provide oven)',  'Pizza oven / fireplace (client provides oven)', 'EA', 13000),
]

export const HS_GRANITE = [
  I('g1', 'Granite countertop LEVEL 1 SF (Includes 1st seal)', 'Granite level 1 (includes 1st seal)', 'SF', 120),
  I('g2', 'Granite countertop LEVEL 2 SF (Includes 1st seal)', 'Granite level 2 (includes 1st seal)', 'SF', 145),
  I('g3', 'Granite countertop LEVEL 3 SF (Includes 1st seal)', 'Granite level 3 (includes 1st seal)', 'SF', 170),
]
export const HS_GRANITE_COLORS = {
  g1: 'Ubatuba, Dallas White, Azul Platino, Santa Cecilia Light, Black Pearl',
  g2: 'Brown Fantasy, Colonial White, Viscount White, Steel Gray (leathered / polished)',
  g3: 'Absolute Black, Alaska, Blue Pearl, Thunder White (honed / polished)',
}
export const HS_GRANITE_FINISH = I('gFinish', 'Granite LEATHERED/HONED SF ADD', 'Granite leathered / honed finish add', 'SF', 3.3)
export const HS_GRANITE_MIN_SF = 30

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()
const n = (v) => Number(v) || 0
const r2 = (v) => Math.round(v * 100) / 100

// Current rate, cost and unit for an item: the catalog item with the same name wins.
export function hsRate(item, catalog = []) {
  const hit = catalog.find(c => norm(c.name) === norm(item.catalogName))
  if (!hit) return { rate: item.rate, cost: 0, unit: item.unit }
  return {
    rate: Number(hit.unitPrice) || 0,
    cost: (Number(hit.costMaterials) || 0) + (Number(hit.costSub) || 0),
    unit: hit.unit || item.unit,
  }
}

export const HS_INPUT_DEFAULTS = {
  patio:   { width: 16, depth: 14, surface: '', pumpTruck: false },
  stepping: 0,
  wall:    { type: '', length: 0, height: 0, backfillDepth: 0 },
  granite: { level: '', length: 0, depth: 0, finish: false },
  qty:     {},        // { itemKey: qty } for accessories and kitchen items
}

export const HS_GROUPS = [
  { key: 'patio',     label: 'Patio' },
  { key: 'wall',      label: 'Retaining wall' },
  { key: 'accessory', label: 'Patio accessories' },
  { key: 'kitchen',   label: 'Outdoor kitchen' },
]

export function computeHardscape(input, catalog) {
  const inp = {
    ...HS_INPUT_DEFAULTS, ...(input || {}),
    patio:   { ...HS_INPUT_DEFAULTS.patio,   ...(input?.patio || {}) },
    wall:    { ...HS_INPUT_DEFAULTS.wall,    ...(input?.wall || {}) },
    granite: { ...HS_INPUT_DEFAULTS.granite, ...(input?.granite || {}) },
  }
  const lines = []
  const add = (group, item, qty, note, labelOverride) => {
    if (!(qty > 0)) return
    const r = hsRate(item, catalog)
    const q = r2(qty)
    lines.push({ group, key: item.key, label: labelOverride || item.label, unit: r.unit, qty: q, rate: r.rate, cost: r.cost,
                 total: q * r.rate, costTotal: q * r.cost, note })
  }

  // Patio surface
  const area = r2(n(inp.patio.width) * n(inp.patio.depth))
  const surface = inp.patio.surface
  const concrete = HS_CONCRETE.find(c => c.key === surface)
  const paver = HS_PAVERS.find(p => p.key === surface)
  if (concrete) {
    const small = concrete.key === 'concrete4' && area > 0 && area < 200
    add('patio', small ? HS_CONCRETE_SMALL : concrete, area, small ? 'under 200 SF' : undefined)
    if (inp.patio.pumpTruck) lines.push({ group: 'patio', key: 'pump', label: 'Concrete pump truck (hill / driveway / house access)', unit: 'LS', qty: 1,
                                          rate: HS_PUMP_TRUCK_FEE, cost: 0, total: HS_PUMP_TRUCK_FEE, costTotal: 0 })
  }
  if (paver) {
    add('patio', paver, area)
    if (area > 0 && area < 200) add('patio', HS_SMALL_PATIO, area, 'patio under 200 SF')
  }
  add('patio', HS_STEPPING, n(inp.stepping))

  // Retaining wall + backfill
  const wallType = HS_WALLS.find(w => w.key === inp.wall.type)
  const wallSF = r2(n(inp.wall.length) * n(inp.wall.height))
  const backfillYd = wallType && n(inp.wall.backfillDepth) > 0
    ? Math.ceil((n(inp.wall.length) * n(inp.wall.backfillDepth) * n(inp.wall.height)) / 27 * 10) / 10
    : 0
  if (wallType) {
    add('wall', wallType, wallSF, `${n(inp.wall.length)}′ long × ${n(inp.wall.height)}′ high`)
    add('wall', HS_BACKFILL, backfillYd, `(${n(inp.wall.length)} × ${n(inp.wall.backfillDepth)} × ${n(inp.wall.height)}) ÷ 27`)
  }

  // Accessories and kitchen (quantity per item)
  for (const it of HS_ACCESSORIES) add('accessory', it, n(inp.qty?.[it.key]))
  for (const it of HS_KITCHEN)     add('kitchen',   it, n(inp.qty?.[it.key]))

  // Granite: (length + 1′) × (depth + 1′), never less than the 30 SF slab minimum
  const g = HS_GRANITE.find(x => x.key === inp.granite.level)
  const gRaw = n(inp.granite.length) > 0 && n(inp.granite.depth) > 0 ? (n(inp.granite.length) + 1) * (n(inp.granite.depth) + 1) : 0
  const graniteSF = gRaw > 0 ? r2(Math.max(HS_GRANITE_MIN_SF, gRaw)) : 0
  if (g && graniteSF > 0) {
    add('kitchen', g, graniteSF, gRaw < HS_GRANITE_MIN_SF ? `30 SF minimum (${r2(gRaw)} SF measured +1′ each way)` : '+1′ to width and length')
    if (inp.granite.finish) add('kitchen', HS_GRANITE_FINISH, graniteSF)
  }

  const groups = HS_GROUPS.map(gr => {
    const gl = lines.filter(l => l.group === gr.key)
    return { ...gr, lines: gl, total: gl.reduce((s, l) => s + l.total, 0), cost: gl.reduce((s, l) => s + l.costTotal, 0) }
  }).filter(gr => gr.lines.length)

  return {
    area, wallSF, backfillYd, graniteSF, lines, groups,
    total: lines.reduce((s, l) => s + l.total, 0),
    cost: lines.reduce((s, l) => s + l.costTotal, 0),
  }
}
