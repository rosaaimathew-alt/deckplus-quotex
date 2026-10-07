// ── Job brain — reads a spoken / typed job into builder-tool settings ─────────
// Built into the app: no outside AI, no key, works offline. It knows Deck Plus's
// own vocabulary (sizes, product lines, rail and door types, hardscape items)
// and returns the same shape the tools open with:
//   { tools: [ { tool: 'deck' | 'porch' | 'conversion' | 'underdeck' | 'hardscape', ... } ], notCovered: [] }
// Each clause of the job is matched to a tool by its key words ("deck",
// "sunroom", "patio"…); clauses with no key word belong to the tool before them
// ("…deck, 4 feet high, hybrid rail").

const WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  a: 1, an: 1, single: 1, double: 2, pair: 2,
}
const TENS = new Set(['twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'])

// "twenty two by sixteen" → "22 by 16"; "16'x14'" → "16 x 14"
export function normalizeJob(text) {
  let t = ` ${String(text || '').toLowerCase()} `
    .replace(/[“”"]/g, ' in ').replace(/[‘’′']/g, ' ft ').replace(/×/g, ' x ')
    .replace(/(\d)\s*x\s*(\d)/g, '$1 x $2').replace(/(\d)(ft|in|sf|lf)\b/g, '$1 $2')
    .replace(/[^a-z0-9.,;&+/\-\s]/g, ' ')
  t = t.replace(/\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[\s-]+(one|two|three|four|five|six|seven|eight|nine)\b/g,
    (_, a, b) => String(WORDS[a] + WORDS[b]))
  t = t.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\b/g,
    (w) => (TENS.has(w) || !['a', 'an'].includes(w) ? String(WORDS[w]) : w))
  return t.replace(/\s+/g, ' ')
}

const NUM = '(\\d+(?:\\.\\d+)?)'
const num = (v) => (v == null ? undefined : Number(v))
// First "W x D" / "W by D" in a clause.
function dims(t) {
  const m = t.match(new RegExp(`${NUM}\\s*(?:ft|feet|foot)?\\s*(?:x|by)\\s*${NUM}`))
  return m ? [num(m[1]), num(m[2])] : null
}
const has = (t, re) => re.test(t)
// A count in front of a phrase: "two sliders", "3 can lights", "a fire pit" → number (default 1)
function countOf(t, phrase) {
  const m = t.match(new RegExp(`(\\d+)\\s+(?:extra\\s+|more\\s+)?\\b${phrase}`))
  return m ? Number(m[1]) : (new RegExp(`\\b${phrase}`).test(t) ? 1 : 0)
}

// ── Which tool a clause is about ─────────────────────────────────────────────
const ANCHORS = [
  ['underdeck',  /\b(under ?deck|under the deck|underneath the deck|dry ?deck|ceiling under)/],
  ['conversion', /\b(convert|conversion|retrofit|enclose (the |an |my )?existing|existing (screen(ed)? )?porch)/],
  ['porch',      /\b(sun ?room|screen(ed)? ?porch|screen ?eze|screened in|eze[ -]?breeze|3[ -]season|4[ -]season|porch|pavilion)\b/],
  ['hardscape',  /\b(patio|paver|pavers|flagstone|travertine|retaining wall|sitting wall|seat wall|fire ?pit|firepit|outdoor kitchen|french drain|downspout|planter|stone column|bench|granite|hardscape|concrete pad|slab)\b/],
  ['deck',       /\b(re-?deck|resurface|deck|decking)\b/],
]
function anchorOf(clause) {
  // "deck" inside an under-deck or porch-on-deck phrase doesn't make it a deck
  for (const [tool, re] of ANCHORS) if (re.test(clause)) return tool
  return null
}

// Which walls get windows: "front and one side" / "2 walls" / "L shaped" → front + 1 side
function wallsOf(t) {
  if (/all 4 (walls|sides)/.test(t)) return 'All 4 walls'
  if (/front only|just the front|only the front/.test(t)) return 'Front only'
  if (/front (and|\+|&) (1|one) side|(1|one) side and (the )?front|\b2 walls\b|l[ -]?shaped|corner of the house|in the corner/.test(t)) return 'Front + 1 side'
  return undefined
}

// ── Per-tool readers ─────────────────────────────────────────────────────────
function readDeck(t) {
  const out = { tool: 'deck' }
  const d = dims(t); if (d) [out.width, out.depth] = d
  const h = t.match(new RegExp(`${NUM}\\s*(?:ft|feet|foot)?\\s*(?:high|tall|off the ground|above (?:the )?ground|up)\\b`)) ||
            t.match(new RegExp(`(?:height|high)\\s*(?:of\\s*)?${NUM}`))
  if (h) out.height = num(h[1])
  if (has(t, /\b(re-?deck|resurface|redo the decking|replace the (deck )?boards)\b/)) out.jobType = 'Re-deck'
  if (has(t, /\bfree ?standing\b/)) out.freestanding = true

  // Rails first (so "trex cap" / "wood cap" don't read as decking)
  let rest = t
  const railRules = [
    [/hybrid[^,;]*?trex cap|trex cap[^,;]*?hybrid/, 'Hybrid Railing / trex cap'],
    [/hybrid[^,;]*?wood cap|wood cap[^,;]*?hybrid/, 'Hybrid Railing / wood cap'],
    [/\bhybrid\b/, 'Hybrid Railing / trex cap'],
    [/2 ?x ?2|picket|wood rail/, '2x2 pickets wood rail'],
    [/transcend rail/, 'Trex Transcend Railing'],
    [/select rail/, 'Trex Select Railing WHITE ONLY'],
    [/signature[^,;]*between posts/, 'Trex SIGNATURE Alum. Railing BETWEEN POSTS ONLY'],
    [/signature (alum\w*|aluminum )?rail/, 'Trex SIGNATURE Alum. Railing'],
    [/timbertech[^,;]*between posts|between posts/, 'TimberTech Railing BETWEEN POSTS ONLY'],
    [/(timbertech )?(alum\w*|aluminum) rail/, 'TimberTech Alum. Railing'],
    [/iron rod/, 'Iron Rod Railing LF'],
  ]
  for (const [re, key] of railRules) if (re.test(t)) { out.rail = key; rest = rest.replace(re, ' '); break }
  if (!out.rail && has(t, /\b(rail|railing|railings)\b/) && !has(t, /\bno rail/)) out.rail = 'Hybrid Railing / trex cap'
  rest = rest.replace(/\b(trex|wood) cap\b/g, ' ')

  // Decking collection
  const coll = [
    [/vintage[^,;]*(t ?& ?g|tongue)/, 'TimberTech VINTAGE T&G'], [/multi ?width/, 'TimberTech PVC MULTI WIDTH 7.25"/3.5"'],
    [/2 in max|2 ?inch max|\bmax\b/, 'TimberTech PVC 2" MAX'], [/narrow/, 'TimberTech PVC 3.5" (NARROW)'], [/\bwide (pvc|boards?)\b/, 'TimberTech PVC 7.25" (WIDE)'],
    [/transcend/, 'Trex TRANSCEND'], [/lineage/, 'Trex LINEAGE'], [/signature/, 'Trex SIGNATURE'], [/enhance/, 'Trex ENHANCE'],
    [/prime/, 'TimberTech PRIME/+'], [/terrain/, 'TimberTech TERRAIN/+'], [/reserve/, 'TimberTech RESERVE'],
    [/harvest/, 'TimberTech HARVEST PVC'], [/landmark/, 'TimberTech LANDMARK PVC'], [/vintage/, 'TimberTech VINTAGE PVC'],
    [/pressure treated|\bpt\b|\bwood deck|treated/, 'PT'],
  ]
  for (const [re, key] of coll) if (re.test(rest)) { out.collection = key; break }
  if (!out.collection && /\btrex\b/.test(rest)) out.collection = 'Trex ENHANCE'
  if (!out.collection && /\btimber ?tech|azek\b/.test(rest)) out.collection = 'TimberTech PRIME/+'

  if (has(t, /\bfascia\b/)) out.fascia = has(t, /(white|pvc) fascia/) ? 'PVC white' : 'Matching'
  if (has(t, /\b(border|picture ?frame)\b/)) out.border = has(t, /(double|2 board|2-board|two board)/) ? '2-board' : '1-board'
  if (has(t, /lattice/)) out.skirt = 'Lattice (stained)'
  else if (has(t, /trex skirt/)) out.skirt = 'Trex skirt'
  else if (has(t, /\bskirt/)) out.skirt = 'PT skirt (stained)'
  if (has(t, /\b(paint|stain)/)) {
    out.paint = out.collection === 'PT' || !out.collection ? 'PT deck'
      : /hybrid|wood/.test(out.rail || '') ? 'Trex deck · hybrid rail' : 'Trex deck · Trex rail'
  }
  if (has(t, /\b(stairs|steps|staircase|step down)\b/) && !has(t, /\bno (stairs|steps)\b/)) {
    const n = (t.match(/(\d+)\s+(?:sets? of )?(?:stairs|staircases)/) || [])[1]
    const across = (t.match(new RegExp(`(?:stairs|steps)[^,;]*?${NUM}\\s*(?:ft|feet|foot)?\\s*wide`)) || t.match(new RegExp(`${NUM}\\s*(?:ft|feet|foot)?\\s*wide (?:stairs|steps)`)) || [])[1]
    const steps = (t.match(/(\d+)\s+(?:box )?steps\b/) || [])[1]
    const style = has(t, /box step/) ? 'Box' : 'Regular'
    out.stairs = Array.from({ length: Math.min(4, Number(n) || 1) }, () => ({ across: num(across), steps: num(steps), style }))
  }
  const land = [...t.matchAll(new RegExp(`${NUM}\\s*(?:ft)?\\s*(?:x|by)\\s*${NUM}\\s*(?:ft)?\\s*landing`, 'g'))]
  if (land.length) out.landings = land.map(m => ({ width: num(m[1]), depth: num(m[2]) }))
  else if (has(t, /\blanding\b/)) out.landings = [{ width: 4, depth: 4 }]
  return out
}

function readPorch(t) {
  const out = { tool: 'porch' }
  out.type = has(t, /sun ?room|4[ -]season/) ? 'sunroom'
    : has(t, /eze[ -]?breeze|3[ -]season/) ? 'ezebreeze'
    : has(t, /screen/) ? 'screen' : 'open'
  const d = dims(t); if (d) [out.width, out.depth] = d
  if (has(t, /free ?standing/)) out.tie = 'free'
  else if (has(t, /roof ?tie|tie (into|in to) the roof|off the roof/)) out.tie = 'roof'
  else if (has(t, /wall ?tie/)) out.tie = 'wall'
  if (has(t, /\b(on|over) (the |an |existing )*(patio|slab|concrete)|existing patio\b/)) out.floor = 'patio'
  else if (has(t, /\b(new )?deck\b/)) out.floor = 'deck'
  if (has(t, /\bhip\b/)) out.roof = 'hip'
  else if (has(t, /semi ?vault/)) out.roof = 'semivault'
  else if (has(t, /\b(gable|a-frame|a frame|cathedral|vaulted)\b/)) out.roof = 'gable'
  else if (has(t, /\bshed\b/)) out.roof = 'shed'
  const deckH = t.match(new RegExp(`${NUM}\\s*(?:ft|feet|foot)?\\s*(?:high|off the ground|above (?:the )?ground)`))
  if (deckH) out.deckHeightFt = num(deckH[1])
  const wallIn = t.match(new RegExp(`${NUM}\\s*in\\w*\\s*(?:tall\\s*)?walls?`)) || t.match(new RegExp(`walls?\\s*(?:are\\s*)?${NUM}\\s*in`))
  const wallFt = t.match(new RegExp(`${NUM}\\s*(?:ft|feet|foot)\\s*(?:tall\\s*)?walls?`)) || t.match(new RegExp(`walls?\\s*(?:are\\s*)?${NUM}\\s*(?:ft|feet|foot)`))
  if (wallIn) out.wallHeightIn = num(wallIn[1]); else if (wallFt) out.wallHeightIn = Math.round(num(wallFt[1]) * 12)
  out.sides = wallsOf(t)

  const doors = {}
  if (out.type === 'sunroom') {
    const big = (word) => (t.match(new RegExp(`(\\d+)\\s*(?:ft|foot)?\\s*${word}`)) || [])[1]
    const sliders = countOf(t, '(?:\\d+\\s*(?:ft|foot)?\\s*)?slid(?:er|ers|ing (?:glass )?doors?)')
    if (sliders) doors[Number(big('slid')) === 5 ? 'sun_door_slider5' : 'sun_door_slider6'] = sliders
    const french = countOf(t, '(?:\\d+\\s*(?:ft|foot)?\\s*)?french doors?')
    if (french) doors[Number(big('french')) === 5 ? 'sun_door_french5' : 'sun_door_french6'] = french
    const full = countOf(t, '(?:full ?view|glass door|entry door|storm door)s?')
    if (full) doors.sun_door_fullview36 = full
    if (has(t, /door[s]? (on|in) the front|front door/)) out.doorWall = 'front'
  } else if (out.type !== 'open') {
    const pet = countOf(t, 'pet doors?'); if (pet) doors.door_savannah_pet = pet
    const sav = countOf(t, 'savannah(?! pet)'); if (sav) doors.door_savannah = sav
    const trade = countOf(t, '(?:tradewinds?|storm doors?|screen doors?|doors?)')
    if (trade && !pet && !sav) doors.door_tradewinds = trade
  }
  if (Object.keys(doors).length) out.doors = doors

  if (has(t, /gold/)) out.elecPackage = 'elec_3s_gold'
  else if (has(t, /12 ?v|twelve volt|low voltage package/)) out.elecPackage = 'elec_12v'
  else if (has(t, /minimum (electric|package)/)) out.elecPackage = 'elec_3s_min'
  else if (has(t, /simple (electric|package)/)) out.elecPackage = 'elec_simple'
  else if (has(t, /\b(standard )?(electric|electrical|lights and (a )?fan|fan and lights)\b/)) out.elecPackage = 'elec_standard'

  if (has(t, /trex (enhance )?(floor|decking)|enhance floor/)) out.flooring = 'floor_trex_enhance'
  else if (has(t, /transcend (floor|decking)/)) out.flooring = 'floor_trex_transcend'

  const extras = {}
  const e15 = countOf(t, '(?:15 ?amp|15a) outlets?'); if (e15) extras.elec_outlet15 = e15
  const e30 = countOf(t, '30 ?amp'); if (e30) extras.elec_30amp = e30
  const gfi = countOf(t, 'gfi'); if (gfi) extras.elec_gfi = gfi
  const outl = t.match(/(\d+)\s+(?:extra\s+|more\s+)?outlets?/); if (outl && !e15) extras.elec_outlet = Number(outl[1])
  const fans = t.match(/(\d+)\s+(?:extra\s+)?(?:ceiling\s+)?fans?/); if (fans && Number(fans[1]) > 1) extras.elec_fan = Number(fans[1]) - 1
  const cans = t.match(/(\d+)\s+(?:extra\s+)?(?:can|recessed)\s+lights?/); if (cans) extras.elec_can = Number(cans[1])
  if (Object.keys(extras).length) out.extras = extras
  return out
}

function readConversion(t) {
  const out = { tool: 'conversion' }
  const d = dims(t); if (d) [out.width, out.depth] = d
  const wallIn = t.match(new RegExp(`${NUM}\\s*in\\w*\\s*(?:tall\\s*)?walls?`))
  const wallFt = t.match(new RegExp(`${NUM}\\s*(?:ft|feet|foot)\\s*(?:tall\\s*)?walls?`))
  if (wallIn) out.wallHeight = num(wallIn[1]); else if (wallFt) out.wallHeight = Math.round(num(wallFt[1]) * 12)
  const doors = t.match(/(\d+)\s+doors?/); if (doors) out.doors = Number(doors[1]); else if (has(t, /\bno doors?\b/)) out.doors = 0
  out.sides = wallsOf(t)
  return out
}

function readUnderdeck(t) {
  const out = { tool: 'underdeck' }
  const d = dims(t); if (d) [out.width, out.depth] = d
  out.style = has(t, /bead ?board/) ? 'bead' : has(t, /faux|wood look|wood grain/) ? 'faux' : has(t, /flat|smooth/) ? 'flat' : undefined
  const el = {}
  if (has(t, /12 ?v|package/)) el.pkg12v = 1
  const fans = countOf(t, 'fans?'); if (fans && !el.pkg12v) el.fan = fans
  const cans = t.match(/(\d+)\s+(?:can|recessed)\s+lights?/); if (cans) el.can = Number(cans[1])
  const heat = countOf(t, '(?:infratech )?heaters?'); if (heat) el[has(t, /recessed/) ? 'heaterRec' : 'heaterBlk'] = heat
  if (Object.keys(el).length) out.electrical = el
  return out
}

function readHardscape(t) {
  const out = { tool: 'hardscape' }
  // Patio: the size next to "patio" (or the first size in the clause)
  const pm = t.match(new RegExp(`${NUM}\\s*(?:ft)?\\s*(?:x|by)\\s*${NUM}[^,;]*?\\b(patio|pavers?|flagstone|travertine|slab|pad)`)) ||
             t.match(new RegExp(`\\b(?:patio|pavers?|slab|pad)\\b[^,;]*?${NUM}\\s*(?:ft)?\\s*(?:x|by)\\s*${NUM}`))
  const patio = {}
  if (pm) { const a = pm.slice(1).filter(v => /^\d/.test(v || '')); patio.width = num(a[0]); patio.depth = num(a[1]) }
  const surf = [
    [/flagstone[^,;]*existing/, 'flagExisting'], [/flagstone/, 'flagConcrete'],
    [/travertine[^,;]*premium|premium travertine/, 'travPrem'], [/travertine/, 'travStd'],
    [/plaza[^,;]*3|3 piece/, 'plaza3'], [/plaza|2 piece|keystone/, 'plaza2'], [/panorama/, 'panorama'],
    [/brick/, 'brick'], [/manchester|antika|\beva\b/, 'tbManchester'], [/\bpara\b/, 'tbPara'], [/\bblu\b/, 'tbBlu'],
    [/reinforced/, 'reinforced'], [/(hill|driveway)[^,;]*concrete|concrete[^,;]*(hill|driveway)/, 'hill'], [/concrete|slab|\bpad\b/, 'concrete4'],
  ]
  for (const [re, key] of surf) if (re.test(t)) { patio.surface = key; break }
  if (Object.keys(patio).length) out.patio = patio

  const wm = t.match(/retaining wall[^,;]*/)
  if (wm) {
    const w = wm[0]
    const wall = { type: /techo/.test(w) ? 'wallTecho' : 'wallStd' }
    const len = w.match(new RegExp(`${NUM}\\s*(?:ft|feet|foot)?\\s*(?:long|of wall|lf|linear)`)) || t.match(new RegExp(`${NUM}\\s*(?:ft|feet|foot)?\\s*(?:long\\s*)?retaining wall`))
    const hi = w.match(new RegExp(`${NUM}\\s*(?:ft|feet|foot)?\\s*(?:high|tall)`))
    const bf = t.match(new RegExp(`${NUM}\\s*(?:ft|feet|foot)?\\s*(?:of\\s*)?backfill`))
    if (len) wall.length = num(len[1]); if (hi) wall.height = num(hi[1]); if (bf) wall.backfillDepth = num(bf[1])
    out.wall = wall
  }

  const qty = {}
  const lf = (re) => { const m = t.match(new RegExp(`${NUM}\\s*(?:ft|feet|foot|lf)?\\s*(?:of\\s*)?${re}`)) || t.match(new RegExp(`${re}[^,;]*?${NUM}\\s*(?:ft|feet|foot|lf)`)); return m ? num(m[1]) : 0 }
  if (has(t, /fire ?pit|firepit/)) qty[has(t, /natural stone[^,;]*fire|fire ?pit[^,;]*natural stone/) ? 'firepitStone' : has(t, /veneer[^,;]*fire|fire ?pit[^,;]*veneer/) ? 'firepitVen' : 'firepitKit'] = countOf(t, '(?:fire ?pits?|firepits?)') || 1
  if (has(t, /sitting wall|seat wall/)) qty[has(t, /keystone/) ? 'sitKeystone' : has(t, /techo/) ? 'sitTecho' : 'sitVeneer'] = countOf(t, '(?:sitting|seat) walls?') || 1
  const fd = lf('french drain'); if (fd) qty.frenchDrain = fd
  const bd = lf('buried downspouts?'); if (bd) qty.buriedDs = bd
  const ds = !bd && countOf(t, '(?:re-?route\\s+)?downspouts?'); if (ds) qty.downspout = ds
  const nds = lf('(?:nds )?drain line'); if (nds) qty.ndsDrain = nds
  const cols = countOf(t, '(?:stone )?columns?'); if (cols && has(t, /column/)) qty[has(t, /24/) ? 'col24' : 'col18'] = cols
  const kit = lf('(?:outdoor )?kitchen'); if (kit) qty.kitchenLF = kit; else if (has(t, /outdoor kitchen/)) qty.kitchenLF = 0
  if (has(t, /pizza oven|fireplace/)) qty.pizzaOven = 1
  const bench = lf('(?:brick |stone )?bench'); if (bench) qty[has(t, /natural stone bench|stone bench/) ? 'stoneBench' : 'brickBench'] = bench
  for (const k of Object.keys(qty)) if (!qty[k]) delete qty[k]
  if (Object.keys(qty).length) out.qty = qty

  const g = t.match(/granite[^,;]*level\s*(\d)|level\s*(\d)\s*granite/)
  if (g) out.granite = { level: `g${g[1] || g[2]}` }
  return out
}

const READERS = { deck: readDeck, porch: readPorch, conversion: readConversion, underdeck: readUnderdeck, hardscape: readHardscape }

// ── Whole job → tools ────────────────────────────────────────────────────────
export function readJob(text) {
  const t = normalizeJob(text)
  // Clauses: commas, semicolons, "plus", "also", "and a/an", "then"
  const clauses = t.split(/\s*(?:[,;]|\bplus\b|\balso\b|\bthen\b|\band (?=an? |also )|\band the\b)\s*/).map(s => s.trim()).filter(Boolean)
  const groups = []          // [{ tool, text }]
  const notCovered = []
  for (const c of clauses) {
    let tool = anchorOf(c)
    // "16x14 sunroom on the deck" → porch, not deck; a porch "on a new deck" stays the porch
    if (tool === 'deck' && groups.length && groups[groups.length - 1].tool === 'porch' && /\b(on|over) (a |the )?(new )?deck\b/.test(c) && !dims(c)) tool = 'porch'
    const same = tool && groups.find(g => g.tool === tool && (tool === 'hardscape' || !dims(c)))
    if (tool && same) { same.text += ` , ${c}`; continue }
    if (tool) { groups.push({ tool, text: c }); continue }
    if (groups.length) { groups[groups.length - 1].text += ` , ${c}`; continue }
    notCovered.push(c)
  }
  const tools = groups.map(g => READERS[g.tool](g.text))
  return { tools, notCovered }
}
