import { useMemo, useState } from 'react'
import { X, Lock, Plus, Trash2 } from 'lucide-react'
import { useStore } from '../store'
import { JicField } from './Jic'
import { JIC_DEFAULT, jicAmount } from '../lib/jic'
import {
  PORCH_BUILD_DEFAULTS, PORCH_BUILD_INPUT_DEFAULTS, PORCH_TYPES, PORCH_TIES, PORCH_FLOORS, PORCH_ROOFS,
  PORCH_BUILD_GROUPS, computePorchBuild, buildPorchScope, PORCH_WINDOW_MAX_H,
} from '../porchBuild'

// ── Porch Builder panel ──────────────────────────────────────────────────────
// The rep enters what they know on site; every price comes from the org's rate
// table (Item Catalog → Formulas → Porch Builder). Rates are never edited here.
// "Add to quote" writes ONE quote line for the whole porch — the full scope as its
// description, the JIC built into its price — and the office keeps the itemized
// breakdown here.

const money = (v) => '$' + Math.round(v).toLocaleString('en-US')
const inputCls = 'w-full text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[var(--brand-200)]'
const selCls   = inputCls + ' bg-white'

function Seg({ options, value, onChange, disabledKeys = [] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map(o => {
        const dis = disabledKeys.includes(o.key)
        const active = value === o.key
        return (
          <button key={o.key} type="button" disabled={dis} onClick={() => onChange(o.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              active ? 'bg-[var(--brand-600)] text-white border-[var(--brand-600)]'
                     : dis ? 'bg-gray-50 text-gray-300 border-gray-200 cursor-not-allowed'
                           : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'}`}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// A div, not a <label>: several fields hold button groups, and buttons inside
// a label get the label's text folded into their accessible name.
function Field({ label, children, hint }) {
  return (
    <div className="block">
      <span className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-gray-400 mt-1">{hint}</span>}
    </div>
  )
}

function Check({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
      <input type="checkbox" checked={!!checked} onChange={e => onChange(e.target.checked)} className="accent-[var(--brand-600)]" />
      {label}
    </label>
  )
}

export default function PorchBuildPanel({ onClose, onAdd, initial }) {
  const savedRates = useStore(s => s.porchBuildRates) || {}
  const locked     = useStore(s => s.porchBuildLocked)
  const scopes     = useStore(s => s.porchBuildScopes)
  const catalog    = useStore(s => s.catalog)
  const rates = useMemo(() => {
    const out = {}
    for (const k of Object.keys(PORCH_BUILD_DEFAULTS)) out[k] = { ...PORCH_BUILD_DEFAULTS[k], ...(savedRates[k] || {}) }
    return out
  }, [savedRates])

  const [inp, setInp] = useState({ ...PORCH_BUILD_INPUT_DEFAULTS, ...(initial || {}) })
  const [jic, setJic] = useState(JIC_DEFAULT)
  const set = (patch) => setInp(p => ({ ...p, ...patch }))
  const setSub = (k, patch) => setInp(p => ({ ...p, [k]: { ...(p[k] || {}), ...patch } }))

  const result = useMemo(() => computePorchBuild(inp, rates), [inp, rates])
  const scopeOut = useMemo(() => buildPorchScope(inp, result, scopes, catalog), [inp, result, scopes, catalog])
  const scope = scopeOut.text
  const typeMeta = PORCH_TYPES.find(t => t.key === inp.type) || PORCH_TYPES[0]
  const W = Number(inp.width) || 0, D = Number(inp.depth) || 0

  const keysWhere = (pred) => Object.keys(rates).filter(k => pred(rates[k]))
  const doorKeys    = keysWhere(r => r.door)
  const floorKeys   = keysWhere(r => r.floor)
  const concreteKeys = keysWhere(r => r.concrete && r !== rates.concrete_small)
  const railKeys    = keysWhere(r => r.rail)
  const fasciaKeys  = keysWhere(r => r.fascia)
  const stepProducts = [...new Set(keysWhere(r => r.steps).map(k => rates[k].steps))]
  const landingProducts = [...new Set(keysWhere(r => r.landing).map(k => rates[k].landing))]
  const optionKeys  = keysWhere(r => r.option)
  const elecPkgKeys = keysWhere(r => r.elecPkg)
  const optionsByGroup = PORCH_BUILD_GROUPS.map(g => ({ ...g, keys: optionKeys.filter(k => rates[k].group === g.key) })).filter(g => g.keys.length)

  const addOption = (key) => {
    if (!key || inp.extras?.[key] != null) return
    const r = rates[key]
    const qty = r.unit === 'SF' ? result.area : r.unit === 'LF' ? W : 1
    set({ extras: { ...(inp.extras || {}), [key]: qty } })
  }
  const removeOption = (key) => { const ex = { ...(inp.extras || {}) }; delete ex[key]; set({ extras: ex }) }

  const jicAmt = jicAmount(jic, result.total)
  const total  = result.total + jicAmt               // what the customer is quoted
  const marginPct = total > 0 && result.cost > 0 ? ((total - result.cost) / total) * 100 : null

  const add = () => {
    onAdd([{
      id: Date.now() + Math.random(),
      catalogId: null,
      name: `${typeMeta.label} — ${W}′×${D}′ (${result.area} SF)`,
      section: 'Porch',
      description: scope,
      unit: 'EA',
      qty: 1,
      unitPrice: Math.round(total),
      category: typeMeta.category,
      costMaterials: Math.round(result.cost),
      costSub: 0,
      porchBuild: inp,
    }])
  }

  return (
    <div className="bg-white rounded-2xl border-2 border-[var(--brand-200)] shadow-lg p-5 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-gray-900">Porch Builder</h3>
          <p className="text-xs text-gray-500 mt-0.5">Open, ScreenEze or Eze-Breeze porch. Enter what you measured; price, cost and scope calculate from the office's rates.</p>
        </div>
        <div className="flex items-center gap-2">
          {locked && <span className="flex items-center gap-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5"><Lock size={11} /> Rates locked</span>}
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
      </div>

      {/* ── The three cost drivers ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Porch type"><Seg options={PORCH_TYPES} value={inp.type} onChange={v => set({ type: v })} /></Field>
        <Field label="Width along the house (ft)"><input type="number" min="1" aria-label="Width (ft)" className={inputCls} value={inp.width} onChange={e => set({ width: e.target.value })} /></Field>
        <Field label="Depth out from the house (ft)" hint={`${result.area} SF floor area`}><input type="number" min="1" aria-label="Depth (ft)" className={inputCls} value={inp.depth} onChange={e => set({ depth: e.target.value })} /></Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Sits on">
          <Seg options={PORCH_FLOORS} value={inp.floor} onChange={v => set({ floor: v, concrete: v === 'patio' ? inp.concrete : null })} />
          {inp.floor === 'deck' && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-gray-500">Deck height (ft)</span>
              <input type="number" min="0" step="0.5" className="w-20 text-sm border border-gray-300 rounded-lg px-2 py-1" value={inp.deckHeightFt} onChange={e => set({ deckHeightFt: e.target.value })} />
              {Number(inp.deckHeightFt) > 8 && <span className="text-[11px] text-amber-600">over 8′ adder applies</span>}
            </div>
          )}
        </Field>
        <Field label="Roof connection"><Seg options={PORCH_TIES} value={inp.tie} onChange={v => set({ tie: v, roof: v === 'free' ? 'gable' : inp.roof })} /></Field>
        <Field label="Roof style" hint={inp.tie === 'free' ? 'Freestanding porches are always gable.' : result.roof === 'gable' || result.roof === 'hip' ? 'Adds PT LVL for the depth + LVL engineering.' : result.roof === 'semivault' ? 'Over 19′ wide adds the same flat fee as a gable.' : undefined}>
          <Seg options={PORCH_ROOFS} value={result.roof} onChange={v => set({ roof: v })} disabledKeys={inp.tie === 'free' ? ['shed', 'hip'] : []} />
        </Field>
      </div>

      {/* ── Enclosure ──────────────────────────────────────────────────── */}
      {inp.type !== 'open' && (
        <div className="rounded-xl border border-gray-200 p-4 space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Enclosure</p>
          {inp.type === 'screen' && (
            <p className="text-xs text-gray-500">ScreenEze screens are added as their own line at the Builder rate per SF of porch, on top of the screen-porch price.</p>
          )}
          {inp.type === 'ezebreeze' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Wall height (in)" hint={Number(inp.wallHeightIn) > PORCH_WINDOW_MAX_H ? 'Over 105″ → one transom per window' : undefined}>
                <input type="number" min="60" aria-label="Wall height (in)" className={inputCls} value={inp.wallHeightIn} onChange={e => set({ wallHeightIn: e.target.value })} />
              </Field>
              <Field label="Enclosed walls">
                <select className={selCls} value={inp.sides} onChange={e => set({ sides: e.target.value })}>
                  {['Front + 2 sides', 'All 4 walls', 'Front only'].map(o => <option key={o}>{o}</option>)}
                </select>
              </Field>
              <div className="text-xs text-gray-600 self-end pb-1.5">
                {result.layout ? <>
                  <span className="font-semibold text-gray-800">{result.layout.totalWindows}</span> windows ·{' '}
                  <span className="font-semibold text-gray-800">{result.layout.totalColumns}</span> columns
                  {Number(inp.wallHeightIn) > PORCH_WINDOW_MAX_H && <> · <span className="font-semibold text-gray-800">{result.layout.totalWindows}</span> transoms</>}
                </> : null}
              </div>
            </div>
          )}
          <div>
            <p className="text-xs text-gray-500 mb-1.5">Doors (count per model)</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {doorKeys.map(k => (
                <label key={k} className="flex items-center justify-between gap-2 text-xs text-gray-700 border border-gray-200 rounded-lg px-2 py-1.5">
                  <span className="truncate">{rates[k].label.replace('Larsen ', '')} <span className="text-gray-400">{money(rates[k].rate)}</span></span>
                  <input type="number" min="0" className="w-12 text-sm border border-gray-300 rounded px-1 py-0.5 text-right" value={inp.doors?.[k] ?? ''} placeholder="0"
                    onChange={e => set({ doors: { ...(inp.doors || {}), [k]: e.target.value } })} />
                </label>
              ))}
            </div>
          </div>
          {result.roof === 'gable' && (
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <span>Glass in gable ends</span>
              <input type="number" min="0" max="2" className="w-16 text-sm border border-gray-300 rounded-lg px-2 py-1" value={inp.glassEnds} onChange={e => set({ glassEnds: e.target.value })} />
              <span className="text-xs text-gray-400">{money(rates.glass_gable_end.rate)} each, any pitch</span>
            </div>
          )}
        </div>
      )}

      {/* ── Structure options ─────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Structural add-ons</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          <Check label={`Reinforce deck for hot tub (${money(rates.hot_tub_reinforce.rate)})`} checked={inp.hotTub} onChange={v => set({ hotTub: v })} />
          <Check label={`Open porch wrap / LVL engineer (${money(rates.porch_wrap.rate)})`} checked={inp.wrap} onChange={v => set({ wrap: v })} />
          <Check label={`Roof cricket (${money(rates.roof_cricket.rate)})`} checked={inp.cricket} onChange={v => set({ cricket: v })} />
          <Check label={`Seed and straw (${money(rates.seed_straw.rate)})`} checked={inp.seedStraw} onChange={v => set({ seedStraw: v })} />
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <span>Metal bracing plates (posts)</span>
            <input type="number" min="0" className="w-16 text-sm border border-gray-300 rounded-lg px-2 py-1" value={inp.bracingPosts} onChange={e => set({ bracingPosts: e.target.value })} />
            <span className="text-xs text-gray-400">+ letter</span>
          </label>
          <Check label="Paint / stain porch (rate follows the floor type)" checked={inp.paintPorch} onChange={v => set({ paintPorch: v })} />
        </div>
      </div>

      {/* ── Flooring, steps, railing ──────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Field label="Flooring upgrade" hint="Trex upgrades are priced per LF of board, like the deck tool.">
          <select className={selCls} value={inp.flooring || ''} onChange={e => set({ flooring: e.target.value || null })}>
            <option value="">None (PT floor included)</option>
            {floorKeys.map(k => <option key={k} value={k}>{rates[k].label} — {rates[k].rate}/{rates[k].unit}</option>)}
          </select>
        </Field>
        {inp.floor === 'patio' && (
          <Field label="New concrete" hint="Slabs under 200 SF price at the small-slab rate.">
            <select className={selCls} value={inp.concrete || ''} onChange={e => set({ concrete: e.target.value || null })}>
              <option value="">None (existing slab)</option>
              {concreteKeys.map(k => <option key={k} value={k}>{rates[k].label} — {rates[k].rate}/SF</option>)}
            </select>
          </Field>
        )}
        {inp.floor === 'deck' && (
          <Field label="Steps" hint={result.risers ? `${result.risers} risers from the deck height` : 'Set a deck height to add steps.'}>
            <div className="flex gap-2">
              <select className={selCls} value={inp.steps?.product || ''} onChange={e => setSub('steps', { product: e.target.value })}>
                <option value="">None</option>
                {stepProducts.map(p => <option key={p}>{p}</option>)}
              </select>
              <input type="number" min="3" title="Stair width (ft)" className="w-16 text-sm border border-gray-300 rounded-lg px-2 py-1" value={inp.steps?.stairWidthFt ?? 4} onChange={e => setSub('steps', { stairWidthFt: e.target.value })} />
            </div>
          </Field>
        )}
        <Field label="Landings" hint="Each landing is 16 SF of board.">
          <div className="flex gap-2">
            <select className={selCls} value={inp.landings?.product || ''} onChange={e => setSub('landings', { product: e.target.value })}>
              <option value="">None</option>
              {landingProducts.map(p => <option key={p}>{p}</option>)}
            </select>
            <input type="number" min="0" title="Count" className="w-16 text-sm border border-gray-300 rounded-lg px-2 py-1" value={inp.landings?.count ?? 0} onChange={e => setSub('landings', { count: e.target.value })} />
          </div>
        </Field>
        <Field label="Railing (LF)">
          <div className="flex gap-2">
            <select className={selCls} value={inp.railing?.product || ''} onChange={e => setSub('railing', { product: e.target.value })}>
              <option value="">None</option>
              {railKeys.map(k => <option key={k} value={k}>{rates[k].label} — {rates[k].rate}/LF</option>)}
            </select>
            <input type="number" min="0" title="Linear feet" className="w-16 text-sm border border-gray-300 rounded-lg px-2 py-1" value={inp.railing?.lf ?? 0} onChange={e => setSub('railing', { lf: e.target.value })} />
          </div>
        </Field>
        {inp.floor === 'deck' && (
          <Field label="Deck fascia" hint={inp.fascia?.lf == null || inp.fascia.lf === ''
              ? `Auto: ${result.fasciaLF} LF, the deck's exposed perimeter (${inp.tie === 'free' ? 'all four sides' : 'front + two sides'}). Type a number to override.`
              : 'Overridden. Clear the box to go back to the automatic perimeter.'}>
            <div className="flex gap-2">
              <select className={selCls} value={inp.fascia?.product || ''} onChange={e => setSub('fascia', { product: e.target.value })}>
                <option value="">None</option>
                {fasciaKeys.map(k => <option key={k} value={k}>{rates[k].label} — {rates[k].rate}/LF</option>)}
              </select>
              <input type="number" min="0" title="Linear feet (blank = automatic)" placeholder={String(result.fasciaLF)}
                className="w-20 text-sm border border-gray-300 rounded-lg px-2 py-1"
                value={inp.fascia?.lf ?? ''} onChange={e => setSub('fascia', { lf: e.target.value === '' ? null : e.target.value })} />
            </div>
          </Field>
        )}
      </div>

      {/* ── Electrical package ──────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 p-4">
        <Field label="Electrical package" hint="Add extra fans, outlets, lights or heaters below under Options → Electrical.">
          <select aria-label="Electrical package" className={selCls} value={inp.elecPackage || ''} onChange={e => set({ elecPackage: e.target.value || null })}>
            <option value="">No electrical package</option>
            {elecPkgKeys.map(k => <option key={k} value={k}>{rates[k].label} — {money(rates[k].rate)}</option>)}
          </select>
        </Field>
      </div>

      {/* ── Options with a quantity ───────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 p-4 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Options (ceilings, roof, walls, deck upgrades, electrical extras)</p>
          <select className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 bg-white" value="" onChange={e => addOption(e.target.value)}>
            <option value="">+ Add option…</option>
            {optionsByGroup.map(g => (
              <optgroup key={g.key} label={g.label}>
                {g.keys.map(k => <option key={k} value={k} disabled={inp.extras?.[k] != null}>{rates[k].label} — {rates[k].rate}/{rates[k].unit}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        {Object.keys(inp.extras || {}).length === 0
          ? <p className="text-xs text-gray-400">None added. SF options default to the porch area, LF options to the width; adjust the quantity as needed.</p>
          : Object.entries(inp.extras).map(([k, q]) => (
            <div key={k} className="flex items-center gap-2 text-sm">
              <span className="flex-1 text-gray-700">{rates[k]?.label}</span>
              <input type="number" min="0" className="w-20 text-sm border border-gray-300 rounded-lg px-2 py-1 text-right" value={q}
                onChange={e => set({ extras: { ...inp.extras, [k]: e.target.value } })} />
              <span className="w-8 text-xs text-gray-400">{rates[k]?.unit}</span>
              <span className="w-20 text-right text-gray-600">{money((Number(q) || 0) * (rates[k]?.rate || 0))}</span>
              <button onClick={() => removeOption(k)} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
            </div>
          ))}
      </div>

      {/* ── Breakdown (office view) ───────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-gray-400 bg-gray-50">
              <th className="text-left font-semibold px-3 py-2">Line</th>
              <th className="text-right font-semibold px-2 py-2 w-24">Qty</th>
              <th className="text-right font-semibold px-2 py-2 w-24">Rate</th>
              <th className="text-right font-semibold px-3 py-2 w-28">Total</th>
            </tr>
          </thead>
          <tbody>
            {result.groups.map(g => (
              <FragmentRows key={g.key} group={g} />
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Scope preview ─────────────────────────────────────────────── */}
      <details className="rounded-xl border border-gray-200 p-4">
        <summary className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 cursor-pointer">Scope of work the customer will see</summary>
        <pre className="mt-2 text-xs text-gray-600 whitespace-pre-wrap font-sans leading-relaxed">{scope}</pre>
      </details>

      <JicField value={jic} onChange={setJic} base={result.total} note="A cushion for this build. Built into the porch price — the customer never sees it." />

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-4 pt-1">
        <div className="text-sm text-gray-500">
          {jicAmt > 0 && <>Price list {money(result.total)} + JIC {money(jicAmt)} · </>}
          Cost <span className="font-semibold text-gray-800">{result.cost > 0 ? money(result.cost) : 'not set'}</span>
          {marginPct != null && <> · Margin <span className="font-semibold text-gray-800">{marginPct.toFixed(0)}%</span></>}
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={add} disabled={result.total <= 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-[var(--brand-600)] text-white text-sm font-semibold rounded-lg hover:bg-[var(--brand-700)] disabled:opacity-40 transition-colors">
            <Plus size={15} /> Add porch to quote — {money(total)}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
        </div>
      </div>
    </div>
  )
}

function FragmentRows({ group }) {
  return (
    <>
      <tr className="bg-[var(--brand-50)]">
        <td className="px-3 py-1.5 font-semibold text-[var(--brand-700)]" colSpan={3}>{group.label}</td>
        <td className="px-3 py-1.5 text-right font-semibold text-[var(--brand-700)]">{money(group.total)}</td>
      </tr>
      {group.lines.map(l => (
        <tr key={l.key} className="border-t border-gray-50">
          <td className="px-3 py-1.5 text-gray-700">{l.label}{l.note && <span className="text-gray-400"> · {l.note}</span>}</td>
          <td className="px-2 py-1.5 text-right text-gray-600">{l.qty} <span className="text-gray-400 text-xs">{l.unit}</span></td>
          <td className="px-2 py-1.5 text-right text-gray-600">{l.rate.toLocaleString('en-US')}</td>
          <td className="px-3 py-1.5 text-right text-gray-800">{money(l.total)}</td>
        </tr>
      ))}
    </>
  )
}
