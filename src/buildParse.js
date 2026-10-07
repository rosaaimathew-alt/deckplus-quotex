// Natural-language → builder-tool specs. Powers the "Quick Build" box: a
// contractor types OR dictates a job and the AI fills Deck Plus's own builder
// tools (deck, porch / sunroom, porch conversion, under-deck, hardscape) —
// never loose catalog items. Each tool then opens pre-filled for the rep to
// check and add, so pricing always comes from the tools. Uses the app's
// server-proxied AI.
import { getModel } from './gemini'
import { DECK_COLLECTIONS, DECK_RAILS, DECK_SKIRT_OPTIONS, DECK_PAINT_OPTIONS, stepsForHeight, runOutForSteps } from './lib/deckPricing'
import { PORCH_BUILD_DEFAULTS, PORCH_TYPES, PORCH_TIES, PORCH_FLOORS, PORCH_ROOFS } from './porchBuild'
import { HS_CONCRETE, HS_PAVERS, HS_WALLS, HS_ACCESSORIES, HS_KITCHEN, HS_GRANITE } from './hardscape'
import { UDC_STYLES, UDC_ELECTRICAL } from './underDeck'

const opts = (list) => list.map(([k, label]) => `  ${k} = ${label}`).join('\n')
const keysOf = (pred) => Object.entries(PORCH_BUILD_DEFAULTS).filter(([, r]) => pred(r)).map(([k, r]) => [k, r.label])

function systemPrompt() {
  return `You turn a deck/porch contractor's spoken job description into settings for their estimating TOOLS.
Return ONLY a JSON object: { "tools": [ ... ], "notCovered": [ "..." ] }

Use one entry in "tools" per piece of work. Use ONLY the keys listed below, copied exactly. Leave out
anything the contractor didn't say — the tool fills sensible defaults. Never invent prices.
"16 by 16" / "16x16" → width 16, depth 16 (first number = width, along the house).

1) DECK (open deck, new or re-deck):
{ "tool":"deck", "jobType":"New deck"|"Re-deck", "collection":<collection>, "width":ft, "depth":ft, "height":ft,
  "rail":<rail>, "fascia":"None"|"Matching"|"PVC white", "border":"None"|"1-board"|"2-board",
  "skirt":<skirt>, "paint":<paint>, "stairs":[{"across":ft,"steps":n,"style":"Regular"|"Box"}],
  "landings":[{"width":ft,"depth":ft}], "freestanding":bool }
collection:
${opts(DECK_COLLECTIONS.map(c => [JSON.stringify(c.key), c.key]))}
rail:
${opts(DECK_RAILS.map(r => [JSON.stringify(r.key), r.key]))}
skirt: ${Object.keys(DECK_SKIRT_OPTIONS).map(k => JSON.stringify(k)).join(', ')}
paint: ${Object.keys(DECK_PAINT_OPTIONS).map(k => JSON.stringify(k)).join(', ')}

2) PORCH — a NEW roofed porch: open, ScreenEze screen porch, Eze-Breeze 3-season porch, or sunroom:
{ "tool":"porch", "type":<type>, "width":ft, "depth":ft, "tie":<tie>, "floor":<floor>, "roof":<roof>,
  "deckHeightFt":ft, "wallHeightIn":in, "sides":"Front + 2 sides"|"All 4 walls"|"Front only",
  "doors":{<door>:count}, "doorWall":"side"|"front", "flooring":<flooring>, "elecPackage":<package>,
  "extras":{<extra>:qty} }
type: ${PORCH_TYPES.map(t => `${t.key} (${t.label})`).join(', ')}
tie: ${PORCH_TIES.map(t => `${t.key} (${t.label})`).join(', ')}
floor: ${PORCH_FLOORS.map(t => `${t.key} (${t.label})`).join(', ')}
roof: ${PORCH_ROOFS.map(t => `${t.key} (${t.label})`).join(', ')}
door for ScreenEze / Eze-Breeze:
${opts(keysOf(r => r.door))}
door for a sunroom:
${opts(keysOf(r => r.sunDoor))}
flooring:
${opts(keysOf(r => r.floor))}
package (electrical):
${opts(keysOf(r => r.elecPkg))}
extra (quantity = count, or SF / LF for area / length items):
${opts(keysOf(r => r.option))}

3) CONVERSION — adding Eze-Breeze windows to an EXISTING porch (no new structure):
{ "tool":"conversion", "width":ft, "depth":ft, "wallHeight":in, "doors":n }

4) UNDERDECK — dry ceiling under a deck:
{ "tool":"underdeck", "width":ft, "depth":ft, "style":<style>, "electrical":{<item>:count} }
style: ${UDC_STYLES.map(s => `${s.key} (${s.label})`).join(', ')}
item:
${opts(UDC_ELECTRICAL.map(e => [e.key, e.label]))}

5) HARDSCAPE — patio, retaining wall, fire pit, drainage, outdoor kitchen:
{ "tool":"hardscape", "patio":{"width":ft,"depth":ft,"surface":<surface>},
  "wall":{"type":<wall>,"length":ft,"height":ft,"backfillDepth":ft},
  "qty":{<item>:qty}, "granite":{"level":<granite>,"length":ft,"depth":ft} }
surface:
${opts([...HS_CONCRETE, ...HS_PAVERS].map(i => [i.key, i.label]))}
wall: ${HS_WALLS.map(i => `${i.key} (${i.label})`).join(', ')}
item (accessories and kitchen; unit in brackets):
${opts([...HS_ACCESSORIES, ...HS_KITCHEN].map(i => [i.key, `${i.label} [${i.unit}]`]))}
granite: ${HS_GRANITE.map(i => `${i.key} (${i.label})`).join(', ')}

Rules:
- A deck and a porch (or patio) in the same job are SEPARATE entries.
- Permits and fees are added automatically — never list them.
- Anything no tool above covers goes in "notCovered" as the contractor's words.`
}

