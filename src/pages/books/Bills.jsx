// ── Bills ────────────────────────────────────────────────────────────────────
// What vendors bill us. Tie a bill to its PO (and so its job), straight to a
// job, or to company overhead (operating / subscription / inventory) — the
// fixed and operating costs the CFO tracks.
import FitTable from '../../components/FitTable'
import { useMemo, useState } from 'react'
import { Plus, CheckSquare, Trash2, Printer } from 'lucide-react'
import { useStore } from '../../store'
import SubDrawsReview from './SubDrawsReview'
import JobSplit from './JobSplit'
import { splitPatch, isSplit, splitReady } from '../../lib/split'
import {
  OVERHEAD_BUCKETS, PO_TYPES, money, shortDate, todayISO, addDays, jobIndex, jobLabel, billBalance, billStatus,
  poAllocations, dueSummary, downloadCsv,
} from '../../lib/books'
import {
  StatusPill, DueBanner, SearchBox, usePaged, Th, sortRows, Modal, Field, Combo,
  useJobOptions, useVendorList, PaymentsEditor, Empty, inputCls, btnPrimary, btnGhost,
  PageHead, Toolbar, DateButton, FilterButton, FilterGroup, StatusCell, RowIcon, XlsButton, viewReport, btnHead, btnHeadPrimary, jobName, jobStreet,
} from './ui'

const STATUS_FILTERS = [['open', 'Unpaid'], ['outstanding', 'Outstanding'], ['overdue', 'Overdue'], ['paid', 'Paid'], ['all', 'All']]
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

