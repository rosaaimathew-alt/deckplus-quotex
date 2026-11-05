// ── Vendors ──────────────────────────────────────────────────────────────────
// Suppliers and service companies, plus every subcontractor from Projects ›
// Subcontractors (so a sub is never entered twice). Paperwork badges: GL and
// WC turn amber 30 days before they expire and red once expired or missing;
// W9 is on file or not.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Pencil, Download, Filter } from 'lucide-react'
import { useStore } from '../../store'
import {
  VENDOR_TYPES, DOC_KEYS, vendorTypeLabel, docStatus, vendorDocProblems, money, todayISO, billBalance,
  billStatus, poIsLive, downloadCsv,
} from '../../lib/books'
import { SearchBox, usePaged, Th, sortRows, Modal, Field, useVendorList, Empty, inputCls, btnPrimary, PageHead, PopButton, FilterGroup, btnHead } from './ui'

const DOC_CLS = {
  ok: 'border-gray-300 text-gray-600 bg-white',
  expiring: 'border-amber-400 text-amber-800 bg-amber-50',
  expired: 'border-red-700 text-white bg-red-700',
  missing: 'border-red-700 text-white bg-red-700',
}
// Knowify shows the papers on file, in the order GL, W9, WC — red when
// expired, amber when expiring. Missing papers are what "Paperwork problems"
// in Filters finds.
const BADGE_ORDER = ['gl', 'w9', 'wc']
function DocBadges({ v }) {
  const keys = BADGE_ORDER.map(k => DOC_KEYS.find(d => d.key === k)).filter(d => d && docStatus(v.docs?.[d.key], d.dated) !== 'missing')
  if (!keys.length) return null
  return (
    <div className="flex gap-1">
      {keys.map(d => {
        const st = docStatus(v.docs?.[d.key], d.dated)
        const exp = v.docs?.[d.key]?.expires
        return <span key={d.key} title={`${d.name}: ${st}${exp ? ` (expires ${exp})` : ''}`} className={`text-[13px] font-semibold border rounded px-1.5 py-0.5 ${DOC_CLS[st]}`}>{d.label}</span>
      })}
    </div>
  )
}

