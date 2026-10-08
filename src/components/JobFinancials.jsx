import { useMemo, useState } from 'react'
import { Plus, Trash2, Check, Package, AlertTriangle, DollarSign, Store } from 'lucide-react'
import { useStore } from '../store'
import { CATEGORIES, jobFinancials, unaccountedRate, adjustedForUnaccounted, periodFor, inventorySummary, isAllocation } from '../lib/finance'

// ── One job's money: what it sold for, what it cost, what's been collected ────
// Used on the job (Jobs → Costs) and on Finance → Jobs. Costs are the shared
// expenses tagged with this job; payments received live on the job record.

const money = (v) => '$' + Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pct = (v) => (v == null ? '—' : `${Number(v).toFixed(1)}%`)
const ratePct = (v) => `${Number(v || 0).toFixed(v > 0 && v < 1 ? 2 : 1)}%`
const today = () => new Date().toISOString().slice(0, 10)
const inputCls = 'w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--brand-200)]'

function Stat({ label, value, sub, tone = 'text-gray-900' }) {
  return (
    <div className="bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-0.5">{label}</p>
      <p className={`text-base font-bold ${tone}`}>{value}</p>
      {sub && <p className="text-[11px] text-gray-500 mt-0.5">{sub}</p>}
    </div>
  )
}

