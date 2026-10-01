// ── Where is the job, and which permit fees apply? ───────────────────────────
// The quote builder reads the job address, works out the state, city and
// county, and adds the price list's permit / jurisdiction items to the
// proposal on its own:
//
//   • Base permit, by job type (one per quote — porch, else deck, else hardscape)
//     Porch:     "Permit + gutters + pressure wash + PortaJohn"
//     Deck:      "Permit + Porta John"
//     Hardscape: "Permit"
//   • Porch roof over 250 SF → "Roof over 250sf permit fee"
//   • Mecklenburg County, NC → "Mecklenburg add"
//   • City of Tega Cay, SC (porch / deck) → "Tega Cay add"
//   • Any South Carolina job → "Footings inspection SOUTH CAROLINA" (porch or deck/hardscape rate)
//
// Prices come from the catalog items of the same name; the numbers here are
// only the fallback. The county comes from the ZIP code (Charlotte-area
// counties), then from the city name.

// label = what the customer reads on the proposal
const P = (key, catalogName, label, rate) => ({ key, catalogName, label, rate })
export const FEE_ITEMS = {
  permitPorch:  P('permitPorch',  'Permit + gutters + pressure wash + PortaJohn',          'Permit, gutters, pressure wash & porta-john', 2000),
  permitDeck:   P('permitDeck',   'Permit + Porta John',                                   'Permit & porta-john', 950),
  permitHard:   P('permitHard',   'Permit',                                                'Permit', 750),
  roof250:      P('roof250',      'Roof over 250sf permit fee',                            'Permit fee — roof over 250 SF', 650),
  meck:         P('meck',         'Mecklenburg add',                                       'Mecklenburg County permit add', 600),
  tegaCay:      P('tegaCay',      'Tega Cay add',                                          'City of Tega Cay permit add', 1000),
  scPorch:      P('scPorch',      'Footings inspection SOUTH CAROLINA (Porch)',            'South Carolina footing inspection', 700),
  scDeck:       P('scDeck',       'Footings inspection SOUTH CAROLINA (Deck & Hardscape)', 'South Carolina footing inspection', 550),
}

// ZIP → county for the area Deck Plus works. Where a ZIP straddles a county
// line it is listed under the county most of it sits in.
const ZIP_COUNTY = {}
const put = (county, state, zips) => zips.forEach(z => { ZIP_COUNTY[z] = { county, state } })
put('Mecklenburg', 'NC', [
  '28031', '28036', '28070', '28078', '28105', '28106', '28126', '28130', '28134',
  '28201', '28202', '28203', '28204', '28205', '28206', '28207', '28208', '28209', '28210', '28211', '28212', '28213',
  '28214', '28215', '28216', '28217', '28218', '28219', '28220', '28221', '28222', '28223', '28224', '28226', '28227',
  '28228', '28229', '28230', '28231', '28232', '28233', '28234', '28235', '28236', '28237', '28241', '28242', '28243',
  '28244', '28246', '28247', '28250', '28253', '28254', '28255', '28256', '28258', '28260', '28262', '28263', '28265',
  '28266', '28269', '28270', '28271', '28272', '28273', '28274', '28275', '28277', '28278', '28280', '28281', '28282',
  '28284', '28285', '28287', '28288', '28289', '28290', '28296', '28297', '28299',
])
put('Union', 'NC', ['28079', '28103', '28104', '28108', '28110', '28111', '28112', '28173', '28174'])
put('Cabarrus', 'NC', ['28025', '28026', '28027', '28075', '28081', '28082', '28083', '28107', '28124'])
put('Gaston', 'NC', ['28006', '28012', '28016', '28032', '28034', '28052', '28053', '28054', '28055', '28056', '28077', '28098', '28101', '28120', '28164'])
put('Iredell', 'NC', ['28115', '28117', '28166', '28625', '28677', '28687', '28688', '28689'])
put('Lincoln', 'NC', ['28037', '28080', '28092', '28093', '28168'])
put('York', 'SC', ['29703', '29704', '29708', '29710', '29715', '29716', '29717', '29726', '29730', '29731', '29732', '29733', '29734', '29742', '29743', '29745'])
put('Lancaster', 'SC', ['29058', '29067', '29707', '29714', '29720', '29721', '29722', '29744'])
put('Chester', 'SC', ['29055', '29706', '29712', '29724', '29729'])

// City name → county (used when the address has no ZIP)
const CITY_COUNTY = {
  Mecklenburg: ['charlotte', 'huntersville', 'cornelius', 'davidson', 'matthews', 'mint hill', 'pineville'],
  Union: ['waxhaw', 'monroe', 'indian trail', 'weddington', 'wesley chapel', 'stallings', 'marvin', 'wingate', 'marshville', 'mineral springs', 'lake park', 'fairview'],
  Cabarrus: ['concord', 'harrisburg', 'kannapolis', 'midland', 'mount pleasant'],
  Gaston: ['gastonia', 'belmont', 'mount holly', 'cramerton', 'lowell', 'mcadenville', 'dallas', 'bessemer city', 'stanley'],
  Iredell: ['mooresville', 'statesville', 'troutman'],
  Lincoln: ['lincolnton', 'denver', 'iron station'],
  York: ['rock hill', 'fort mill', 'tega cay', 'clover', 'lake wylie', 'york'],
  Lancaster: ['indian land', 'lancaster', 'heath springs', 'kershaw'],
  Chester: ['chester', 'great falls', 'richburg'],
}
const COUNTY_STATE = { Mecklenburg: 'NC', Union: 'NC', Cabarrus: 'NC', Gaston: 'NC', Iredell: 'NC', Lincoln: 'NC', York: 'SC', Lancaster: 'SC', Chester: 'SC' }

