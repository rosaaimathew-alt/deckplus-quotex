import { useState, useMemo, useRef } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { useStore } from '../store'
import { wonRevenueOf } from '../contractTotal'
import { getModel } from '../gemini'
import {
  Upload, Plus, X, Trash2, Pencil, CreditCard, DollarSign, Loader,
  Check, FileText, Search, Briefcase, TrendingDown, Wallet,
} from 'lucide-react'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

const CATEGORIES = ['Materials', 'Labor', 'Subcontractor', 'Fuel', 'Tools', 'Equipment', 'Permits', 'Office', 'Insurance', 'Other']
const CARD_COLORS = ['#0f766e', '#2563eb', '#7c3aed', '#c0603f', '#b45309', '#be123c', '#4b5563']
const fmt = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const STATEMENT_SYSTEM = `You extract transactions from a bank or credit-card statement. Return ONLY a JSON array; each item: {"date":"YYYY-MM-DD","description":"short merchant/description","amount":<positive number = money spent>}. Only include purchases and charges (money OUT). Skip payments, credits, refunds, interest, fees you can't attribute, and running balances. If the year isn't printed, infer a recent reasonable year. Return [] if none found.`

async function extractPdfText(file) {
  const buf = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise
  let text = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    text += content.items.map(it => it.str).join(' ') + '\n'
  }
  return text
}

