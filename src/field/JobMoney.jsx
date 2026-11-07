// ── Payments & change orders (Field mode, read-only) ────────────────────────
// Tucked away at the bottom of a job: closed until tapped. Lets a PM answer
// "when did they last pay?" and "what can we bill next?" on site, without
// opening the full app. Same numbers as the desktop Jobs → Costs tab
// (lib/finance jobFinancials); recording payments stays on desktop.
import { useMemo, useState } from 'react'
import { Wallet, ChevronDown, Check } from 'lucide-react'
import { jobFinancials } from '../lib/finance'

const money = (v) => '$' + Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const shortDate = (s) => (s ? new Date(String(s).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '')

export default function JobMoney({ proposal }) {
  const [open, setOpen] = useState(false)
  const fin = useMemo(() => jobFinancials(proposal, [], null), [proposal])
  const received = proposal.jobData?.paymentsReceived || []
  const last = [...received].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0]
  // The office prices and gets change orders signed; PMs only see approved ones.
  const cos = (proposal.jobData?.changeOrders || []).filter(co => co.status === 'Approved')
  const paidLabel = (label) => received.some(r => r.milestone === label)
  const nextIdx = fin.milestones.findIndex((m, i) => !paidLabel(m.label || `Payment ${i + 1}`))

  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <button onClick={() => setOpen(v => !v)} aria-expanded={open}
        className="w-full px-4 h-14 flex items-center gap-3 text-left">
        <Wallet size={20} className="text-gray-500" />
        <span className="flex-1 text-base font-semibold text-gray-900">Payments & change orders</span>
        <ChevronDown size={18} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-gray-100 p-4 space-y-5">
          {/* Totals */}
          <div className="grid grid-cols-3 gap-2 text-center">
            {[['Job total', fin.revenue], ['Collected', fin.received], ['Balance', fin.balanceDue]].map(([label, v]) => (
              <div key={label} className="rounded-xl bg-gray-50 border border-gray-100 px-2 py-2.5">
                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
                <p className="text-base font-bold text-gray-900 tabular-nums">{money(v)}</p>
              </div>
            ))}
          </div>
          {fin.changeOrders > 0 && (
            <p className="-mt-3 text-xs text-gray-500 text-center">Includes {money(fin.changeOrders)} in approved change orders</p>
          )}

          {/* Last payment */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5">Last payment received</p>
            {last ? (
              <p className="text-base text-gray-900">
                <b className="tabular-nums">{money(last.amount)}</b> · {shortDate(last.date)}
                <span className="block text-sm text-gray-500">{[last.milestone, last.method].filter(Boolean).join(' · ')}</span>
              </p>
            ) : <p className="text-sm text-gray-500">No payments recorded yet.</p>}
          </div>

          {/* Payment schedule */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5">Payment schedule</p>
            {fin.milestones.length === 0 ? (
              <p className="text-sm text-gray-500">No payment schedule on the contract.</p>
            ) : (
              <ul className="space-y-1.5">
                {fin.milestones.map((m, i) => {
                  const label = m.label || `Payment ${i + 1}`
                  const paid = paidLabel(label)
                  const isNext = i === nextIdx
                  return (
                    <li key={i} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${isNext ? 'border-[var(--brand-300)] bg-[var(--brand-50)]' : 'border-gray-100'}`}>
                      <span className="flex-1 min-w-0">
                        <span className={`block text-sm ${paid ? 'text-gray-400 line-through' : 'text-gray-900 font-medium'}`}>{label}</span>
                        {isNext && <span className="block text-xs font-bold text-[var(--brand-700)]">Next to bill</span>}
                      </span>
                      <span className={`text-sm font-semibold tabular-nums ${paid ? 'text-gray-400' : 'text-gray-900'}`}>{money(m.amount)}</span>
                      {paid && <Check size={16} className="text-green-600 shrink-0" aria-label="Paid" />}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* Change orders */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5">Approved change orders</p>
            {cos.length === 0 ? (
              <p className="text-sm text-gray-500">No approved change orders.</p>
            ) : (
              <ul className="space-y-1.5">
                {cos.map(co => (
                  <li key={co.id} className="px-3 py-2.5 rounded-xl border border-gray-100">
                    <div className="flex items-start gap-2">
                      <span className="flex-1 min-w-0 text-sm font-medium text-gray-900">{co.description || 'Change order'}</span>
                      <span className="text-sm font-semibold text-gray-900 tabular-nums">{money(co.amount)}</span>
                    </div>
                    {co.coNumber && <p className="mt-0.5 text-xs text-gray-400 font-mono truncate">{co.coNumber}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-xs text-gray-400">Payments and change orders are handled by the office in the full app.</p>
        </div>
      )}
    </section>
  )
}