export default function JobFinancials({ proposal }) {
  const expensesRaw     = useStore(s => s.expenses)
  const proposalsRaw    = useStore(s => s.proposals)
  const expenses        = useMemo(() => expensesRaw || [], [expensesRaw])
  const proposals       = useMemo(() => proposalsRaw || [], [proposalsRaw])
  const legacy          = useStore(s => s.jobCosts?.[proposal.id])
  const addExpense      = useStore(s => s.addExpense)
  const deleteExpense   = useStore(s => s.deleteExpense)
  const addJobPayment   = useStore(s => s.addJobPayment)
  const removeJobPayment = useStore(s => s.removeJobPayment)

  const fin = useMemo(() => jobFinancials(proposal, expenses, legacy), [proposal, expenses, legacy])
  // The company's unaccounted rate this year — the share of revenue every job gives up to misc spend.
  const rate = useMemo(() => unaccountedRate({ expenses, proposals, period: periodFor('year') }), [expenses, proposals])
  const adj = adjustedForUnaccounted(fin, rate.rate)
  const stock = useMemo(() => inventorySummary(expenses), [expenses])
  const received = proposal.jobData?.paymentsReceived || []

  // Add a cost
  const blankCost = { date: today(), description: '', merchant: '', amount: '', category: 'Materials' }
  const [cost, setCost] = useState(blankCost)
  const saveCost = () => {
    if (!(Number(cost.amount) > 0)) return
    addExpense({ ...cost, description: cost.description.trim(), merchant: cost.merchant.trim(), amount: Number(cost.amount), bucket: 'job', jobId: proposal.id, cardId: null })
    setCost(blankCost)
  }
  // Use inventory on this job
  const [use, setUse] = useState({ amount: '', description: '' })
  const saveUse = () => {
    if (!(Number(use.amount) > 0)) return
    addExpense({ kind: 'allocation', date: today(), description: use.description.trim() || 'Materials from inventory', amount: Number(use.amount), category: 'Materials (from inventory)', bucket: 'job', jobId: proposal.id })
    setUse({ amount: '', description: '' })
  }
  // Record a payment
  const blankPay = { date: today(), amount: '', method: 'Check', note: '' }
  const [pay, setPay] = useState(blankPay)
  const savePay = () => {
    if (!(Number(pay.amount) > 0)) return
    addJobPayment(proposal.id, { ...pay, amount: Number(pay.amount) })
    setPay(blankPay)
  }
  const milestonePaid = (label) => received.some(r => r.milestone === label)

  const cats = Object.entries(fin.byCategory).sort((a, b) => b[1] - a[1])
  const maxCat = Math.max(1, ...cats.map(([, v]) => v))
  const entries = [...fin.entries].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))

  return (
    <div className="space-y-5">
      {/* ── Summary ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat label="Revenue" value={money(fin.revenue)} sub={fin.changeOrders ? `${money(fin.contract)} + ${money(fin.changeOrders)} change orders` : 'Contract value'} />
        <Stat label="Actual cost" value={money(fin.actualCost)} tone="text-red-600"
          sub={fin.estimatedCost ? `Estimated ${money(fin.estimatedCost)}` : 'No estimate on the proposal'} />
        <Stat label="Profit" value={money(fin.profit)} tone={fin.profit >= 0 ? 'text-green-700' : 'text-red-600'} sub={`Margin ${pct(fin.margin)}`} />
        <Stat label="Adjusted margin" value={pct(adj.margin)} tone={(adj.margin ?? 0) >= 0 ? 'text-gray-900' : 'text-red-600'}
          sub={rate.rate > 0 ? `After ${ratePct(rate.rate)} unaccounted (−${money(adj.deduction)})` : 'No unaccounted spend this year'} />
        <Stat label="Collected" value={money(fin.received)} tone="text-gray-900" sub={`Balance due ${money(fin.balanceDue)}`} />
      </div>

      {/* Estimate vs actual */}
      {fin.estimatedCost > 0 && (
        <div className={`rounded-xl border px-4 py-3 text-sm flex items-center gap-2 ${fin.costVariance > 0 ? 'bg-red-50 border-red-100 text-red-800' : 'bg-green-50 border-green-100 text-green-800'}`}>
          {fin.costVariance > 0 ? <AlertTriangle size={15} /> : <Check size={15} />}
          {fin.costVariance > 0
            ? <>Costs are <strong>{money(fin.costVariance)}</strong> over the estimate ({money(fin.estimatedCost)}). Estimated profit was {money(fin.estimatedProfit)}.</>
            : <>Costs are <strong>{money(-fin.costVariance)}</strong> under the estimate ({money(fin.estimatedCost)}) so far.</>}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-5">
        {/* ── Cost breakdown ─────────────────────────────────────── */}
        <div className="border border-gray-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-gray-800 mb-3">Costs by category</p>
          {cats.length === 0 ? <p className="text-xs text-gray-400">No costs logged yet.</p> : (
            <div className="space-y-2">
              {cats.map(([c, v]) => (
                <div key={c}>
                  <div className="flex justify-between text-xs text-gray-600 mb-0.5"><span>{c}</span><span className="font-semibold text-gray-800">{money(v)}</span></div>
                  <div className="h-2 rounded-full bg-gray-100"><div className="h-2 rounded-full bg-[var(--brand-500)]" style={{ width: `${(v / maxCat) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Payments ───────────────────────────────────────────── */}
        <div className="border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-gray-800">Payments received</p>
            <span className="text-xs text-gray-500">{pct(fin.percentCollected)} collected</span>
          </div>
          <div className="h-2 rounded-full bg-gray-100 mb-3"><div className="h-2 rounded-full bg-green-500" style={{ width: `${fin.percentCollected}%` }} /></div>
          {fin.milestones.length > 0 && (
            <div className="space-y-1 mb-3">
              {fin.milestones.map((m, i) => {
                const paid = milestonePaid(m.label)
                return (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className={`flex-1 min-w-0 truncate ${paid ? 'text-gray-400 line-through' : 'text-gray-700'}`}>{m.label || `Payment ${i + 1}`}</span>
                    <span className="text-gray-600">{money(m.amount)}</span>
                    {paid
                      ? <span className="text-green-600 font-semibold flex items-center gap-0.5"><Check size={12} /> Paid</span>
                      : <button type="button" onClick={() => addJobPayment(proposal.id, { date: today(), amount: Number(m.amount) || 0, method: 'Check', milestone: m.label || `Payment ${i + 1}` })}
                          className="text-[var(--brand-700)] font-semibold hover:underline">Mark received</button>}
                  </div>
                )
              })}
            </div>
          )}
          <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
            <input type="date" aria-label="Payment date" value={pay.date} onChange={e => setPay(p => ({ ...p, date: e.target.value }))} className={inputCls} />
            <input type="number" aria-label="Payment amount" placeholder="Amount" value={pay.amount} onChange={e => setPay(p => ({ ...p, amount: e.target.value }))} className={inputCls} />
            <select aria-label="Payment method" value={pay.method} onChange={e => setPay(p => ({ ...p, method: e.target.value }))} className={inputCls}>
              {['Check', 'ACH', 'Card', 'Cash', 'Financing', 'Other'].map(m => <option key={m}>{m}</option>)}
            </select>
            <button type="button" onClick={savePay} disabled={!(Number(pay.amount) > 0)} className="p-2 rounded-lg bg-gray-900 text-white disabled:opacity-40" aria-label="Add payment"><Plus size={15} /></button>
          </div>
          {received.length > 0 && (
            <div className="mt-3 divide-y divide-gray-50 border-t border-gray-100">
              {received.map(r => (
                <div key={r.id} className="flex items-center gap-2 py-1.5 text-xs">
                  <span className="text-gray-500 w-20">{r.date}</span>
                  <span className="flex-1 min-w-0 truncate text-gray-700">{r.milestone || r.note || r.method}</span>
                  <span className="font-semibold text-gray-900">{money(r.amount)}</span>
                  <button type="button" onClick={() => removeJobPayment(proposal.id, r.id)} className="text-gray-300 hover:text-red-500" aria-label="Remove payment"><Trash2 size={12} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Add a cost / use inventory ─────────────────────────────── */}
      <div className="grid lg:grid-cols-[2fr_1fr] gap-5">
        <div className="border border-gray-200 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-800 flex items-center gap-1.5"><DollarSign size={15} className="text-gray-400" /> Add a cost</p>
          <div className="grid sm:grid-cols-2 gap-2">
            <input aria-label="Cost description" value={cost.description} onChange={e => setCost(c => ({ ...c, description: e.target.value }))} placeholder="What it was for (e.g. deck boards)" className={inputCls} />
            <div className="flex items-center gap-1.5 border border-gray-200 rounded-lg px-2.5">
              <Store size={14} className="text-gray-400 shrink-0" />
              <input aria-label="Merchant" value={cost.merchant} onChange={e => setCost(c => ({ ...c, merchant: e.target.value }))} placeholder="Merchant / vendor" className="w-full text-sm py-2 focus:outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
            <input type="number" aria-label="Cost amount" value={cost.amount} onChange={e => setCost(c => ({ ...c, amount: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') saveCost() }} placeholder="Amount" className={inputCls} />
            <select aria-label="Cost category" value={cost.category} onChange={e => setCost(c => ({ ...c, category: e.target.value }))} className={inputCls}>
              {CATEGORIES.job.map(c => <option key={c}>{c}</option>)}
            </select>
            <input type="date" aria-label="Cost date" value={cost.date} onChange={e => setCost(c => ({ ...c, date: e.target.value }))} className={inputCls} />
            <button type="button" onClick={saveCost} disabled={!(Number(cost.amount) > 0)} className="px-3 rounded-lg bg-[var(--brand-600)] text-white disabled:opacity-40" aria-label="Add cost"><Plus size={15} /></button>
          </div>
        </div>
        <div className="border border-gray-200 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-800 flex items-center gap-1.5"><Package size={15} className="text-gray-400" /> Use inventory</p>
          <p className="text-[11px] text-gray-500">Stock on hand: <strong>{money(stock.onHand)}</strong>. Moves the cost onto this job.</p>
          <input aria-label="Inventory used description" value={use.description} onChange={e => setUse(u => ({ ...u, description: e.target.value }))} placeholder="What was used" className={inputCls} />
          <div className="flex gap-2">
            <input type="number" aria-label="Inventory used amount" value={use.amount} onChange={e => setUse(u => ({ ...u, amount: e.target.value }))} placeholder="Value $" className={inputCls} />
            <button type="button" onClick={saveUse} disabled={!(Number(use.amount) > 0)} className="px-3 rounded-lg bg-gray-900 text-white text-sm disabled:opacity-40">Use</button>
          </div>
        </div>
      </div>

      {/* ── Cost log ───────────────────────────────────────────────── */}
      {entries.length > 0 && (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-50">
              {entries.map(e => (
                <tr key={e.id}>
                  <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">{e.date || '—'}</td>
                  <td className="px-3 py-2 text-gray-800">{e.description || '—'}{e.merchant ? <span className="text-gray-400"> · {e.merchant}</span> : null}
                    {isAllocation(e) && <span className="ml-1.5 text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">from inventory</span>}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{e.category}</td>
                  <td className="px-3 py-2 text-right font-semibold text-gray-900 whitespace-nowrap">{money(e.amount)}</td>
                  <td className="px-2 py-2 text-right"><button type="button" onClick={() => deleteExpense(e.id)} className="text-gray-300 hover:text-red-500" aria-label="Delete cost"><Trash2 size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