async function aiExtractTransactions(text) {
  const model = getModel(STATEMENT_SYSTEM)
  const res = await model.generateContent(`Statement text:\n\n${text.slice(0, 30000)}`)
  const out = res.response.text()
  const match = out.match(/\[[\s\S]*\]/)
  const arr = match ? JSON.parse(match[0]) : []
  return (arr || [])
    .filter(t => t && Number(t.amount) > 0)
    .map(t => ({ date: t.date || '', description: String(t.description || '').slice(0, 120), amount: Number(t.amount) }))
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

// ── Statement import (drag-drop PDF → AI → review) ────────────────────────────
function ImportModal({ cards, onClose }) {
  const addExpenses = useStore(s => s.addExpenses)
  const fileRef = useRef()
  const [step, setStep] = useState('drop') // drop | loading | review | error
  const [rows, setRows] = useState([])
  const [cardId, setCardId] = useState(cards[0]?.id || '')
  const [error, setError] = useState('')
  const [pasted, setPasted] = useState('')

  const process = async (text) => {
    setStep('loading'); setError('')
    try {
      const tx = await aiExtractTransactions(text)
      if (!tx.length) { setError('No transactions found. Try a clearer statement or paste the text.'); setStep('error'); return }
      setRows(tx.map((t, i) => ({ ...t, _id: i, category: 'Materials', include: true })))
      setStep('review')
    } catch (err) {
      setError(err.message.includes('ANTHROPIC') ? 'AI isn’t configured yet — set it up in Settings.' : 'Could not read the statement. You can paste the text instead.')
      setStep('error')
    }
  }

  const handleFile = async (file) => {
    if (!file) return
    setStep('loading'); setError('')
    try {
      const text = await extractPdfText(file)
      if (!text.trim() || text.trim().length < 40) { setError('Could not read text from that PDF (it may be a scan). Paste the transactions below instead.'); setStep('error'); return }
      await process(text)
    } catch {
      setError('Could not open that PDF. Paste the transactions below instead.'); setStep('error')
    }
  }

  const setRow = (id, k, v) => setRows(rs => rs.map(r => r._id === id ? { ...r, [k]: v } : r))
  const importAll = () => {
    const chosen = rows.filter(r => r.include && Number(r.amount) > 0)
    addExpenses(chosen.map(r => ({ date: r.date, description: r.description, amount: Number(r.amount), category: r.category, cardId: cardId || null, jobId: null })))
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <p className="font-semibold text-gray-900">Import statement</p>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={17} /></button>
        </div>

        {step === 'drop' && (
          <div className="p-5">
            <label
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]) }}
              className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-xl p-10 cursor-pointer hover:border-blue-400 hover:bg-blue-50/40 transition-colors">
              <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={e => handleFile(e.target.files[0])} />
              <Upload size={26} className="text-gray-400 mb-2" />
              <p className="text-sm font-medium text-gray-600">Drop a PDF bank / credit-card statement</p>
              <p className="text-xs text-gray-400 mt-1">or click to browse — AI pulls out the transactions</p>
            </label>
            <div className="mt-4">
              <p className="text-xs font-semibold text-gray-500 mb-1">…or paste transactions text</p>
              <textarea rows={4} value={pasted} onChange={e => setPasted(e.target.value)}
                placeholder="Paste rows copied from your statement…"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none" />
              <button onClick={() => pasted.trim() && process(pasted)} disabled={!pasted.trim()}
                className="mt-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 disabled:opacity-40">Extract from text</button>
            </div>
          </div>
        )}

        {step === 'loading' && (
          <div className="p-16 text-center">
            <Loader size={28} className="animate-spin text-blue-500 mx-auto mb-3" />
            <p className="text-sm text-gray-500">Reading the statement…</p>
          </div>
        )}

        {step === 'error' && (
          <div className="p-5">
            <p className="text-sm text-red-500 mb-3">{error}</p>
            <textarea rows={5} value={pasted} onChange={e => setPasted(e.target.value)}
              placeholder="Paste the transactions text here…"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none" />
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => { setStep('drop'); setError('') }} className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100">Back</button>
              <button onClick={() => pasted.trim() && process(pasted)} disabled={!pasted.trim()}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 disabled:opacity-40">Extract</button>
            </div>
          </div>
        )}

        {step === 'review' && (
          <>
            <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3 shrink-0">
              <span className="text-xs text-gray-500">{rows.filter(r => r.include).length} of {rows.length} transactions · charge to</span>
              <select value={cardId} onChange={e => setCardId(Number(e.target.value) || '')}
                className="text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-300">
                <option value="">No card</option>
                {cards.map(c => <option key={c.id} value={c.id}>{c.label}{c.owner ? ` · ${c.owner}` : ''}</option>)}
              </select>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-2">
              {rows.map(r => (
                <div key={r._id} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${r.include ? '' : 'opacity-40'}`}>
                  <input type="checkbox" checked={r.include} onChange={e => setRow(r._id, 'include', e.target.checked)} className="shrink-0" />
                  <input value={r.date} onChange={e => setRow(r._id, 'date', e.target.value)} className="w-24 text-xs border border-gray-200 rounded px-1.5 py-1" />
                  <input value={r.description} onChange={e => setRow(r._id, 'description', e.target.value)} className="flex-1 min-w-0 text-xs border border-gray-200 rounded px-1.5 py-1" />
                  <select value={r.category} onChange={e => setRow(r._id, 'category', e.target.value)} className="text-xs border border-gray-200 rounded px-1 py-1 shrink-0">
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                  <div className="flex items-center gap-0.5 shrink-0"><span className="text-gray-400 text-xs">$</span>
                    <input type="number" value={r.amount} onChange={e => setRow(r._id, 'amount', e.target.value)} className="w-20 text-xs border border-gray-200 rounded px-1.5 py-1 text-right" />
                  </div>
                </div>
              ))}
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2 shrink-0">
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100">Cancel</button>
              <button onClick={importAll} className="flex items-center gap-1.5 px-5 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700">
                <Check size={14} /> Import {rows.filter(r => r.include).length}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Manual expense ────────────────────────────────────────────────────────────
function ExpenseModal({ cards, onClose }) {
  const addExpense = useStore(s => s.addExpense)
  const [f, setF] = useState({ date: new Date().toISOString().slice(0, 10), description: '', amount: '', category: 'Materials', cardId: cards[0]?.id || '' })
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const save = () => {
    if (!f.description.trim() || !Number(f.amount)) return
    addExpense({ date: f.date, description: f.description, amount: Number(f.amount), category: f.category, cardId: f.cardId || null, jobId: null })
    onClose()
  }
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <p className="font-semibold text-gray-900">Add expense</p>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={17} /></button>
        </div>
        <div className="p-5 space-y-3">
          <input value={f.description} onChange={e => set('description', e.target.value)} placeholder="Description"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300" />
          <div className="grid grid-cols-2 gap-3">
            <input type="date" value={f.date} onChange={e => set('date', e.target.value)} className="text-sm border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300" />
            <div className="flex items-center gap-1"><span className="text-gray-400">$</span>
              <input type="number" value={f.amount} onChange={e => set('amount', e.target.value)} placeholder="0.00" className="w-full text-sm border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <select value={f.category} onChange={e => set('category', e.target.value)} className="text-sm border border-gray-200 rounded-lg px-2 py-2">
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
            <select value={f.cardId} onChange={e => set('cardId', Number(e.target.value) || '')} className="text-sm border border-gray-200 rounded-lg px-2 py-2">
              <option value="">No card</option>
              {cards.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100">Cancel</button>
          <button onClick={save} className="px-5 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700">Save</button>
        </div>
      </div>
    </div>
  )
}

export default function Finance() {
  const cards       = useStore(s => s.financeCards) || []
  const expenses    = useStore(s => s.expenses) || []
  const proposals   = useStore(s => s.proposals)
  const updateExpense = useStore(s => s.updateExpense)
  const deleteExpense = useStore(s => s.deleteExpense)
  const deleteFinanceCard = useStore(s => s.deleteFinanceCard)

  const [importing, setImporting] = useState(false)
  const [addingExpense, setAddingExpense] = useState(false)
  const [editingCard, setEditingCard] = useState(null) // card obj or {} for new
  const [filterCard, setFilterCard] = useState('all')
  const [search, setSearch] = useState('')

  const jobs = useMemo(() => proposals.filter(p => p.status === 'Won'), [proposals])
  const cardOf = (id) => cards.find(c => c.id === id)
  const jobLabel = (id) => { const j = jobs.find(p => p.id === id); return j ? (j.client || `Job #${j.id}`) : null }

  const filtered = expenses.filter(e => {
    if (filterCard !== 'all' && String(e.cardId) !== String(filterCard)) return false
    if (search) { const q = search.toLowerCase(); return (e.description || '').toLowerCase().includes(q) || (e.category || '').toLowerCase().includes(q) }
    return true
  })

  const total     = expenses.reduce((s, e) => s + Number(e.amount || 0), 0)
  const thisMonth = expenses.filter(e => (e.date || '').slice(0, 7) === new Date().toISOString().slice(0, 7)).reduce((s, e) => s + Number(e.amount || 0), 0)
  const unassigned = expenses.filter(e => !e.jobId).reduce((s, e) => s + Number(e.amount || 0), 0)

  const perCard = cards.map(c => ({ ...c, spent: expenses.filter(e => e.cardId === c.id).reduce((s, e) => s + Number(e.amount || 0), 0) }))
  const perJob = jobs
    .map(j => ({ id: j.id, client: j.client || `Job #${j.id}`, revenue: wonRevenueOf(j), cost: expenses.filter(e => e.jobId === j.id).reduce((s, e) => s + Number(e.amount || 0), 0) }))
    .filter(j => j.cost > 0)
    .sort((a, b) => b.cost - a.cost)

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2"><Wallet size={22} className="text-gray-400" /> Finance</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">Track card spend by employee and tie expenses to jobs for automatic P&amp;L.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setImporting(true)} className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
            <Upload size={14} /> Import statement
          </button>
          <button onClick={() => setAddingExpense(true)} className="flex items-center gap-1.5 px-3 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700">
            <Plus size={14} /> Add expense
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total spend', value: `$${fmt(total)}`, icon: TrendingDown },
          { label: 'This month', value: `$${fmt(thisMonth)}`, icon: DollarSign },
          { label: 'Unassigned', value: `$${fmt(unassigned)}`, icon: Briefcase },
          { label: 'Cards', value: cards.length, icon: CreditCard },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-8 h-8 rounded-lg bg-gray-100 text-gray-500 flex items-center justify-center shrink-0"><s.icon size={16} /></span>
              <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">{s.label}</span>
            </div>
            <p className="text-xl font-bold text-gray-900">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Cards */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold text-gray-700">Cards &amp; who's spending</p>
          <button onClick={() => setEditingCard({})} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"><Plus size={13} /> Add card</button>
        </div>
        {perCard.length === 0 ? (
          <p className="text-xs text-gray-400 italic">No cards yet — add one to label who's spending.</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {perCard.map(c => (
              <div key={c.id} className="rounded-xl p-4 bg-white border border-gray-200 shadow-sm relative overflow-hidden" style={{ borderLeftColor: c.color, borderLeftWidth: '4px' }}>
                <div className="flex items-start justify-between">
                  <CreditCard size={18} style={{ color: c.color }} />
                  <div className="flex gap-1">
                    <button onClick={() => setEditingCard(c)} className="text-gray-300 hover:text-gray-600"><Pencil size={13} /></button>
                    <button onClick={() => { if (window.confirm('Delete this card? Expenses stay but lose their card label.')) deleteFinanceCard(c.id) }} className="text-gray-300 hover:text-red-500"><Trash2 size={13} /></button>
                  </div>
                </div>
                <p className="font-semibold mt-3 text-gray-900">{c.label}{c.last4 ? ` ••${c.last4}` : ''}</p>
                <p className="text-xs text-gray-400">{c.owner || 'Unassigned'}</p>
                <p className="text-2xl font-bold mt-2 text-gray-900">${fmt(c.spent)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Per-job P&L */}
      {perJob.length > 0 && (
        <div className="mb-6">
          <p className="text-sm font-semibold text-gray-700 mb-2">Spend by job</p>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-50">
            {perJob.map(j => {
              const profit = j.revenue - j.cost
              return (
                <div key={j.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="flex-1 font-medium text-gray-800 truncate">{j.client}</span>
                  <span className="text-gray-400 text-xs">rev ${fmt(j.revenue)}</span>
                  <span className="text-red-500 text-xs">cost ${fmt(j.cost)}</span>
                  <span className={`font-semibold w-24 text-right ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>${fmt(profit)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Expenses */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <p className="text-sm font-semibold text-gray-700 mr-auto">Expenses</p>
        <select value={filterCard} onChange={e => setFilterCard(e.target.value)} className="text-xs border border-gray-200 rounded-lg px-2 py-1.5">
          <option value="all">All cards</option>
          {cards.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className="pl-7 pr-2 py-1.5 border border-gray-200 rounded-lg text-xs w-40 focus:outline-none focus:ring-2 focus:ring-blue-300" />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">No expenses yet — import a statement or add one.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead className="bg-gray-50 border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold">Date</th>
                  <th className="px-4 py-2 text-left font-semibold">Description</th>
                  <th className="px-4 py-2 text-left font-semibold">Category</th>
                  <th className="px-4 py-2 text-left font-semibold">Card</th>
                  <th className="px-4 py-2 text-left font-semibold">Job</th>
                  <th className="px-4 py-2 text-right font-semibold">Amount</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(e => {
                  const c = cardOf(e.cardId)
                  return (
                    <tr key={e.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-500 text-xs whitespace-nowrap">{e.date || '—'}</td>
                      <td className="px-4 py-2 text-gray-800">{e.description}</td>
                      <td className="px-4 py-2">
                        <select value={e.category || 'Other'} onChange={ev => updateExpense(e.id, { category: ev.target.value })} className="text-xs border border-gray-200 rounded px-1 py-0.5">
                          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-2 text-xs">
                        {c ? <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: c.color }} />{c.label}</span> : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2">
                        <select value={e.jobId || ''} onChange={ev => updateExpense(e.id, { jobId: Number(ev.target.value) || null })}
                          className={`text-xs border rounded px-1 py-0.5 ${e.jobId ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-400'}`}>
                          <option value="">Unassigned</option>
                          {jobs.map(j => <option key={j.id} value={j.id}>{j.client || `Job #${j.id}`}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-2 text-right font-semibold text-gray-900 whitespace-nowrap">${fmt(e.amount)}</td>
                      <td className="px-4 py-2 text-right">
                        <button onClick={() => deleteExpense(e.id)} className="text-gray-300 hover:text-red-500"><Trash2 size={13} /></button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {importing && <ImportModal cards={cards} onClose={() => setImporting(false)} />}
      {addingExpense && <ExpenseModal cards={cards} onClose={() => setAddingExpense(false)} />}
      {editingCard && <CardModal card={editingCard.id ? editingCard : null} onClose={() => setEditingCard(null)} />}
    </div>
  )
}
