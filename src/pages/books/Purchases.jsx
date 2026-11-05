// ── Purchases (purchase orders) ──────────────────────────────────────────────
// Money committed to a vendor: materials, subs, labor, equipment, commissions.
// A PO can be split across several jobs; with no job it's company spend
// (operating / inventory), which feeds fixed-cost tracking.
import { useMemo, useState } from 'react'
import { Plus, Mail, X, Trash2, Split, ClipboardList, Network } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { BillModal } from './Bills'
import { useStore } from '../../store'
import {
  PO_TYPES, OVERHEAD_BUCKETS, poTypeLabel, money, shortDate, todayISO, jobIndex, jobLabel, poAllocations,
  poBilled, nextPoNumber, downloadCsv,
} from '../../lib/books'
import {
  StatusPill, SearchBox, usePaged, Th, sortRows, Modal, Field, Combo,
  useJobOptions, useVendorList, Empty, inputCls, btnPrimary, btnGhost,
  PageHead, Toolbar, DateButton, FilterButton, FilterGroup, StatusCell, RowIcon, XlsButton, viewReport, btnHead, btnHeadPrimary,
} from './ui'

export function PurchaseModal({ po, presetJobId, onClose }) {
  const purchases = useStore(s => s.purchases)
  const bills = useStore(s => s.bills)
  const me = useStore(s => s.me)
  const addPurchase = useStore(s => s.addPurchase)
  const updatePurchase = useStore(s => s.updatePurchase)
  const deletePurchase = useStore(s => s.deletePurchase)
  const jobOptions = useJobOptions()
  const vendorList = useVendorList()
  const vendorOptions = useMemo(() => vendorList.map(v => ({ value: v.ref, label: v.name, sub: v.trade || (v.type === 'sub' ? 'Subcontractor' : '') })), [vendorList])

  const [f, setF] = useState(() => po ? {
    ...po, vendorName: po.vendorName || '', items: po.items || '',
    allocations: poAllocations(po).length ? poAllocations(po).map(a => ({ ...a })) : [{ jobId: null, amount: '' }],
    forJob: poAllocations(po).length > 0 || !po.bucket,
  } : {
    number: nextPoNumber(purchases), date: todayISO(), vendorRef: null, vendorName: '', type: 'materials', items: '', amount: '',
    allocations: [{ jobId: presetJobId ?? null, amount: '' }], forJob: true, bucket: 'operating', status: 'open', notes: '',
  })
  const set = (patch) => setF(x => ({ ...x, ...patch }))
  const split = f.allocations.length > 1
  const allocTotal = f.allocations.reduce((s, a) => s + (Number(a.amount) || 0), 0)
  const amount = Number(f.amount) || 0
  const allocOk = !f.forJob || (f.allocations.every(a => a.jobId != null) && (!split || Math.abs(allocTotal - amount) < 0.01))
  const canSave = amount !== 0 && (f.vendorRef || f.vendorName.trim()) && allocOk
  const billed = po ? poBilled(po, bills) : 0

  const save = (status = f.status) => {
    const vendorName = f.vendorRef ? (vendorList.find(v => v.ref === f.vendorRef)?.name || f.vendorName) : f.vendorName.trim()
    const allocations = f.forJob ? (split ? f.allocations.map(a => ({ jobId: a.jobId, amount: Number(a.amount) || 0 })) : [{ jobId: f.allocations[0].jobId, amount }]) : []
    const rec = { number: String(f.number).trim(), date: f.date, vendorRef: f.vendorRef, vendorName, type: f.type, items: f.items.trim(),
      amount, allocations, jobId: null, bucket: f.forJob ? null : f.bucket, status, notes: f.notes }
    if (po) updatePurchase(po.id, rec)
    else addPurchase({ ...rec, enteredBy: me?.displayName || me?.email || 'Office' })
    onClose()
  }

  return (
    <Modal wide title={po ? `PO #${po.number}` : 'New purchase order'} onClose={onClose}
      footer={<>
        {po && <button onClick={() => { if (window.confirm('Delete this PO for good? (Void keeps it in history.)')) { deletePurchase(po.id); onClose() } }} className="mr-auto inline-flex items-center gap-1 text-sm text-red-600 hover:underline"><Trash2 size={14} /> Delete</button>}
        {po && f.status !== 'void' && <button onClick={() => save('void')} className={btnGhost}>Void</button>}
        {po && f.status === 'open' && <button onClick={() => save('closed')} className={btnGhost}>Close PO</button>}
        <button onClick={() => save(f.status === 'void' ? 'open' : f.status)} disabled={!canSave} className={btnPrimary}>{po ? 'Save' : 'Create PO'}</button>
      </>}>
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label="PO #"><input value={f.number} onChange={e => set({ number: e.target.value })} className={inputCls} /></Field>
        <Field label="Date"><input type="date" value={f.date} onChange={e => set({ date: e.target.value })} className={inputCls} /></Field>
        <Field label="Type">
          <select value={f.type} onChange={e => set({ type: e.target.value })} className={inputCls}>
            {PO_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label={f.type === 'commission' ? 'Paid to (rep)' : 'Vendor *'}>
          {f.type === 'commission'
            ? <input value={f.vendorName} onChange={e => set({ vendorName: e.target.value, vendorRef: null })} placeholder="Sales rep's name" className={inputCls} />
            : <Combo options={vendorOptions} value={f.vendorRef} onChange={v => set({ vendorRef: v })} placeholder="Pick a vendor…" />}
          {f.type !== 'commission' && !f.vendorRef && (
            <input value={f.vendorName} onChange={e => set({ vendorName: e.target.value })} placeholder="…or type a one-off vendor name" className={`${inputCls} mt-1.5`} />
          )}
        </Field>
        <Field label="Amount *"><input type="number" step="0.01" value={f.amount} onChange={e => set({ amount: e.target.value })} placeholder="0.00" className={inputCls} /></Field>
      </div>
      <Field label="Items"><input value={f.items} onChange={e => set({ items: e.target.value })} placeholder={f.type === 'commission' ? 'Commission - Final payment' : 'e.g. supply material, Trex Transcend 16′'} className={inputCls} /></Field>

      <div className="rounded-xl border border-gray-200 p-3 space-y-2">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-max">
          <button type="button" onClick={() => set({ forJob: true })} className={`px-3 py-1 rounded-md text-xs font-medium ${f.forJob ? 'bg-white shadow-sm' : 'text-gray-500'}`}>For a job</button>
          <button type="button" onClick={() => set({ forJob: false })} className={`px-3 py-1 rounded-md text-xs font-medium ${!f.forJob ? 'bg-white shadow-sm' : 'text-gray-500'}`}>Company spend</button>
        </div>
        {f.forJob ? (
          <>
            {f.allocations.map((a, i) => (
              <div key={i} className={`grid gap-2 ${split ? 'grid-cols-[1fr_120px_auto]' : 'grid-cols-1'}`}>
                <Combo options={jobOptions} value={a.jobId} onChange={v => set({ allocations: f.allocations.map((x, j) => (j === i ? { ...x, jobId: v } : x)) })} placeholder="Pick a job…" />
                {split && <input type="number" step="0.01" value={a.amount} onChange={e => set({ allocations: f.allocations.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)) })} placeholder="0.00" className={inputCls} aria-label="Amount to this job" />}
                {split && <button type="button" onClick={() => set({ allocations: f.allocations.filter((_, j) => j !== i) })} className="text-gray-300 hover:text-red-500 px-1" aria-label="Remove job"><XCircle size={15} /></button>}
              </div>
            ))}
            <div className="flex items-center justify-between">
              <button type="button" onClick={() => set({ allocations: split ? [...f.allocations, { jobId: null, amount: '' }] : [{ ...f.allocations[0], amount: f.amount }, { jobId: null, amount: '' }] })} className="inline-flex items-center gap-1 text-xs text-[var(--brand-700)] font-semibold hover:underline"><Split size={12} /> Split across jobs</button>
              {split && <p className={`text-xs ${Math.abs(allocTotal - amount) < 0.01 ? 'text-gray-500' : 'text-red-600 font-semibold'}`}>Allocated {money(allocTotal)} of {money(amount)}</p>}
            </div>
          </>
        ) : (
          <select value={f.bucket || 'operating'} onChange={e => set({ bucket: e.target.value })} className={inputCls} aria-label="Company spend type">
            {OVERHEAD_BUCKETS.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
          </select>
        )}
      </div>
      <Field label="Notes"><textarea rows={2} value={f.notes || ''} onChange={e => set({ notes: e.target.value })} className={inputCls} /></Field>
      {po && <p className="text-xs text-gray-500">Billed against this PO: <span className="font-semibold">{money(billed)}</span> of {money(po.amount)}{po.enteredBy ? ` · entered by ${po.enteredBy}` : ''}</p>}
    </Modal>
  )
}

