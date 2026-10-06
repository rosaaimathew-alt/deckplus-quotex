import { useMemo, useState } from 'react'
import { Plus, X, Lock, RotateCcw } from 'lucide-react'
import { useStore } from '../store'
import { JicField } from './Jic'
import { scopeFor, countWords } from '../lib/scopeText'
import { JIC_DEFAULT, jicAmount, jicLine } from '../lib/jic'
import {
  DECK_COLLECTIONS, DECK_RAILS, BRONZE_BALUSTERS, DECK_FASCIA, DECK_SKIRT_OPTIONS, DECK_PAINT_OPTIONS, DECK_ITEMS,
  catalogPrice, matchCollection, deckTakeoff, stepsForHeight, runOutForSteps, STEP_FACTOR,
} from '../lib/deckPricing'

// ── Deck Builder — priced like the Deck Plus price list ──────────────────────
// Square feet × the collection's $/SF for the deck, steps (×1.5) and landings;
// linear feet × $/LF for railing and fascia; then the sheet's add-ons. Every
// rate is the catalog item's price. The rep can change any quantity; rates are
// read-only for non-managers when the manager locks the formula.

const n = (v) => Number(v) || 0
const money = (v) => '$' + Math.round(v).toLocaleString('en-US')
const money2 = (v) => '$' + (Math.round(n(v) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
const ft = (v) => `${n(v)}’`
const fmtQty = (v) => (Math.round(n(v) * 100) / 100).toString()
let seq = 0
const uid = () => `${Date.now()}-${++seq}`
const lineId = () => Date.now() + Math.random()
const NONE = []

const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-300)]'
const smallCls = 'w-16 text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white'