export function locateAddress(address = '') {
  const a = String(address || '')
  const low = a.toLowerCase()
  const zips = a.match(/\b\d{5}(?:-\d{4})?\b/g) || []
  const zip = zips.length ? zips[zips.length - 1].slice(0, 5) : ''
  let state = /\b(SC|S\.C\.|South Carolina)\b/i.test(a) ? 'SC' : /\b(NC|N\.C\.|North Carolina)\b/i.test(a) ? 'NC' : ''
  if (!state && zip) state = zip.startsWith('29') ? 'SC' : /^2[78]/.test(zip) ? 'NC' : ''
  let county = ''
  let from = ''
  if (zip && ZIP_COUNTY[zip]) { county = ZIP_COUNTY[zip].county; from = 'zip'; if (!state) state = ZIP_COUNTY[zip].state }
  if (!county) {
    for (const [c, cities] of Object.entries(CITY_COUNTY)) {
      if (state && COUNTY_STATE[c] !== state) continue
      if (cities.some(city => new RegExp(`\\b${city}\\b`).test(low))) { county = c; from = 'city'; break }
    }
    if (county && !state) state = COUNTY_STATE[county]
  }
  const tegaCay = /\btega\s*cay\b/.test(low)
  // 29708 is shared by Tega Cay and Fort Mill — only the city name settles it
  const tegaCayUnsure = !tegaCay && zip === '29708' && !/\bfort\s*mill\b/.test(low)
  return { zip, state, county, countyFrom: from, tegaCay, tegaCayUnsure, known: !!(state || county) }
}

const PORCH_TYPES = ['Screen Porches', 'Eze-Breeze Porches', 'Open Porches', 'Porch Conversions', 'Sunrooms']

// Which kinds of work are on the quote (fees and auto lines are ignored)
export function jobKinds(lines = [], projectTypes = []) {
  const work = lines.filter(l => !l.autoFee && l.category !== 'Permits & Fees')
  const has = (re) => work.some(l => re.test(`${l.section || ''} ${l.category || ''}`))
  return {
    porch: projectTypes.some(t => PORCH_TYPES.includes(t)) || has(/porch|sunroom/i),
    deck: projectTypes.includes('Open Deck') || has(/\bdecks?\b|under deck/i),
    hardscape: projectTypes.includes('Hardscapes') || has(/hardscape|outdoor kitchen|pergola|fireplace|paver|concrete/i),
  }
}

// Largest porch roof on the quote (from Porch Builder lines)
function porchRoofSF(lines = []) {
  let max = 0
  for (const l of lines) {
    const pb = l.porchBuild
    if (pb) max = Math.max(max, (Number(pb.width) || 0) * (Number(pb.depth) || 0))
  }
  return max
}

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()
export function feePrice(item, catalog = []) {
  const hit = catalog.find(c => norm(c.name) === norm(item.catalogName))
  return hit
    ? { rate: Number(hit.unitPrice) || 0, cost: (Number(hit.costMaterials) || 0) + (Number(hit.costSub) || 0), catalogId: hit.id }
    : { rate: item.rate, cost: 0, catalogId: null }
}

// The fees this job should carry, each with the reason it applies.
// `overrides.tegaCay` (true / false) settles a 29708 address.
export function requiredFees({ address, lines, projectTypes, catalog, overrides = {} }) {
  const loc = locateAddress(address)
  const kinds = jobKinds(lines, projectTypes)
  const anyWork = kinds.porch || kinds.deck || kinds.hardscape
  const out = []
  if (!anyWork || !loc.known) return { loc, kinds, fees: out }
  const place = [loc.county && `${loc.county} County`, loc.state].filter(Boolean).join(', ')
  // A fee the rep already added by hand (same catalog item) isn't added twice
  const manual = (item) => lines.some(l => !l.autoFee && [item.catalogName, item.label].some(nm => norm(l.name) === norm(nm)))
  const add = (item, why) => { if (!manual(item)) out.push({ ...item, ...feePrice(item, catalog), why }) }

  if (kinds.porch)          add(FEE_ITEMS.permitPorch, 'Porch permit')
  else if (kinds.deck)      add(FEE_ITEMS.permitDeck, 'Deck permit')
  else if (kinds.hardscape) add(FEE_ITEMS.permitHard, 'Hardscape permit')

  const roof = porchRoofSF(lines)
  if (kinds.porch && roof > 250) add(FEE_ITEMS.roof250, `Porch roof ${roof} SF (over 250 SF)`)

  if (loc.county === 'Mecklenburg') add(FEE_ITEMS.meck, `Job is in ${place}`)

  const inTegaCay = overrides.tegaCay ?? loc.tegaCay
  if (inTegaCay && (kinds.porch || kinds.deck)) add(FEE_ITEMS.tegaCay, 'Job is in the City of Tega Cay, SC')

  if (loc.state === 'SC') add(kinds.porch ? FEE_ITEMS.scPorch : FEE_ITEMS.scDeck, `South Carolina job${loc.county ? ` (${loc.county} County)` : ''}`)

  return { loc, kinds, fees: out }
}
