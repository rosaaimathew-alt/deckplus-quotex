// ── Bills ────────────────────────────────────────────────────────────────────
// What vendors bill us. Tie a bill to its PO (and so its job), straight to a
// job, or to company overhead (operating / subscription / inventory) — the
// fixed and operating costs the CFO tracks.
import { useMemo, useState } from 'react'
import { Plus, CheckSquare, Trash2 } from 'lucide-react'
import { useStore } from '../../store'
import {
  OVERHEAD_BUCKETS, PO_TYPES, money, shortDate, todayISO, addDays, jobIndex, jobLabel, billBalance, billStatus,
  poAllocations, dueSummary, downloadCsv,
} from '../../lib/books'
import {
  StatusPill, DueBanner, SearchBox, DateRange, ExportButton, usePaged, Th, sortRows, Modal, Field, Combo,
  useJobOptions, useVendorList, PaymentsEditor, Empty, inputCls, btnPrimary, btnGhost,
} from './ui'

const STATUS_FILTERS = [['open', 'Unpaid'], ['outstanding', 'Outstanding'], ['overdue', 'Overdue'], ['paid', 'Paid'], ['all', 'All']]

export function BillModal({ bill, presetJobId = null, onClose }) {
  const purchases = useStore(s => s.purchases)
  const bills = useStore(s => s.bills)
  const addBill = useStore(s => s.addBill)
  const updateBill = useStore(s => s.updateBill)
  const deleteBill = useStore(s => s.deleteBill)
  const addBillPayment = useStore(s => s.addBillPayment)
  const removeBillPayment = useStore(s => s.removeBillPayment)
  const jobOptions = useJobOptions()
  const vendorList = useVendorList()
  const vendorOptions = useMemo(() => vendorList.map(v => ({ value: v.ref, label: v.name })), [vendorList])

  const [f, setF] = useState(() => bill ? { ...bill, vendorName: bill.vendorName || '', number: bill.number || '', target: bill.poId != null ? 'po' : bill.jobId != null ? 'job' : 'overhead' } : {
    vendorRef: null, vendorName: '', number: '', date: todayISO(), dueDate: addDays(todayISO(), 30), total: '',
    target: presetJobId != null ? 'job' : 'po', poId: null, jobId: presetJobId, bucket: 'operating', category: '', notes: '',
  })
  const set = (patch) => setF(x => ({ ...x, ...patch }))
  const live = bill ? bills.find(b => b.id === bill.id) || bill : null

  // POs from this vendor first, open ones only (plus the one already linked).
  const poOptions = useMemo(() => purchases
    .filter(p => p.status !== 'void' && (p.status !== 'closed' || String(p.id) === String(f.poId)))
    .filter(p => !f.vendorRef || p.vendorRef === f.vendorRef || String(p.id) === String(f.poId))
    .map(p => ({ value: p.id, label: `PO #${p.number} · ${money(p.amount)}`, sub: `${p.vendorName || ''}${p.items ? ` · ${p.items}` : ''}` })), [purchases, f.vendorRef, f.poId])

  const canSave = Number(f.total) !== 0 && (f.vendorRef || f.vendorName.trim()) &&
    (f.target === 'po' ? f.poId != null : f.target === 'job' ? f.jobId != null : !!f.bucket)

  const save = () => {
    const vendorName = f.vendorRef ? (vendorList.find(v => v.ref === f.vendorRef)?.name || f.vendorName) : f.vendorName.trim()
    const po = f.target === 'po' ? purchases.find(p => String(p.id) === String(f.poId)) : null
    const allocs = po ? poAllocations(po) : []
    const rec = {
      vendorRef: f.vendorRef, vendorName, number: f.number.trim(), date: f.date, dueDate: f.dueDate || f.date, total: Number(f.total) || 0,
      poId: po ? po.id : null, poNumber: po ? po.number : null,
      // A PO's single job carries over so the bill shows on that job.
      jobId: f.target === 'job' ? f.jobId : (allocs.length === 1 ? allocs[0].jobId : null),
      type: f.target === 'job' ? (f.type || 'materials') : null,
      bucket: f.target === 'overhead' ? f.bucket : null, category: String(f.category || '').trim(), notes: f.notes,
    }
    if (bill) updateBill(bill.id, rec)
    else addBill(rec)
    onClose()
  }

  return (
    <Modal wide title={bill ? `Bill · ${bill.vendorName || ''}` : 'New bill'} onClose={onClose}
      footer={<>
        {bill && <button onClick={() => { if (window.confirm('Delete this bill?')) { deleteBill(bill.id); onClose() } }} className="mr-auto inline-flex items-center gap-1 text-sm text-red-600 hover:underline"><Trash2 size={14} /> Delete</button>}
        {bill && live?.status !== 'void' && <button onClick={() => { updateBill(bill.id, { status: 'void' }); onClose() }} className={btnGhost}>Void</button>}
        <button onClick={save} disabled={!canSave} className={btnPrimary}>{bill ? 'Save' : 'Add bill'}</button>
      </>}>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Vendor *">
          <Combo options={vendorOptions} value={f.vendorRef} onChange={v => set({ vendorRef: v })} placeholder="Pick a vendor…" />
          {!f.vendorRef && <input value={f.vendorName} onChange={e => set({ vendorName: e.target.value })} placeholder="…or type a one-off vendor name" className={`${inputCls} mt-1.5`} />}
        </Field>
        <Field label="Vendor's invoice #"><input value={f.number} onChange={e => set({ number: e.target.value })} className={inputCls} /></Field>
        <Field label="Bill date"><input type="date" value={f.date} onChange={e => set({ date: e.target.value })} className={inputCls} /></Field>
        <Field label="Due date"><input type="date" value={f.dueDate} onChange={e => set({ dueDate: e.target.value })} className={inputCls} /></Field>
        <Field label="Total *"><input type="number" step="0.01" value={f.total} onChange={e => set({ total: e.target.value })} placeholder="0.00" className={inputCls} /></Field>
        <Field label="Category (optional)"><input value={f.category || ''} onChange={e => set({ category: e.target.value })} placeholder="e.g. Rent, Insurance, Lumber" className={inputCls} /></Field>
      </div>

      <div className="rounded-xl border border-gray-200 p-3 space-y-2">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-max">
          {[['po', 'Against a PO'], ['job', 'Straight to a job'], ['overhead', 'Company overhead']].map(([k, l]) => (
            <button key={k} type="button" onClick={() => set({ target: k })} className={`px-3 py-1 rounded-md text-xs font-medium ${f.target === k ? 'bg-white shadow-sm' : 'text-gray-500'}`}>{l}</button>
          ))}
        </div>
        {f.target === 'po' && <Combo options={poOptions} value={f.poId} onChange={v => set({ poId: v })} placeholder={poOptions.length ? 'Pick the PO…' : 'No open POs for this vendor'} />}
        {f.target === 'job' && (
          <div className="grid sm:grid-cols-[1fr_180px] gap-2">
            <Combo options={jobOptions} value={f.jobId} onChange={v => set({ jobId: v })} placeholder="Pick a job…" />
            <select value={f.type || 'materials'} onChange={e => set({ type: e.target.value })} className={inputCls} aria-label="Cost type">
              {PO_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>
        )}
        {f.target === 'overhead' && (
          <select value={f.bucket || 'operating'} onChange={e => set({ bucket: e.target.value })} className={inputCls} aria-label="Overhead type">
            {OVERHEAD_BUCKETS.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
          </select>
        )}
      </div>
      <Field label="Notes"><textarea rows={2} value={f.notes || ''} onChange={e => set({ notes: e.target.value })} className={inputCls} /></Field>

      {bill && live && (
        <PaymentsEditor payments={live.payments || []} balance={billBalance(live)}
          onAdd={(p) => addBillPayment(bill.id, p)} onRemove={(pid) => removeBillPayment(bill.id, pid)} />
      )}
    </Modal>
  )
}

function PayBillModal({ billId, onClose }) {
  const bill = useStore(s => s.bills.find(b => b.id === billId))
  const addBillPayment = useStore(s => s.addBillPayment)
  const removeBillPayment = useStore(s => s.removeBillPayment)
  if (!bill) return null
  return (
    <Modal title={`Pay · ${bill.vendorName || 'Vendor'}${bill.number ? ` #${bill.number}` : ''}`} onClose={onClose} footer={<button onClick={onClose} className={btnPrimary}>Done</button>}>
      <PaymentsEditor payments={bill.payments || []} balance={billBalance(bill)}
        onAdd={(p) => addBillPayment(bill.id, p)} onRemove={(pid) => removeBillPayment(bill.id, pid)} />
    </Modal>
  )
}

export default function Bills() {
  const bills = useStore(s => s.bills)
  const proposals = useStore(s => s.proposals)
  const byId = useMemo(() => jobIndex(proposals), [proposals])
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('open')
  const [range, setRange] = useState({ from: '', to: '' })
  const [sort, setSort] = useState({ key: 'due', dir: 'asc' })
  const [editing, setEditing] = useState(null)
  const [paying, setPaying] = useState(null)

  const rows = useMemo(() => bills.map(b => {
    const job = byId.get(String(b.jobId))
    const forLabel = [b.poNumber ? `PO #${b.poNumber}` : '', job ? jobLabel(job) : '', !job && b.bucket ? (OVERHEAD_BUCKETS.find(x => x.key === b.bucket)?.label || b.bucket) : ''].filter(Boolean)
    return { bill: b, job, status: billStatus(b), balance: billBalance(b), total: Number(b.total) || 0, dueDate: b.dueDate, forLabel }
  }), [bills, byId])
  const sum = useMemo(() => dueSummary(rows, 7), [rows])

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    const out = rows.filter(r => {
      if (status === 'open' && r.status !== 'outstanding' && r.status !== 'overdue') return false
      if (!['open', 'all'].includes(status) && r.status !== status) return false
      if (range.from && (r.bill.date || '') < range.from) return false
      if (range.to && (r.bill.date || '') > range.to) return false
      if (s && ![r.bill.vendorName, r.bill.number, r.bill.poNumber, r.bill.category, r.job?.client].some(v => String(v || '').toLowerCase().includes(s))) return false
      return true
    })
    return sortRows(out, sort, { due: r => r.bill.dueDate || '', date: r => r.bill.date || '', balance: r => r.balance, total: r => r.total, vendor: r => r.bill.vendorName || '' })
  }, [rows, q, status, range, sort])
  const { slice, pager } = usePaged(shown)

  const exportCsv = () => downloadCsv(`bills-${todayISO()}.csv`, [
    ['Status', r => r.status], ['Due date', r => r.bill.dueDate], ['Bill date', r => r.bill.date], ['Vendor', r => r.bill.vendorName],
    ['Vendor invoice #', r => r.bill.number], ['PO #', r => r.bill.poNumber], ['Job', r => r.job?.client], ['Overhead', r => r.bill.bucket], ['Category', r => r.bill.category],
    ['Total', r => r.total.toFixed(2)], ['Paid', r => (r.total - r.balance).toFixed(2)], ['Balance', r => r.balance.toFixed(2)],
  ], shown)

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-4">
      <DueBanner sum={sum} soonLabel="Due within 7 days" />
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={q} onChange={setQ} placeholder="Search vendor, #, job" />
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {STATUS_FILTERS.map(([k, l]) => (
            <button key={k} onClick={() => setStatus(k)} className={`px-2.5 py-1 rounded-lg text-xs font-medium ${status === k ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>{l}</button>
          ))}
        </div>
        <DateRange from={range.from} to={range.to} label="Bill date" onChange={(from, to) => setRange({ from, to })} />
        <div className="flex-1" />
        <ExportButton onClick={exportCsv} />
        <button onClick={() => setEditing('new')} className={btnPrimary}><Plus size={15} /> New bill</button>
      </div>

      {shown.length === 0 ? <Empty>{bills.length ? 'No bills match.' : 'No bills yet.'}</Empty> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead className="border-b border-gray-200 text-left">
              <tr>
                <Th>Status</Th>
                <Th sortKey="due" sort={sort} setSort={setSort}>Due date</Th>
                <Th sortKey="date" sort={sort} setSort={setSort}>Bill date</Th>
                <Th sortKey="balance" sort={sort} setSort={setSort} className="text-right">Balance</Th>
                <Th sortKey="total" sort={sort} setSort={setSort} className="text-right">Total</Th>
                <Th sortKey="vendor" sort={sort} setSort={setSort}>Payee / vendor</Th>
                <Th>PO # / for</Th>
                <Th>Invoice #</Th>
                <Th>&nbsp;</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {slice.map(r => (
                <tr key={r.bill.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setEditing(r.bill)}>
                  <td className="px-3 py-2.5"><StatusPill status={r.status} /></td>
                  <td className="px-3 py-2.5 text-gray-700">{shortDate(r.bill.dueDate)}</td>
                  <td className="px-3 py-2.5 text-gray-700">{shortDate(r.bill.date)}</td>
                  <td className="px-3 py-2.5 text-right font-medium">{money(r.balance)}</td>
                  <td className="px-3 py-2.5 text-right text-gray-700">{money(r.total)}</td>
                  <td className="px-3 py-2.5 max-w-[180px] truncate">{r.bill.vendorName || '—'}</td>
                  <td className="px-3 py-2.5 max-w-[220px]">{r.forLabel.map((l, i) => <p key={i} className={`truncate ${i ? 'text-xs text-gray-500' : 'text-gray-800'}`}>{l}</p>)}</td>
                  <td className="px-3 py-2.5 text-gray-600">{r.bill.number || ''}</td>
                  <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                    {(r.status === 'outstanding' || r.status === 'overdue') && (
                      <button onClick={() => setPaying(r.bill.id)} title="Pay bill" aria-label="Pay bill" className="p-1.5 rounded-lg text-[var(--brand-600)] hover:bg-[var(--brand-50)]"><CheckSquare size={18} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-end px-3 py-2 border-t border-gray-100">{pager}</div>
        </div>
      )}
      {editing && <BillModal bill={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {paying && <PayBillModal billId={paying} onClose={() => setPaying(null)} />}
    </div>
  )
}