// One bill on a page of its own, for the paper file (same look as a printed invoice).
function printBill(b, job, branding = {}) {
  const total = Number(b.total) || 0, balance = billBalance(b), pays = b.payments || []
  const forWhat = [b.poNumber ? `PO #${b.poNumber}` : '', job ? jobLabel(job) : '', !job && b.bucket ? (OVERHEAD_BUCKETS.find(x => x.key === b.bucket)?.label || b.bucket) : '', b.category || ''].filter(Boolean)
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Bill ${esc(b.vendorName || '')}${b.number ? ` #${esc(b.number)}` : ''}</title>
  <style>body{font:14px/1.45 system-ui,sans-serif;color:#111;margin:40px;max-width:760px}h1{font-size:28px;margin:0}
  table{width:100%;border-collapse:collapse;margin-top:24px}td,th{padding:8px 6px;border-bottom:1px solid #e5e7eb;text-align:left}
  th{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280}.r{text-align:right}.muted{color:#6b7280}
  .top{display:flex;justify-content:space-between;gap:24px}.tot td{border:0;padding:4px 6px}</style></head><body>
  <div class="top"><div>${branding.logo ? `<img src="${esc(branding.logo)}" style="height:56px"><br>` : ''}<strong>${esc(branding.companyName || '')}</strong></div>
  <div style="text-align:right"><h1>Bill</h1>${b.number ? `<div class="muted">Vendor invoice #${esc(b.number)}</div>` : ''}
  <div>Bill date: ${esc(shortDate(b.date))}</div><div>Due: ${esc(shortDate(b.dueDate))}</div><div>Status: ${esc(billStatus(b))}</div></div></div>
  <p style="margin-top:28px"><span class="muted">Payee / vendor</span><br><strong>${esc(b.vendorName || '')}</strong></p>
  ${forWhat.length ? `<p><span class="muted">For</span><br>${forWhat.map(esc).join('<br>')}${job?.address ? `<br><span class="muted">${esc(job.address)}</span>` : ''}</p>` : ''}
  ${pays.length ? `<table><thead><tr><th>Payment date</th><th>Method</th><th class="r">Amount</th></tr></thead><tbody>
  ${pays.map(p => `<tr><td>${esc(shortDate(p.date))}</td><td>${esc(p.method || '')}</td><td class="r">${esc(money(p.amount))}</td></tr>`).join('')}</tbody></table>` : ''}
  <table class="tot" style="width:280px;margin-left:auto;margin-top:12px">
  <tr><td>Total</td><td class="r"><strong>${esc(money(total))}</strong></td></tr>
  <tr><td>Paid</td><td class="r">${esc(money(total - balance))}</td></tr>
  <tr><td>Balance</td><td class="r"><strong>${esc(money(balance))}</strong></td></tr></table>
  ${b.notes ? `<p class="muted" style="margin-top:28px;white-space:pre-wrap">${esc(b.notes)}</p>` : ''}
  <script>window.onload=()=>window.print()</script></body></html>`)
  w.document.close()
}

// presetPo: "Enter bill" from a purchase order (Purchases › clipboard).
export function BillModal({ bill, presetJobId = null, presetPo = null, onClose }) {
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
    vendorRef: presetPo?.vendorRef || null, vendorName: presetPo?.vendorName || '', number: '', date: todayISO(), dueDate: addDays(todayISO(), 30), total: presetPo ? (Number(presetPo.amount) || '') : '',
    target: presetJobId != null && !presetPo ? 'job' : 'po', poId: presetPo ? presetPo.id : null, jobId: presetJobId, bucket: 'operating', category: '', notes: '',
  })
  const set = (patch) => setF(x => ({ ...x, ...patch }))
  // One bill shared by several jobs (a dump run for three): a row per job with its amount
  const [splitRows, setSplitRows] = useState(() => (isSplit(bill) ? bill.splits.map(r => ({ ...r })) : null))
  const live = bill ? bills.find(b => b.id === bill.id) || bill : null
  const branding = useStore(s => s.branding)
  const proposals = useStore(s => s.proposals)

  // POs from this vendor first, open ones only (plus the one already linked).
  const poOptions = useMemo(() => purchases
    .filter(p => p.status !== 'void' && (p.status !== 'closed' || String(p.id) === String(f.poId)))
    .filter(p => !f.vendorRef || p.vendorRef === f.vendorRef || String(p.id) === String(f.poId))
    .map(p => ({ value: p.id, label: `PO #${p.number} · ${money(p.amount)}`, sub: `${p.vendorName || ''}${p.items ? ` · ${p.items}` : ''}` })), [purchases, f.vendorRef, f.poId])

  const canSave = Number(f.total) !== 0 && (f.vendorRef || f.vendorName.trim()) &&
    (f.target === 'po' ? f.poId != null
      : f.target === 'job' ? (splitRows ? splitReady(splitRows, f.total) : f.jobId != null)
      : !!f.bucket)

  const save = () => {
    const vendorName = f.vendorRef ? (vendorList.find(v => v.ref === f.vendorRef)?.name || f.vendorName) : f.vendorName.trim()
    const po = f.target === 'po' ? purchases.find(p => String(p.id) === String(f.poId)) : null
    const allocs = po ? poAllocations(po) : []
    const rec = {
      vendorRef: f.vendorRef, vendorName, number: f.number.trim(), date: f.date, dueDate: f.dueDate || f.date, total: Number(f.total) || 0,
      poId: po ? po.id : null, poNumber: po ? po.number : null,
      // A PO's single job carries over so the bill shows on that job.
      jobId: f.target === 'job' ? f.jobId : (allocs.length === 1 ? allocs[0].jobId : null), splits: null,
      ...(f.target === 'job' && splitRows ? splitPatch(splitRows) : {}),
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
        {bill && <button onClick={() => printBill(live, jobIndex(proposals).get(String(live.jobId)), branding)} className={btnGhost}><Printer size={14} /> Print</button>}
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
        {f.target === 'job' && splitRows && (
          <div className="space-y-2">
            <JobSplit rows={splitRows} setRows={setSplitRows} total={f.total} jobOptions={jobOptions} />
            <div className="flex items-center gap-3">
              <select value={f.type || 'materials'} onChange={e => set({ type: e.target.value })} className={`${inputCls} sm:w-[180px]`} aria-label="Cost type">
                {PO_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
              <button type="button" onClick={() => { set({ jobId: splitRows.find(r => r.jobId != null)?.jobId ?? null }); setSplitRows(null) }} className="text-xs text-gray-500 hover:underline whitespace-nowrap">One job only</button>
            </div>
          </div>
        )}
        {f.target === 'job' && !splitRows && (
          <div className="grid sm:grid-cols-[1fr_180px] gap-2">
            <button type="button" onClick={() => setSplitRows([{ jobId: f.jobId, amount: f.total || '' }, { jobId: null, amount: '' }])}
              className="sm:col-span-2 order-last justify-self-start text-xs text-[var(--brand-700)] hover:underline">Split across jobs</button>
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
  const branding = useStore(s => s.branding)
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
    return { bill: b, job, jobName: jobName(job), street: jobStreet(job), status: billStatus(b), balance: billBalance(b), total: Number(b.total) || 0, dueDate: b.dueDate, forLabel }
  }), [bills, byId])
  const sum = useMemo(() => dueSummary(rows, 7), [rows])

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    const out = rows.filter(r => {
      if (status === 'open' && r.status !== 'outstanding' && r.status !== 'overdue') return false
      if (!['open', 'all'].includes(status) && r.status !== status) return false
      if (range.from && (r.bill.date || '') < range.from) return false
      if (range.to && (r.bill.date || '') > range.to) return false
      if (s && ![r.bill.vendorName, r.bill.number, r.bill.poNumber, r.bill.category, r.jobName, r.street, r.job?.client].some(v => String(v || '').toLowerCase().includes(s))) return false
      return true
    })
    return sortRows(out, sort, { due: r => r.bill.dueDate || '', date: r => r.bill.date || '', balance: r => r.balance, total: r => r.total, vendor: r => r.bill.vendorName || '', job: r => r.jobName })
  }, [rows, q, status, range, sort])
  const { slice, pager } = usePaged(shown)

  const exportCsv = () => downloadCsv(`bills-${todayISO()}.csv`, [
    ['Status', r => r.status], ['Due date', r => r.bill.dueDate], ['Bill date', r => r.bill.date], ['Vendor', r => r.bill.vendorName],
    ['Vendor invoice #', r => r.bill.number], ['PO #', r => r.bill.poNumber], ['Job', r => `${r.jobName} ${r.street}`.trim()], ['Client', r => r.job?.client], ['Overhead', r => r.bill.bucket], ['Category', r => r.bill.category],
    ['Total', r => r.total.toFixed(2)], ['Paid', r => (r.total - r.balance).toFixed(2)], ['Balance', r => r.balance.toFixed(2)],
  ], shown)
  const report = () => viewReport('Bills', [
    ['Status', r => r.status], ['Due', r => shortDate(r.bill.dueDate)], ['Bill date', r => shortDate(r.bill.date)], ['Vendor', r => r.bill.vendorName],
    ['Job', r => `${r.jobName} ${r.street}`.trim()], ['PO # / for', r => r.forLabel.join(' · ')], ['Invoice #', r => r.bill.number], ['Total', r => r.total], ['Balance', r => r.balance],
  ], shown, ['Total', 'Balance'])

  return (
    <div className="p-4 sm:p-6 lg:px-8 max-w-[1500px] space-y-5">
      <PageHead title="Bills">
        <button onClick={report} className={btnHead}>View report</button>
        <button onClick={() => setEditing('new')} className={btnHeadPrimary}>Add new bill</button>
      </PageHead>
      <DueBanner sum={sum} soonLabel="Due within 7 days" counts={false} />
      <SubDrawsReview />
      <Toolbar
        left={<>
          <SearchBox value={q} onChange={setQ} placeholder="Search" />
          <DateButton label="Invoice date" from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} />
          <FilterButton count={status !== 'open' ? 1 : 0}><FilterGroup title="Status" options={STATUS_FILTERS} value={status} onChange={setStatus} /></FilterButton>
        </>}
        right={<><XlsButton onClick={exportCsv} />{pager}</>} />

      {shown.length === 0 ? <Empty>{bills.length ? 'No bills match.' : 'No bills yet.'}</Empty> : (
        <FitTable cols={[112, 86, 92, 100, 100, '1.3fr', '1.5fr', '1.2fr', '0.8fr', 104]} card={['status', 'sub:Due', 'hide', 'amount', 'hide', 'title', 'long', 'hide', 'hide', 'act']} className="bg-white border border-gray-200 rounded-2xl shadow-sm">
          <table className="w-full text-[15px]">
            <thead className="border-b border-gray-200 text-left">
              <tr>
                <Th className="text-center">Status</Th>
                <Th sortKey="due" sort={sort} setSort={setSort}>Due date</Th>
                <Th sortKey="date" sort={sort} setSort={setSort}>Invoice date</Th>
                <Th sortKey="balance" sort={sort} setSort={setSort} className="text-right">Balance</Th>
                <Th sortKey="total" sort={sort} setSort={setSort} className="text-right">Total</Th>
                <Th sortKey="vendor" sort={sort} setSort={setSort}>Payee/Vendor</Th>
                <Th sortKey="job" sort={sort} setSort={setSort}>Job</Th>
                <Th>PO#/For</Th>
                <Th>Invoice #</Th>
                <Th>&nbsp;</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {slice.map(r => (
                <tr key={r.bill.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setEditing(r.bill)}>
                  <StatusCell status={r.status} />
                  <td className="px-2 text-gray-800">{shortDate(r.bill.dueDate)}</td>
                  <td className="px-2 text-gray-800">{shortDate(r.bill.date)}</td>
                  <td className="px-2 text-right text-gray-900">{money(r.balance)}</td>
                  <td className="px-2 text-right text-gray-900">{money(r.total)}</td>
                  <td className="px-2 max-w-[180px] truncate text-gray-900">{r.bill.vendorName || '—'}</td>
                  <td className="px-2 py-3 whitespace-nowrap"><p className="font-semibold text-gray-900">{r.jobName || '—'}{isSplit(r.bill) && <span className="ml-1 font-normal text-gray-500">+{r.bill.splits.length - 1} job{r.bill.splits.length > 2 ? 's' : ''}</span>}</p><p className="text-gray-600 text-sm">{jobStreet(r.job)}</p></td>
                  <td className="px-2 py-3 max-w-[240px]">{r.forLabel.map((l, i) => <p key={i} className="truncate text-gray-800">{l}</p>)}</td>
                  <td className="px-2 text-gray-800">{r.bill.number || ''}</td>
                  <td className="px-2 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                    {(r.status === 'outstanding' || r.status === 'overdue') && <RowIcon icon={CheckSquare} title="Pay bill" onClick={() => setPaying(r.bill.id)} />}
                    <RowIcon icon={Printer} title="Print bill" onClick={() => printBill(r.bill, r.job, branding)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </FitTable>
      )}
      {editing && <BillModal bill={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {paying && <PayBillModal billId={paying} onClose={() => setPaying(null)} />}
    </div>
  )
}