export default function DeckPricingPanel({ onClose, onAdd, initial }) {
  const catalog          = useStore(s => s.catalog)
  const customComponents = useStore(s => s.deckCustomComponents) || NONE
  const formulaLocked    = useStore(s => s.deckFormulaLocked)
  const scopeTemplate    = useStore(s => s.deckScopeTemplate)
  const isManager        = useStore(s => (s.role || 'manager') === 'manager')
  const priceLocked      = formulaLocked && !isManager

  const startH = initial?.height ?? 3
  const [jobType, setJobType]   = useState('New deck')
  const [collKey, setCollKey]   = useState(matchCollection(initial?.collection) || 'Trex ENHANCE')
  const [width, setWidth]       = useState(initial?.width ?? 20)
  const [depth, setDepth]       = useState(initial?.depth ?? 16)
  const [height, setHeight]     = useState(startH)
  const [sections, setSections] = useState(() => (initial?.extraSections || []).map(s => ({ id: uid(), width: s.width, depth: s.depth })))
  const [stairs, setStairs]     = useState(() => {
    if (initial?.stairs === false || !(n(startH) > 0)) return []
    const steps = stepsForHeight(startH)
    return [{ id: uid(), out: runOutForSteps(steps), across: 4, steps }]
  })
  const [landings, setLandings] = useState(() => Array.from({ length: n(initial?.landings) }, () => ({ id: uid(), width: 4, depth: 4 })))
  const [stepStyle, setStepStyle] = useState(initial?.stepStyle === 'Box steps' ? 'Box steps' : 'Regular steps')
  const [rail, setRail]         = useState(initial?.railing ? 'Hybrid Railing / trex cap' : 'None')
  const [bronze, setBronze]     = useState(false)
  const [fascia, setFascia]     = useState(initial?.fascia ? 'Matching' : 'None')
  const [border, setBorder]     = useState(initial?.border === 'Double' ? '2-board' : initial?.border === 'Single' ? '1-board' : 'None')
  const [cortex, setCortex]     = useState('None')
  const [skirt, setSkirt]       = useState('None')
  const [paint, setPaint]       = useState('None')
  const [freestanding, setFreestanding] = useState(false)
  const [extras, setExtras]     = useState({})   // add-on quantities typed by the rep
  const [qtyOv, setQtyOv]       = useState({})   // quantity overrides, by row key
  const [rateOv, setRateOv]     = useState({})   // rate overrides, by row key
  const [jic, setJic]           = useState(JIC_DEFAULT)

  const coll   = DECK_COLLECTIONS.find(c => c.key === collKey) || DECK_COLLECTIONS[0]
  const redeck = jobType === 'Re-deck'
  const canRedeck = !!coll.redeck
  const t = deckTakeoff({ width, depth, sections, stairs, landings })
  const W = n(width), D = n(depth), H = n(height)

  // ── Rows: one per price-list line in use ──────────────────────────────────
  const rows = useMemo(() => {
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
        { calc: stairs.map(s => `${n(s.out)}×${n(s.across)}×${STEP_FACTOR}`).join(' + ') })
    }
    if (t.landingSF > 0) {
      const item = coll.landing ? `${coll.fam} Landing` : `${coll.fam} Deck`
      push('landing', `${coll.fam} Landing${coll.landing ? '' : ' (deck rate)'}`, item, 'SF', t.landingSF, coll.rate,
        { calc: landings.map(l => `${n(l.width)}×${n(l.depth)}`).join(' + ') })
    }
    if (stepStyle === 'Box steps' && t.stepCount > 0) push('boxstep', 'Box steps (per step)', DECK_ITEMS.boxstep.item, 'EA', t.stepCount, DECK_ITEMS.boxstep.rate)

    const railOpt = DECK_RAILS.find(r => r.key === rail)
    const railLF  = t.openLF + t.stairRailLF
    if (railOpt && railOpt.rate != null) {
      push('rail', railOpt.key, railOpt.key, 'LF', railLF, railOpt.rate, { calc: `3 sides ${t.openLF}${t.stairRailLF ? ` + stairs ${t.stairRailLF}` : ''}` })
      if (bronze) push('bronze', 'Bronze balusters (add)', BRONZE_BALUSTERS.item, 'LF', qtyOv.rail ?? railLF, BRONZE_BALUSTERS.rate)
    }

    const fasciaOpt = fascia === 'PVC white' ? DECK_FASCIA.pvcwhite : fascia === 'Matching' && coll.fascia ? DECK_FASCIA[coll.fascia] : null
    if (fasciaOpt) push('fascia', fasciaOpt.item.replace(/ LF$/, ''), fasciaOpt.item, 'LF', t.openLF, fasciaOpt.rate, { calc: '3 open sides' })

    if (border !== 'None') {
      const b = border === '2-board' ? DECK_ITEMS.border2 : DECK_ITEMS.border1
      push('border', b.item.replace(/ SF$/, ''), b.item, 'SF', t.deckSF, b.rate)
    }
    if (cortex !== 'None') {
      const c = cortex === 'PVC' ? DECK_ITEMS.cortexPvc : DECK_ITEMS.cortexComp
      push('cortex', c.item, c.item, 'EA', Math.max(1, Math.ceil(t.stepCount / 15)), c.rate)
    }

    const sk = DECK_SKIRT_OPTIONS[skirt]
    if (sk) {
      const skirtSF = Math.round(t.openLF * H)
      push('skirt', sk.item, sk.item, sk.unit, sk.sheetSF ? Math.ceil(skirtSF / sk.sheetSF) : skirtSF, sk.rate,
        { calc: `${t.openLF} LF × ${H}′${sk.sheetSF ? ` = ${skirtSF} SF ÷ 32` : ''}` })
    }
    const pt = DECK_PAINT_OPTIONS[paint]
    if (pt) {
      const paintSF = Math.round(t.deckSF + t.stepSF + t.landingSF)
      push('paint', pt.item, pt.item, 'SF', paintSF, pt.rate, { calc: `deck${t.stepSF ? ' + steps' : ''}${t.landingSF ? ' + landings' : ''}` })
    }

    if (H > 8) push('high', DECK_ITEMS.high.item, DECK_ITEMS.high.item, 'SF', t.deckSF, DECK_ITEMS.high.rate, { calc: `${H}′ high` })
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
  }, [catalog, coll, redeck, canRedeck, t, W, D, H, stairs, landings, stepStyle, rail, bronze, fascia, border, cortex, skirt, paint, freestanding, extras, customComponents, qtyOv, rateOv])

  const price = rows.reduce((s, r) => s + r.line, 0)
  const cost  = rows.reduce((s, r) => s + r.lineCost, 0)
  const marginPct = price > 0 ? ((price - cost) / price) * 100 : 0
  const row = (k) => rows.find(r => r.key === k)

  // ── Scope, in the catalog's own wording ──────────────────────────────────
  const description = (() => {
    const lines = (scopeTemplate || '').split('\n').map(s => s.trim()).filter(Boolean)
    const fb = (r, text) => r ? scopeFor(catalog, r.item, { sqft: r.qty, lf: r.qty, count: r.qty }, text) : null
    if (redeck && canRedeck) lines.push(scopeFor(catalog, coll.redeck.item, { size: [W, D], sqft: t.deckSF },
      `Remove the existing decking and install new ${coll.key} decking on the existing joists, approximately ${ft(W)}x${ft(D)}.`))
    else lines.push(scopeFor(catalog, `${coll.fam} Deck`, { size: [W, D] },
      `Build a pressure treated wood deck platform approximately ${ft(W)}x${ft(D)}.\n• ${coll.key} decking as flooring, installed with hidden fasteners.`))
    if (sections.length) lines.push('Deck layout as per drawing.')
    if (row('border')) lines.push(fb(row('border'), `${border} border.`))
    if (row('fascia')) lines.push(fb(row('fascia'), `${row('fascia').label} around the deck.`))
    for (const s of stairs) {
      const steps = n(s.steps)
      if (steps <= 0 && n(s.out) <= 0) continue
      lines.push(stepStyle === 'Box steps'
        ? scopeFor(catalog, DECK_ITEMS.boxstep.item, { count: steps, width: s.across }, `Approximately ${countWords(steps)} ${ft(s.across)} wide BOX steps to grade.`)
        : scopeFor(catalog, coll.steps ? `${coll.fam} Steps` : null, { count: steps, width: s.across }, `Approximately ${countWords(steps)} ${ft(s.across)} wide steps to grade.`).replace(/^__’x__’ landing and a/, 'A'))
    }
    for (const l of landings) lines.push(scopeFor(catalog, coll.landing ? `${coll.fam} Landing` : null, { size: [l.width, l.depth] }, `${ft(l.width)}x${ft(l.depth)} landing.`))
    if (row('rail')) lines.push(fb(row('rail'), `Install ${rail}.`))
    if (row('bronze')) lines.push(fb(row('bronze'), 'Bronze balusters (special order).'))
    for (const k of ['cortex', 'skirt', 'paint', 'high', 'freestand', 'demoDeck', 'demoConc', 'footings', 'lvl', 'hottub', 'bracePlate', 'braceLetter', 'posts8x8', 'gate', 'privacy']) {
      const r = row(k)
      if (r) lines.push(fb(r, `${r.label}.`))
    }
    return lines.filter(Boolean).join('\n')
  })()

  const add = () => {
    const jl = jicLine(jic, price, { section: 'Deck', category: 'Decks', label: 'deck' })
    onAdd([{
      id: lineId(),
      catalogId: null,
      name: `${coll.key} ${redeck && canRedeck ? 'Re-Deck' : 'Open Deck'} — ${W}′×${D}′ (${t.deckSF} SF)`,
      section: 'Deck',
      description,
      unit: 'EA',
      qty: 1,
      unitPrice: Math.round(price),
      category: 'Decks',
      costMaterials: Math.round(cost),
      costSub: 0,
    }, ...(jl ? [jl] : [])])
    onClose()
  }

  // ── Small field helpers ───────────────────────────────────────────────────
  const field = (label, value, onChange, props = {}) => (
    <label className="block">
      <span className="text-xs font-medium text-gray-500 block mb-1">{label}</span>
      <input type="number" min="0" value={value} onChange={e => onChange(e.target.value)} className={inputCls} {...props} />
    </label>
  )
  const pick = (label, value, onChange, options) => (
    <label className="block">
      <span className="text-xs font-medium text-gray-500 block mb-1">{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} className={inputCls}>
        {options.map(o => typeof o === 'string'
          ? <option key={o} value={o}>{o}</option>
          : <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
      </select>
    </label>
  )
  const clearOv = (...keys) => {
    setQtyOv(o => { const c = { ...o }; keys.forEach(k => delete c[k]); return c })
  }
  const setStair = (id, p) => { setStairs(cur => cur.map(s => s.id === id ? { ...s, ...p } : s)); clearOv('steps', 'rail', 'boxstep', 'cortex', 'paint') }
  const addStair = () => {
    const steps = stepsForHeight(height) || 3
    setStairs(cur => [...cur, { id: uid(), out: runOutForSteps(steps), across: 4, steps }]); clearOv('steps', 'rail', 'boxstep', 'cortex', 'paint')
  }
  const extra = (key, label, unit) => (
    <label className="block">
      <span className="text-[11px] text-gray-500 block mb-1 leading-tight">{label} <span className="text-gray-400">({unit})</span></span>
      <input type="number" min="0" value={extras[key] ?? ''} placeholder="0" aria-label={label}
        onChange={e => setExtras(x => ({ ...x, [key]: e.target.value }))} className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white" />
    </label>
  )
  const cell = 'border border-gray-200 rounded px-2 py-1 text-sm w-full text-right focus:outline-none focus:ring-1 focus:ring-[var(--brand-300)]'
  const cellLocked = 'border border-gray-200 rounded px-2 py-1 text-sm w-full text-right bg-gray-100 text-gray-500 cursor-not-allowed'

  const groups = [...new Set(DECK_COLLECTIONS.map(c => c.group))]

  return (
    <div className="bg-white rounded-2xl border-2 border-[var(--brand-300)] shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs font-medium text-[var(--brand-600)] uppercase tracking-wide">Tool</p>
          <h2 className="text-lg font-bold text-gray-900">Deck Builder</h2>
          <p className="text-xs text-gray-400">Priced from the Deck Plus price list: square feet × $/SF, railing and fascia × $/LF.</p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100" title="Close builder"><X size={18} /></button>
      </div>

      {/* Job + collection */}
      <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-3 mb-3">
        <div>
          <span className="text-xs font-medium text-gray-500 block mb-1">Job</span>
          <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50">
            {['New deck', 'Re-deck'].map(j => (
              <button key={j} type="button" onClick={() => { setJobType(j); clearOv('deck') }}
                disabled={j === 'Re-deck' && !canRedeck}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors disabled:opacity-40 ${jobType === j ? 'bg-white shadow-sm font-semibold text-gray-900' : 'text-gray-500'}`}>{j}</button>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="text-xs font-medium text-gray-500 block mb-1">Decking collection</span>
          <select value={collKey} onChange={e => {
            const k = e.target.value; setCollKey(k); setRateOv({}); clearOv('deck')
            if (!DECK_COLLECTIONS.find(c => c.key === k)?.redeck) setJobType('New deck')
          }} className={inputCls}>
            {groups.map(g => (
              <optgroup key={g} label={g}>
                {DECK_COLLECTIONS.filter(c => c.group === g).map(c => {
                  const p = catalogPrice(catalog, `${c.fam} Deck`, c.rate).rate
                  return <option key={c.key} value={c.key}>{c.key} — {money2(p)}/SF</option>
                })}
              </optgroup>
            ))}
          </select>
        </label>
      </div>
      {redeck && <p className="text-xs text-gray-500 -mt-1 mb-3">Re-deck price includes demo of the old decking and resetting the existing joists.</p>}
      {jobType === 'New deck' && !canRedeck && <p className="text-xs text-gray-400 -mt-1 mb-3">The price list has no re-deck price for {coll.key}.</p>}

      {/* Deck size */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        {field('Across — width (ft)', width, v => { setWidth(v); setQtyOv({}) })}
        {field('Out — depth (ft)', depth, v => { setDepth(v); setQtyOv({}) })}
        {field('Height (ft)', height, v => { setHeight(v); clearOv('skirt', 'high') })}
        {pick('Steps', stepStyle, setStepStyle, ['Regular steps', 'Box steps'])}
      </div>

      {/* Bump-outs */}
      <Section title={`Bump-outs / walkways${t.sectionSF ? ` · ${t.sectionSF} SF` : ''}`} onAdd={() => { setSections(s => [...s, { id: uid(), width: 4, depth: 4 }]); setQtyOv({}) }} addLabel="Add bump-out"
        empty="Rectangle only. Add a bump-out for L-shapes and odd layouts.">
        {sections.map((s, i) => (
          <Row key={s.id} label={`Bump-out ${i + 1}`} onRemove={() => { setSections(cur => cur.filter(x => x.id !== s.id)); setQtyOv({}) }}>
            <input type="number" min="0" value={s.width} aria-label={`Bump-out ${i + 1} width`} className={smallCls}
              onChange={e => { setSections(cur => cur.map(x => x.id === s.id ? { ...x, width: e.target.value } : x)); setQtyOv({}) }} />
            <span className="text-xs text-gray-400">along deck ×</span>
            <input type="number" min="0" value={s.depth} aria-label={`Bump-out ${i + 1} depth`} className={smallCls}
              onChange={e => { setSections(cur => cur.map(x => x.id === s.id ? { ...x, depth: e.target.value } : x)); setQtyOv({}) }} />
            <span className="text-xs text-gray-400">out ft = {n(s.width) * n(s.depth)} SF</span>
          </Row>
        ))}
      </Section>

      {/* Stairs */}
      <Section title={`Stairs${t.stepSF ? ` · ${fmtQty(t.stepSF)} SF` : ''}`} onAdd={addStair} addLabel="Add stairs"
        empty="No stairs."
        note={stairs.length ? `Out × across × ${STEP_FACTOR} = SF (price list). Steps suggested from height: ${stepsForHeight(height)} at ${7.5}″ risers.` : null}>
        {stairs.map((s, i) => (
          <Row key={s.id} label={`Stairs ${i + 1}`} onRemove={() => { setStairs(cur => cur.filter(x => x.id !== s.id)); clearOv('steps', 'rail', 'boxstep', 'cortex', 'paint') }}>
            <input type="number" min="0" step="0.5" value={s.out} aria-label={`Stairs ${i + 1} out`} className={smallCls} onChange={e => setStair(s.id, { out: e.target.value })} />
            <span className="text-xs text-gray-400">out ×</span>
            <input type="number" min="0" value={s.across} aria-label={`Stairs ${i + 1} across`} className={smallCls} onChange={e => setStair(s.id, { across: e.target.value })} />
            <span className="text-xs text-gray-400">across ft ·</span>
            <input type="number" min="0" value={s.steps} aria-label={`Stairs ${i + 1} steps`} className={smallCls} onChange={e => setStair(s.id, { steps: e.target.value })} />
            <span className="text-xs text-gray-400">steps = {fmtQty(n(s.out) * n(s.across) * STEP_FACTOR)} SF</span>
          </Row>
        ))}
      </Section>

      {/* Landings */}
      <Section title={`Landings${t.landingSF ? ` · ${t.landingSF} SF` : ''}`} onAdd={() => { setLandings(l => [...l, { id: uid(), width: 4, depth: 4 }]); clearOv('landing', 'paint') }} addLabel="Add landing" empty="No landings.">
        {landings.map((l, i) => (
          <Row key={l.id} label={`Landing ${i + 1}`} onRemove={() => { setLandings(cur => cur.filter(x => x.id !== l.id)); clearOv('landing', 'paint') }}>
            <input type="number" min="0" value={l.width} aria-label={`Landing ${i + 1} width`} className={smallCls}
              onChange={e => { setLandings(cur => cur.map(x => x.id === l.id ? { ...x, width: e.target.value } : x)); clearOv('landing', 'paint') }} />
            <span className="text-xs text-gray-400">×</span>
            <input type="number" min="0" value={l.depth} aria-label={`Landing ${i + 1} depth`} className={smallCls}
              onChange={e => { setLandings(cur => cur.map(x => x.id === l.id ? { ...x, depth: e.target.value } : x)); clearOv('landing', 'paint') }} />
            <span className="text-xs text-gray-400">ft = {n(l.width) * n(l.depth)} SF</span>
          </Row>
        ))}
      </Section>

      {/* Railing, fascia, finish */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        {pick('Railing ($/LF)', rail, v => { setRail(v); setRateOv(o => { const c = { ...o }; delete c.rail; return c }) },
          DECK_RAILS.map(r => ({ value: r.key, label: r.rate == null ? 'None' : `${r.key}${r.custom ? ' — custom price' : ` — ${money2(catalogPrice(catalog, r.key, r.rate).rate)}/LF`}` })))}
        {pick('Fascia ($/LF)', fascia, v => { setFascia(v); setRateOv(o => { const c = { ...o }; delete c.fascia; return c }) }, [
          { value: 'None', label: 'None' },
          { value: 'Matching', label: coll.fascia ? `Matching — ${DECK_FASCIA[coll.fascia].item.replace(/ LF$/, '')}` : 'Matching — none for PT', disabled: !coll.fascia },
          { value: 'PVC white', label: 'PVC white fascia' },
        ])}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        {pick('Border', border, setBorder, ['None', '1-board', '2-board'])}
        {pick('Cortex plugs', cortex, setCortex, ['None', 'Composite', 'PVC'])}
        {pick('Skirting', skirt, v => { setSkirt(v); clearOv('skirt'); setRateOv(o => { const c = { ...o }; delete c.skirt; return c }) }, Object.keys(DECK_SKIRT_OPTIONS))}
        {pick('Paint / stain', paint, v => { setPaint(v); setRateOv(o => { const c = { ...o }; delete c.paint; return c }) }, Object.keys(DECK_PAINT_OPTIONS))}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 mb-3 text-sm text-gray-700">
        {rail !== 'None' && <label className="flex items-center gap-2"><input type="checkbox" checked={bronze} onChange={e => setBronze(e.target.checked)} /> Bronze balusters (+{money2(catalogPrice(catalog, BRONZE_BALUSTERS.item, BRONZE_BALUSTERS.rate).rate)}/LF)</label>}
        <label className="flex items-center gap-2"><input type="checkbox" checked={freestanding} onChange={e => setFreestanding(e.target.checked)} /> Free-standing deck (+{money2(catalogPrice(catalog, DECK_ITEMS.freestand.item, DECK_ITEMS.freestand.rate).rate)}/SF)</label>
        {H > 8 && <span className="text-xs text-amber-700 self-center">Over 8′ high: the price list adds {money2(catalogPrice(catalog, DECK_ITEMS.high.item, DECK_ITEMS.high.rate).rate)}/SF.</span>}
      </div>

      {/* Add-ons the rep counts */}
      <details className="mb-3 border border-gray-100 rounded-lg bg-gray-50/50" open={Object.values(extras).some(v => n(v) > 0)}>
        <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-gray-600">Demo, structural and accessories</summary>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 px-3 pb-3">
          {extra('demoDeck', 'Demo deck & steps', 'SF')}
          {extra('demoConc', 'Demo concrete', 'SF')}
          {extra('footings', 'Undermined footings', 'EA')}
          {extra('lvl', 'PT LVL framing', 'LF')}
          {extra('hottub', 'Hot tub reinforcement', 'EA')}
          {extra('bracePlate', 'Bracing plates (per post)', 'EA')}
          {extra('braceLetter', 'Bracing engineer letter', 'EA')}
          {extra('posts8x8', '8x8 solid posts', 'EA')}
          {extra('gate', 'Trex aluminum gate', 'EA')}
          {extra('privacy', 'Privacy wall', 'SF')}
        </div>
      </details>

      {/* The math, line by line */}
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-gray-400">
              <th className="text-left font-semibold py-1">Price-list item</th>
              <th className="text-right font-semibold py-1 w-24">Qty</th>
              <th className="font-semibold py-1 w-10">Unit</th>
              <th className="text-right font-semibold py-1 w-24">$ per</th>
              <th className="text-right font-semibold py-1 w-24">Price</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.key} className="border-t border-gray-100 align-top">
                <td className="py-1.5 pr-2 text-gray-800">
                  {r.label}
                  {r.calc && <span className="block text-[11px] text-gray-400">{r.calc}</span>}
                </td>
                <td className="py-1.5 px-1">
                  <div className="flex items-center gap-1">
                    <input type="number" min="0" value={fmtQty(r.qty)} aria-label={`${r.label} quantity`}
                      onChange={e => setQtyOv(o => ({ ...o, [r.key]: parseFloat(e.target.value) || 0 }))} className={cell} />
                    {qtyOv[r.key] != null && !r.custom && (
                      <button type="button" title={`Back to ${fmtQty(r.autoQty)}`} onClick={() => clearOv(r.key)} className="text-gray-300 hover:text-[var(--brand-600)]"><RotateCcw size={12} /></button>
                    )}
                  </div>
                </td>
                <td className="py-1.5 px-1 text-center text-xs text-gray-500">{r.unit}</td>
                <td className="py-1.5 px-1">
                  <input type="number" min="0" step="0.01" value={r.rate} disabled={priceLocked} aria-label={`${r.label} rate`}
                    onChange={e => setRateOv(o => ({ ...o, [r.key]: parseFloat(e.target.value) || 0 }))} className={priceLocked ? cellLocked : cell} />
                </td>
                <td className="py-1.5 pl-2 text-right font-medium text-gray-900 whitespace-nowrap">{money(r.line)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {priceLocked && (
          <p className="flex items-center gap-1.5 text-xs text-amber-600 mt-2">
            <Lock size={12} /> Prices are locked by your manager. They come from the item catalog.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 mt-3 border-t border-gray-200 pt-3">
        {isManager && <span className="text-xs text-gray-400">Est. cost <span className="text-gray-600 font-medium">{money(cost)}</span> · margin <span className={marginPct >= 30 ? 'text-green-600 font-medium' : 'text-amber-600 font-medium'}>{marginPct.toFixed(0)}%</span></span>}
        <span className="text-sm text-gray-500">Subtotal <span className="text-lg font-bold text-gray-900">{money(price)}</span></span>
      </div>

      <div className="mt-4">
        <p className="text-xs font-medium text-gray-500 mb-1">Scope description (auto-written)</p>
        <p className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2 whitespace-pre-line">{description}</p>
      </div>

      <div className="mt-4"><JicField value={jic} onChange={setJic} base={price} /></div>

      <div className="flex gap-2 mt-5">
        <button onClick={add} disabled={price <= 0}
          className="flex-1 py-2.5 bg-[var(--brand-600)] text-white text-sm font-medium rounded-lg hover:bg-[var(--brand-700)] disabled:opacity-40 transition-colors">
          Add deck to quote — {money(price + jicAmount(jic, price))}
        </button>
        <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
      </div>
    </div>
  )
}

function Section({ title, onAdd, addLabel, empty, note, children }) {
  const has = Array.isArray(children) ? children.length > 0 : !!children
  return (
    <div className="mb-3 border border-gray-100 rounded-lg p-3 bg-gray-50/50">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-gray-600">{title}</span>
        <button type="button" onClick={onAdd} className="flex items-center gap-1 text-xs font-medium text-[var(--brand-600)] hover:text-[var(--brand-700)]">
          <Plus size={12} /> {addLabel}
        </button>
      </div>
      {has ? <div className="space-y-2">{children}</div> : <p className="text-xs text-gray-400">{empty}</p>}
      {note && <p className="text-[11px] text-gray-400 mt-1.5">{note}</p>}
    </div>
  )
}

function Row({ label, onRemove, children }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-gray-500 w-20">{label}</span>
      {children}
      <button type="button" onClick={onRemove} aria-label={`Remove ${label}`} className="ml-auto text-gray-300 hover:text-red-500"><X size={14} /></button>
    </div>
  )
}
