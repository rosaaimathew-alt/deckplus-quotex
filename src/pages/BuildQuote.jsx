import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, Trash2, GripVertical, GitMerge, Eye, EyeOff, BookTemplate, X, Save, Copy, BookPlus, Check, Calculator, Lock, Sparkles, Loader, RotateCcw, Landmark } from 'lucide-react'
import { useStore, DECK_COMPONENT_DEFAULTS, PORCH_COMPONENT_DEFAULTS } from '../store'
import { parseBuildSpec } from '../buildParse'
import PorchBuildPanel from '../components/PorchBuildPanel'
import UnderDeckPanel from '../components/UnderDeckPanel'
import HardscapePanel from '../components/HardscapePanel'
import DeckPricingPanel from '../components/DeckPricingPanel'
import { DECK_COLLECTIONS } from '../lib/deckPricing'
import { requiredFees } from '../lib/permitFees'
import { JicField } from '../components/Jic'
import { scopeFor, countWords } from '../lib/scopeText'
import { JIC_DEFAULT, jicAmount } from '../lib/jic'

const MARGIN_DEFAULT = 30

// New ids for lines loaded into the builder, keeping "merged into" links pointing
// at the right line.
function freshIds(lines) {
  const map = new Map(lines.map(l => [String(l.id), Date.now() + Math.random()]))
  return lines.map(l => ({
    ...l,
    id: map.get(String(l.id)),
    ...(l.mergeInto != null ? { mergeInto: map.get(String(l.mergeInto)) ?? null } : {}),
  }))
}

// Decking layout for porch floors priced per LF of board — NO butt joints. The
// picture frame absorbs width at the ends; once the remaining run is longer than
// a 20' board a spline splits it into equal runs, each covered by the smallest
// stock board (end gaps let it round up ~a foot).
const DECK_BOARD_LENGTHS = [12, 16, 20]           // composite boards are sold in these lengths
const DECK_BOARD_FACE_IN = 5.5                    // 1"×5.5" profile face width
const DECK_MAX_BOARD_FT = 20                      // longest stock board
const DECK_GAP_SLACK_FT = 0.5                     // end expansion gaps let a board round up ~a foot
function deckLayout(Wft, frameCourses) {
  const face = DECK_BOARD_FACE_IN / 12
  const frameAbsorb = 2 * frameCourses * face          // both end borders
  const fieldRun = Math.max(0, Wft - frameAbsorb)      // ft the field boards span
  const splineW = face                                 // single spline board
  let splines = 0
  while (fieldRun > 0 && (fieldRun - splines * splineW) / (splines + 1) > DECK_MAX_BOARD_FT + DECK_GAP_SLACK_FT && splines < 12) splines++
  const sections = splines + 1
  const sectionRun = fieldRun > 0 ? (fieldRun - splines * splineW) / sections : 0
  const boardFt = DECK_BOARD_LENGTHS.find(L => sectionRun <= L + DECK_GAP_SLACK_FT) ?? DECK_MAX_BOARD_FT
  return { frameCourses, fieldRun, splines, sections, sectionRun, boardFt }
}

// Linear feet of decking board to floor a W×D area — the SAME takeoff the deck
// tool uses (rows across the depth × runs of stock length), flooring only. Porch
// floors from a composite/wood collection are priced at that collection's $/LF.
function floorDeckingLF(Wft, Dft) {
  const { sections, boardFt } = deckLayout(Wft, 0)
  const fieldRows = Math.ceil((Math.max(0, Dft) * 12) / DECK_BOARD_FACE_IN)
  return fieldRows * sections * boardFt
}

// ── Porch Conversion (Eze-Breeze) assembly ──────────────────────────────────
const PORCH_WINDOW_MAX_W = 54    // Eze-Breeze unit max width (in)
const PORCH_WINDOW_GRAB   = 2.5  // frame overlap onto each column (in)
const PORCH_COL_W         = 5.5  // 6×6 column width (in)
const PORCH_WINDOW_MAX_H  = 105  // Eze-Breeze max height (in); over → transom
const PORCH_DOOR_W        = 36   // exit-door opening (in)
const PORCH_CLEAR_SPAN    = PORCH_WINDOW_MAX_W - 2 * PORCH_WINDOW_GRAB   // 49" of wall each window fills
const PORCH_MODULE        = PORCH_CLEAR_SPAN + PORCH_COL_W               // 54.5" per window+column

// Windows + columns on a wall of length L (inches). A column bounds every opening
// (window OR door) on both ends, so N openings need N+1 columns. We use the FEWEST
// windows that fit (each ≤ 49"), which makes each unit as large as possible, then
// size them all equally — remaining span ÷ window count — so no wall mixes sizes.
function porchWall(Lin, doorCount = 0) {
  const L = Math.max(0, Lin)
  const avail = L - PORCH_DOOR_W * doorCount - PORCH_COL_W * (doorCount + 1)
  const windows = avail > 0 ? Math.ceil(avail / PORCH_MODULE) : 0
  const columns = windows + doorCount + 1
  const winSpan = L - PORCH_DOOR_W * doorCount - PORCH_COL_W * columns  // total glass span
  const winWidth = windows > 0 ? winSpan / windows : 0                  // equal per window
  return { windows, columns, winWidth }
}

// Total Eze-Breeze window & column count for a whole porch (shared by the porch
// tool and the proposal playground so both count units identically).
function porchLayout(Wft, Dft, { doors = 0, sides = 'Front + 2 sides' } = {}) {
  const wallSet = sides === 'All 4 walls' ? [Wft, Dft, Wft, Dft] : sides === 'Front only' ? [Wft] : [Wft, Dft, Dft]
  const layout = wallSet.map((ln, i) => porchWall(ln * 12, i === 0 ? doors : 0))
  const totalWindows = layout.reduce((s, w) => s + w.windows, 0)
  const rawColumns   = layout.reduce((s, w) => s + w.columns, 0)
  const sharedCorners = sides === 'All 4 walls' ? 4 : Math.max(0, wallSet.length - 1)
  return { totalWindows, totalColumns: Math.max(0, rawColumns - sharedCorners) }
}

// Proposal-playground sizing rates the contractor confirmed. (Post-demo these
// should move into the Tools tab so a manager can edit them.)
const PLAY_LVP_SF_RATE    = 13    // LVP porch floor, $/SF
const PLAY_EZE_UNIT_RATE  = 850   // Eze-Breeze window, $/unit (count from geometry)
const PLAY_RAIL_ALL_SIDES = false // cable rail on 3 open sides (W+2D), not all 4
const PLAY_ELEC_SPAN_FT   = 20    // porches over this span get the larger electrical pkg
const PLAY_OUTLET_RATE       = 220  // 6/12 compliance outlet, $/outlet
const PLAY_OUTLET_SPACING_FT = 9    // one outlet per 9 ft of FULL (4-side) perimeter

