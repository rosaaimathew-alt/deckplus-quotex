import { useState, useMemo, useRef } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { useStore } from '../store'
import {
  Upload, Plus, X, Trash2, Pencil, CreditCard, Loader, Check, Search, Wallet, AlertTriangle,
  ChevronDown, ChevronRight, Package, Repeat, Briefcase, LayoutDashboard, Receipt,
} from 'lucide-react'
import {
  BUCKETS, CATEGORIES, bucketOf, isAllocation, inPeriod, periodFor, companySummary, jobFinancials,
  adjustedForUnaccounted, monthlyCostOf, yearlyCostOf, nextRenewal, suggestBucket, matchSubscription, inventorySummary,
} from '../lib/finance'
import JobFinancials from '../components/JobFinancials'
import { parseStatementText } from '../lib/statementParse'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

// ── Finance ──────────────────────────────────────────────────────────────────
// Every dollar out lands in one bucket (src/lib/finance.js): a job, operating,
// subscriptions, inventory — or Miscellaneous, the money nobody has accounted
// for. The Overview shows that unaccounted amount and the % it takes off every
// job's margin if it really was project cost.

const CARD_COLORS = ['#0f766e', '#2563eb', '#7c3aed', '#c0603f', '#b45309', '#be123c', '#4b5563']
const fmt = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const money = (v) => `$${fmt(v)}`
const pct = (v) => (v == null ? '—' : `${Number(v).toFixed(1)}%`)
const ratePct = (v) => `${Number(v || 0).toFixed(v > 0 && v < 1 ? 2 : 1)}%`
const today = () => new Date().toISOString().slice(0, 10)
const inputCls = 'w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300'
const jobName = (j) => j ? `${j.client || 'Job'} · #${j.id}` : ''

// ── Statement reading — built in, no outside AI ──────────────────────────────
// PDF text comes back as loose words; rebuild the printed lines by their height
// on the page, then read "date … description … amount" from each line.
async function extractPdfText(file) {
  const buf = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise
  const out = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const rows = new Map()
    for (const it of content.items) {
      const y = Math.round((it.transform?.[5] || 0) / 2)
      if (!rows.has(y)) rows.set(y, [])
      rows.get(y).push({ x: it.transform?.[4] || 0, s: it.str })
    }
    ;[...rows.entries()].sort((a, b) => b[0] - a[0])
      .forEach(([, items]) => out.push(items.sort((a, b) => a.x - b.x).map(t => t.s).join(' ').replace(/\s+/g, ' ').trim()))
  }
  return out.join('\n')
}

