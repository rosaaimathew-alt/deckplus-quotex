// ── JIC ("Just in case") input — the math is in src/lib/jic.js ───────────────

import { JIC_DEFAULT, jicAmount } from '../lib/jic'

export function JicField({ value, onChange, base }) {
  const v = value || JIC_DEFAULT
  const amt = jicAmount(v, base)
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-gray-300 bg-gray-50/60 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-800">JIC — Just in case</p>
        <p className="text-[11px] text-gray-500">A cushion for this build. Added as its own line.</p>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden text-xs font-medium" role="radiogroup" aria-label="JIC as dollars or percent">
          {['$', '%'].map(m => (
            <button key={m} type="button" role="radio" aria-checked={v.mode === m} onClick={() => onChange({ ...v, mode: m })}
              className={`px-2.5 py-1.5 ${v.mode === m ? 'bg-[var(--brand-600)] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>{m}</button>
          ))}
        </div>
        <input type="number" min="0" step={v.mode === '%' ? '0.5' : '50'} aria-label="JIC amount" placeholder="0"
          value={v.amount} onChange={e => onChange({ ...v, amount: e.target.value })}
          className="w-24 text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[var(--brand-200)]" />
        {v.mode === '%' && amt > 0 && <span className="text-xs text-gray-500 tabular-nums">= ${amt.toLocaleString('en-US')}</span>}
      </div>
    </div>
  )
}
