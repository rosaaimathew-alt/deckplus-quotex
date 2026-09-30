import { useState } from 'react'
import { ChevronDown, ChevronRight, Lock, Unlock } from 'lucide-react'
import { useStore } from '../store'
import { PORCH_BUILD_DEFAULTS, PORCH_BUILD_GROUPS, PORCH_BUILD_SCOPE_DEFAULTS, PORCH_TYPES } from '../porchBuild'

// ── Porch Builder rates — Item Catalog → Formulas ────────────────────────────
// Every number the porch builder uses, grouped the way the customer sees them.
// Office/admin edit price and cost; the lock stops sales from changing anything.
// Only edited keys are stored, so new defaults still arrive with app updates.

export default function PorchBuildFormulaCard() {
  const isManager = useStore(s => (s.role || 'manager') === 'manager')
  const saved     = useStore(s => s.porchBuildRates) || {}
  const setRate   = useStore(s => s.setPorchBuildRate)
  const locked    = useStore(s => s.porchBuildLocked)
  const setLocked = useStore(s => s.setPorchBuildLocked)
  const scopes    = useStore(s => s.porchBuildScopes) || {}
  const setScope  = useStore(s => s.setPorchBuildScope)
  const canEdit   = isManager || !locked
  const [open, setOpen] = useState(false)
  const [openGroups, setOpenGroups] = useState(() => new Set(['structure']))

  const keys = Object.keys(PORCH_BUILD_DEFAULTS)
  const rateOf = (k) => ({ ...PORCH_BUILD_DEFAULTS[k], ...(saved[k] || {}) })
  const numCell = `w-24 text-sm border rounded px-2 py-1 focus:outline-none ${canEdit ? 'border-gray-300 focus:ring-2 focus:ring-[var(--brand-200)]' : 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'}`
  const toggleGroup = (k) => setOpenGroups(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })
  const marginOf = (c) => c.rate > 0 && c.cost > 0 ? `${Math.round((c.rate - c.cost) / c.rate * 100)}%` : c.rate > 0 ? 'cost not set' : '—'
  const changed = keys.filter(k => saved[k] && (saved[k].rate !== PORCH_BUILD_DEFAULTS[k].rate || (saved[k].cost || 0) !== 0)).length

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-xl border-2 border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <button className="flex items-center gap-3" onClick={() => setOpen(o => !o)}>
            {open ? <ChevronDown size={15} className="text-gray-400" /> : <ChevronRight size={15} className="text-gray-400" />}
            <span className="font-semibold text-gray-800">Porch Builder — open, ScreenEze &amp; Eze-Breeze</span>
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">{keys.length} rates{changed ? ` · ${changed} edited` : ''}</span>
          </button>
          {isManager ? (
            <button onClick={() => setLocked(!locked)}
              title={locked ? 'Unlock so sales can adjust pricing' : 'Lock pricing so sales must use these rates'}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${locked ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {locked ? <Lock size={13} /> : <Unlock size={13} />} {locked ? 'Locked for sales' : 'Unlocked'}
            </button>
          ) : locked ? (
            <span className="flex items-center gap-1.5 text-xs text-amber-600 font-medium"><Lock size={12} /> Locked by manager</span>
          ) : null}
        </div>

        {open && (
          <div className="p-4 space-y-4">
            <p className="text-xs text-gray-500 leading-relaxed">
              Base rates are $/SF of floor area by porch type, roof connection and what it sits on. Eze-Breeze porches use the
              Open rows plus windows, transoms, doors and the column package. Costs are blank until you enter them; margin then shows per line.
              Rules: <span className="font-mono">docs/PORCH_BUILDER_SPEC.md</span>.
            </p>
            {!isManager && locked && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Pricing is locked by your manager. You can build quotes with these rates, but you can't change them.
              </div>
            )}
            {PORCH_BUILD_GROUPS.map(g => {
              const gk = keys.filter(k => PORCH_BUILD_DEFAULTS[k].group === g.key)
              const isOpen = openGroups.has(g.key)
              return (
                <div key={g.key} className="border border-gray-200 rounded-lg overflow-hidden">
                  <button onClick={() => toggleGroup(g.key)} className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 text-left">
                    {isOpen ? <ChevronDown size={13} className="text-gray-400" /> : <ChevronRight size={13} className="text-gray-400" />}
                    <span className="text-sm font-semibold text-gray-700">{g.label}</span>
                    <span className="text-xs text-gray-400">{gk.length}</span>
                  </button>
                  {isOpen && (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                          <th className="text-left font-semibold px-3 py-1.5">Item</th>
                          <th className="font-semibold py-1.5 w-12">Unit</th>
                          <th className="font-semibold py-1.5 w-28">Price $</th>
                          <th className="font-semibold py-1.5 w-28">Cost $</th>
                          <th className="text-right font-semibold px-3 py-1.5 w-24">Margin</th>
                        </tr>
                      </thead>
                      <tbody>
                        {gk.map(k => {
                          const c = rateOf(k)
                          return (
                            <tr key={k} className="border-b border-gray-50">
                              <td className="px-3 py-1.5 text-gray-700">{c.label}</td>
                              <td className="py-1.5 text-center text-gray-400 text-xs">{c.unit}</td>
                              <td className="py-1.5 px-1"><input type="number" min="0" step="0.01" disabled={!canEdit} value={c.rate}
                                onChange={e => setRate(k, { rate: parseFloat(e.target.value) || 0 })} className={numCell} /></td>
                              <td className="py-1.5 px-1"><input type="number" min="0" step="0.01" disabled={!canEdit} value={c.cost || ''} placeholder="0"
                                onChange={e => setRate(k, { cost: parseFloat(e.target.value) || 0 })} className={numCell} /></td>
                              <td className="px-3 py-1.5 text-right text-gray-500 text-xs">{marginOf(c)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {open && (
        <div className="bg-white rounded-xl border-2 border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="font-semibold text-gray-800">Porch Builder — standard scope of work, per porch type</p>
            <p className="text-xs text-gray-400 mt-0.5">One bullet per line. The builder adds the size, roof connection, floor, roof style, window/door counts and chosen options automatically.</p>
          </div>
          <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
            {PORCH_TYPES.map(t => (
              <label key={t.key} className="block">
                <span className="block text-xs font-semibold text-gray-600 mb-1">{t.label}</span>
                <textarea rows={6} disabled={!canEdit}
                  value={scopes[t.key] ?? PORCH_BUILD_SCOPE_DEFAULTS[t.key]}
                  onChange={e => setScope(t.key, e.target.value)}
                  className={`w-full text-sm rounded-lg px-3 py-2 leading-relaxed focus:outline-none resize-y ${canEdit ? 'border border-gray-300 focus:ring-2 focus:ring-[var(--brand-200)]' : 'border border-gray-200 bg-gray-100 text-gray-500 cursor-not-allowed'}`} />
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