function PorchAssemblyPanel({ onClose, onAdd, initial, saved }) {
  const rates            = useStore(s => s.porchComponentRates) || PORCH_COMPONENT_DEFAULTS
  const customComponents = useStore(s => s.porchCustomComponents) || []
  const formulaLocked    = useStore(s => s.porchFormulaLocked)
  const scopeTemplate    = useStore(s => s.porchScopeTemplate)
  const catalog          = useStore(s => s.catalog)
  const isManager        = useStore(s => (s.role || 'manager') === 'manager')
  const priceLocked      = formulaLocked && !isManager
  const r = (key) => rates?.[key] || PORCH_COMPONENT_DEFAULTS[key]
  const toCustomComp = (c) => ({ key: `c:${c.id}`, customId: c.id, label: c.label, unit: c.unit, rate: c.rate, cost: c.cost, qty: 0, custom: true })

  // `saved` = this tool's settings from a quote line being edited (Edit in builder).
  const [width, setWidth] = useState(saved?.width ?? initial?.width ?? 16)   // ft — front wall
  const [depth, setDepth] = useState(saved?.depth ?? initial?.depth ?? 12)   // ft — side walls
  const [wallH, setWallH] = useState(saved?.wallH ?? initial?.wallHeight ?? 96)   // in — wall height
  const [doors, setDoors] = useState(saved?.doors ?? initial?.doors ?? 1)    // 36" exit doors (on the front wall)
  const [jic, setJic] = useState(saved?.jic ?? JIC_DEFAULT)
  const [sides, setSides] = useState(saved?.sides ?? 'Front + 2 sides')

  const W  = Math.max(0, parseFloat(width) || 0)
  const D  = Math.max(0, parseFloat(depth) || 0)
  const Hin = Math.max(0, parseFloat(wallH) || 0)
  const Dr = Math.max(0, parseInt(doors) || 0)

  // Enclosed walls (ft). Door(s) ride on the front wall (index 0).
  const wallSet = sides === 'All 4 walls' ? [W, D, W, D] : sides === 'Front only' ? [W] : [W, D, D]
  const layout = wallSet.map((ln, i) => porchWall(ln * 12, i === 0 ? Dr : 0))
  const totalWindows = layout.reduce((s, w) => s + w.windows, 0)
  const rawColumns   = layout.reduce((s, w) => s + w.columns, 0)
  // Corner columns are shared between adjacent walls: a closed 4-wall loop shares all
  // 4 corners; an open chain (front + sides) shares (walls − 1); front-only shares 0.
  const sharedCorners = sides === 'All 4 walls' ? 4 : Math.max(0, wallSet.length - 1)
  const totalColumns  = Math.max(0, rawColumns - sharedCorners)
  const overHeight    = Hin > PORCH_WINDOW_MAX_H
  const totalTransoms = overHeight ? totalWindows : 0

  const autoQty = (key) => {
    switch (key) {
      case 'column':    return totalColumns
      case 'window':    return totalWindows
      case 'transom':   return totalTransoms
      case 'door':      return Dr
      case 'finishing': return 1
      default:          return 0
    }
  }

  const [comps, setComps] = useState(saved?.comps || [
    { key: 'column',    label: r('column').label,    unit: r('column').unit,    rate: r('column').rate,    cost: r('column').cost,    qty: null, fromRates: true },
    { key: 'window',    label: r('window').label,    unit: r('window').unit,    rate: r('window').rate,    cost: r('window').cost,    qty: null, fromRates: true },
    { key: 'transom',   label: r('transom').label,   unit: r('transom').unit,   rate: r('transom').rate,   cost: r('transom').cost,   qty: null, fromRates: true, transomOnly: true },
    { key: 'door',      label: r('door').label,      unit: r('door').unit,      rate: r('door').rate,      cost: r('door').cost,      qty: null, fromRates: true, doorOnly: true },
    { key: 'finishing', label: r('finishing').label, unit: r('finishing').unit, rate: r('finishing').rate, cost: r('finishing').cost, qty: null, fromRates: true },
    ...customComponents.map(toCustomComp),
  ])
  const patch = (key, p) => setComps(cs => cs.map(c => c.key === key ? { ...c, ...p } : c))

  // Keep custom-component lines synced to the saved list (add/remove/refresh), keeping qty.
  useEffect(() => {
    setComps(cs => {
      const ids = new Set(customComponents.map(c => c.id))
      let next = cs.filter(c => !c.custom || ids.has(c.customId)).map(c => {
        if (!c.custom) return c
        const src = customComponents.find(x => x.id === c.customId)
        return src ? { ...c, label: src.label, unit: src.unit, rate: src.rate, cost: src.cost } : c
      })
      const have = new Set(next.filter(c => c.custom).map(c => c.customId))
      customComponents.forEach(c => { if (!have.has(c.id)) next = [...next, toCustomComp(c)] })
      return next
    })
  }, [customComponents])

  const rows = comps
    .filter(c => (!c.transomOnly || totalTransoms > 0) && (!c.doorOnly || Dr > 0))
    .map(c => {
      const qty = c.qty != null ? c.qty : autoQty(c.key)
      return { ...c, qty, line: qty * c.rate, lineCost: qty * c.cost }
    })
  const price = rows.reduce((s, x) => s + x.line, 0)
  const cost  = rows.reduce((s, x) => s + x.lineCost, 0)
  const marginPct = price > 0 ? ((price - cost) / price) * 100 : 0
  const money = (v) => '$' + Math.round(v).toLocaleString('en-US')

  // Scope in the catalog's Porch Remodel wording, counts filled in
  const ftIn = (v) => `${Math.round((Number(v) || 0) * 100) / 100}’`
  const description = (() => {
    const lines = (scopeTemplate || '').split('\n').map(s => s.trim()).filter(Boolean)
    lines.push(`Convert existing ${ftIn(W)}x${ftIn(D)} open porch into a 3-season porch:`)
    lines.push(scopeFor(catalog, '6x6 lam column', { count: totalColumns }, '6”x6” laminated COX columns.'))
    lines.push(scopeFor(catalog, 'EzeBreeze RETRO', { count: totalWindows }, `${countWords(totalWindows)} single unit Eze Breeze 3-season windows.`))
    if (totalTransoms > 0) lines.push(scopeFor(catalog, 'Transom RETRO', { count: totalTransoms }, `${countWords(totalTransoms)} transoms.`))
    if (Dr > 0) lines.push(scopeFor(catalog, 'Larsen Tradewinds Door RETRO', {}, '01 (one) 36” Tradewinds storm door.').replace(/^01 \(one\)/, countWords(Dr)))
    lines.push(scopeFor(catalog, 'Paint/Stain PORCH on PATIO', {}, 'Prepare and apply paint/stain.'))
    return lines.filter(Boolean).join('\n')
  })()

  const add = () => {
    // JIC is built into the price — never its own line on the quote.
    onAdd([{
      id: Date.now() + Math.random(),
      catalogId: null,
      name: `Eze-Breeze Porch Conversion — ${W}′×${D}′`,
      section: 'Porch',
      description,
      unit: 'EA',
      qty: 1,
      unitPrice: Math.round(price + jicAmount(jic, price)),
      category: 'Screen Porches',
      costMaterials: Math.round(cost),
      costSub: 0,
      builder: { tool: 'porch', state: { width, depth, wallH, doors, sides, jic, comps } },
    }])
    onClose()
  }

  const dim = (label, value, onChange, props = {}) => (
    <div>
      <label className="text-xs font-medium text-gray-500 block mb-1">{label}</label>
      <input type="number" value={value} onChange={onChange} {...props}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-300)]" />
    </div>
  )
  const drop = (label, value, onChange, options) => (
    <div>
      <label className="text-xs font-medium text-gray-500 block mb-1">{label}</label>
      <select value={value} onChange={onChange}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-300)]">
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
  const cell = "border border-gray-200 rounded px-2 py-1 text-sm w-full focus:outline-none focus:ring-1 focus:ring-[var(--brand-300)]"
  const cellLocked = "border border-gray-200 rounded px-2 py-1 text-sm w-full bg-gray-100 text-gray-400 cursor-not-allowed focus:outline-none"

  return (
    <div className="bg-white rounded-2xl border-2 border-[var(--brand-300)] shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs font-medium text-[var(--brand-600)] uppercase tracking-wide">Tool</p>
          <h2 className="text-lg font-bold text-gray-900">Porch Conversion — Eze-Breeze</h2>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100" title="Close builder"><X size={18} /></button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-3">
        {dim('Width (ft)', width, e => setWidth(e.target.value), { min: 0 })}
        {dim('Depth (ft)', depth, e => setDepth(e.target.value), { min: 0 })}
        {dim('Wall height (in)', wallH, e => setWallH(e.target.value), { min: 0 })}
        {dim('# Doors (36″)', doors, e => setDoors(e.target.value), { min: 0, step: 1 })}
        {drop('Enclosed walls', sides, e => setSides(e.target.value), ['Front + 2 sides', 'All 4 walls', 'Front only'])}
      </div>

      {/* Layout recommendation */}
      <div className="bg-[var(--brand-50)] border border-[var(--brand-100)] rounded-lg px-3 py-2 mb-4 text-xs text-gray-600 space-y-0.5">
        <p>Each window fills <strong>{PORCH_CLEAR_SPAN}″</strong> (54″ unit − 2.5″ each side) between <strong>5.5″</strong> columns.</p>
        {wallSet.map((ln, i) => (
          <p key={i}>{i === 0 ? 'Front' : `Side ${i}`} wall {ln}′ ({Math.round(ln * 12)}″){i === 0 && Dr > 0 ? `, ${Dr} door${Dr !== 1 ? 's' : ''}` : ''} → <strong>{layout[i].windows} window{layout[i].windows !== 1 ? 's' : ''}</strong>{layout[i].windows > 0 ? ` @ ${Math.round(layout[i].winWidth)}″ each` : ''}</p>
        ))}
        <p className="pt-0.5 border-t border-[var(--brand-100)]">Total: <strong>{totalWindows} windows</strong> · <strong>{totalColumns} columns</strong>{Dr > 0 ? <> · <strong>{Dr} door{Dr !== 1 ? 's' : ''}</strong></> : ''}{overHeight ? <> · wall {Hin}″ &gt; 105″ → <strong>{totalTransoms} transoms</strong></> : ''}</p>
      </div>

      {/* Component table */}
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-gray-400">
              <th className="text-left font-semibold py-1">Component</th>
              <th className="font-semibold py-1 w-20">Unit</th>
              <th className="font-semibold py-1 w-24">Qty</th>
              <th className="font-semibold py-1 w-24">Rate $</th>
              <th className="font-semibold py-1 w-24">Cost $</th>
              <th className="text-right font-semibold py-1 w-24">Line</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.key} className="border-t border-gray-100">
                <td className="py-1.5 pr-2 text-gray-700">{row.label}</td>
                <td className="py-1.5 px-1 text-center text-gray-400 text-xs">{row.unit}</td>
                <td className="py-1.5 px-1">
                  <input type="number" value={Number(row.qty.toFixed(1))}
                    onChange={e => patch(row.key, { qty: parseFloat(e.target.value) || 0 })} className={cell} />
                </td>
                <td className="py-1.5 px-1">
                  <input type="number" value={row.rate} disabled={priceLocked}
                    onChange={e => patch(row.key, { rate: parseFloat(e.target.value) || 0 })} className={priceLocked ? cellLocked : cell} />
                </td>
                <td className="py-1.5 px-1">
                  <input type="number" value={row.cost} disabled={priceLocked}
                    onChange={e => patch(row.key, { cost: parseFloat(e.target.value) || 0 })} className={priceLocked ? cellLocked : cell} />
                </td>
                <td className="py-1.5 pl-2 text-right font-medium text-gray-900 whitespace-nowrap">{money(row.line)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {priceLocked && (
          <p className="flex items-center gap-1.5 text-xs text-amber-600 mt-2">
            <Lock size={12} /> Pricing locked by your manager — set in Catalog → Builder rates.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 mt-3 border-t border-gray-200 pt-3">
        <span className="text-xs text-gray-400">Est. cost <span className="text-gray-600 font-medium">{money(cost)}</span></span>
        <span className="text-xs text-gray-400">Margin <span className={marginPct >= 30 ? 'text-green-600 font-medium' : 'text-amber-600 font-medium'}>{marginPct.toFixed(0)}%</span></span>
        <span className="text-sm text-gray-500">Price <span className="text-lg font-bold text-gray-900">{money(price)}</span></span>
      </div>

      <div className="mt-4">
        <p className="text-xs font-medium text-gray-500 mb-1">Scope description (auto-written)</p>
        <p className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2 whitespace-pre-line">{description}</p>
      </div>

      <div className="mt-4"><JicField value={jic} onChange={setJic} base={price} note="A cushion for this build. Built into the porch price — the customer never sees it." /></div>

      <div className="flex gap-2 mt-5">
        <button onClick={add} disabled={price <= 0}
          className="flex-1 py-2.5 bg-[var(--brand-600)] text-white text-sm font-medium rounded-lg hover:bg-[var(--brand-700)] disabled:opacity-40 transition-colors">
          Add porch to quote — {money(price + jicAmount(jic, price))}
        </button>
        <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
      </div>
    </div>
  )
}

export default function BuildQuote() {
  const catalogRaw = useStore(s => s.catalog)
  // Make the formula/assembly builder reachable from the catalog on every site
  // (not just the demo) by injecting it into the picker when it isn't already there.
  const catalog = useMemo(() => {
    const extra = []
    if (!catalogRaw.some(c => c.assembly === 'deck'))
      extra.push({ id: 'deck-builder', name: 'Deck — Build to Spec (formula)', category: 'Decks', assembly: 'deck', unit: 'EA', unitPrice: 0, description: 'Configure framing, decking, steps, landings, height and difficulty; price, cost and scope auto-calculate.' })
    if (!catalogRaw.some(c => c.assembly === 'porchbuild'))
      extra.push({ id: 'porch-build', name: 'Porch — Build to Spec (formula)', category: 'Screen Porches', assembly: 'porchbuild', unit: 'EA', unitPrice: 0, description: 'New open, ScreenEze or Eze-Breeze porch: size, roof connection, floor, roof style and options — price, cost and scope auto-calculate.' })
    if (!catalogRaw.some(c => c.assembly === 'underdeck'))
      extra.push({ id: 'underdeck-builder', name: 'Under Deck — Build to Spec (formula)', category: 'Under Deck Ceiling', assembly: 'underdeck', unit: 'EA', unitPrice: 0, description: 'Dry under-deck ceiling: enter the size, pick the style and count the lights, fans and heaters — priced from the catalog.' })
    if (!catalogRaw.some(c => c.assembly === 'hardscape'))
      extra.push({ id: 'hardscape-builder', name: 'Hardscape — Build to Spec (formula)', category: 'Hardscapes', assembly: 'hardscape', unit: 'EA', unitPrice: 0, description: 'Patio, retaining wall, fire pit, drainage and outdoor kitchen — enter sizes and counts; priced from the catalog.' })
    if (!catalogRaw.some(c => c.assembly === 'porch'))
      extra.push({ id: 'porch-builder', name: 'Porch Conversion — Build to Spec (formula)', category: 'Screen Porches', assembly: 'porch', unit: 'EA', unitPrice: 0, description: 'Eze-Breeze porch conversion: enter width, depth, wall height and doors — windows, columns, transoms, price, cost and scope auto-calculate.' })
    return extra.length ? [...extra, ...catalogRaw] : catalogRaw
  }, [catalogRaw])
  const templates = useStore(s => s.templates)
  const { saveTemplate, deleteTemplate, addCatalogItems } = useStore()
  const [savedToLog, setSavedToLog] = useState(new Set())
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('All')
  const [lines, setLines] = useState([])
  const [client, setClient] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [expiration, setExpiration] = useState('')
  const [margin, setMargin] = useState(MARGIN_DEFAULT)
  const [showMargin, setShowMargin] = useState(false)

  const [isAlaCarte, setIsAlaCarte] = useState(false)
  const [showBreakdown, setShowBreakdown] = useState(true)
  const [projectTypes, setProjectTypes] = useState([])
  const [projectSummary, setProjectSummary] = useState('')
  // Permit & jurisdiction fees are worked out from the address (src/lib/permitFees.js).
  // The rep can remove one (feeDismissed), change its price (feeEdits) or settle a
  // shared ZIP like 29708 (feeOverrides.tegaCay).
  const [feeDismissed, setFeeDismissed] = useState([])
  const [feeEdits, setFeeEdits] = useState({})
  const [feeOverrides, setFeeOverrides] = useState({})

  const PROJECT_TYPE_OPTIONS = ['Open Deck','Screen Porches','Eze-Breeze Porches','Open Porches','Porch Conversions','Sunrooms','Hardscapes']
  const toggleProjectType = (t) => setProjectTypes(prev =>
    prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]
  )

  // Template modals
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)
  const [showLoadTemplate, setShowLoadTemplate] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [templateDesc, setTemplateDesc] = useState('')
  const [revisingParentId, setRevisingParentId] = useState(null)
  // The Draft proposal this quote already saved when previewed, so previewing
  // again updates it instead of creating a duplicate.
  const [draftProposalId, setDraftProposalId] = useState(null)
  // Whose estimate that saved draft / revision is. Typing a different customer
  // name makes this a NEW estimate — it never overwrites the other customer's.
  const [draftClient, setDraftClient] = useState('')
  const [revisingClient, setRevisingClient] = useState('')
  const [restoredFrom, setRestoredFrom] = useState(null)   // banner: "picked up where you left off"

  const DRAFT_KEY = 'quotex:draft-proposal'

  // Pre-fill when opening a revision from the Proposal Tracker; otherwise restore draft
  useEffect(() => {
    const raw = sessionStorage.getItem('revise-proposal')
    if (raw) {
      sessionStorage.removeItem('revise-proposal')
      try {
        const d = JSON.parse(raw)
        setClient(d.client || '')
        setEmail(d.email || '')
        setPhone(d.phone || '')
        setAddress(d.address || '')
        setExpiration(d.expiration || '')
        setLines(freshIds((d.lines || []).filter(l => !l.autoFee)))
        setFeeEdits(Object.fromEntries((d.lines || []).filter(l => l.autoFee).flatMap(l => l.feeParts
          ? l.feeParts.map(p => [p.key, p.unitPrice])
          : [[l.autoFee, l.unitPrice]])))
        if (d.feeDismissed) setFeeDismissed(d.feeDismissed)
        if (d.feeOverrides) setFeeOverrides(d.feeOverrides)
        if (d.showBreakdown !== undefined) setShowBreakdown(d.showBreakdown)
        if (d.isAlaCarte !== undefined) setIsAlaCarte(!!d.isAlaCarte)
        if (d.projectTypes) setProjectTypes(d.projectTypes)
        if (d.projectSummary) setProjectSummary(d.projectSummary)
        setRevisingParentId(d.parentId || null)
        setRevisingClient(d.client || '')
        return
      } catch {}
    }
    const draft = localStorage.getItem(DRAFT_KEY)
    if (!draft) return
    try {
      const d = JSON.parse(draft)
      setClient(d.client || '')
      setEmail(d.email || '')
      setPhone(d.phone || '')
      setAddress(d.address || '')
      setExpiration(d.expiration || '')
      setMargin(d.margin ?? MARGIN_DEFAULT)
      setLines(freshIds((d.lines || []).filter(l => !l.autoFee)))
      setFeeDismissed(d.feeDismissed || [])
      setFeeEdits(d.feeEdits || {})
      setFeeOverrides(d.feeOverrides || {})
      setIsAlaCarte(d.isAlaCarte || false)
      setShowBreakdown(d.showBreakdown ?? true)
      setProjectTypes(d.projectTypes || [])
      setProjectSummary(d.projectSummary || '')
      setRevisingParentId(d.revisingParentId || null)
      setRevisingClient(d.revisingClient ?? d.client ?? '')
      setDraftProposalId(d.draftProposalId || null)
      setDraftClient(d.draftClient ?? d.client ?? '')
      if (d.client || (d.lines || []).length) setRestoredFrom(d.client || 'your last quote')
    } catch {}
  }, [])

  // Clear everything for a brand-new quote (the unsent one is dropped).
  const startFresh = () => {
    localStorage.removeItem(DRAFT_KEY)
    setClient(''); setEmail(''); setPhone(''); setAddress(''); setExpiration('')
    setLines([]); setMargin(MARGIN_DEFAULT); setIsAlaCarte(false); setShowBreakdown(true)
    setProjectTypes([]); setProjectSummary(''); setRevisingParentId(null)
    setDraftProposalId(null); setDraftClient(''); setRevisingClient(''); setRestoredFrom(null)
    setFeeDismissed([]); setFeeEdits({}); setFeeOverrides({})
  }

  // Auto-save draft to localStorage whenever form state changes
  useEffect(() => {
    const isEmpty = !client && !email && !phone && !address && lines.length === 0 && !projectSummary
    if (isEmpty) return
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      client, email, phone, address, expiration, margin, lines,
      isAlaCarte, showBreakdown, projectTypes, projectSummary, revisingParentId, draftProposalId, draftClient, revisingClient,
      feeDismissed, feeEdits, feeOverrides,
    }))
  }, [client, email, phone, address, expiration, margin, lines, isAlaCarte, showBreakdown, projectTypes, projectSummary, revisingParentId, draftProposalId, draftClient, revisingClient, feeDismissed, feeEdits, feeOverrides])

  // Permit fees for this address + work, as quote lines (derived, never stored twice)
  const feePlan = useMemo(() => requiredFees({ address, lines, projectTypes, catalog: catalogRaw, overrides: feeOverrides }),
    [address, lines, projectTypes, catalogRaw, feeOverrides])
  const feeLines = useMemo(() => feePlan.fees
    .filter(f => !feeDismissed.includes(f.key))
    .map(f => ({
      id: `fee-${f.key}`, catalogId: f.catalogId, name: f.label, section: 'Permits & Fees', description: '',
      unit: 'LS', qty: 1, unitPrice: feeEdits[f.key] ?? f.rate, category: 'Permits & Fees',
      costMaterials: f.cost, costSub: 0, autoFee: f.key, why: f.why,
    })), [feePlan, feeDismissed, feeEdits])
  // Permits & fees go on the proposal as ONE line (the parts are listed in its
  // scope); each part is still adjustable / removable here in the builder.
  const feeLine = useMemo(() => {
    if (!feeLines.length) return null
    const price = feeLines.reduce((a, f) => a + (Number(f.unitPrice) || 0), 0)
    return {
      id: 'fee-all', catalogId: null, name: 'Permits & fees', section: 'Permits & Fees', category: 'Permits & Fees',
      description: feeLines.map(f => f.name).join('\n'),
      unit: 'LS', qty: 1, unitPrice: price,
      costMaterials: feeLines.reduce((a, f) => a + (Number(f.costMaterials) || 0), 0), costSub: 0,
      autoFee: 'combined', feeParts: feeLines.map(f => ({ key: f.autoFee, name: f.name, unitPrice: f.unitPrice })),
    }
  }, [feeLines])
  const allLines = useMemo(() => [...lines, ...(feeLine ? [feeLine] : [])], [lines, feeLine])
  const dismissedFees = feePlan.fees.filter(f => feeDismissed.includes(f.key))

  const cats = ['All', ...new Set(catalog.map(c => c.category))]
  const filtered = catalog
    .filter(c => catFilter === 'All' || c.category === catFilter)
    .filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()))

  const addItem = (item) => {
    // Formula/assembly items open their inline builder instead of adding a flat line.
    if (item.assembly === 'deck') { setEditingLineId(null); setActiveAssembly('deck'); return }
    if (item.assembly === 'porch') { setEditingLineId(null); setActiveAssembly('porch'); return }
    if (item.assembly === 'porchbuild') { setEditingLineId(null); setActiveAssembly('porchbuild'); return }
    if (item.assembly === 'underdeck') { setEditingLineId(null); setActiveAssembly('underdeck'); return }
    if (item.assembly === 'hardscape') { setEditingLineId(null); setActiveAssembly('hardscape'); return }
    setLines(prev => {
      const existing = prev.find(l => l.catalogId === item.id)
      if (existing) return prev.map(l => l.catalogId === item.id ? { ...l, qty: l.qty + 1 } : l)
      return [{
        id: Date.now() + Math.random(),
        catalogId: item.id,
        name: item.name,
        section: item.section || item.category || '',
        description: item.description || '',
        unit: item.unit,
        qty: 1,
        unitPrice: item.unitPrice,
        category: item.category,
        costMaterials: item.costMaterials || 0,
        costSub: item.costSub || 0,
      }, ...prev]
    })
  }

  const updateLine = (id, field, val) => {
    setLines(prev => prev.map(l => l.id === id
      ? { ...l, [field]: field === 'qty' || field === 'unitPrice' ? parseFloat(val) || 0 : val }
      : l
    ))
  }

  // Removing a line un-merges anything that was merged into it.
  const removeLine = (id) => setLines(prev => prev.filter(l => l.id !== id).map(l => l.mergeInto === id ? { ...l, mergeInto: null } : l))
  const setMerge = (id, into) => setLines(prev => prev.map(l => l.id === id ? { ...l, mergeInto: into ?? null } : l))
  const [mergePickFor, setMergePickFor] = useState(null)   // line id whose "Merge into" picker is open

  const [activeAssembly, setActiveAssembly] = useState(null)
  const [assemblyInitial, setAssemblyInitial] = useState(null)
  // The quote line being re-opened in its builder ("Edit in builder"), if any.
  const [editingLineId, setEditingLineId] = useState(null)
  const editingLine = editingLineId ? lines.find(l => l.id === editingLineId) : null
  const editSaved = editingLine?.builder?.state || null
  const closeAssembly = () => { setActiveAssembly(null); setAssemblyInitial(null); setEditingLineId(null) }
  // A builder's line(s) replace the line being edited in place; new ones go on top.
  const finishAssembly = (line) => {
    const add = Array.isArray(line) ? line : [line]
    setLines(prev => {
      const at = editingLineId ? prev.findIndex(l => l.id === editingLineId) : -1
      return at >= 0 ? [...prev.slice(0, at), ...add, ...prev.slice(at + 1)] : [...add, ...prev]
    })
    closeAssembly()
  }
  const openInBuilder = (line) => {
    if (!line?.builder?.tool) return
    setAssemblyInitial(null)
    setEditingLineId(line.id)
    setActiveAssembly(line.builder.tool)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ── Quick Build — type or dictate a job; AI fills the matching tool ──────────
  const collectionNames = useMemo(() => {
    const names = new Set()
    for (const c of catalogRaw) {
      if (/porch\s*floor\s*upgrade/i.test(c.name || '')) {
        const coll = (c.name || '').replace(/porch\s*floor\s*upgrade/i, '').trim()
        if (coll) names.add(coll)
      }
    }
    for (const c of DECK_COLLECTIONS) names.add(c.key)
    return [...names]
  }, [catalogRaw])

  const [quickText, setQuickText] = useState('')
  const [quickBusy, setQuickBusy] = useState(false)
  const [quickErr, setQuickErr]   = useState('')
  const [quickNote, setQuickNote] = useState('')

  // Assemble a whole proposal from the catalog with EXACT, dimension-driven sizing.
  const assembleFromCatalog = (plan, rawText = '') => {
    const W = Number(plan.width) || 0, D = Number(plan.depth) || 0
    const area = W * D
    const railLF = PLAY_RAIL_ALL_SIDES ? 2 * (W + D) : (W + 2 * D)   // 3 open sides by default
    const span = Math.max(W, D)
    const doors = plan.doors != null ? Number(plan.doors) : 1
    const { totalWindows } = porchLayout(W, D, { doors, sides: 'Front + 2 sides' })
    const roof = (plan.roofType || '').toLowerCase()
    // Substrate: is the porch built ON a deck (elevated) vs at grade?
    const wantsDeck = /on\s+(?:a\s+|the\s+|top\s+of\s+a?\s*)?(?:pt[-\s]?wood\s+)?deck|elevated|raised\s+porch|on\s+stilts/i.test(rawText)

    const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
    const escapeRegExp = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const byExact = (name) => { const n = norm(name); return n ? catalogRaw.find(c => norm(c.name) === n) : null }
    const byName = (frag) => { const f = norm(frag); return f ? catalogRaw.find(c => norm(c.name).includes(f)) : null }
    const made = []
    const missing = []
    const mkLine = (item, over = {}) => ({
      id: Date.now() + Math.random(),
      catalogId: typeof item.id === 'number' ? item.id : null,
      name: item.name,
      section: item.category || 'General',
      description: item.description || '',
      unit: over.unit ?? item.unit ?? 'EA',
      qty: over.qty ?? 1,
      unitPrice: over.unitPrice ?? item.unitPrice ?? 0,
      category: item.category || 'General',
      costMaterials: item.costMaterials || 0, costSub: item.costSub || 0,
    })

    for (const it of (plan.items || [])) {
      // The AI picked the exact catalog item name; that's the authority (it respects
      // roof type, substrate like "on PT-Wood Deck", flooring product, etc.).
      const matched = it.match ? (byExact(it.match) || byName(it.match)) : null
      switch (it.kind) {
        case 'structure': {
          const cands = catalogRaw.filter(c => /porch/i.test(c.name || '') && (!roof || new RegExp(escapeRegExp(roof), 'i').test(c.name || '')))
          const sized = cands.filter(c => { const raw = norm(c.name); return raw.includes(norm(`${W}x${D}`)) || raw.includes(norm(`${D}x${W}`)) })
          const pool = sized.length ? sized : cands
          const isDeck = (c) => /deck/i.test(c.name || '')
          // Substrate is decisive: on a deck → require a deck variant; else prefer at-grade.
          let item
          if (wantsDeck) item = (matched && isDeck(matched) ? matched : null) || pool.find(isDeck) || matched || pool[0]
          else           item = matched || pool.find(c => !isDeck(c)) || pool[0]
          if (item) {
            if (wantsDeck && !isDeck(item)) missing.push(`deck-mounted ${roof} ${W}×${D} structure (used "${item.name}" — no on-deck variant found, verify)`)
            else if (!sized.length) missing.push(`exact ${W}×${D} ${roof} structure (used "${item.name}" — verify size/price)`)
            made.push(mkLine(item))
          } else missing.push(`${roof || ''} porch structure ${W}×${D}`.trim())
          break
        }
        case 'lvp': {
          const item = matched || byName('lvp') || { name: 'LVP Floor as Porch Floor', unit: 'SF', category: 'General', description: 'Provide and install 3/4" plywood subfloor and underlayment, then install LVP flooring as porch floor.' }
          made.push(mkLine(item, { unit: 'SF', qty: area, unitPrice: PLAY_LVP_SF_RATE }))
          break
        }
        case 'floor': {
          // Composite/wood porch floor: same board takeoff as the deck, priced at
          // the collection's own $/LF from its catalog item.
          const item = matched || byName('porch floor')
          if (item && Number(item.unitPrice) > 0) made.push(mkLine(item, { unit: 'LF', qty: floorDeckingLF(W, D), unitPrice: item.unitPrice }))
          else missing.push('porch floor collection (no per-LF catalog item matched)')
          break
        }
        case 'cable_rail': {
          const item = matched || byName('cable rail') || byName('cable railing')
          if (item) made.push(mkLine(item, { unit: 'LF', qty: railLF, unitPrice: item.unitPrice || 75 }))
          else missing.push('cable railing')
          break
        }
        case 'eze_breeze_windows': {
          const item = matched || byName('eze breeze window') || byName('eze breeze')
          if (item) made.push(mkLine(item, { unit: 'EA', qty: totalWindows, unitPrice: PLAY_EZE_UNIT_RATE }))
          else missing.push('Eze-Breeze windows')
          break
        }
        case 'electrical_package': {
          // Span rule wins: >20' → the larger package, else the standard one.
          const cands = catalogRaw.filter(c => { const nm = c.name || ''; return /electric/i.test(nm) && !/compliance|heater|6\s*\/\s*12/i.test(nm) })
          if (cands.length) {
            const target = span > PLAY_ELEC_SPAN_FT ? 3810 : 2900
            const pick = cands.reduce((b, c) => Math.abs((c.unitPrice || 0) - target) < Math.abs((b.unitPrice || 0) - target) ? c : b, cands[0])
            made.push(mkLine(pick, { qty: 1 }))
          } else if (matched) made.push(mkLine(matched, { qty: 1 }))
          else missing.push('electrical package')
          break
        }
        default: {
          // Any other named item → the AI's matched catalog item, sized by its unit.
          const item = matched || byName(it.text || '')
          if (item) {
            const u = (item.unit || 'EA').toUpperCase()
            made.push(mkLine(item, { qty: u === 'SF' ? area : u === 'LF' ? railLF : 1 }))
          } else missing.push(it.text || 'item')
        }
      }
    }

    // Rule: new porch build + Eze-Breeze → auto-add 6/12 electrical compliance.
    // Outlets are code-spaced: ⌈perimeter ÷ 9′⌉ outlets, each at PLAY_OUTLET_RATE.
    const hasEze = (plan.items || []).some(i => i.kind === 'eze_breeze_windows')
    if (plan.newBuild && hasEze) {
      const comp = catalogRaw.find(c => /compliance/i.test(c.name || '') || /6\s*\/\s*12/.test(c.name || ''))
      if (comp && !made.some(l => l.catalogId === comp.id)) {
        const outlets = Math.max(1, Math.ceil((2 * (W + D)) / PLAY_OUTLET_SPACING_FT))
        made.push(mkLine(comp, { unit: 'EA', qty: outlets, unitPrice: PLAY_OUTLET_RATE }))
      }
    }

    setLines(prev => [...made, ...prev])
    return { count: made.length, missing }
  }

  const runQuickBuild = async () => {
    if (!quickText.trim() || quickBusy) return
    setQuickBusy(true); setQuickErr(''); setQuickNote('')
    try {
      const spec = await parseBuildSpec(quickText, { collections: collectionNames, catalog: catalogRaw.map(c => c.name) })
      if (spec.mode === 'catalog') {
        const { count, missing } = assembleFromCatalog(spec, quickText)
        setQuickText('')
        if (!count && !missing.length) setQuickErr('Nothing matched — try naming the items, e.g. "16x16 gable Eze-Breeze porch with LVP and cable rails".')
        else setQuickNote(`Added ${count} item${count !== 1 ? 's' : ''} to the scope.${missing.length ? ` Couldn’t match: ${missing.join('; ')}.` : ''}`)
      } else {
        setAssemblyInitial(spec)
        setEditingLineId(null)
        setActiveAssembly(spec.tool === 'porch' ? 'porch' : 'deck')
        setQuickText('')
      }
    } catch (e) {
      setQuickErr(e.message || 'Could not read that.')
    } finally {
      setQuickBusy(false)
    }
  }

  const addBlankLine = () => setLines(prev => [{
    id: Date.now() + Math.random(),
    catalogId: null,
    name: '',
    section: '',
    description: '',
    unit: 'EA',
    qty: 1,
    unitPrice: 0,
    category: 'General',
  }, ...prev])

  // Drag to reorder: grab a line's handle and drop it anywhere in the list.
  // Pointer events, so it works the same with a mouse and on a touch screen.
  const [drag, setDrag] = useState(null)   // { from, over } while dragging
  const moveLine = (from, to) => {
    if (from === to || from < 0 || to < 0) return
    setLines(prev => { const next = [...prev]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next })
  }
  const dragStart = (e, idx) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setDrag({ from: idx, over: idx })
  }
  const dragMove = (e) => {
    if (!drag) return
    const row = document.elementFromPoint(e.clientX, e.clientY)?.closest('tr[data-line-idx]')
    if (row) { const over = Number(row.dataset.lineIdx); if (over !== drag.over) setDrag(d => d && { ...d, over }) }
  }
  const dragEnd = () => { if (drag) moveLine(drag.from, drag.over); setDrag(null) }
  // Keyboard: arrow keys on a focused handle move the line one step.
  const dragKey = (e, idx) => {
    if (e.key === 'ArrowUp' && idx > 0) { e.preventDefault(); moveLine(idx, idx - 1) }
    if (e.key === 'ArrowDown' && idx < lines.length - 1) { e.preventDefault(); moveLine(idx, idx + 1) }
  }

  const subtotal = allLines.reduce((s, l) => s + l.qty * l.unitPrice, 0)
  // Hiding lines from the customer only applies to lump-sum proposals.
  const summed = !showBreakdown && !isAlaCarte
  // The line a line is merged into (if it still exists).
  const mergedTarget = (line) => line.mergeInto != null ? lines.find(l => l.id === line.mergeInto) || null : null
  const mergedInto = (line) => lines.filter(l => l.mergeInto === line.id)
  const cost = showMargin ? subtotal / (1 + margin / 100) : null

  const sameClient = (a, b) => String(a || '').toLowerCase().replace(/[^a-z0-9]/g, '') === String(b || '').toLowerCase().replace(/[^a-z0-9]/g, '')

  // Preview keeps this quote's draft, so "Back to quote" returns to exactly
  // this screen. The draft is cleared once the proposal is sent or printed.
  const goToProposal = () => {
    sessionStorage.setItem('proposal', JSON.stringify({
      client, email, phone, address, expiration, lines: allLines.map(l => { const c = { ...l }; delete c.why; return c }), margin, isAlaCarte, showBreakdown, projectTypes, projectSummary,
      feeDismissed, feeOverrides,
      ...(revisingParentId && sameClient(revisingClient, client) ? { parentId: revisingParentId } : {}),
      ...(draftProposalId && sameClient(draftClient, client) ? { proposalId: draftProposalId } : {}),
      fromBuilder: true,
    }))
    navigate('/proposal')
  }

  const handleSaveTemplate = () => {
    if (!templateName.trim() || !lines.length) return
    saveTemplate({
      name: templateName.trim(),
      description: templateDesc.trim(),
      lines: lines.map(l => ({
        name: l.name, section: l.section, description: l.description,
        unit: l.unit, qty: l.qty, unitPrice: l.unitPrice, category: l.category,
      })),
    })
    setShowSaveTemplate(false)
    setTemplateName('')
    setTemplateDesc('')
  }

  const handleLoadTemplate = (template) => {
    setLines(template.lines.map(l => ({ ...l, id: Date.now() + Math.random(), catalogId: null })))
    setShowLoadTemplate(false)
  }

  return (
    <div className="p-4 sm:p-6 flex flex-col lg:flex-row gap-5 h-full min-h-screen">
      {/* Left: Catalog picker */}
      <div className="lg:w-64 shrink-0 flex flex-col gap-3">
        <h3 className="font-semibold text-gray-800 text-sm">Catalog</h3>
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full pl-7 pr-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            placeholder="Search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {cats.map(c => (
            <button key={c} onClick={() => setCatFilter(c)}
              className={`px-2 py-0.5 rounded text-xs font-medium ${catFilter === c ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {c}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto space-y-1 max-h-[calc(100vh-220px)]">
          {filtered.map(item => (
            <button key={item.id} onClick={() => addItem(item)}
              className="w-full text-left px-3 py-2 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors group">
              <p className="text-xs font-medium text-gray-800 group-hover:text-blue-700 leading-tight">{item.name}</p>
              {item.assembly
                ? <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-semibold text-[var(--brand-700)] bg-[var(--brand-100)] px-1.5 py-0.5 rounded-full"><Calculator size={10} /> Builder</span>
                : <p className="text-xs text-gray-400 mt-0.5">${item.unitPrice}/{item.unit}</p>}
            </button>
          ))}
        </div>
      </div>

      {/* Right: Quote builder */}
      <div className="flex-1 flex flex-col gap-4">
        {revisingParentId && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            <Copy size={13} className="shrink-0" />
            <span>Creating a <strong>new revision</strong> — client info and lines are pre-filled. Edit as needed, then preview.</span>
            <button onClick={() => setRevisingParentId(null)} className="ml-auto text-amber-400 hover:text-amber-700"><X size={13} /></button>
          </div>
        )}
        {restoredFrom && !revisingParentId && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-[var(--brand-50)] border border-[var(--brand-200)] rounded-lg text-sm text-gray-700">
            <RotateCcw size={13} className="shrink-0 text-[var(--brand-600)]" />
            <span>Picked up where you left off{restoredFrom !== 'your last quote' ? <> — <strong>{restoredFrom}</strong></> : ''}.</span>
            <button onClick={() => { if (window.confirm('Start a new quote? The unsent quote on screen will be cleared.')) startFresh() }}
              className="ml-auto text-xs font-semibold text-[var(--brand-700)] hover:underline whitespace-nowrap">Start a new quote</button>
            <button onClick={() => setRestoredFrom(null)} aria-label="Dismiss" className="text-gray-400 hover:text-gray-600"><X size={13} /></button>
          </div>
        )}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-gray-900">Build Quote</h2>
            {(client || lines.length > 0 || draftProposalId || revisingParentId) && (
              <button onClick={() => { if (window.confirm('Start a new quote for a new customer? The quote on screen is cleared (anything already saved stays in the tracker).')) startFresh() }}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50">
                <Plus size={12} /> New quote
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {/* Item breakdown toggle */}
            <button
              onClick={() => setShowBreakdown(v => !v)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                showBreakdown
                  ? 'bg-green-50 border-green-300 text-green-700'
                  : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
              }`}
            >
              <span className={`relative w-8 h-4 rounded-full transition-colors shrink-0 ${showBreakdown ? 'bg-green-500' : 'bg-gray-300'}`}>
                <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${showBreakdown ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </span>
              {showBreakdown ? 'Itemized Pricing' : 'Lump Sum'}
            </button>
            {/* Summed / A La Carte toggle */}
            <button
              onClick={() => setIsAlaCarte(v => !v)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                isAlaCarte
                  ? 'bg-purple-50 border-purple-300 text-purple-700'
                  : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
              }`}
            >
              <span className={`relative w-8 h-4 rounded-full transition-colors shrink-0 ${isAlaCarte ? 'bg-purple-500' : 'bg-gray-300'}`}>
                <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${isAlaCarte ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </span>
              {isAlaCarte ? 'A La Carte' : 'Summed Total'}
            </button>
            {/* Template buttons */}
            {templates.length > 0 && (
              <button
                onClick={() => setShowLoadTemplate(true)}
                className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              >
                <BookTemplate size={14} /> Load Template
              </button>
            )}
            {lines.length > 0 && (
              <button
                onClick={() => { setTemplateName(''); setTemplateDesc(''); setShowSaveTemplate(true) }}
                className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              >
                <Save size={14} /> Save as Template
              </button>
            )}
            <button
              onClick={goToProposal}
              disabled={!lines.length}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Preview Proposal →
            </button>
          </div>
        </div>

        {/* Customer info */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Customer Info</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Customer Name</label>
              <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" placeholder="John Smith" value={client} onChange={e => setClient(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Project Address</label>
              <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" placeholder="123 Main St" value={address} onChange={e => setAddress(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Email Address</label>
              <input type="email" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" placeholder="john@example.com" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Phone Number</label>
              <input type="tel" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" placeholder="(555) 000-0000" value={phone} onChange={e => setPhone(e.target.value)} />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="text-xs font-medium text-gray-500 block mb-1">Quote Expiration Date</label>
              <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" value={expiration} onChange={e => setExpiration(e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-500 block mb-1">Project Type <span className="text-gray-400">(multi-select — used on contract)</span></label>
              <div className="flex flex-wrap gap-1.5">
                {PROJECT_TYPE_OPTIONS.map(t => (
                  <button key={t} type="button" onClick={() => toggleProjectType(t)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      projectTypes.includes(t)
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-blue-300'
                    }`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-500 block mb-1">Project Summary <span className="text-gray-400">(optional — appears on scope of work)</span></label>
              <textarea rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none" placeholder="e.g. 16'x16' Gable Roof Eze-Breeze Porch with vaulted ceilings…" value={projectSummary} onChange={e => setProjectSummary(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Quick Build — type or dictate (Wispr Flow) a job; AI fills the matching tool */}
        {!activeAssembly && (
          <div className="bg-[var(--brand-50)] border-2 border-[var(--brand-200)] rounded-2xl p-4 mb-1">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={15} className="text-[var(--brand-600)]" />
              <p className="text-sm font-semibold text-gray-800">Quick Build</p>
              <span className="text-xs text-gray-400">— say or type a job and the tool fills itself</span>
            </div>
            <div className="flex gap-2">
              <input
                value={quickText}
                onChange={e => { setQuickText(e.target.value); if (quickErr) setQuickErr('') }}
                onKeyDown={e => { if (e.key === 'Enter') runQuickBuild() }}
                placeholder='e.g. “16 by 16 TimberTech Prime Plus open deck with railing and stairs”'
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-300)] bg-white"
              />
              <button onClick={runQuickBuild} disabled={quickBusy || !quickText.trim()}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-[var(--brand-600)] text-white text-sm font-semibold rounded-lg hover:bg-[var(--brand-700)] disabled:opacity-40 transition-colors whitespace-nowrap">
                {quickBusy ? <Loader size={15} className="animate-spin" /> : <Sparkles size={15} />}
                {quickBusy ? 'Reading…' : 'Build'}
              </button>
            </div>
            {quickErr && <p className="text-xs text-red-500 mt-2">{quickErr}</p>}
            {quickNote && <p className="text-xs text-green-700 mt-2">{quickNote}</p>}
          </div>
        )}

        {/* Inline formula-item builder (opened from the catalog) — sits in the scope area */}
        {activeAssembly && editingLine && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            <Calculator size={13} className="shrink-0" />
            <span>Editing <strong>{editingLine.name}</strong> — saving replaces that line on the quote.</span>
          </div>
        )}
        {activeAssembly === 'deck' && (
          <DeckPricingPanel key={editingLineId || 'new'}
            initial={assemblyInitial} saved={editSaved}
            onClose={closeAssembly}
            onAdd={finishAssembly}
          />
        )}
        {activeAssembly === 'porchbuild' && (
          <PorchBuildPanel key={editingLineId || 'new'}
            initial={assemblyInitial?.porchBuild || null} saved={editSaved}
            onClose={closeAssembly}
            onAdd={finishAssembly}
          />
        )}
        {activeAssembly === 'underdeck' && (
          <UnderDeckPanel key={editingLineId || 'new'}
            initial={assemblyInitial?.underDeck || null} saved={editSaved}
            onClose={closeAssembly}
            onAdd={finishAssembly}
          />
        )}
        {activeAssembly === 'hardscape' && (
          <HardscapePanel key={editingLineId || 'new'}
            initial={assemblyInitial?.hardscape || null} saved={editSaved}
            onClose={closeAssembly}
            onAdd={finishAssembly}
          />
        )}
        {activeAssembly === 'porch' && (
          <PorchAssemblyPanel key={editingLineId || 'new'}
            initial={assemblyInitial} saved={editSaved}
            onClose={closeAssembly}
            onAdd={finishAssembly}
          />
        )}

        {/* Lines */}
        <div className="bg-white rounded-xl border border-gray-200 flex-1">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase w-8">#</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Item / Scope</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase w-20">Qty</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase w-20">Unit</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase w-28">Unit Price</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase w-28">Line Total</th>
                  <th className="px-4 py-2.5 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {lines.map((line, idx) => (
                  <tr key={line.id} data-line-idx={idx}
                    className={`hover:bg-gray-50 align-top ${(summed && line.hidden) || mergedTarget(line) ? 'bg-gray-50 opacity-60' : ''} ${drag?.from === idx ? 'opacity-40' : ''} ${drag && drag.over === idx && drag.from !== idx ? (drag.over < drag.from ? 'shadow-[inset_0_3px_0_var(--brand-500)]' : 'shadow-[inset_0_-3px_0_var(--brand-500)]') : ''}`}>
                    <td className="px-2 pt-3">
                      <button type="button" title="Drag to reorder" aria-label={`Move ${line.name || 'line'} (drag, or use the arrow keys)`}
                        onPointerDown={e => dragStart(e, idx)} onPointerMove={dragMove} onPointerUp={dragEnd} onPointerCancel={() => setDrag(null)}
                        onKeyDown={e => dragKey(e, idx)}
                        className={`p-1 rounded text-gray-300 hover:text-gray-600 hover:bg-gray-100 touch-none select-none ${drag?.from === idx ? 'cursor-grabbing' : 'cursor-grab'}`}>
                        <GripVertical size={15} />
                      </button>
                    </td>
                    <td className="px-4 py-2">
                      <input
                        className="w-full border border-transparent rounded px-1 py-0.5 hover:border-gray-200 focus:border-blue-300 focus:outline-none text-sm font-medium text-gray-800"
                        value={line.name}
                        onChange={e => updateLine(line.id, 'name', e.target.value)}
                        placeholder="Item name"
                      />
                      {summed && line.hidden && !mergedTarget(line) && <p className="px-1 text-[11px] font-semibold text-gray-500 flex items-center gap-1"><EyeOff size={11} /> Hidden from the customer — still counted in the total</p>}
                      {mergedTarget(line) && (
                        <p className="px-1 text-[11px] font-semibold text-gray-600 flex items-center gap-1 flex-wrap">
                          <GitMerge size={11} /> Merged into “{mergedTarget(line).name || 'untitled line'}” — the customer sees it inside that line’s price
                          <button type="button" onClick={() => setMerge(line.id, null)} className="ml-1 text-[var(--brand-700)] hover:underline font-semibold">Un-merge</button>
                        </p>
                      )}
                      {mergePickFor === line.id && !mergedTarget(line) && (
                        <div className="mt-1 flex items-center gap-2 px-1">
                          <span className="text-[11px] text-gray-500">Merge into</span>
                          <select autoFocus aria-label={`Merge ${line.name || 'line'} into`} defaultValue=""
                            onChange={e => { if (e.target.value) { setMerge(line.id, lines.find(l => String(l.id) === e.target.value)?.id); setMergePickFor(null) } }}
                            className="text-xs border border-gray-300 rounded px-1.5 py-1 bg-white max-w-[260px]">
                            <option value="">Choose a line…</option>
                            {lines.filter(l => l.id !== line.id && l.mergeInto == null).map(l => <option key={l.id} value={String(l.id)}>{l.name || 'Untitled line'}</option>)}
                          </select>
                          <button type="button" onClick={() => setMergePickFor(null)} className="text-[11px] text-gray-400 hover:text-gray-600">Cancel</button>
                        </div>
                      )}
                      <textarea
                        rows={Math.min(8, Math.max(2, (line.description || '').split('\n').length))}
                        className="w-full border border-transparent rounded px-1 py-0.5 hover:border-gray-200 focus:border-blue-300 focus:outline-none text-xs text-gray-400 italic mt-0.5 resize-y"
                        value={line.description || ''}
                        onChange={e => updateLine(line.id, 'description', e.target.value)}
                        placeholder="Scope detail (prints on proposal)..."
                      />
                    </td>
                    <td className="px-4 pt-3">
                      <input type="number" min="0"
                        className="w-full border border-transparent rounded px-1 py-0.5 hover:border-gray-200 focus:border-blue-300 focus:outline-none text-sm text-center"
                        value={line.qty} onChange={e => updateLine(line.id, 'qty', e.target.value)} />
                    </td>
                    <td className="px-4 pt-3">
                      <select
                        className="text-sm border border-transparent rounded px-1 py-0.5 hover:border-gray-200 focus:border-blue-300 focus:outline-none"
                        value={line.unit} onChange={e => updateLine(line.id, 'unit', e.target.value)}>
                        {['LF','SF','EA','LS'].map(u => <option key={u}>{u}</option>)}
                      </select>
                    </td>
                    <td className="px-4 pt-3">
                      <div className="flex items-center gap-0.5">
                        <span className="text-gray-400 text-sm">$</span>
                        <input type="number" min="0"
                          className="w-full border border-transparent rounded px-1 py-0.5 hover:border-gray-200 focus:border-blue-300 focus:outline-none text-sm"
                          value={line.unitPrice} onChange={e => updateLine(line.id, 'unitPrice', e.target.value)} />
                      </div>
                    </td>
                    <td className="px-4 pt-3 text-right font-medium text-gray-800 whitespace-nowrap">
                      ${(line.qty * line.unitPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      {mergedInto(line).length > 0 && (
                        <p className="text-[11px] font-normal text-gray-500" title="What the customer sees for this line">
                          Customer sees ${(line.qty * line.unitPrice + mergedInto(line).reduce((a, l) => a + l.qty * l.unitPrice, 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      )}
                    </td>
                    <td className="px-2 pt-2.5">
                      <div className="flex flex-col gap-1">
                        {line.catalogId === null && !savedToLog.has(line.id) && line.name?.trim() && (
                          <button
                            title="Save to catalog"
                            onClick={() => {
                              addCatalogItems([{
                                name: line.name.trim(),
                                description: line.description || '',
                                unit: line.unit || 'EA',
                                unitPrice: Number(line.unitPrice) || 0,
                                category: line.category || 'General',
                                section: line.section || '',
                              }])
                              setSavedToLog(prev => new Set([...prev, line.id]))
                            }}
                            className="p-1 rounded text-gray-300 hover:text-blue-500 hover:bg-blue-50"
                          >
                            <BookPlus size={13} />
                          </button>
                        )}
                        {savedToLog.has(line.id) && (
                          <span className="p-1 text-green-500"><Check size={13} /></span>
                        )}
                        {lines.length > 1 && !mergedTarget(line) && !lines.some(l => l.mergeInto === line.id) && (
                          <button title="Merge into another line (the customer sees one line, one price)" aria-label={`Merge ${line.name || 'line'} into another line`}
                            onClick={() => setMergePickFor(cur => cur === line.id ? null : line.id)}
                            className={`p-1 rounded hover:bg-gray-100 ${mergePickFor === line.id ? 'text-gray-700' : 'text-gray-300 hover:text-gray-600'}`}>
                            <GitMerge size={13} />
                          </button>
                        )}
                        {summed && !mergedTarget(line) && (
                          <button title={line.hidden ? 'Show on the proposal' : 'Hide from the customer (still in the total)'}
                            aria-label={`${line.hidden ? 'Show' : 'Hide'} ${line.name || 'line'} on the proposal`}
                            onClick={() => setLines(prev => prev.map(l => l.id === line.id ? { ...l, hidden: !l.hidden } : l))}
                            className={`p-1 rounded hover:bg-gray-100 ${line.hidden ? 'text-gray-700' : 'text-gray-300 hover:text-gray-600'}`}>
                            {line.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
                          </button>
                        )}
                        {line.builder?.tool && (
                          <button title="Edit in builder" aria-label={`Edit ${line.name} in builder`} onClick={() => openInBuilder(line)}
                            className={`p-1 rounded hover:bg-[var(--brand-50)] ${editingLineId === line.id ? 'text-[var(--brand-600)]' : 'text-gray-400 hover:text-[var(--brand-600)]'}`}>
                            <Calculator size={13} />
                          </button>
                        )}
                        <button onClick={() => removeLine(line.id)} className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {feeLine && (
                  <tr className="bg-amber-50/70 border-t-2 border-amber-100">
                    <td className="px-4 py-2 text-xs text-amber-600"><Landmark size={13} /></td>
                    <td className="px-4 py-2" colSpan={4}>
                      <p className="text-sm font-semibold text-gray-800">Permits &amp; fees</p>
                      <p className="text-xs text-amber-700/80">One line on the proposal. Adjust or remove the parts below.</p>
                    </td>
                    <td className="px-4 pt-3 text-right font-semibold text-gray-800 whitespace-nowrap">
                      ${Number(feeLine.unitPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td />
                  </tr>
                )}
                {feeLines.map((f) => (
                  <tr key={f.id} className="bg-amber-50/30 border-t border-gray-50">
                    <td className="px-4 py-2 text-xs text-amber-500" title="Added from the job address">
                      <Landmark size={13} />
                    </td>
                    <td className="px-4 py-2 pl-8">
                      <p className="text-sm font-medium text-gray-700">{f.name}</p>
                      <p className="text-xs text-amber-700/80">Auto-added · {f.why}</p>
                    </td>
                    <td className="px-4 pt-3 text-sm text-center text-gray-500">1</td>
                    <td className="px-4 pt-3 text-sm text-gray-500">LS</td>
                    <td className="px-4 pt-3">
                      <div className="flex items-center gap-0.5">
                        <span className="text-gray-400 text-sm">$</span>
                        <input type="number" min="0" aria-label={`${f.name} price`}
                          className="w-full border border-transparent rounded px-1 py-0.5 hover:border-gray-200 focus:border-blue-300 focus:outline-none text-sm bg-transparent"
                          value={f.unitPrice} onChange={e => setFeeEdits(cur => ({ ...cur, [f.autoFee]: parseFloat(e.target.value) || 0 }))} />
                      </div>
                    </td>
                    <td className="px-4 pt-3 text-right font-medium text-gray-800 whitespace-nowrap">
                      ${Number(f.unitPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-2 pt-2.5">
                      <button onClick={() => setFeeDismissed(cur => [...cur, f.autoFee])} title="Remove this fee from the quote" aria-label={`Remove ${f.name}`}
                        className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Where the job is, and why these fees were added */}
          {(lines.length > 0 || address) && (
            <div className="mx-4 my-3 rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2 text-xs text-gray-600 flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="flex items-center gap-1.5 font-semibold text-amber-800"><Landmark size={13} /> Permits &amp; fees</span>
              {!address.trim() ? (
                <span>Enter the project address and the permit fees for that location are added automatically.</span>
              ) : !feePlan.loc.known ? (
                <span>Couldn’t tell the county or state from “{address}”. Add the city, state and ZIP (e.g. “Charlotte, NC 28277”).</span>
              ) : (
                <span>
                  {[feePlan.loc.county && `${feePlan.loc.county} County`, feePlan.loc.state, feePlan.loc.zip].filter(Boolean).join(' · ')}
                  {feePlan.loc.countyFrom === 'city' && ' (county from the city name)'}
                  {!(feePlan.kinds.porch || feePlan.kinds.deck || feePlan.kinds.hardscape) && ' — add the work and its permit is added too.'}
                </span>
              )}
              {(feePlan.loc.tegaCayUnsure || feeOverrides.tegaCay !== undefined) && (
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" className="accent-[var(--brand-600)]" checked={!!(feeOverrides.tegaCay ?? feePlan.loc.tegaCay)}
                    onChange={e => setFeeOverrides(cur => ({ ...cur, tegaCay: e.target.checked }))} />
                  Inside Tega Cay city limits? (29708 is shared with Fort Mill)
                </label>
              )}
              {dismissedFees.map(f => (
                <button key={f.key} onClick={() => setFeeDismissed(cur => cur.filter(k => k !== f.key))}
                  className="text-[var(--brand-700)] hover:underline">+ Add back {f.label}</button>
              ))}
            </div>
          )}

          {lines.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <p className="text-sm">Click items from the catalog on the left to add them.</p>
              {templates.length > 0 && (
                <button onClick={() => setShowLoadTemplate(true)} className="mt-2 text-sm text-blue-500 hover:underline">
                  Or load a saved template →
                </button>
              )}
            </div>
          )}

          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
            <button onClick={addBlankLine} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
              <Plus size={14} /> Add blank line
            </button>
            <div className="text-right">
              <p className="text-xs text-gray-500 mb-0.5">{allLines.length} line{allLines.length !== 1 ? 's' : ''}</p>
              <p className="text-lg font-bold text-gray-900">
                ${subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>

        {/* Margin overlay */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-amber-800">Margin Overlay (Contractor Only)</span>
            <button onClick={() => setShowMargin(m => !m)} className="text-amber-600 hover:text-amber-800">
              {showMargin ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {showMargin && (
            <div className="flex items-center gap-4 text-sm">
              <label className="text-amber-700">Margin %</label>
              <input type="number" min="0" max="100"
                className="w-20 border border-amber-300 rounded px-2 py-1 text-center focus:outline-none"
                value={margin} onChange={e => setMargin(parseFloat(e.target.value) || 0)} />
              <div className="flex gap-6 ml-auto">
                <div className="text-center">
                  <p className="text-xs text-amber-600">Est. Cost</p>
                  <p className="font-semibold text-amber-900">${cost?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-amber-600">Est. Profit</p>
                  <p className="font-semibold text-green-700">${(subtotal - cost).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Save Template Modal */}
      {showSaveTemplate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Save size={16} className="text-[var(--brand-500)]" /> Save as Template
              </h3>
              <button onClick={() => setShowSaveTemplate(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="space-y-3 mb-4">
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Template Name</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                  placeholder="e.g. Standard 6ft Cedar Fence"
                  value={templateName}
                  onChange={e => setTemplateName(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Description (optional)</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                  placeholder="e.g. Typical residential privacy fence job"
                  value={templateDesc}
                  onChange={e => setTemplateDesc(e.target.value)}
                />
              </div>
              <p className="text-xs text-gray-400">{lines.length} line item{lines.length !== 1 ? 's' : ''} will be saved. Customer info is not included.</p>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowSaveTemplate(false)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button
                onClick={handleSaveTemplate}
                disabled={!templateName.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                Save Template
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Load Template Modal */}
      {showLoadTemplate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <BookTemplate size={16} className="text-[var(--brand-500)]" /> Load Template
              </h3>
              <button onClick={() => setShowLoadTemplate(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <p className="text-xs text-gray-500 mb-3">Loading a template will replace your current line items.</p>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {templates.map(t => (
                <div key={t.id} className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 group transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 group-hover:text-blue-700">{t.name}</p>
                    {t.description && <p className="text-xs text-gray-400 mt-0.5">{t.description}</p>}
                    <p className="text-xs text-gray-300 mt-0.5">{t.lines.length} items · saved {new Date(t.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => handleLoadTemplate(t)}
                      className="px-2.5 py-1 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700"
                    >
                      Load
                    </button>
                    <button
                      onClick={() => deleteTemplate(t.id)}
                      className="p-1 text-gray-300 hover:text-red-500 rounded"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end mt-4">
              <button onClick={() => setShowLoadTemplate(false)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