function VendorModal({ entry, onClose }) {
  const addVendor = useStore(s => s.addVendor)
  const updateVendor = useStore(s => s.updateVendor)
  const deleteVendor = useStore(s => s.deleteVendor)
  const updateSubcontractor = useStore(s => s.updateSubcontractor)
  const isSub = entry?.source === 'sub'
  const rec = entry?.rec || {}
  const [f, setF] = useState(() => ({
    name: rec.name || '', type: isSub ? 'sub' : (rec.type || 'supplier'), contact: rec.contact || '', email: rec.email || '', phone: rec.phone || '',
    address: rec.address || '', notes: rec.vendorNotes ?? (isSub ? '' : rec.notes || ''), active: rec.active !== false,
    docs: { gl: { ...(rec.docs?.gl || {}) }, wc: { ...(rec.docs?.wc || {}) }, w9: { ...(rec.docs?.w9 || {}) } },
  }))
  const set = (patch) => setF(x => ({ ...x, ...patch }))
  const setDoc = (k, patch) => setF(x => ({ ...x, docs: { ...x.docs, [k]: { ...x.docs[k], ...patch } } }))

  const save = () => {
    const clean = Object.fromEntries(Object.entries(f.docs).filter(([, d]) => d.expires || d.onFile))
    if (isSub) updateSubcontractor(rec.id, { name: f.name.trim(), email: f.email, phone: f.phone, docs: clean, vendorNotes: f.notes, active: f.active })
    else if (entry) updateVendor(rec.id, { ...f, name: f.name.trim(), docs: clean })
    else addVendor({ ...f, name: f.name.trim(), docs: clean })
    onClose()
  }

  return (
    <Modal title={entry ? f.name || 'Vendor' : 'New vendor'} onClose={onClose}
      footer={<>
        {entry && !isSub && <button onClick={() => { if (window.confirm('Delete this vendor? Past POs and bills keep its name.')) { deleteVendor(rec.id); onClose() } }} className="mr-auto text-sm text-red-600 hover:underline">Delete</button>}
        <button onClick={save} disabled={!f.name.trim()} className={btnPrimary}>Save</button>
      </>}>
      {isSub && <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">This is a subcontractor from Projects › Subcontractors. Trade, rating and COI files are edited there.</p>}
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Name *" className="sm:col-span-2"><input value={f.name} onChange={e => set({ name: e.target.value })} className={inputCls} /></Field>
        <Field label="Type">
          <select value={f.type} disabled={isSub} onChange={e => set({ type: e.target.value })} className={inputCls}>
            {VENDOR_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </Field>
        {!isSub && <Field label="Contact person"><input value={f.contact} onChange={e => set({ contact: e.target.value })} className={inputCls} /></Field>}
        <Field label="Email (POs are sent here)"><input type="email" value={f.email} onChange={e => set({ email: e.target.value })} className={inputCls} /></Field>
        <Field label="Phone"><input value={f.phone} onChange={e => set({ phone: e.target.value })} className={inputCls} /></Field>
        {!isSub && <Field label="Address" className="sm:col-span-2"><input value={f.address} onChange={e => set({ address: e.target.value })} className={inputCls} /></Field>}
      </div>
      <div className="rounded-xl border border-gray-200 p-3 space-y-2">
        <p className="text-sm font-semibold text-gray-800">Paperwork</p>
        {DOC_KEYS.map(d => (
          <div key={d.key} className="grid grid-cols-[110px_1fr] items-center gap-2">
            <span className="text-sm text-gray-700">{d.name}</span>
            {d.dated
              ? <div className="flex items-center gap-2"><input type="date" value={f.docs[d.key].expires || ''} onChange={e => setDoc(d.key, { expires: e.target.value })} className={inputCls} aria-label={`${d.name} expires`} /><span className="text-xs text-gray-400 whitespace-nowrap">expires</span></div>
              : <label className="flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={!!f.docs[d.key].onFile} onChange={e => setDoc(d.key, { onFile: e.target.checked })} /> On file</label>}
          </div>
        ))}
      </div>
      <Field label="Notes"><textarea rows={2} value={f.notes} onChange={e => set({ notes: e.target.value })} className={inputCls} /></Field>
      <label className="flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={f.active} onChange={e => set({ active: e.target.checked })} /> Active</label>
    </Modal>
  )
}

export default function Vendors() {
  const list = useVendorList()
  const purchases = useStore(s => s.purchases)
  const bills = useStore(s => s.bills)
  const [q, setQ] = useState('')
  const [type, setType] = useState('all')
  const [problemsOnly, setProblemsOnly] = useState(false)
  const [showInactive, setShowInactive] = useState(false)
  const [sort, setSort] = useState({ key: 'name', dir: 'asc' })
  const [editing, setEditing] = useState(null)
  const navigate = useNavigate()

  const rows = useMemo(() => {
    const spent = new Map(), owed = new Map()
    for (const po of purchases) if (poIsLive(po) && po.vendorRef) spent.set(po.vendorRef, (spent.get(po.vendorRef) || 0) + (Number(po.amount) || 0))
    for (const b of bills) if (b.vendorRef && ['outstanding', 'overdue'].includes(billStatus(b))) owed.set(b.vendorRef, (owed.get(b.vendorRef) || 0) + billBalance(b))
    return list.map(v => ({ v, spent: spent.get(v.ref) || 0, owed: owed.get(v.ref) || 0, problems: vendorDocProblems(v) }))
  }, [list, purchases, bills])

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    const out = rows.filter(r => {
      if (!showInactive && !r.v.active) return false
      if (type !== 'all' && r.v.type !== type) return false
      if (problemsOnly && !r.problems.length) return false
      if (s && ![r.v.name, r.v.email, r.v.phone, r.v.trade].some(x => String(x || '').toLowerCase().includes(s))) return false
      return true
    })
    return sortRows(out, sort, { name: r => r.v.name.toLowerCase(), type: r => vendorTypeLabel(r.v.type), spent: r => r.spent, owed: r => r.owed })
  }, [rows, q, type, problemsOnly, showInactive, sort])
  const { slice, pager } = usePaged(shown)
  const problemCount = rows.filter(r => r.v.active && r.problems.length).length

  const exportCsv = () => downloadCsv(`vendors-${todayISO()}.csv`, [
    ['Vendor', r => r.v.name], ['Type', r => vendorTypeLabel(r.v.type)], ['Email', r => r.v.email], ['Phone', r => r.v.phone],
    ['GL expires', r => r.v.docs?.gl?.expires], ['WC expires', r => r.v.docs?.wc?.expires], ['W9 on file', r => (r.v.docs?.w9?.onFile ? 'yes' : '')],
    ['Paperwork problems', r => r.problems.map(p => `${p.label} ${p.status}`).join('; ')],
    ['Approved to be spent', r => r.spent.toFixed(2)], ['Outstanding bills', r => r.owed.toFixed(2)],
  ], shown)

  const filterCount = (type !== 'all' ? 1 : 0) + (problemsOnly ? 1 : 0) + (showInactive ? 1 : 0)

  return (
    <div className="p-4 sm:p-6 lg:px-8 max-w-[1500px] space-y-5">
      <PageHead title="Vendors" />
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <SearchBox value={q} onChange={setQ} placeholder="Search" />
          {/* Knowify's "Filters" link under the search box */}
          <div className="mt-1.5 [&>div>button]:h-auto [&>div>button]:border-0 [&>div>button]:bg-transparent [&>div>button]:px-1 [&>div>button]:py-0.5 [&>div>button]:text-sm [&>div>button]:text-gray-600">
            <PopButton icon={Filter} label={filterCount ? `Filters (${filterCount})` : 'Filters'} title="Filters">
              <FilterGroup title="Type" options={[['all', 'All types'], ...VENDOR_TYPES.map(t => [t.key, t.label])]} value={type} onChange={setType} />
              <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={problemsOnly} onChange={e => setProblemsOnly(e.target.checked)} /> Paperwork problems only <span className="text-gray-400">({problemCount})</span></label>
              <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} /> Show inactive</label>
            </PopButton>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={exportCsv} title="Export to Excel" aria-label="Export to Excel" className={`${btnHead} h-[42px] px-3 py-0`}><Download size={18} /></button>
          <button onClick={() => setEditing('new')} className={`${btnHead} h-[42px] py-0`}><Plus size={17} /> Add new vendor</button>
          {pager}
        </div>
      </div>

      {shown.length === 0 ? <Empty>{list.length ? 'No vendors match.' : 'No vendors yet.'}</Empty> : (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-x-auto">
          <table className="w-full text-[15px] min-w-[860px]">
            <thead className="border-b border-gray-200 text-left">
              <tr>
                <Th sortKey="name" sort={sort} setSort={setSort}>Vendor</Th>
                <Th sortKey="type" sort={sort} setSort={setSort}>Type</Th>
                <Th>Documentation</Th>
                <Th sortKey="spent" sort={sort} setSort={setSort} className="text-right">Approved to be spent</Th>
                <Th sortKey="owed" sort={sort} setSort={setSort} className="text-right">Outstanding bills</Th>
                <Th>&nbsp;</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {slice.map(r => (
                <tr key={r.v.ref} className={`hover:bg-gray-50 ${r.v.active ? '' : 'opacity-50'}`}>
                  <td className="px-3 py-5"><p className="text-gray-900">{r.v.name}</p>{r.v.trade && <p className="text-xs text-gray-500">{r.v.trade}</p>}</td>
                  <td className="px-3"><span className="text-[15px] bg-gray-100 border border-gray-200 text-gray-700 rounded px-2 py-1 whitespace-nowrap">{vendorTypeLabel(r.v.type)}</span></td>
                  <td className="px-3"><DocBadges v={r.v} /></td>
                  <td className="px-3 text-right">
                    {r.spent > 0
                      ? <button onClick={() => navigate(`/money?tab=purchases&q=${encodeURIComponent(r.v.name)}`)} className="underline underline-offset-2 text-gray-900 hover:text-[var(--brand-700)]" title={`Purchases from ${r.v.name}`}>{money(r.spent)}</button>
                      : <span className="text-gray-900">{money(0)}</span>}
                  </td>
                  <td className={`px-3 text-right ${r.owed > 0 ? 'font-semibold text-amber-700' : 'text-gray-900'}`}>{money(r.owed)}</td>
                  <td className="px-3 text-right"><button onClick={() => setEditing(r.v)} title={`Edit ${r.v.name}`} aria-label={`Edit ${r.v.name}`} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"><Pencil size={20} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <VendorModal entry={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