const mailPo = (po, jobs, vendorList, branding) => {
  const v = vendorList.find(x => x.ref === po.vendorRef)
  const to = v?.email || ''
  const where = poAllocations(po).map(a => { const j = jobs.get(String(a.jobId)); return j ? `${jobLabel(j)}${j.address ? `, ${j.address}` : ''}` : '' }).filter(Boolean).join('; ')
  const body = `Purchase order #${po.number}\nDate: ${po.date}\nItems: ${po.items || ''}\nAmount: ${money(po.amount)}${where ? `\nJob: ${where}` : ''}\n\n${branding?.companyName || ''}`
  window.location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(`PO #${po.number} from ${branding?.companyName || 'us'}`)}&body=${encodeURIComponent(body)}`
}

export default function Purchases() {
  const purchases = useStore(s => s.purchases)
  const proposals = useStore(s => s.proposals)
  const branding = useStore(s => s.branding)
  const updatePurchase = useStore(s => s.updatePurchase)
  const byId = useMemo(() => jobIndex(proposals), [proposals])
  const jobOptions = useJobOptions()
  const vendorList = useVendorList()
  const [params] = useSearchParams()
  const [q, setQ] = useState(() => params.get('q') || '')   // Vendors › "Approved to be spent" opens it filtered
  const [jobFilter, setJobFilter] = useState(null)
  const [billFor, setBillFor] = useState(null)   // PO to enter a bill against
  const [type, setType] = useState('all')
  const [status, setStatus] = useState('live')
  const [range, setRange] = useState({ from: '', to: '' })
  const [sort, setSort] = useState({ key: 'date', dir: 'desc' })
  const [editing, setEditing] = useState(null)

  const rows = useMemo(() => purchases.map(po => {
    const allocs = poAllocations(po)
    const jobs = allocs.map(a => byId.get(String(a.jobId))).filter(Boolean)
    // vendor: the vendor record's current name, so a search finds POs typed under an older name
    return { po, allocs, jobs, status: po.status || 'open', vendor: po.vendorRef ? (vendorList.find(v => v.ref === po.vendorRef)?.name || '') : '', where: jobs.length ? jobs.map(jobLabel).join(', ') : (po.bucket ? `Company · ${po.bucket}` : 'Company') }
  }), [purchases, byId, vendorList])

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    const out = rows.filter(r => {
      if (status === 'live' && r.status === 'void') return false
      if (!['live', 'all'].includes(status) && r.status !== status) return false
      if (type !== 'all' && (r.po.type || 'misc') !== type) return false
      if (jobFilter != null && !r.allocs.some(a => String(a.jobId) === String(jobFilter))) return false
      if (range.from && (r.po.date || '') < range.from) return false
      if (range.to && (r.po.date || '') > range.to) return false
      if (s && ![r.po.number, r.po.vendorName, r.vendor, r.po.items, r.where, r.po.enteredBy].some(v => String(v || '').toLowerCase().includes(s))) return false
      return true
    })
    return sortRows(out, sort, { date: r => r.po.date || '', amount: r => Number(r.po.amount) || 0, number: r => String(r.po.number || ''), vendor: r => r.po.vendorName || '' })
  }, [rows, q, status, type, jobFilter, range, sort])
  const { slice, pager } = usePaged(shown)
  const total = shown.reduce((s, r) => s + (r.status === 'void' ? 0 : Number(r.po.amount) || 0), 0)

  const exportCsv = () => downloadCsv(`purchases-${todayISO()}.csv`, [
    ['Status', r => r.status], ['Date', r => r.po.date], ['PO #', r => r.po.number], ['Type', r => poTypeLabel(r.po.type)],
    ['Vendor', r => r.po.vendorName], ['Items', r => r.po.items], ['Allocated to', r => r.where], ['Amount', r => (Number(r.po.amount) || 0).toFixed(2)], ['Entered by', r => r.po.enteredBy],
  ], shown)
  const report = () => viewReport('Purchases', [
    ['Status', r => r.status], ['Date', r => shortDate(r.po.date)], ['Allocated to', r => r.where], ['PO #', r => r.po.number],
    ['Vendor', r => r.po.vendorName], ['Items', r => `${poTypeLabel(r.po.type)} · ${r.po.items || ''}`], ['From', r => r.po.enteredBy], ['Amount', r => Number(r.po.amount) || 0],
  ], shown, ['Amount'])
  const filterCount = (type !== 'all' ? 1 : 0) + (status !== 'live' ? 1 : 0)

  return (
    <div className="p-4 sm:p-6 lg:px-8 max-w-[1500px] space-y-5">
      <PageHead title="Purchases">
        <button onClick={report} className={btnHead}>View report</button>
        <button onClick={() => setEditing('new')} className={btnHeadPrimary}>Add new purchase</button>
      </PageHead>
      <Toolbar
        left={<>
          <div className="w-full sm:w-56 flex items-center gap-2 h-[42px] border border-gray-300 rounded-lg bg-white pl-3 [&_button]:border-0 [&_button]:h-[40px]">
            <Network size={16} className="text-gray-600 shrink-0" />
            <div className="flex-1 min-w-0"><Combo options={jobOptions} value={jobFilter} onChange={setJobFilter} placeholder="All" allowNone noneLabel="All" /></div>
          </div>
          <SearchBox value={q} onChange={setQ} placeholder="Search" />
          <DateButton label="Date" iconOnly from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} />
          <FilterButton count={filterCount}>
            <FilterGroup title="Type" options={[['all', 'All types'], ...PO_TYPES.map(t => [t.key, t.label])]} value={type} onChange={setType} />
            <FilterGroup title="Status" options={[['live', 'Open + closed'], ['open', 'Open'], ['closed', 'Closed'], ['void', 'Void'], ['all', 'All']]} value={status} onChange={setStatus} />
          </FilterButton>
        </>}
        right={<><XlsButton onClick={exportCsv} />{pager}</>} />
      {shown.length > 0 && filterCount + (jobFilter != null ? 1 : 0) + (q ? 1 : 0) > 0 && <p className="text-sm text-gray-500">{shown.length.toLocaleString()} purchase{shown.length === 1 ? '' : 's'} · {money(total)}</p>}

      {shown.length === 0 ? <Empty>{purchases.length ? 'No purchases match.' : 'No purchase orders yet.'}</Empty> : (
        <div className="bg-white border border-gray-200 overflow-x-auto">
          <table className="w-full text-[15px] min-w-[960px]">
            <thead className="border-b border-gray-200 text-left">
              <tr>
                <Th className="text-center">Status</Th>
                <Th sortKey="date" sort={sort} setSort={setSort}>Date</Th>
                <Th>Allocated to</Th>
                <Th sortKey="amount" sort={sort} setSort={setSort} className="text-right">Amount</Th>
                <Th sortKey="number" sort={sort} setSort={setSort}>PO#</Th>
                <Th sortKey="vendor" sort={sort} setSort={setSort}>Vendor</Th>
                <Th>Items</Th>
                <Th>From</Th>
                <Th>&nbsp;</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {slice.map(r => (
                <tr key={r.po.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setEditing(r.po)}>
                  <StatusCell status={r.status === 'open' ? 'active' : r.status} />
                  <td className="px-3 text-gray-800">{shortDate(r.po.date)}</td>
                  <td className="px-3 py-3 max-w-[190px]"><p className="truncate text-gray-900">{r.where}</p>{r.allocs.length > 1 ? <p className="text-xs text-gray-500">split {r.allocs.length} jobs</p> : r.jobs[0]?.address ? <p className="truncate text-gray-600">{r.jobs[0].address}</p> : null}</td>
                  <td className="px-3 text-right text-gray-900">{money(r.po.amount)}</td>
                  <td className="px-3 text-gray-800 max-w-[130px] truncate">#{r.po.number}</td>
                  <td className="px-3 max-w-[170px] truncate text-gray-900">{r.po.vendorName || r.vendor || '—'}</td>
                  <td className="px-3 max-w-[180px] truncate text-gray-800">{r.po.items || poTypeLabel(r.po.type)}</td>
                  <td className="px-3 max-w-[120px] truncate text-gray-800">{r.po.enteredBy || ''}</td>
                  <td className="px-3 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                    {r.status !== 'void' && <RowIcon icon={ClipboardList} title="Enter a bill for this PO" onClick={() => setBillFor(r.po)} />}
                    <RowIcon icon={Mail} title="Email PO to vendor" onClick={() => mailPo(r.po, byId, vendorList, branding)} />
                    {r.status !== 'void' && <RowIcon icon={X} tone="muted" title="Void PO" onClick={() => { if (window.confirm(`Void PO #${r.po.number}?`)) updatePurchase(r.po.id, { status: 'void' }) }} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {billFor && <BillModal presetPo={billFor} onClose={() => setBillFor(null)} />}
      {editing && <PurchaseModal po={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