export async function parseBuildSpec(text) {
  const clean = (text || '').trim()
  if (!clean) throw new Error('Say or type a job, e.g. "20 by 16 Trex Enhance deck 4 feet high with hybrid rail and a 12 by 12 paver patio".')
  const model = getModel(systemPrompt())
  const out = await model.generateContent(`JOB: ${clean}`, { maxTokens: 2000, json: true })
  const raw = out.response.text()
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('Could not read that. Try rephrasing the job.')
  let spec
  try { spec = JSON.parse(match[0]) } catch { throw new Error('Could not read that. Try rephrasing the job.') }
  const tools = (Array.isArray(spec.tools) ? spec.tools : []).filter(t => t && ['deck', 'porch', 'conversion', 'underdeck', 'hardscape'].includes(t.tool))
  return { tools, notCovered: Array.isArray(spec.notCovered) ? spec.notCovered.filter(Boolean).map(String) : [] }
}

// ── AI spec → what opens in the builder ──────────────────────────────────────
// Every value is checked against the tool's own option lists; anything the AI
// got wrong or left out is dropped so the tool's default applies.
const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : undefined)
const oneOf = (v, list) => (list.includes(v) ? v : undefined)
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ''))
const pickQty = (obj, allowed) => clean(Object.fromEntries(Object.entries(obj || {}).filter(([k]) => allowed.includes(k)).map(([k, v]) => [k, num(v)])))
let _seq = 0
const uid = () => `qb-${Date.now()}-${++_seq}`
const size = (w, d) => (w && d ? ` — ${w}′×${d}′` : '')

