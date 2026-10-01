import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { useStore } from '../store'
import { JicField } from './Jic'
import { JIC_DEFAULT, jicAmount, jicLine } from '../lib/jic'
import { UDC_STYLES, UDC_ELECTRICAL, UDC_INPUT_DEFAULTS, computeUnderDeck, rateFor } from '../underDeck'

// ── Under-deck ceiling tool ──────────────────────────────────────────────────
// The rep enters the area under the deck, picks the ceiling style and counts the
// electrical; prices come from the catalog (Deck price list rows 111–126).
// "Add to quote" writes the ceiling as one line and each electrical item as its
// own line, so the customer sees exactly what they're getting.

const money = (v) => '$' + Math.round(v).toLocaleString('en-US')
const money2 = (v) => '$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 })
const inputCls = 'w-full text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[var(--brand-200)]'

function Field({ label, children, hint }) {
  return (
    <div className="block">
      <span className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-gray-400 mt-1">{hint}</span>}
    </div>
  )
}

export default function UnderDeckPanel({ onClose, onAdd, initial }) {
  const catalogRaw = useStore(s => s.catalog)
  const catalog = useMemo(() => catalogRaw || [], [catalogRaw])
  const [inp, setInp] = useState({ ...UDC_INPUT_DEFAULTS, ...(initial || {}) })
  const [jic, setJic] = useState(JIC_DEFAULT)
  const set = (p) => setInp(cur => ({ ...cur, ...p }))
  const setQty = (key, v) => setInp(cur => ({ ...cur, electrical: { ...cur.electrical, [key]: v } }))
  const result = useMemo(() => computeUnderDeck(inp, catalog), [inp, catalog])
  const W = Number(inp.width) || 0, D = Number(inp.depth) || 0

  const add = () => {
    const stamp = Date.now()
    const ceilingLine = {
      id: stamp + Math.random(),
      catalogId: null,
      name: `Under-deck ceiling — ${result.style.label} (${W}′×${D}′, ${result.area} SF)`,
      section: 'Under Deck',
      description: `Install a Dry under-deck ceiling system (${result.style.label.toLowerCase()} finish) under the deck, approximately ${W}′ × ${D}′ (${result.area} SF).`,
      unit: 'SF',
      qty: result.area,
      unitPrice: result.ceiling.rate,
      category: 'Under Deck Ceiling',
      costMaterials: Math.round(result.ceiling.costTotal),
      costSub: 0,
      underDeck: inp,
    }
    const elecLines = result.electrical.map((l, i) => ({
      id: stamp + i + 1 + Math.random(),
      catalogId: null,
      name: l.label,
      section: 'Under Deck',
      description: '',
      unit: 'EA',
      qty: l.qty,
      unitPrice: l.rate,
      category: 'Electrical',
      costMaterials: Math.round(l.costTotal),
      costSub: 0,
    }))
    const jl = jicLine(jic, result.total, { section: 'Under Deck', category: 'Under Deck Ceiling', label: 'under-deck' })
    onAdd([ceilingLine, ...elecLines, ...(jl ? [jl] : [])])
  }

  return (
    <div className="bg-white rounded-2xl border-2 border-[var(--brand-200)] shadow-lg p-5 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-gray-900">Under-Deck Builder</h3>
          <p className="text-xs text-gray-500 mt-0.5">Dry under-deck ceiling plus lighting and power. Prices come from your catalog.</p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close under-deck builder"><X size={18} /></button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Width (ft)"><input type="number" min="0" aria-label="Under-deck width (ft)" className={inputCls} value={inp.width} onChange={e => set({ width: e.target.value })} /></Field>
        <Field label="Depth (ft)" hint={`${result.area} SF of ceiling`}><input type="number" min="0" aria-label="Under-deck depth (ft)" className={inputCls} value={inp.depth} onChange={e => set({ depth: e.target.value })} /></Field>
        <Field label="Ceiling style">
          <div className="flex flex-wrap gap-1">
            {UDC_STYLES.map(s => {
              const on = inp.style === s.key
              return (
                <button key={s.key} type="button" onClick={() => set({ style: s.key })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${on ? 'bg-[var(--brand-600)] text-white border-[var(--brand-600)]' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'}`}>
                  {s.label} <span className={on ? 'text-white/70' : 'text-gray-400'}>{money2(rateFor(s, catalog).rate)}/SF</span>
                </button>
              )
            })}
          </div>
        </Field>
      </div>

      <div className="rounded-xl border border-gray-200 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-3">Electrical (quantity of each)</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
          {UDC_ELECTRICAL.map(e => (
            <label key={e.key} className="flex items-center gap-3 text-sm text-gray-700">
              <input type="number" min="0" aria-label={e.label} value={inp.electrical?.[e.key] ?? ''} placeholder="0"
                onChange={ev => setQty(e.key, ev.target.value)}
                className="w-16 text-sm border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[var(--brand-200)]" />
              <span className="flex-1 min-w-0 truncate" title={e.label}>{e.label}</span>
              <span className="text-xs text-gray-400 tabular-nums">{money(rateFor(e, catalog).rate)}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-xl bg-gray-50 border border-gray-100 divide-y divide-gray-100">
        {result.lines.map(l => (
          <div key={l.key} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
            <span className="text-gray-700">{l.label} <span className="text-gray-400">— {l.qty} {l.unit} × {money2(l.rate)}</span></span>
            <span className="font-medium text-gray-900 tabular-nums">{money(l.total)}</span>
          </div>
        ))}
      </div>

      <JicField value={jic} onChange={setJic} base={result.total} />

      <div className="flex gap-2">
        <button onClick={add} disabled={result.total <= 0}
          className="flex-1 py-2.5 bg-[var(--brand-600)] text-white text-sm font-medium rounded-lg hover:bg-[var(--brand-700)] disabled:opacity-40 transition-colors">
          Add under-deck to quote — {money(result.total + jicAmount(jic, result.total))}
        </button>
        <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
      </div>
    </div>
  )
}
