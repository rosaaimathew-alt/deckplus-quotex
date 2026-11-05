// ── Shared pieces for the Money pages (Invoices, Bills, Purchases, Vendors) ──
import { useMemo, useRef, useState, useEffect } from 'react'
import { X, Search, Download, ChevronLeft, ChevronRight, Calendar } from 'lucide-react'
import { useStore } from '../../store'
import { STATUS_STYLE, money, isBooksJob, jobLabel, allVendors } from '../../lib/books'

export const inputCls = 'w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[var(--brand-200)]'
export const labelCls = 'text-[11px] font-semibold text-gray-500 uppercase tracking-wider block mb-1'
export const btnPrimary = 'inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white shadow-sm bg-[var(--brand-600)] hover:bg-[var(--brand-700)] disabled:opacity-40 transition-colors'
export const btnGhost = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors'

export function StatusPill({ status, className = '' }) {
  const st = STATUS_STYLE[status] || { label: status, cls: 'bg-gray-100 text-gray-600' }
  return <span className={`inline-flex items-center justify-center text-xs font-semibold rounded-md px-2.5 py-1 min-w-[92px] ${st.cls} ${className}`}>{st.label}</span>
}

// Outstanding / due soon / overdue strip.
export function DueBanner({ sum, soonLabel }) {
  const cell = (label, amt, count, tone) => (
    <div className="text-center px-2">
      <p className="text-sm text-gray-700">{label}</p>
      <p className={`text-lg font-bold ${tone}`}>{money(amt)} <span className="text-sm font-medium">({count})</span></p>
    </div>
  )
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl border border-amber-300 bg-amber-50/70 px-4 py-3">
      {cell('Outstanding', sum.outstanding, sum.outstandingCount, 'text-amber-600')}
      {cell(soonLabel, sum.dueSoon, sum.dueSoonCount, 'text-amber-600')}
      {cell('Overdue', sum.overdue, sum.overdueCount, 'text-red-600')}
    </div>
  )
}

export function SearchBox({ value, onChange, placeholder = 'Search' }) {
  return (
    <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 bg-white w-full sm:w-64">
      <Search size={14} className="text-gray-400 shrink-0" />
      <input className="flex-1 text-sm bg-transparent outline-none placeholder:text-gray-400 min-w-0" placeholder={placeholder}
        value={value} onChange={e => onChange(e.target.value)} aria-label={placeholder} />
      {value && <button onClick={() => onChange('')} className="text-gray-300 hover:text-gray-500" aria-label="Clear search"><X size={13} /></button>}
    </div>
  )
}

export function DateRange({ from, to, onChange, label = 'Date' }) {
  return (
    <div className="flex items-center gap-1.5 border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-sm text-gray-600">
      <Calendar size={14} className="text-gray-400" />
      <span className="text-xs text-gray-400 hidden sm:inline">{label}</span>
      <input type="date" value={from} onChange={e => onChange(e.target.value, to)} aria-label={`${label} from`} className="bg-transparent outline-none text-xs w-[118px]" />
      <span className="text-gray-300">–</span>
      <input type="date" value={to} onChange={e => onChange(from, e.target.value)} aria-label={`${label} to`} className="bg-transparent outline-none text-xs w-[118px]" />
      {(from || to) && <button onClick={() => onChange('', '')} className="text-gray-300 hover:text-gray-500" aria-label="Clear dates"><X size={12} /></button>}
    </div>
  )
}

export function ExportButton({ onClick, label = 'Export to Excel' }) {
  return <button onClick={onClick} className={btnGhost}><Download size={14} /> {label}</button>
}

// Paged rows: 50 a page, with "1–50 of 2,966" and arrows.
export function usePaged(rows, size = 50) {
  const [page, setPage] = useState(0)
  const pages = Math.max(1, Math.ceil(rows.length / size))
  const p = Math.min(page, pages - 1)
  const slice = rows.slice(p * size, p * size + size)
  const pager = (
    <div className="flex items-center gap-2 text-sm text-gray-500">
      <span>{rows.length ? `${p * size + 1}–${Math.min(rows.length, p * size + size)} of ${rows.length.toLocaleString()}` : '0 of 0'}</span>
      <button onClick={() => setPage(Math.max(0, p - 1))} disabled={p === 0} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30" aria-label="Previous page"><ChevronLeft size={16} /></button>
      <button onClick={() => setPage(Math.min(pages - 1, p + 1))} disabled={p >= pages - 1} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30" aria-label="Next page"><ChevronRight size={16} /></button>
    </div>
  )
  return { slice, pager, reset: () => setPage(0) }
}

// Sortable header cell.
export function Th({ children, sortKey, sort, setSort, className = '' }) {
  if (!sortKey) return <th className={`px-3 py-2.5 text-xs font-semibold text-gray-500 ${className}`}>{children}</th>
  const on = sort.key === sortKey
  return (
    <th className={`px-3 py-2.5 text-xs font-semibold ${on ? 'text-gray-900' : 'text-gray-500'} ${className}`}>
      <button onClick={() => setSort({ key: sortKey, dir: on && sort.dir === 'desc' ? 'asc' : 'desc' })} className="inline-flex items-center gap-1 hover:text-gray-900">
        {children}<span className="text-[10px] text-[var(--brand-600)]">{on ? (sort.dir === 'desc' ? '▼' : '▲') : ''}</span>
      </button>
    </th>
  )
}
export function sortRows(rows, sort, getters) {
  const g = getters[sort.key]
  if (!g) return rows
  const dir = sort.dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const x = g(a), y = g(b)
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir
    return String(x ?? '').localeCompare(String(y ?? '')) * dir
  })
}

