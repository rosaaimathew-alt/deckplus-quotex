import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { useStore } from '../store'
import { JicField } from './Jic'
import { JIC_DEFAULT, jicAmount, jicLine } from '../lib/jic'
import {
  HS_CONCRETE, HS_PAVERS, HS_WALLS, HS_ACCESSORIES, HS_KITCHEN, HS_GRANITE, HS_GRANITE_COLORS,
  HS_INPUT_DEFAULTS, HS_PUMP_TRUCK_FEE, HS_STEPPING, HS_BACKFILL, HS_GRANITE_FINISH, computeHardscape, hsRate,
} from '../hardscape'

// ── Hardscape tool ───────────────────────────────────────────────────────────
// Patio surface, retaining wall, patio accessories and outdoor kitchen, priced
// from the catalog (Hardscape price list rows 34–89). "Add to quote" writes one
// line per item so the customer sees exactly what they're getting.

const money  = (v) => '$' + Math.round(v).toLocaleString('en-US')
const money2 = (v) => '$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 })
const inputCls = 'w-full text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[var(--brand-200)]'
const selCls = inputCls + ' bg-white'

function Field({ label, children, hint }) {
  return (
    <div className="block">
      <span className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-gray-400 mt-1">{hint}</span>}
    </div>
  )
}

function Section({ title, total, children }) {
  return (
    <div className="rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{title}</p>
        {total > 0 && <span className="text-xs font-semibold text-gray-700 tabular-nums">{money(total)}</span>}
      </div>
      {children}
    </div>
  )
}

