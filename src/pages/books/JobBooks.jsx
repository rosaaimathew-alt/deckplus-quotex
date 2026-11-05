// ── One job's books: Summary, Transactions, Documents (Projects › Jobs) ──────
import { useMemo, useRef, useState } from 'react'
import { Plus, Loader, FileText, Folder, Trash2, Smartphone, Search } from 'lucide-react'
import { useStore } from '../../store'
import { PO_TYPES, money, shortDate, todayISO, jobBooks, jobTransactions, downloadCsv } from '../../lib/books'
import { StatusPill, DateRange, ExportButton, btnPrimary, btnGhost } from './ui'
import { InvoiceModal } from './Invoices'
import { PurchaseModal } from './Purchases'
import { BillModal } from './Bills'

function useJobBooks(proposal) {
  const invoices = useStore(s => s.invoices)
  const purchases = useStore(s => s.purchases)
  const bills = useStore(s => s.bills)
  return useMemo(() => ({
    books: jobBooks(proposal, { invoices, purchases, bills }),
    rows: jobTransactions(proposal, { invoices, purchases, bills }),
  }), [proposal, invoices, purchases, bills])
}

export function ProfitRing({ margin, size = 96 }) {
  const pct = margin == null ? 0 : Math.max(0, Math.min(100, margin))
  const tone = margin == null ? '#d1d5db' : margin < 0 ? '#dc2626' : margin < 20 ? '#f59e0b' : '#2563eb'
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90" aria-hidden="true">
        <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5e7eb" strokeWidth="2.6" />
        <circle cx="18" cy="18" r="15.9" fill="none" stroke={tone} strokeWidth="2.6" strokeDasharray={`${pct} ${100 - pct}`} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`font-bold ${size > 80 ? 'text-lg' : 'text-[10px]'} ${margin != null && margin < 0 ? 'text-red-600' : 'text-gray-900'}`}>{margin == null ? '—' : size > 80 ? `${margin.toFixed(margin > -10 && margin < 100 ? 2 : 0)}%` : `${Math.round(margin)}%`}</span>
        {size > 80 && <span className="text-[11px] text-gray-500">Profit</span>}
      </div>
    </div>
  )
}

function Bar({ label, value, max, color, dashed = false }) {
  const w = max > 0 ? Math.max(value ? 1.5 : 0, (Math.abs(value) / max) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-5 bg-gray-50 rounded-sm overflow-hidden">
        <div className={`h-full ${dashed ? 'border border-dashed border-gray-400 bg-transparent' : ''}`} style={{ width: `${w}%`, background: dashed ? undefined : color }} />
      </div>
      <div className="w-40 shrink-0 text-xs"><span className="text-gray-500">{label}</span> <span className="font-semibold text-gray-900">{money(value)}</span></div>
    </div>
  )
}

// ── Summary ──────────────────────────────────────────────────────────────────
export function JobSummary({ proposal }) {
  const { books } = useJobBooks(proposal)
  const max = Math.max(books.revenue, books.invoiced, books.committed, 1)
  const types = PO_TYPES.filter(t => books.committedByType[t.key])
  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <div className="space-y-4">
        <div className="flex items-center gap-5">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 flex-1">
            <div><p className="text-xs text-gray-500">Contract value</p><p className="text-lg font-bold">{money(books.revenue)}</p></div>
            <div><p className="text-xs text-gray-500">Left to bill</p><p className="text-lg font-bold">{money(books.contractBalance)}</p></div>
            <div><p className="text-xs text-gray-500">Current profit / loss</p><p className={`text-lg font-bold ${books.profit < 0 ? 'text-red-600' : ''}`}>{money(books.profit)}</p></div>
            <div><p className="text-xs text-gray-500">Collected</p><p className="text-lg font-bold">{money(books.collected)}</p></div>
          </div>
          <ProfitRing margin={books.margin} />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-800 mb-2">Revenue</p>
          <div className="space-y-1.5">
            <Bar label="Contract" value={books.revenue} max={max} color="#bbf7d0" />
            <Bar label="Invoiced" value={books.invoiced} max={max} color="#4ade80" />
            <Bar label="Paid" value={books.invoicePaid} max={max} color="#15803d" />
          </div>
        </div>
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-800 mb-2">Committed cost <span className="font-bold">{money(books.committed)}</span></p>
        {types.length === 0 ? <p className="text-xs text-gray-400">No purchase orders on this job yet. Add one under Transactions.</p> : (
          <div className="space-y-1.5">
            {types.map(t => <Bar key={t.key} label={t.label} value={books.committedByType[t.key]} max={max} color={t.color} />)}
          </div>
        )}
        <div className="mt-3 text-xs text-gray-500 space-y-0.5">
          <p>Vendors have billed {money(books.billed)} against this job; {money(books.paidOut)} paid.</p>
          <p>Profit here is contract value minus committed cost (purchase orders, plus bills entered straight to the job). The Costs tab also counts card expenses tagged to this job.</p>
        </div>
      </div>
    </div>
  )
}