export function quickToolFor(spec) {
  const s = spec || {}
  if (s.tool === 'deck') {
    const height = num(s.height)
    const coll = oneOf(s.collection, DECK_COLLECTIONS.map(c => c.key))
    const stairs = Array.isArray(s.stairs) && s.stairs.length
      ? s.stairs.map(st => {
          const given = num(st?.steps)
          const steps = given || stepsForHeight(height || 3) || 3
          return { id: uid(), out: runOutForSteps(steps), across: num(st?.across) || 4, steps, style: st?.style === 'Box' ? 'Box' : 'Regular', auto: !given }
        })
      : undefined
    const landings = Array.isArray(s.landings) && s.landings.length
      ? s.landings.map(l => ({ id: uid(), width: num(l?.width) || 4, depth: num(l?.depth) || 4 }))
      : undefined
    return {
      assembly: 'deck', label: `Deck${coll ? ` · ${coll}` : ''}${size(num(s.width), num(s.depth))}`,
      saved: clean({
        jobType: s.jobType === 'Re-deck' ? 'Re-deck' : undefined, collKey: coll,
        width: num(s.width), depth: num(s.depth), height,
        rail: oneOf(s.rail, DECK_RAILS.map(r => r.key)), fascia: oneOf(s.fascia, ['None', 'Matching', 'PVC white']),
        border: oneOf(s.border, ['None', '1-board', '2-board']), skirt: oneOf(s.skirt, Object.keys(DECK_SKIRT_OPTIONS)),
        paint: oneOf(s.paint, Object.keys(DECK_PAINT_OPTIONS)), freestanding: s.freestanding === true ? true : undefined,
        stairs, landings,
      }),
    }
  }
  if (s.tool === 'porch') {
    const keys = (pred) => Object.keys(PORCH_BUILD_DEFAULTS).filter(k => pred(PORCH_BUILD_DEFAULTS[k]))
    const type = oneOf(s.type, PORCH_TYPES.map(t => t.key))
    const inp = clean({
      type, width: num(s.width), depth: num(s.depth),
      tie: oneOf(s.tie, PORCH_TIES.map(t => t.key)), floor: oneOf(s.floor, PORCH_FLOORS.map(t => t.key)),
      roof: oneOf(s.roof, PORCH_ROOFS.map(t => t.key)), deckHeightFt: num(s.deckHeightFt), wallHeightIn: num(s.wallHeightIn),
      sides: oneOf(s.sides, ['Front + 2 sides', 'All 4 walls', 'Front only']),
      doors: pickQty(s.doors, keys(r => r.door || r.sunDoor)), doorWall: oneOf(s.doorWall, ['side', 'front']),
      flooring: oneOf(s.flooring, keys(r => r.floor)), elecPackage: oneOf(s.elecPackage, keys(r => r.elecPkg)),
      extras: pickQty(s.extras, keys(r => r.option)),
    })
    if (inp.doors && !Object.keys(inp.doors).length) delete inp.doors
    if (inp.extras && !Object.keys(inp.extras).length) delete inp.extras
    const label = PORCH_TYPES.find(t => t.key === type)?.label || 'Porch'
    return { assembly: 'porchbuild', label: `${label}${size(inp.width, inp.depth)}`, saved: { inp } }
  }
  if (s.tool === 'conversion') {
    return {
      assembly: 'porch', label: `Porch conversion${size(num(s.width), num(s.depth))}`,
      initial: clean({ width: num(s.width), depth: num(s.depth), wallHeight: num(s.wallHeight), doors: Number.isFinite(Number(s.doors)) ? Number(s.doors) : undefined }),
    }
  }
  if (s.tool === 'underdeck') {
    const inp = clean({
      width: num(s.width), depth: num(s.depth), style: oneOf(s.style, UDC_STYLES.map(x => x.key)),
      electrical: pickQty(s.electrical, UDC_ELECTRICAL.map(e => e.key)),
    })
    return { assembly: 'underdeck', label: `Under-deck ceiling${size(inp.width, inp.depth)}`, initial: { underDeck: inp } }
  }
  if (s.tool === 'hardscape') {
    const patio = clean({ width: num(s.patio?.width), depth: num(s.patio?.depth), surface: oneOf(s.patio?.surface, [...HS_CONCRETE, ...HS_PAVERS].map(i => i.key)) })
    const wall = clean({ type: oneOf(s.wall?.type, HS_WALLS.map(i => i.key)), length: num(s.wall?.length), height: num(s.wall?.height), backfillDepth: num(s.wall?.backfillDepth) })
    const granite = clean({ level: oneOf(s.granite?.level, HS_GRANITE.map(i => i.key)), length: num(s.granite?.length), depth: num(s.granite?.depth) })
    const qty = pickQty(s.qty, [...HS_ACCESSORIES, ...HS_KITCHEN].map(i => i.key))
    return {
      assembly: 'hardscape', label: `Hardscape${size(patio.width, patio.depth)}`,
      initial: { hardscape: clean({ patio, wall, granite, qty: Object.keys(qty).length ? qty : undefined }) },
    }
  }
  return null
}