export function Modal({ title, onClose, children, footer, wide = false }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} my-4`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <p className="font-semibold text-gray-900">{title}</p>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400" aria-label="Close"><X size={17} /></button>
        </div>
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2 flex-wrap">{footer}</div>}
      </div>
    </div>
  )
}

export function Field({ label, children, className = '' }) {
  return <div className={className}><label className={labelCls}>{label}</label>{children}</div>
}

// Type-to-search picker: works with 1,000+ jobs or 400 vendors.
export function Combo({ options, value, onChange, placeholder, allowNone = false, noneLabel = 'None' }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const box = useRef(null)
  const current = options.find(o => String(o.value) === String(value))
  useEffect(() => {
    if (!open) return
    const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (s ? options.filter(o => `${o.label} ${o.sub || ''}`.toLowerCase().includes(s)) : options).slice(0, 60)
  }, [options, q])
  return (
    <div className="relative" ref={box}>
      <button type="button" onClick={() => { setOpen(o => !o); setQ('') }}
        className={`${inputCls} text-left truncate ${current ? 'text-gray-900' : 'text-gray-400'}`}>
        {current ? current.label : placeholder}
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Type to search…"
            className="w-full text-sm px-3 py-2 border-b border-gray-100 outline-none" />
          <div className="max-h-64 overflow-y-auto">
            {allowNone && <button type="button" onClick={() => { onChange(null); setOpen(false) }} className="w-full text-left px-3 py-2 text-sm text-gray-500 hover:bg-gray-50">{noneLabel}</button>}
            {shown.map(o => (
              <button type="button" key={o.value} onClick={() => { onChange(o.value); setOpen(false) }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${String(o.value) === String(value) ? 'bg-[var(--brand-50)] text-[var(--brand-700)]' : 'text-gray-800'}`}>
                {o.label}{o.sub && <span className="block text-[11px] text-gray-400">{o.sub}</span>}
              </button>
            ))}
            {shown.length === 0 && <p className="px-3 py-3 text-xs text-gray-400">Nothing matches.</p>}
          </div>
        </div>
      )}
    </div>
  )
}

export function useJobOptions() {
  const proposals = useStore(s => s.proposals)
  return useMemo(() => proposals.filter(isBooksJob)
    .map(p => ({ value: p.id, label: jobLabel(p), sub: p.address || '' }))
    .sort((a, b) => a.label.localeCompare(b.label)), [proposals])
}

export function useVendorList() {
  const vendors = useStore(s => s.vendors)
  const subs = useStore(s => s.subcontractors)
  return useMemo(() => allVendors(vendors || [], subs || []), [vendors, subs])
}

// Payments list + "record a payment" row, used by invoices and bills.
export function PaymentsEditor({ payments, balance, onAdd, onRemove, methodDefault = 'Check' }) {
  const [p, setP] = useState({ date: new Date().toISOString().slice(0, 10), amount: '', method: methodDefault, note: '' })
  const add = () => {
    if (!(Number(p.amount) > 0)) return
    onAdd({ ...p, amount: Number(p.amount) })
    setP({ ...p, amount: '', note: '' })
  }
  return (
    <div className="border border-gray-200 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-800">Payments</p>
        <p className="text-xs text-gray-500">Balance <span className={`font-semibold ${balance > 0 ? 'text-amber-700' : 'text-green-700'}`}>{money(balance)}</span></p>
      </div>
      {payments.length === 0 && <p className="text-xs text-gray-400">No payments yet.</p>}
      {payments.map(x => (
        <div key={x.id} className="flex items-center gap-2 text-sm bg-gray-50 rounded-lg px-3 py-1.5">
          <span className="text-gray-500 w-20">{x.date}</span>
          <span className="font-semibold text-gray-800">{money(x.amount)}</span>
          <span className="text-gray-500 flex-1 truncate">{x.method}{x.note ? ` · ${x.note}` : ''}</span>
          {onRemove && <button onClick={() => onRemove(x.id)} className="text-gray-300 hover:text-red-500" aria-label="Remove payment"><X size={13} /></button>}
        </div>
      ))}
      <div className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_1fr_auto] gap-2 pt-1">
        <input type="date" value={p.date} onChange={e => setP({ ...p, date: e.target.value })} className={inputCls} aria-label="Payment date" />
        <input type="number" step="0.01" placeholder={balance > 0 ? String(balance) : 'Amount'} value={p.amount} onChange={e => setP({ ...p, amount: e.target.value })} className={inputCls} aria-label="Payment amount" />
        <select value={p.method} onChange={e => setP({ ...p, method: e.target.value })} className={inputCls} aria-label="Payment method">
          {['Check', 'ACH', 'Card', 'Cash', 'Financing', 'Other'].map(m => <option key={m}>{m}</option>)}
        </select>
        <button type="button" onClick={add} disabled={!(Number(p.amount) > 0)} className={btnPrimary}>Record</button>
      </div>
      {balance > 0 && <button type="button" onClick={() => setP({ ...p, amount: String(balance) })} className="text-xs text-[var(--brand-700)] hover:underline">Pay full balance</button>}
    </div>
  )
}

export const Empty = ({ children }) => (
  <div className="bg-white rounded-2xl border border-dashed border-gray-200 py-14 text-center text-sm text-gray-400">{children}</div>
)