// ── Card editor ──────────────────────────────────────────────────────────────
function CardModal({ card, onClose }) {
  const addFinanceCard    = useStore(s => s.addFinanceCard)
  const updateFinanceCard = useStore(s => s.updateFinanceCard)
  const [label, setLabel] = useState(card?.label || '')
  const [owner, setOwner] = useState(card?.owner || '')
  const [last4, setLast4] = useState(card?.last4 || '')
  const [color, setColor] = useState(card?.color || CARD_COLORS[0])

  const save = () => {
    if (!label.trim()) return
    if (card?.id) updateFinanceCard(card.id, { label, owner, last4, color })
    else addFinanceCard({ label, owner, last4, color })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <p className="font-semibold text-gray-900">{card ? 'Edit card' : 'Add card'}</p>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={17} /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Card name *</label>
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Amex Business"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Assigned to</label>
              <input value={owner} onChange={e => setOwner(e.target.value)} placeholder="Employee"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Last 4</label>
              <input value={last4} onChange={e => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="1234"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">Color</label>
            <div className="flex gap-2">
              {CARD_COLORS.map(c => (
                <button key={c} onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded-full transition-transform ${color === c ? 'ring-2 ring-offset-1 ring-gray-400 scale-110' : 'hover:scale-105'}`}
                  style={{ background: c }} />
              ))}
            </div>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100">Cancel</button>
          <button onClick={save} disabled={!label.trim()} className="px-5 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-40">Save</button>
        </div>
      </div>
    </div>
  )
}

// ── Pickers shared by the import, the add form and the table ─────────────────
function BucketPicker({ value, onChange, className = '' }) {
  return (
    <select aria-label="Bucket" value={value || ''} onChange={e => onChange(e.target.value)} className={`text-xs border rounded px-1 py-1 ${value ? 'border-gray-200' : 'border-red-200 bg-red-50 text-red-700'} ${className}`}>
      <option value="">Unaccounted</option>
      <option value="job">Job cost</option>
      <option value="operating">Operating</option>
      <option value="subscription">Subscription</option>
      <option value="inventory">Inventory</option>
    </select>
  )
}
function CategoryPicker({ bucket, value, onChange }) {
  const list = CATEGORIES[bucket || 'misc'] || CATEGORIES.misc
  return (
    <select aria-label="Category" value={list.includes(value) ? value : ''} onChange={e => onChange(e.target.value)} className="text-xs border border-gray-200 rounded px-1 py-1">
      <option value="">—</option>
      {list.map(c => <option key={c}>{c}</option>)}
    </select>
  )
}
function JobPicker({ jobs, value, onChange }) {
  return (
    <select aria-label="Job" value={value || ''} onChange={e => onChange(Number(e.target.value) || null)}
      className={`text-xs border rounded px-1 py-1 max-w-[180px] ${value ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-amber-300 bg-amber-50 text-amber-800'}`}>
      <option value="">Pick a job…</option>
      {jobs.map(j => <option key={j.id} value={j.id}>{jobName(j)}</option>)}
    </select>
  )
}
// The bucket shown in a picker: a job pick, else what was chosen.
const pickerBucket = (e) => (e.jobId ? 'job' : e.bucket || '')
// Apply a bucket choice to an expense patch.
const bucketPatch = (b) => (b === 'job' ? { bucket: 'job' } : { bucket: b || null, jobId: null })

// ── Statement import ─────────────────────────────────────────────────────────
function ImportModal({ cards, jobs, subscriptions, onClose }) {
  const addExpenses = useStore(s => s.addExpenses)
  const fileRef = useRef()
  const [step, setStep] = useState('drop')
  const [rows, setRows] = useState([])
  const [cardId, setCardId] = useState(cards[0]?.id || '')
  const [error, setError] = useState('')
  const [pasted, setPasted] = useState('')

  const process = (text) => {
    const tx = parseStatementText(text)
    if (!tx.length) { setError('No purchases found. Paste the transaction lines (date, description, amount) instead.'); setStep('error'); return }
    setRows(tx.map((t, i) => {
      const bucket = suggestBucket(t.description, subscriptions)
      const sub = matchSubscription(t.description, subscriptions)
      return { ...t, _id: i, include: true, bucket, jobId: null, category: sub ? (sub.category || 'Software') : '', subscriptionId: sub?.id || null }
    }))
    setStep('review')
  }
  const handleFile = async (file) => {
    if (!file) return
    setStep('loading'); setError('')
    try { process(await extractPdfText(file)) }
    catch { setError('Could not open that PDF. Paste the transactions below instead.'); setStep('error') }
  }
  const setRow = (id, patch) => setRows(rs => rs.map(r => (r._id === id ? { ...r, ...patch } : r)))
  const chosen = rows.filter(r => r.include && Number(r.amount) > 0)
  const importAll = () => {
    addExpenses(chosen.map(r => ({
      date: r.date, description: r.description, amount: Number(r.amount), cardId: cardId || null,
      bucket: r.bucket || null, jobId: r.bucket === 'job' ? r.jobId : null, category: r.category || '', subscriptionId: r.subscriptionId || null,
    })))
    onClose()
  }
  const unsorted = chosen.filter(r => !r.bucket || (r.bucket === 'job' && !r.jobId)).length

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <p className="font-semibold text-gray-900">Import statement</p>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={17} /></button>
        </div>
        {(step === 'drop' || step === 'error') && (
          <div className="p-5">
            {step === 'error' && <p className="text-sm text-red-500 mb-3">{error}</p>}
            {step === 'drop' && (
              <label onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]) }}
                className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-xl p-10 cursor-pointer hover:border-blue-400 hover:bg-blue-50/40 transition-colors">
                <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={e => handleFile(e.target.files[0])} />
                <Upload size={26} className="text-gray-400 mb-2" />
                <p className="text-sm font-medium text-gray-600">Drop a PDF bank / credit-card statement</p>
                <p className="text-xs text-gray-400 mt-1">or click to browse — the purchases are read right in the app</p>
              </label>
            )}
            <div className="mt-4">
              <p className="text-xs font-semibold text-gray-500 mb-1">…or paste the transaction lines</p>
              <textarea rows={5} value={pasted} onChange={e => setPasted(e.target.value)} placeholder={'09/14 HOME DEPOT #1234 CHARLOTTE NC 412.87\n09/15 ADOBE CREATIVE CLOUD 59.99'}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none font-mono" />
              <div className="flex justify-end gap-2 mt-2">
                {step === 'error' && <button onClick={() => { setStep('drop'); setError('') }} className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100">Back</button>}
                <button onClick={() => pasted.trim() && process(pasted)} disabled={!pasted.trim()} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 disabled:opacity-40">Read transactions</button>
              </div>
            </div>
          </div>
        )}
        {step === 'loading' && (
          <div className="p-16 text-center"><Loader size={28} className="animate-spin text-blue-500 mx-auto mb-3" /><p className="text-sm text-gray-500">Reading the statement…</p></div>
        )}
        {step === 'review' && (
          <>
            <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3 shrink-0 flex-wrap">
              <span className="text-xs text-gray-500">{chosen.length} of {rows.length} transactions · charge to</span>
              <select value={cardId} onChange={e => setCardId(Number(e.target.value) || '')} className="text-sm border border-gray-200 rounded-lg px-2 py-1">
                <option value="">No card</option>
                {cards.map(c => <option key={c.id} value={c.id}>{c.label}{c.owner ? ` · ${c.owner}` : ''}</option>)}
              </select>
              {unsorted > 0 && <span className="text-xs text-red-600 ml-auto">{unsorted} will land in Unaccounted until sorted</span>}
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-2">
              {rows.map(r => (
                <div key={r._id} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg flex-wrap ${r.include ? '' : 'opacity-40'}`}>
                  <input type="checkbox" checked={r.include} onChange={e => setRow(r._id, { include: e.target.checked })} />
                  <input value={r.date} onChange={e => setRow(r._id, { date: e.target.value })} className="w-24 text-xs border border-gray-200 rounded px-1.5 py-1" />
                  <input value={r.description} onChange={e => setRow(r._id, { description: e.target.value })} className="flex-1 min-w-[160px] text-xs border border-gray-200 rounded px-1.5 py-1" />
                  <BucketPicker value={r.bucket} onChange={b => setRow(r._id, { bucket: b, jobId: null, category: '' })} />
                  {r.bucket === 'job' && <JobPicker jobs={jobs} value={r.jobId} onChange={id => setRow(r._id, { jobId: id })} />}
                  {r.bucket && <CategoryPicker bucket={r.bucket} value={r.category} onChange={c => setRow(r._id, { category: c })} />}
                  <div className="flex items-center gap-0.5"><span className="text-gray-400 text-xs">$</span>
                    <input type="number" value={r.amount} onChange={e => setRow(r._id, { amount: e.target.value })} className="w-20 text-xs border border-gray-200 rounded px-1.5 py-1 text-right" />
                  </div>
                </div>
              ))}
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2 shrink-0">
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100">Cancel</button>
              <button onClick={importAll} className="flex items-center gap-1.5 px-5 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700"><Check size={14} /> Import {chosen.length}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Add one expense ──────────────────────────────────────────────────────────
function ExpenseModal({ cards, jobs, subscriptions, initial, onClose }) {
  const addExpense = useStore(s => s.addExpense)
  const [f, setF] = useState({ date: today(), description: '', amount: '', bucket: '', jobId: null, category: '', cardId: cards[0]?.id || '', subscriptionId: null, ...(initial || {}) })
  const set = (patch) => setF(p => ({ ...p, ...patch }))
  const save = () => {
    if (!f.description.trim() || !(Number(f.amount) > 0)) return
    addExpense({ ...f, description: f.description.trim(), amount: Number(f.amount), bucket: f.bucket || null, jobId: f.bucket === 'job' ? f.jobId : null, cardId: f.cardId || null })
    onClose()
  }
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <p className="font-semibold text-gray-900">Add expense</p>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={17} /></button>
        </div>
        <div className="p-5 space-y-3">
          <input aria-label="Description" value={f.description} onChange={e => set({ description: e.target.value })} placeholder="Description / vendor" className={inputCls} />
          <div className="grid grid-cols-2 gap-3">
            <input type="date" aria-label="Date" value={f.date} onChange={e => set({ date: e.target.value })} className={inputCls} />
            <input type="number" aria-label="Amount" value={f.amount} onChange={e => set({ amount: e.target.value })} placeholder="Amount $" className={inputCls} />
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <BucketPicker value={f.bucket} onChange={b => set({ bucket: b, jobId: null, category: '', subscriptionId: null })} className="text-sm py-2" />
            {f.bucket === 'job' && <JobPicker jobs={jobs} value={f.jobId} onChange={id => set({ jobId: id })} />}
            {f.bucket && <CategoryPicker bucket={f.bucket} value={f.category} onChange={c => set({ category: c })} />}
            {f.bucket === 'subscription' && subscriptions.length > 0 && (
              <select aria-label="Subscription" value={f.subscriptionId || ''} onChange={e => set({ subscriptionId: Number(e.target.value) || null })} className="text-xs border border-gray-200 rounded px-1 py-1">
                <option value="">Which subscription?</option>
                {subscriptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
          </div>
          {!f.bucket && <p className="text-xs text-red-600">With no project or bucket this counts as unaccounted (Miscellaneous).</p>}
          <select aria-label="Card" value={f.cardId} onChange={e => set({ cardId: Number(e.target.value) || '' })} className={inputCls}>
            <option value="">No card</option>
            {cards.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100">Cancel</button>
          <button onClick={save} className="px-5 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700">Save</button>
        </div>
      </div>
    </div>
  )
}

function Kpi({ label, value, sub, tone = 'text-gray-900' }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-1">{label}</p>
      <p className={`text-xl font-bold ${tone}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Overview ─────────────────────────────────────────────────────────────────
function Overview({ sum, period, onReviewUnaccounted }) {
  const maxB = Math.max(1, ...Object.values(sum.byBucket))
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Collected" value={money(sum.collected)} sub={`Customer payments · ${period.label.toLowerCase()}`} tone="text-green-700" />
        <Kpi label="Spent" value={money(sum.spend)} sub="All money out" tone="text-red-600" />
        <Kpi label="Net cash" value={money(sum.net)} sub="Collected − spent" tone={sum.net >= 0 ? 'text-gray-900' : 'text-red-600'} />
        <Kpi label="Owed by customers" value={money(sum.outstanding)} sub="Open balances on won jobs" />
      </div>

      {/* Unaccounted */}
      <div className={`rounded-2xl border-2 p-5 ${sum.unaccounted > 0 ? 'border-red-200 bg-red-50/60' : 'border-green-200 bg-green-50/50'}`}>
        <div className="flex items-start gap-3 flex-wrap">
          <AlertTriangle size={20} className={sum.unaccounted > 0 ? 'text-red-600 mt-0.5' : 'text-green-600 mt-0.5'} />
          <div className="flex-1 min-w-[240px]">
            <p className="text-sm font-semibold text-gray-900">Unaccounted spend (Miscellaneous)</p>
            <p className="text-3xl font-bold text-red-700 mt-1">{money(sum.unaccounted)}</p>
            <p className="text-xs text-gray-600 mt-1">{sum.unaccountedCount} transaction{sum.unaccountedCount === 1 ? '' : 's'} with no project and no bucket · {pct(sum.unaccountedPct)} of all spending {period.key === 'all' ? '' : `(${period.label.toLowerCase()})`}</p>
            {sum.unaccounted > 0 && (
              <button onClick={onReviewUnaccounted} className="mt-2 text-xs font-semibold text-red-700 hover:underline">Sort these expenses →</button>
            )}
          </div>
          <div className="min-w-[260px] bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">If it's all project cost</p>
            <p className="text-sm text-gray-700 mt-1">Take <strong className="text-red-700">{ratePct(sum.unaccountedRate)}</strong> off every job's margin</p>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <div><p className="text-gray-400">Job profit</p><p className="font-semibold text-gray-900">{money(sum.jobProfit)}</p><p className="text-gray-500">{pct(sum.jobMargin)} margin</p></div>
              <div><p className="text-gray-400">Adjusted</p><p className={`font-semibold ${sum.adjustedJobProfit >= 0 ? 'text-gray-900' : 'text-red-600'}`}>{money(sum.adjustedJobProfit)}</p><p className="text-gray-500">{pct(sum.adjustedJobMargin)} margin</p></div>
            </div>
            <p className="text-[11px] text-gray-400 mt-2">Unaccounted ÷ job revenue sold ({money(sum.sold)}) {period.key === 'all' ? '' : period.label.toLowerCase()}.</p>
          </div>
        </div>
      </div>

      {/* Spend by bucket */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <p className="text-sm font-semibold text-gray-800 mb-3">Where the money went</p>
        <div className="space-y-3">
          {BUCKETS.map(b => (
            <div key={b.key}>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-700">{b.label} <span className="text-xs text-gray-400">· {sum.countBy[b.key]}</span></span>
                <span className="font-semibold text-gray-900">{money(sum.byBucket[b.key])} <span className="text-xs font-normal text-gray-400">{pct(sum.spend ? (sum.byBucket[b.key] / sum.spend) * 100 : 0)}</span></span>
              </div>
              <div className="h-2.5 rounded-full bg-gray-100"><div className="h-2.5 rounded-full" style={{ width: `${(sum.byBucket[b.key] / maxB) * 100}%`, background: b.color }} /></div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <Kpi label="Subscriptions" value={`${money(sum.subscriptionsMonthly)}/mo`} sub={`${money(sum.subscriptionsMonthly * 12)} a year`} />
        <Kpi label="Inventory on hand" value={money(sum.inventory.onHand)} sub={`${money(sum.inventory.bought)} bought · ${money(sum.inventory.used)} used on jobs`} />
      </div>
    </div>
  )
}

// ── Expenses table ───────────────────────────────────────────────────────────
function ExpensesTab({ list, cards, jobs, bucketFilter, setBucketFilter }) {
  const updateExpense = useStore(s => s.updateExpense)
  const deleteExpense = useStore(s => s.deleteExpense)
  const [search, setSearch] = useState('')
  const [cardFilter, setCardFilter] = useState('all')
  const cardOf = (id) => cards.find(c => c.id === id)
  const rows = list.filter(e => {
    if (bucketFilter !== 'all' && bucketOf(e) !== bucketFilter) return false
    if (cardFilter !== 'all' && String(e.cardId) !== String(cardFilter)) return false
    if (search) { const q = search.toLowerCase(); return [e.description, e.merchant, e.category].some(x => String(x || '').toLowerCase().includes(q)) }
    return true
  }).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
  const total = rows.reduce((s, e) => s + Number(e.amount || 0), 0)
  return (
    <div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="flex flex-wrap gap-1">
          {[{ key: 'all', label: 'All' }, ...BUCKETS.map(b => ({ key: b.key, label: b.key === 'misc' ? 'Unaccounted' : b.label }))].map(b => (
            <button key={b.key} onClick={() => setBucketFilter(b.key)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border ${bucketFilter === b.key ? (b.key === 'misc' ? 'bg-red-600 text-white border-red-600' : 'bg-gray-900 text-white border-gray-900') : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>{b.label}</button>
          ))}
        </div>
        <select value={cardFilter} onChange={e => setCardFilter(e.target.value)} className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 ml-auto">
          <option value="all">All cards</option>
          {cards.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className="pl-7 pr-2 py-1.5 border border-gray-200 rounded-lg text-xs w-40 focus:outline-none focus:ring-2 focus:ring-blue-300" />
        </div>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {rows.length === 0 ? <div className="py-12 text-center text-gray-400 text-sm">Nothing here for this period.</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[860px]">
              <thead className="bg-gray-50 border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wider">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Date</th>
                  <th className="px-3 py-2 text-left font-semibold">Description</th>
                  <th className="px-3 py-2 text-left font-semibold">Bucket</th>
                  <th className="px-3 py-2 text-left font-semibold">Category</th>
                  <th className="px-3 py-2 text-left font-semibold">Card</th>
                  <th className="px-3 py-2 text-right font-semibold">Amount</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map(e => {
                  const c = cardOf(e.cardId)
                  const b = pickerBucket(e)
                  return (
                    <tr key={e.id} className={bucketOf(e) === 'misc' ? 'bg-red-50/40' : 'hover:bg-gray-50'}>
                      <td className="px-3 py-2 text-gray-500 text-xs whitespace-nowrap">{e.date || '—'}</td>
                      <td className="px-3 py-2 text-gray-800">{e.description}{e.merchant ? <span className="text-gray-400"> · {e.merchant}</span> : null}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1 flex-wrap">
                          <BucketPicker value={b} onChange={nb => updateExpense(e.id, { ...bucketPatch(nb), category: '' })} />
                          {b === 'job' && <JobPicker jobs={jobs} value={e.jobId} onChange={id => updateExpense(e.id, { jobId: id, bucket: 'job' })} />}
                        </div>
                      </td>
                      <td className="px-3 py-2">{b ? <CategoryPicker bucket={b} value={e.category} onChange={cat => updateExpense(e.id, { category: cat })} /> : <span className="text-xs text-gray-400">{e.category || '—'}</span>}</td>
                      <td className="px-3 py-2 text-xs">{c ? <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: c.color }} />{c.label}</span> : <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-2 text-right font-semibold text-gray-900 whitespace-nowrap">{money(e.amount)}</td>
                      <td className="px-2 py-2 text-right"><button onClick={() => deleteExpense(e.id)} className="text-gray-300 hover:text-red-500" aria-label="Delete expense"><Trash2 size={13} /></button></td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot><tr className="border-t border-gray-100"><td colSpan={5} className="px-3 py-2 text-xs text-gray-500">{rows.length} expense{rows.length === 1 ? '' : 's'}</td><td className="px-3 py-2 text-right font-bold text-gray-900">{money(total)}</td><td /></tr></tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Jobs P&L ─────────────────────────────────────────────────────────────────
function JobsTab({ jobs, expenses, jobCosts, rate }) {
  const [open, setOpen] = useState(null)
  const rows = jobs.map(j => {
    const fin = jobFinancials(j, expenses, jobCosts?.[j.id])
    return { j, fin, adj: adjustedForUnaccounted(fin, rate) }
  }).sort((a, b) => b.fin.revenue - a.fin.revenue)
  const tot = rows.reduce((t, r) => ({ rev: t.rev + r.fin.revenue, cost: t.cost + r.fin.actualCost, profit: t.profit + r.fin.profit, adj: t.adj + r.adj.profit, due: t.due + r.fin.balanceDue }), { rev: 0, cost: 0, profit: 0, adj: 0, due: 0 })
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <p className="px-4 py-3 text-xs text-gray-500 border-b border-gray-100">Adjusted margin takes this year's unaccounted rate (<strong className="text-red-700">{ratePct(rate)}</strong>) off each job. Click a job for its full financials.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-gray-50 border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wider">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Job</th>
              <th className="px-3 py-2 text-right font-semibold">Revenue</th>
              <th className="px-3 py-2 text-right font-semibold">Est. cost</th>
              <th className="px-3 py-2 text-right font-semibold">Actual cost</th>
              <th className="px-3 py-2 text-right font-semibold">Profit</th>
              <th className="px-3 py-2 text-right font-semibold">Margin</th>
              <th className="px-3 py-2 text-right font-semibold">Adjusted</th>
              <th className="px-3 py-2 text-right font-semibold">Collected</th>
              <th className="px-3 py-2 text-right font-semibold">Balance due</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.length === 0 && <tr><td colSpan={9} className="py-10 text-center text-gray-400">No won jobs yet.</td></tr>}
            {rows.map(({ j, fin, adj }) => (
              <FragmentRow key={j.id} open={open === j.id} onToggle={() => setOpen(o => (o === j.id ? null : j.id))} j={j} fin={fin} adj={adj} />
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="border-t-2 border-gray-200 font-semibold">
              <tr>
                <td className="px-3 py-2">Total</td>
                <td className="px-3 py-2 text-right">{money(tot.rev)}</td>
                <td />
                <td className="px-3 py-2 text-right text-red-600">{money(tot.cost)}</td>
                <td className="px-3 py-2 text-right">{money(tot.profit)}</td>
                <td className="px-3 py-2 text-right">{pct(tot.rev ? (tot.profit / tot.rev) * 100 : null)}</td>
                <td className="px-3 py-2 text-right">{pct(tot.rev ? (tot.adj / tot.rev) * 100 : null)}</td>
                <td />
                <td className="px-3 py-2 text-right">{money(tot.due)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
function FragmentRow({ j, fin, adj, open, onToggle }) {
  return (
    <>
      <tr className="hover:bg-gray-50 cursor-pointer" onClick={onToggle}>
        <td className="px-3 py-2 font-medium text-gray-800"><span className="inline-flex items-center gap-1">{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}{jobName(j)}</span></td>
        <td className="px-3 py-2 text-right">{money(fin.revenue)}</td>
        <td className="px-3 py-2 text-right text-gray-500">{fin.estimatedCost ? money(fin.estimatedCost) : '—'}</td>
        <td className={`px-3 py-2 text-right ${fin.costVariance > 0 ? 'text-red-600 font-semibold' : 'text-gray-800'}`}>{money(fin.actualCost)}</td>
        <td className={`px-3 py-2 text-right ${fin.profit >= 0 ? 'text-green-700' : 'text-red-600'}`}>{money(fin.profit)}</td>
        <td className="px-3 py-2 text-right">{pct(fin.margin)}</td>
        <td className="px-3 py-2 text-right text-gray-700">{pct(adj.margin)}</td>
        <td className="px-3 py-2 text-right">{money(fin.received)}</td>
        <td className={`px-3 py-2 text-right ${fin.balanceDue > 0 ? 'text-amber-700' : 'text-gray-400'}`}>{money(fin.balanceDue)}</td>
      </tr>
      {open && <tr><td colSpan={9} className="bg-gray-50/60 px-4 py-4"><JobFinancials proposal={j} /></td></tr>}
    </>
  )
}

// ── Subscriptions ────────────────────────────────────────────────────────────
function SubscriptionsTab({ subscriptions, expenses, cards, period, onLogCharge }) {
  const addSubscription    = useStore(s => s.addSubscription)
  const updateSubscription = useStore(s => s.updateSubscription)
  const deleteSubscription = useStore(s => s.deleteSubscription)
  const blank = { name: '', vendor: '', amount: '', cycle: 'monthly', startDate: today(), category: 'Software', cardId: '' }
  const [f, setF] = useState(blank)
  const save = () => {
    if (!f.name.trim() || !(Number(f.amount) > 0)) return
    addSubscription({ ...f, name: f.name.trim(), vendor: f.vendor.trim(), amount: Number(f.amount), cardId: f.cardId || null })
    setF(blank)
  }
  const monthly = subscriptions.reduce((s, x) => s + monthlyCostOf(x), 0)
  const spentOn = (sub) => expenses.filter(e => !isAllocation(e) && inPeriod(e.date, period) && (e.subscriptionId === sub.id || (bucketOf(e) === 'subscription' && matchSubscription(e.description, [sub])))).reduce((s, e) => s + Number(e.amount || 0), 0)
  const sorted = [...subscriptions].sort((a, b) => String(nextRenewal(a) || '9').localeCompare(String(nextRenewal(b) || '9')))
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Kpi label="Monthly" value={money(monthly)} sub={`${subscriptions.filter(s => s.active !== false).length} active`} />
        <Kpi label="Yearly" value={money(monthly * 12)} />
        <Kpi label={`Charged · ${period.label.toLowerCase()}`} value={money(expenses.filter(e => !isAllocation(e) && inPeriod(e.date, period) && bucketOf(e) === 'subscription').reduce((s, e) => s + Number(e.amount || 0), 0))} sub="Logged subscription expenses" />
      </div>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <p className="text-sm font-semibold text-gray-800 mb-2">Add a subscription</p>
        <div className="grid grid-cols-2 lg:grid-cols-[2fr_1.5fr_1fr_1fr_1fr_1fr_auto] gap-2">
          <input aria-label="Subscription name" value={f.name} onChange={e => setF(p => ({ ...p, name: e.target.value }))} placeholder="Name (e.g. QuickBooks)" className={inputCls} />
          <input aria-label="Vendor on statement" value={f.vendor} onChange={e => setF(p => ({ ...p, vendor: e.target.value }))} placeholder="Shows on statement as…" className={inputCls} />
          <input type="number" aria-label="Subscription amount" value={f.amount} onChange={e => setF(p => ({ ...p, amount: e.target.value }))} placeholder="Amount $" className={inputCls} />
          <select aria-label="Billing cycle" value={f.cycle} onChange={e => setF(p => ({ ...p, cycle: e.target.value }))} className={inputCls}><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select>
          <input type="date" aria-label="Start date" value={f.startDate} onChange={e => setF(p => ({ ...p, startDate: e.target.value }))} className={inputCls} />
          <select aria-label="Subscription category" value={f.category} onChange={e => setF(p => ({ ...p, category: e.target.value }))} className={inputCls}>{CATEGORIES.subscription.map(c => <option key={c}>{c}</option>)}</select>
          <button onClick={save} disabled={!f.name.trim() || !(Number(f.amount) > 0)} className="px-3 py-2 rounded-lg bg-gray-900 text-white disabled:opacity-40" aria-label="Add subscription"><Plus size={15} /></button>
        </div>
        <p className="text-[11px] text-gray-400 mt-2">Statement lines that mention the name or the "shows on statement as" text are filed under Subscriptions automatically when you import.</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {sorted.length === 0 ? <p className="py-10 text-center text-sm text-gray-400">No subscriptions yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[820px]">
              <thead className="bg-gray-50 border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wider">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Subscription</th>
                  <th className="px-3 py-2 text-right font-semibold">Price</th>
                  <th className="px-3 py-2 text-right font-semibold">Per month</th>
                  <th className="px-3 py-2 text-right font-semibold">Per year</th>
                  <th className="px-3 py-2 text-left font-semibold">Renews</th>
                  <th className="px-3 py-2 text-right font-semibold">Charged</th>
                  <th className="px-3 py-2 text-center font-semibold">Active</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sorted.map(sub => (
                  <tr key={sub.id} className={sub.active === false ? 'opacity-50' : ''}>
                    <td className="px-3 py-2"><p className="font-medium text-gray-800">{sub.name}</p><p className="text-xs text-gray-400">{[sub.vendor, sub.category].filter(Boolean).join(' · ')}</p></td>
                    <td className="px-3 py-2 text-right">{money(sub.amount)}<span className="text-xs text-gray-400">/{sub.cycle === 'yearly' ? 'yr' : 'mo'}</span></td>
                    <td className="px-3 py-2 text-right">{money(monthlyCostOf(sub))}</td>
                    <td className="px-3 py-2 text-right">{money(yearlyCostOf(sub))}</td>
                    <td className="px-3 py-2 text-xs text-gray-600">{nextRenewal(sub) || '—'}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{money(spentOn(sub))}</td>
                    <td className="px-3 py-2 text-center"><input type="checkbox" checked={sub.active !== false} onChange={e => updateSubscription(sub.id, { active: e.target.checked })} aria-label={`${sub.name} active`} /></td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button onClick={() => onLogCharge(sub)} className="text-xs font-semibold text-blue-600 hover:underline mr-3">Log charge</button>
                      <button onClick={() => { if (window.confirm(`Remove ${sub.name}?`)) deleteSubscription(sub.id) }} className="text-gray-300 hover:text-red-500" aria-label={`Delete ${sub.name}`}><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {cards.length === 0 && null}
    </div>
  )
}

// ── Inventory ────────────────────────────────────────────────────────────────
function InventoryTab({ expenses, jobs, period, onAddPurchase }) {
  const addExpense = useStore(s => s.addExpense)
  const deleteExpense = useStore(s => s.deleteExpense)
  const inv = inventorySummary(expenses)
  const purchases = expenses.filter(e => !isAllocation(e) && bucketOf(e) === 'inventory' && inPeriod(e.date, period)).sort((a, b) => String(b.date).localeCompare(String(a.date)))
  const uses = expenses.filter(e => isAllocation(e) && inPeriod(e.date, period)).sort((a, b) => String(b.date).localeCompare(String(a.date)))
  const [u, setU] = useState({ jobId: null, amount: '', description: '' })
  const saveUse = () => {
    if (!u.jobId || !(Number(u.amount) > 0)) return
    addExpense({ kind: 'allocation', date: today(), jobId: u.jobId, bucket: 'job', amount: Number(u.amount), description: u.description.trim() || 'Materials from inventory', category: 'Materials (from inventory)' })
    setU({ jobId: null, amount: '', description: '' })
  }
  const jobOf = (id) => jobs.find(j => j.id === id)
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Kpi label="On hand" value={money(inv.onHand)} sub="Bought − used on jobs" />
        <Kpi label="Bought (all time)" value={money(inv.bought)} />
        <Kpi label="Used on jobs (all time)" value={money(inv.used)} />
      </div>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-2">
        <div className="flex items-center justify-between"><p className="text-sm font-semibold text-gray-800">Use stock on a job</p>
          <button onClick={onAddPurchase} className="text-xs font-semibold text-blue-600 hover:underline">+ Log an inventory purchase</button></div>
        <div className="grid sm:grid-cols-[1.5fr_2fr_1fr_auto] gap-2 items-center">
          <JobPicker jobs={jobs} value={u.jobId} onChange={id => setU(p => ({ ...p, jobId: id }))} />
          <input aria-label="What was used" value={u.description} onChange={e => setU(p => ({ ...p, description: e.target.value }))} placeholder="What was used (e.g. 40 Trex boards)" className={inputCls} />
          <input type="number" aria-label="Value used" value={u.amount} onChange={e => setU(p => ({ ...p, amount: e.target.value }))} placeholder="Value $" className={inputCls} />
          <button onClick={saveUse} disabled={!u.jobId || !(Number(u.amount) > 0)} className="px-3 py-2 rounded-lg bg-gray-900 text-white text-sm disabled:opacity-40">Use</button>
        </div>
        <p className="text-[11px] text-gray-400">Moves the cost onto that job and lowers stock on hand. It isn't new spending — the purchase was already counted.</p>
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        {[['Purchases', purchases, false], ['Used on jobs', uses, true]].map(([title, list, isUse]) => (
          <div key={title} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <p className="px-4 py-2.5 text-sm font-semibold text-gray-800 border-b border-gray-100">{title} <span className="text-xs font-normal text-gray-400">· {period.label.toLowerCase()}</span></p>
            {list.length === 0 ? <p className="py-8 text-center text-xs text-gray-400">None.</p> : (
              <div className="divide-y divide-gray-50">
                {list.map(e => (
                  <div key={e.id} className="flex items-center gap-2 px-4 py-2 text-sm">
                    <span className="text-xs text-gray-500 w-20">{e.date}</span>
                    <span className="flex-1 min-w-0 truncate text-gray-800">{e.description}{isUse && jobOf(e.jobId) ? <span className="text-gray-400"> → {jobName(jobOf(e.jobId))}</span> : e.category ? <span className="text-gray-400"> · {e.category}</span> : null}</span>
                    <span className="font-semibold text-gray-900">{money(e.amount)}</span>
                    <button onClick={() => deleteExpense(e.id)} className="text-gray-300 hover:text-red-500" aria-label="Delete"><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Cards ────────────────────────────────────────────────────────────────────
function CardsTab({ cards, list, onEdit }) {
  const deleteFinanceCard = useStore(s => s.deleteFinanceCard)
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-gray-700">Cards &amp; who's spending</p>
        <button onClick={() => onEdit({})} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"><Plus size={13} /> Add card</button>
      </div>
      {cards.length === 0 ? <p className="text-xs text-gray-400 italic">No cards yet — add one to label who's spending.</p> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {cards.map(c => {
            const mine = list.filter(e => e.cardId === c.id)
            const spent = mine.reduce((s, e) => s + Number(e.amount || 0), 0)
            const misc = mine.filter(e => bucketOf(e) === 'misc').reduce((s, e) => s + Number(e.amount || 0), 0)
            return (
              <div key={c.id} className="rounded-xl p-4 bg-white border border-gray-200 shadow-sm" style={{ borderLeftColor: c.color, borderLeftWidth: '4px' }}>
                <div className="flex items-start justify-between">
                  <CreditCard size={18} style={{ color: c.color }} />
                  <div className="flex gap-1">
                    <button onClick={() => onEdit(c)} className="text-gray-300 hover:text-gray-600" aria-label="Edit card"><Pencil size={13} /></button>
                    <button onClick={() => { if (window.confirm('Delete this card? Expenses stay but lose their card label.')) deleteFinanceCard(c.id) }} className="text-gray-300 hover:text-red-500" aria-label="Delete card"><Trash2 size={13} /></button>
                  </div>
                </div>
                <p className="font-semibold mt-3 text-gray-900">{c.label}{c.last4 ? ` ••${c.last4}` : ''}</p>
                <p className="text-xs text-gray-400">{c.owner || 'Unassigned'}</p>
                <p className="text-2xl font-bold mt-2 text-gray-900">{money(spent)}</p>
                {misc > 0 && <p className="text-xs text-red-600 mt-0.5">{money(misc)} unaccounted</p>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const TABS = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'expenses', label: 'Expenses', icon: Receipt },
  { key: 'jobs', label: 'Jobs', icon: Briefcase },
  { key: 'subscriptions', label: 'Subscriptions', icon: Repeat },
  { key: 'inventory', label: 'Inventory', icon: Package },
  { key: 'cards', label: 'Cards', icon: CreditCard },
]
const PERIODS = ['month', 'lastmonth', 'quarter', 'year', 'lastyear', 'all']

export default function Finance() {
  const cardsRaw    = useStore(s => s.financeCards)
  const expensesRaw = useStore(s => s.expenses)
  const proposals   = useStore(s => s.proposals)
  const subsRaw     = useStore(s => s.subscriptions)
  const jobCosts    = useStore(s => s.jobCosts)
  const cards = useMemo(() => cardsRaw || [], [cardsRaw])
  const expenses = useMemo(() => expensesRaw || [], [expensesRaw])
  const subscriptions = useMemo(() => subsRaw || [], [subsRaw])

  const [tab, setTab] = useState('overview')
  const [periodKey, setPeriodKey] = useState('year')
  const [bucketFilter, setBucketFilter] = useState('all')
  const [importing, setImporting] = useState(false)
  const [adding, setAdding] = useState(null)        // initial values for the add form, or null
  const [editingCard, setEditingCard] = useState(null)

  const period = useMemo(() => periodFor(periodKey), [periodKey])
  const jobs = useMemo(() => (proposals || []).filter(p => p.status === 'Won'), [proposals])
  const sum = useMemo(() => companySummary({ expenses, proposals: proposals || [], subscriptions, jobCosts, period }), [expenses, proposals, subscriptions, jobCosts, period])
  const rateYear = useMemo(() => companySummary({ expenses, proposals: proposals || [], subscriptions, jobCosts, period: periodFor('year') }).unaccountedRate, [expenses, proposals, subscriptions, jobCosts])
  const cashInPeriod = useMemo(() => expenses.filter(e => !isAllocation(e) && inPeriod(e.date, period)), [expenses, period])

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h1 className="qx-hide-embedded text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2"><Wallet size={22} className="text-gray-400" /> Finance</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">Every dollar sorted into a job, operating, subscriptions or inventory — anything else shows up as unaccounted.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <select aria-label="Period" value={periodKey} onChange={e => setPeriodKey(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-2 py-2">
            {PERIODS.map(k => <option key={k} value={k}>{periodFor(k).label}</option>)}
          </select>
          <button onClick={() => setImporting(true)} className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"><Upload size={14} /> Import statement</button>
          <button onClick={() => setAdding({})} className="flex items-center gap-1.5 px-3 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700"><Plus size={14} /> Add expense</button>
        </div>
      </div>

      <div className="flex gap-1 mb-5 border-b border-gray-200 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${tab === t.key ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
            <t.icon size={14} /> {t.label}
            {t.key === 'expenses' && sum.unaccountedCount > 0 && <span className="ml-1 text-[10px] font-bold bg-red-600 text-white rounded-full px-1.5">{sum.unaccountedCount}</span>}
          </button>
        ))}
      </div>

      {tab === 'overview' && <Overview sum={sum} period={period} onReviewUnaccounted={() => { setBucketFilter('misc'); setTab('expenses') }} />}
      {tab === 'expenses' && <ExpensesTab list={cashInPeriod} cards={cards} jobs={jobs} bucketFilter={bucketFilter} setBucketFilter={setBucketFilter} />}
      {tab === 'jobs' && <JobsTab jobs={jobs} expenses={expenses} jobCosts={jobCosts} rate={rateYear} />}
      {tab === 'subscriptions' && <SubscriptionsTab subscriptions={subscriptions} expenses={expenses} cards={cards} period={period}
        onLogCharge={(sub) => setAdding({ description: sub.name, amount: String(sub.amount), bucket: 'subscription', category: sub.category || 'Software', subscriptionId: sub.id, cardId: sub.cardId || cards[0]?.id || '' })} />}
      {tab === 'inventory' && <InventoryTab expenses={expenses} jobs={jobs} period={period} onAddPurchase={() => setAdding({ bucket: 'inventory', category: 'Decking' })} />}
      {tab === 'cards' && <CardsTab cards={cards} list={cashInPeriod} onEdit={setEditingCard} />}

      {importing && <ImportModal cards={cards} jobs={jobs} subscriptions={subscriptions} onClose={() => setImporting(false)} />}
      {adding && <ExpenseModal cards={cards} jobs={jobs} subscriptions={subscriptions} initial={adding} onClose={() => setAdding(null)} />}
      {editingCard && <CardModal card={editingCard.id ? editingCard : null} onClose={() => setEditingCard(null)} />}
    </div>
  )
}