// ── Transactions ─────────────────────────────────────────────────────────────
const VIEWS = [['all', 'All'], ['invoice', 'Invoices'], ['purchase', 'Purchases'], ['bill', 'Bills']]
export function JobTransactions({ proposal }) {
  const { books, rows } = useJobBooks(proposal)
  const [view, setView] = useState('all')
  const [range, setRange] = useState({ from: '', to: '' })
  const [open, setOpen] = useState(null)   // { kind, rec } | { kind, new: true }
  const shown = rows.filter(r => (view === 'all' || r.kind === view) && (!range.from || (r.date || '') >= range.from) && (!range.to || (r.date || '') <= range.to))
  const c = books.committedByType
  const exportCsv = () => downloadCsv(`${(proposal.client || 'job').replace(/\W+/g, '-')}-transactions-${todayISO()}.csv`, [
    ['Date', r => r.date], ['Type', r => r.type], ['Status', r => r.status], ['Details', r => r.details], ['Total', r => r.total.toFixed(2)], ['To this job', r => (r.toJob == null ? '' : r.toJob.toFixed(2))],
  ], shown)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[['Materials', c.materials, 'w/ open POs'], ['Labor', c.labor, ''], ['Subs', c.sub, 'w/ open POs'], ['Invoices', books.invoiced, 'ex. drafts']].map(([l, v, sub]) => (
          <div key={l}><p className="text-xs text-gray-500">{l}</p><p className="text-base font-bold">{money(v)}</p>{sub && <p className="text-[11px] text-gray-400">{sub}</p>}</div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <DateRange from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} />
        <select value={view} onChange={e => setView(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white" aria-label="Show">
          {VIEWS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <div className="flex-1" />
        <ExportButton onClick={exportCsv} label="Export" />
        <button onClick={() => setOpen({ kind: 'purchase', isNew: true })} className={btnGhost}><Plus size={14} /> PO</button>
        <button onClick={() => setOpen({ kind: 'bill', isNew: true })} className={btnGhost}><Plus size={14} /> Bill</button>
        <button onClick={() => setOpen({ kind: 'invoice', isNew: true })} className={btnPrimary}><Plus size={14} /> Invoice</button>
      </div>
      {shown.length === 0 ? <p className="text-sm text-gray-400 text-center py-8 border border-dashed border-gray-200 rounded-xl">No transactions{view !== 'all' || range.from || range.to ? ' match' : ' on this job yet'}.</p> : (
        <div className="overflow-x-auto border border-gray-200 rounded-xl">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="text-left border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wider">
              <tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Details</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2 text-right">To this job</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {shown.map(r => (
                <tr key={r.key} className="hover:bg-gray-50 cursor-pointer" onClick={() => setOpen({ kind: r.kind, rec: r.rec })}>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{shortDate(r.date)}</td>
                  <td className="px-3 py-2 text-[var(--brand-700)] font-medium">{r.type}</td>
                  <td className="px-3 py-2"><StatusPill status={r.status} className="!min-w-0 !text-[11px]" /></td>
                  <td className="px-3 py-2 text-gray-700 max-w-[320px] truncate">{r.details}</td>
                  <td className="px-3 py-2 text-right">{money(r.total)}</td>
                  <td className={`px-3 py-2 text-right font-semibold ${r.toJob == null ? 'text-gray-400' : r.kind === 'invoice' ? 'text-green-700' : 'text-red-600'}`}>{r.toJob == null ? <span title="Counted on its PO">on PO</span> : money(r.toJob)}{r.split && <span className="block text-[10px] font-normal text-gray-400">split</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open?.kind === 'invoice' && <InvoiceModal invoice={open.isNew ? null : open.rec} presetJobId={proposal.id} onClose={() => setOpen(null)} />}
      {open?.kind === 'purchase' && <PurchaseModal po={open.isNew ? null : open.rec} presetJobId={proposal.id} onClose={() => setOpen(null)} />}
      {open?.kind === 'bill' && <BillModal bill={open.isNew ? null : open.rec} presetJobId={proposal.id} onClose={() => setOpen(null)} />}
    </div>
  )
}

// ── Documents ────────────────────────────────────────────────────────────────
// One place for a job's files, in folders. Older receipts (jobData.receipts)
// show in the Receipts folder. "Share to mobile" puts a file on the job's
// Field mode page for the crew / PM.
export const DOC_FOLDERS = ['Contract', 'Change orders', 'Plans & permits', 'Photos', 'Receipts', 'Other']

// Receipts are job money: left out for someone with job money switched off.
export function jobDocuments(proposal, includeReceipts = true) {
  const jd = proposal.jobData || {}
  return [
    ...(jd.documents || []).filter(d => includeReceipts || d.folder !== 'Receipts'),
    ...(includeReceipts ? (jd.receipts || []) : []).map(r => ({ ...r, folder: 'Receipts', legacyReceipt: true })),
  ]
}

export function JobDocuments({ proposal, showReceipts = true }) {
  const updateJobData = useStore(s => s.updateJobData)
  const jd = proposal.jobData || {}
  const docs = jobDocuments(proposal, showReceipts)
  const folderList = DOC_FOLDERS.filter(f => showReceipts || f !== 'Receipts')
  const [folder, setFolder] = useState('Other')
  const [openFolder, setOpenFolder] = useState(null)
  const [q, setQ] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef(null)

  const onFiles = async (e) => {
    const files = [...(e.target.files || [])]
    if (!files.length) return
    setUploading(true); setError('')
    try {
      const added = []
      for (const file of files) {
        const base64 = await new Promise((resolve, reject) => {
          const r = new FileReader()
          r.onload = () => resolve(String(r.result).split(',')[1])
          r.onerror = reject
          r.readAsDataURL(file)
        })
        const res = await fetch('/api/drive/upload', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pdfBase64: base64, fileName: `${(proposal.client || 'Job').replace(/[^\w ,.-]+/g, '')}-${folder}-${file.name}`, mimeType: file.type || 'application/octet-stream' }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Upload failed')
        added.push({ id: data.fileId || `${Date.now()}${Math.random()}`, name: file.name, link: data.driveLink, mimeType: file.type, folder, shareMobile: false, uploadedAt: new Date().toISOString() })
      }
      updateJobData(proposal.id, { documents: [...(jd.documents || []), ...added] })
    } catch (err) {
      setError(/token|auth|not connected|401|drive/i.test(err.message) ? 'Connect Google Drive in Settings first, then try again.' : err.message)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const patchDoc = (d, patch) => {
    if (d.legacyReceipt) updateJobData(proposal.id, { receipts: (jd.receipts || []).map(r => (r.id === d.id ? { ...r, ...patch } : r)) })
    else updateJobData(proposal.id, { documents: (jd.documents || []).map(x => (x.id === d.id ? { ...x, ...patch } : x)) })
  }
  const removeDoc = (d) => {
    if (!window.confirm(`Remove "${d.name}" from the job? (The file stays in your Drive.)`)) return
    if (d.legacyReceipt) updateJobData(proposal.id, { receipts: (jd.receipts || []).filter(r => r.id !== d.id) })
    else updateJobData(proposal.id, { documents: (jd.documents || []).filter(x => x.id !== d.id) })
  }

  const s = q.trim().toLowerCase()
  const folders = folderList.map(f => ({ name: f, files: docs.filter(d => (d.folder || 'Other') === f) })).filter(f => f.files.length)
  const visible = s ? docs.filter(d => String(d.name).toLowerCase().includes(s)) : openFolder ? docs.filter(d => (d.folder || 'Other') === openFolder) : null

  const fileRow = (d) => (
    <div key={`${d.legacyReceipt ? 'r' : 'd'}${d.id}`} className="flex items-center gap-3 px-3 py-2 bg-gray-50 rounded-lg group">
      <FileText size={15} className="text-gray-400 shrink-0" />
      <div className="flex-1 min-w-0">
        {d.link ? <a href={d.link} target="_blank" rel="noopener noreferrer" className="text-sm text-gray-800 hover:underline truncate block">{d.name}</a> : <p className="text-sm text-gray-800 truncate">{d.name}</p>}
        <p className="text-[11px] text-gray-400">{shortDate(d.uploadedAt)}{s ? ` · ${d.folder || 'Other'}` : ''}</p>
      </div>
      <select value={d.folder || 'Other'} onChange={e => patchDoc(d, { folder: e.target.value })} disabled={d.legacyReceipt} className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white" aria-label="Folder">
        {folderList.map(f => <option key={f}>{f}</option>)}
      </select>
      <label className="flex items-center gap-1 text-xs text-gray-500 shrink-0" title="Show on the job in Field mode">
        <input type="checkbox" checked={!!d.shareMobile} onChange={e => patchDoc(d, { shareMobile: e.target.checked })} />
        <Smartphone size={13} /> <span className="hidden sm:inline">Mobile</span>
      </label>
      <button onClick={() => removeDoc(d)} className="text-gray-300 hover:text-red-500 shrink-0" aria-label={`Remove ${d.name}`}><Trash2 size={14} /></button>
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-1.5 bg-white w-full sm:w-56">
          <Search size={13} className="text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter by name" className="flex-1 text-sm outline-none bg-transparent" aria-label="Filter documents by name" />
        </div>
        <div className="flex-1" />
        <select value={folder} onChange={e => setFolder(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white" aria-label="Upload into folder">
          {folderList.map(f => <option key={f}>{f}</option>)}
        </select>
        <input ref={fileRef} type="file" multiple onChange={onFiles} className="hidden" />
        <button onClick={() => fileRef.current?.click()} disabled={uploading} className={btnPrimary}>
          {uploading ? <Loader size={14} className="animate-spin" /> : <Plus size={14} />} {uploading ? 'Uploading…' : 'Upload files'}
        </button>
      </div>
      {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      {docs.length === 0 && <p className="text-center py-8 text-sm text-gray-400 border border-dashed border-gray-200 rounded-xl">No documents yet. Upload contracts, plans, photos or receipts — they're stored in your Google Drive.</p>}
      {visible ? (
        <div className="space-y-1.5">
          {!s && <button onClick={() => setOpenFolder(null)} className="text-xs text-[var(--brand-700)] hover:underline">← All folders</button>}
          {visible.length ? visible.map(fileRow) : <p className="text-sm text-gray-400">No files match.</p>}
        </div>
      ) : (
        <div className="space-y-1.5">
          {folders.map(f => (
            <button key={f.name} onClick={() => setOpenFolder(f.name)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 border border-gray-100 text-left">
              <Folder size={18} className="text-sky-500 shrink-0" fill="currentColor" />
              <span className="flex-1 text-sm font-medium text-gray-800">{f.name}</span>
              <span className="text-xs text-gray-400">{f.files.length} file{f.files.length === 1 ? '' : 's'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