export default function HardscapePanel({ onClose, onAdd, initial }) {
  const catalogRaw = useStore(s => s.catalog)
  const catalog = useMemo(() => catalogRaw || [], [catalogRaw])
  const [inp, setInp] = useState(() => ({
    ...HS_INPUT_DEFAULTS, ...(initial || {}),
    patio: { ...HS_INPUT_DEFAULTS.patio, ...(initial?.patio || {}) },
    wall: { ...HS_INPUT_DEFAULTS.wall, ...(initial?.wall || {}) },
    granite: { ...HS_INPUT_DEFAULTS.granite, ...(initial?.granite || {}) },
  }))
  const [jic, setJic] = useState(JIC_DEFAULT)
  const setIn = (part, p) => setInp(cur => ({ ...cur, [part]: { ...cur[part], ...p } }))
  const setQty = (key, v) => setInp(cur => ({ ...cur, qty: { ...cur.qty, [key]: v } }))
  const result = useMemo(() => computeHardscape(inp, catalog), [inp, catalog])
  const groupTotal = (k) => result.groups.find(g => g.key === k)?.total || 0
  const rateOf = (it) => hsRate(it, catalog)
  const isConcrete = HS_CONCRETE.some(c => c.key === inp.patio.surface)

  // A plain render helper (not a nested component) so inputs keep focus while typing
  const qtyRow = (it) => {
    const r = rateOf(it)
    return (
      <label key={it.key} className="flex items-center gap-3 text-sm text-gray-700">
        <input type="number" min="0" aria-label={it.label} value={inp.qty?.[it.key] ?? ''} placeholder="0"
          onChange={e => setQty(it.key, e.target.value)}
          className="w-16 text-sm border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[var(--brand-200)]" />
        <span className="flex-1 min-w-0 truncate" title={it.label}>{it.label}</span>
        <span className="text-xs text-gray-400 tabular-nums whitespace-nowrap">{money2(r.rate)}/{r.unit}</span>
      </label>
    )
  }

  const add = () => {
    const stamp = Date.now()
    const P = inp.patio
    const out = result.lines.map((l, i) => {
      const isSurface = l.group === 'patio' && (HS_CONCRETE.some(c => c.key === l.key) || HS_PAVERS.some(p => p.key === l.key) || l.key === 'concreteSmall')
      return {
        id: stamp + i + Math.random(),
        catalogId: null,
        name: isSurface ? `${l.label} patio — ${Number(P.width) || 0}′×${Number(P.depth) || 0}′ (${result.area} SF)` : l.label,
        section: 'Hardscape',
        description: isSurface
          ? `Install a ${l.label.toLowerCase()} patio, approximately ${Number(P.width) || 0}′ × ${Number(P.depth) || 0}′ (${result.area} SF).`
          : (l.note || ''),
        unit: l.unit,
        qty: l.qty,
        unitPrice: l.rate,
        category: l.group === 'kitchen' ? 'Outdoor Kitchens' : 'Hardscapes',
        costMaterials: Math.round(l.costTotal),
        costSub: 0,
        ...(i === 0 ? { hardscape: inp } : {}),
      }
    })
    const jl = jicLine(jic, result.total, { section: 'Hardscape', category: 'Hardscapes', label: 'hardscape' })
    onAdd(jl ? [...out, jl] : out)
  }

  const g = HS_GRANITE.find(x => x.key === inp.granite.level)

  return (
    <div className="bg-white rounded-2xl border-2 border-[var(--brand-200)] shadow-lg p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-gray-900">Hardscape Builder</h3>
          <p className="text-xs text-gray-500 mt-0.5">Patios, retaining walls, fire pits, drainage and outdoor kitchens. Prices come from your catalog.</p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close hardscape builder"><X size={18} /></button>
      </div>

      {/* Patio */}
      <Section title="Patio" total={groupTotal('patio')}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Width (ft)"><input type="number" min="0" aria-label="Patio width (ft)" className={inputCls} value={inp.patio.width} onChange={e => setIn('patio', { width: e.target.value })} /></Field>
          <Field label="Depth (ft)" hint={`${result.area} SF`}><input type="number" min="0" aria-label="Patio depth (ft)" className={inputCls} value={inp.patio.depth} onChange={e => setIn('patio', { depth: e.target.value })} /></Field>
          <Field label="Surface" hint={result.area > 0 && result.area < 200 && inp.patio.surface ? (isConcrete ? (inp.patio.surface === 'concrete4' ? 'Under 200 SF — priced as a small slab.' : undefined) : 'Under 200 SF — small-patio add applies.') : undefined}>
            <select aria-label="Patio surface" className={selCls} value={inp.patio.surface} onChange={e => setIn('patio', { surface: e.target.value })}>
              <option value="">No patio</option>
              <optgroup label="Concrete">
                {HS_CONCRETE.map(c => <option key={c.key} value={c.key}>{c.label} — {money2(rateOf(c).rate)}/SF</option>)}
              </optgroup>
              <optgroup label="Pavers & stone">
                {HS_PAVERS.map(p => <option key={p.key} value={p.key}>{p.label} — {money2(rateOf(p).rate)}/SF</option>)}
              </optgroup>
            </select>
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {isConcrete && (
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
              <input type="checkbox" checked={!!inp.patio.pumpTruck} onChange={e => setIn('patio', { pumpTruck: e.target.checked })} className="accent-[var(--brand-600)]" />
              Pump truck needed (hill / driveway / house access) — {money(HS_PUMP_TRUCK_FEE)}
            </label>
          )}
          <label className="flex items-center gap-3 text-sm text-gray-700">
            <input type="number" min="0" aria-label={HS_STEPPING.label} value={inp.stepping || ''} placeholder="0"
              onChange={e => setInp(cur => ({ ...cur, stepping: e.target.value }))}
              className="w-16 text-sm border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[var(--brand-200)]" />
            {HS_STEPPING.label} <span className="text-xs text-gray-400">{money2(rateOf(HS_STEPPING).rate)} each</span>
          </label>
        </div>
      </Section>

      {/* Retaining wall */}
      <Section title="Retaining wall" total={groupTotal('wall')}>
        <div className="grid grid-cols-2 md:grid-cols-[2fr_1fr_1fr_1fr] gap-4">
          <Field label="Wall type">
            <select aria-label="Retaining wall type" className={selCls} value={inp.wall.type} onChange={e => setIn('wall', { type: e.target.value })}>
              <option value="">No wall</option>
              {HS_WALLS.map(w => <option key={w.key} value={w.key}>{w.label} — {money2(rateOf(w).rate)}/SF</option>)}
            </select>
          </Field>
          <Field label="Length (ft)"><input type="number" min="0" aria-label="Wall length (ft)" className={inputCls} value={inp.wall.length || ''} onChange={e => setIn('wall', { length: e.target.value })} /></Field>
          <Field label="Height (ft)" hint={inp.wall.type ? `${result.wallSF} SF of wall` : undefined}><input type="number" min="0" step="0.5" aria-label="Wall height (ft)" className={inputCls} value={inp.wall.height || ''} onChange={e => setIn('wall', { height: e.target.value })} /></Field>
          <Field label="Backfill depth (ft)" hint={result.backfillYd > 0 ? `${result.backfillYd} yd × ${money2(rateOf(HS_BACKFILL).rate)}` : '(L × D × H) ÷ 27'}><input type="number" min="0" step="0.5" aria-label="Backfill depth (ft)" className={inputCls} value={inp.wall.backfillDepth || ''} onChange={e => setIn('wall', { backfillDepth: e.target.value })} /></Field>
        </div>
      </Section>

      {/* Accessories */}
      <Section title="Patio accessories" total={groupTotal('accessory')}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
          {HS_ACCESSORIES.map(qtyRow)}
        </div>
      </Section>

      {/* Outdoor kitchen */}
      <Section title="Outdoor kitchen" total={groupTotal('kitchen')}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
          {HS_KITCHEN.map(qtyRow)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr] gap-4 pt-2 border-t border-gray-100">
          <Field label="Granite countertop" hint={g ? HS_GRANITE_COLORS[g.key] : '30 SF minimum; +1′ added to width and length'}>
            <select aria-label="Granite level" className={selCls} value={inp.granite.level} onChange={e => setIn('granite', { level: e.target.value })}>
              <option value="">No granite</option>
              {HS_GRANITE.map(x => <option key={x.key} value={x.key}>{x.label.replace(' (includes 1st seal)', '')} — {money2(rateOf(x).rate)}/SF</option>)}
            </select>
          </Field>
          <Field label="Countertop length (ft)"><input type="number" min="0" step="0.5" aria-label="Countertop length (ft)" className={inputCls} value={inp.granite.length || ''} onChange={e => setIn('granite', { length: e.target.value })} /></Field>
          <Field label="Countertop depth (ft)" hint={result.graniteSF > 0 ? `${result.graniteSF} SF billed` : undefined}><input type="number" min="0" step="0.5" aria-label="Countertop depth (ft)" className={inputCls} value={inp.granite.depth || ''} onChange={e => setIn('granite', { depth: e.target.value })} /></Field>
          <Field label="Finish">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none mt-1.5">
              <input type="checkbox" checked={!!inp.granite.finish} onChange={e => setIn('granite', { finish: e.target.checked })} className="accent-[var(--brand-600)]" />
              Leathered / honed (+{money2(rateOf(HS_GRANITE_FINISH).rate)}/SF)
            </label>
          </Field>
        </div>
      </Section>

      {/* Summary */}
      {result.lines.length > 0 && (
        <div className="rounded-xl bg-gray-50 border border-gray-100 divide-y divide-gray-100">
          {result.lines.map(l => (
            <div key={l.key} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
              <span className="text-gray-700 min-w-0">{l.label} <span className="text-gray-400">— {l.qty} {l.unit} × {money2(l.rate)}{l.note ? ` · ${l.note}` : ''}</span></span>
              <span className="font-medium text-gray-900 tabular-nums">{money(l.total)}</span>
            </div>
          ))}
        </div>
      )}

      <JicField value={jic} onChange={setJic} base={result.total} />

      <div className="flex gap-2">
        <button onClick={add} disabled={result.total <= 0}
          className="flex-1 py-2.5 bg-[var(--brand-600)] text-white text-sm font-medium rounded-lg hover:bg-[var(--brand-700)] disabled:opacity-40 transition-colors">
          Add hardscape to quote — {money(result.total + jicAmount(jic, result.total))}
        </button>
        <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
      </div>
    </div>
  )
}
