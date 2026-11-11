// ── Vendors ──────────────────────────────────────────────────────────────────
// Every company we buy from, in one list: materials suppliers, services and
// subcontractors (subs used to have their own page under Projects). A sub also
// carries its trade, rating, COI files and incident log. Paperwork badges: GL
// and WC turn amber 30 days before they expire and red once expired or
// missing; W9 is on file or not.
// Project managers see this page too, for the subs only (the database keeps
// suppliers, POs and bills to the office), and without the money columns.
import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Pencil, Download, Filter, Star, Upload, FileText, X, Package, Smartphone, CheckCircle2 } from 'lucide-react'
import { useStore } from '../../store'
import { createSubInvite, setUpVendorAsSub } from '../../supabase'
import { DEMO } from '../../demo'
import { useNav, useJobMoney } from '../../nav'
import { dataUrlToBytes, downloadZip } from '../../lib/zip'
import {
  VENDOR_TYPES, DOC_KEYS, vendorTypeLabel, docStatus, vendorDocProblems, money, todayISO, billBalance,
  billStatus, poIsLive, downloadCsv, allVendors,
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

const TRADES = ['Electrical', 'Plumbing', 'HVAC', 'Concrete / Footings', 'Roofing', 'Framing', 'Carpentry', 'Painting', 'Landscaping', 'General Labor', 'Other']
const MAX_COI_BYTES = 8 * 1024 * 1024 // 8 MB per file
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—')
const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const r = new FileReader(); r.onload = (e) => resolve(e.target.result); r.onerror = reject; r.readAsDataURL(file)
})
const safeName = (s) => (s || 'sub').replace(/[^a-z0-9 ._-]/gi, '_').trim()
const extOf = (filename) => { const m = /\.([a-z0-9]+)$/i.exec(filename || ''); return m ? `.${m[1].toLowerCase()}` : '' }

function StarRating({ value, onChange, size = 15 }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" onClick={onChange ? () => onChange(n) : undefined} disabled={!onChange} aria-label={`${n} star${n > 1 ? 's' : ''}`}
          className={`${n <= value ? 'text-amber-400' : 'text-gray-200'} disabled:cursor-default`}>
          <Star size={size} fill={n <= value ? 'currentColor' : 'none'} />
        </button>
      ))}
    </div>
  )
}

// The sub's own phone login (src/sub): the office sends a one-time invite
// link; once they sign up, the tasks PMs book for this sub show up there.
function SubAppAccess({ sub }) {
  const live = useStore(s => s.subcontractors.find(x => x.id === sub.id)) || sub
  const canInvite = useStore(s => s.role === 'manager')
  const updateSubcontractor = useStore(s => s.updateSubcontractor)
  const crew = live.crew || []
  const [email, setEmail] = useState(live.appEmail || live.email || '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)   // { ok, text, link }
  const invite = async () => {
    setBusy(true); setMsg(null)
    try {
      if (DEMO) throw new Error('Invites are turned off in the demo.')
      const r = await createSubInvite(live.id, email.trim())
      const link = `${window.location.origin}/signup?code=${r.code}`
      try { await navigator.clipboard?.writeText(link) } catch { /* shown below to copy by hand */ }
      setMsg({ ok: true, text: `Invite link for ${r.email} copied. Text it to them; it works for 14 days.`, link })
    } catch (e) { setMsg({ ok: false, text: e.message }) } finally { setBusy(false) }
  }
  return (
    <div className="rounded-xl border border-gray-200 p-3 space-y-2">
      <p className="text-sm font-semibold text-gray-800 flex items-center gap-1.5"><Smartphone size={14} /> Sub app</p>
      {live.userId ? (
        <p className="text-sm text-gray-700 flex items-center gap-1.5"><CheckCircle2 size={14} className="text-green-600" /> Signed up{live.appEmail ? ` as ${live.appEmail}` : ''}. Tasks booked for them show on their phone.</p>
      ) : canInvite ? (
        <>
          {live.appEmail && <p className="text-xs text-gray-500">Invited {live.appEmail}, not signed up yet.</p>}
          <div className="flex gap-2">
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Their email" className={inputCls} aria-label="Sub app email" />
            <button type="button" onClick={invite} disabled={busy || !email.trim()} className={`${btnPrimary} whitespace-nowrap`}>{busy ? 'Inviting…' : live.appEmail ? 'Invite again' : 'Invite'}</button>
          </div>
        </>
      ) : (
        <p className="text-xs text-gray-500">{live.appEmail ? `Invited ${live.appEmail}, not signed up yet.` : 'Not on the sub app yet. The office can invite them.'}</p>
      )}
      {msg && (
        <p className={`text-xs ${msg.ok ? 'text-emerald-700' : 'text-red-600'} break-all`}>{msg.text}{msg.link ? <><br />{msg.link}</> : null}</p>
      )}
      {/* An outside company (e.g. electrical) with its own PM and crew: the
          login above is their PM; they invite and assign their own people. */}
      <label className="flex items-start gap-2 text-sm text-gray-700 pt-1">
        <input type="checkbox" className="mt-0.5" checked={!!live.hasCrew} disabled={!canInvite}
          onChange={e => updateSubcontractor(live.id, { hasCrew: e.target.checked })} />
        <span>Outside company with its own PM and crew<span className="block text-xs text-gray-500">The login above is their PM. They add their own people and put one on each job.</span></span>
      </label>
      {live.hasCrew && crew.length > 0 && (
        <ul className="text-xs text-gray-600 space-y-0.5 pl-6">
          {crew.map(c => <li key={c.email}>{c.name} · {c.userId ? 'signed up' : 'invited'}</li>)}
        </ul>
      )}
    </div>
  )
}

// A sub that came over from Knowify is filed as a vendor: it can't be invited
// to the sub app or booked on a job until it's on the subs list. One press
// moves it there with its POs and bills (supabase/sub_promote.sql).
function SubAppSetUp({ vendor, onMoved }) {
  const canInvite = useStore(s => s.role === 'manager')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!canInvite) return null
  const setUp = async () => {
    setBusy(true); setError('')
    try {
      if (DEMO) throw new Error('Turned off in the demo.')
      await setUpVendorAsSub(vendor.id)
      onMoved?.(vendor.id)
    } catch (e) { setError(e.message); setBusy(false) }
  }
  return (
    <div className="rounded-xl border border-gray-200 p-3 space-y-2">
      <p className="text-sm font-semibold text-gray-800 flex items-center gap-1.5"><Smartphone size={14} /> Sub app</p>
      <button type="button" onClick={setUp} disabled={busy} className={btnPrimary}>{busy ? 'Setting up…' : 'Set up for the sub app'}</button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

// A sub's certificate files and incident log — saved as you go.
function SubExtras({ sub }) {
  const updateSubcontractor = useStore(s => s.updateSubcontractor)
  const live = useStore(s => s.subcontractors.find(x => x.id === sub.id)) || sub
  const cois = live.cois || []
  const incidents = live.incidents || []
  const [text, setText] = useState('')
  const fileRef = useRef(null)
  const uploadCoi = async (file) => {
    if (!file) return
    if (file.size > MAX_COI_BYTES) { window.alert(`"${file.name}" is ${(file.size / 1048576).toFixed(1)} MB. Please upload a COI under 8 MB.`); return }
    const dataUrl = await readFileAsDataUrl(file)
    updateSubcontractor(sub.id, { cois: [{ id: Date.now(), name: file.name, type: file.type, size: file.size, dataUrl, uploadedAt: new Date().toISOString() }, ...cois] })
  }
  const addIncident = () => {
    if (!text.trim()) return
    updateSubcontractor(sub.id, { incidents: [{ id: Date.now(), date: new Date().toISOString(), text: text.trim() }, ...incidents] })
    setText('')
  }
  return (
    <>
      <div className="rounded-xl border border-gray-200 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-800">Insurance certificates (COI)</p>
          <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-1 text-sm font-medium text-[var(--brand-700)] hover:underline"><Upload size={14} /> Upload</button>
          <input ref={fileRef} type="file" accept=".pdf,image/*" className="hidden" onChange={e => { uploadCoi(e.target.files?.[0]); e.target.value = '' }} />
        </div>
        {cois.length === 0 ? <p className="text-xs text-gray-400">None on file.</p> : cois.map((c, i) => (
          <div key={c.id} className="flex items-center justify-between gap-2 bg-gray-50 rounded-lg px-2.5 py-1.5">
            <a href={c.dataUrl} download={c.name} className="flex items-center gap-2 min-w-0 text-sm text-gray-700 hover:text-[var(--brand-700)]">
              <FileText size={14} className="text-gray-400 shrink-0" /><span className="truncate">{c.name}</span>
              <span className="text-xs text-gray-400 shrink-0">{i === 0 ? 'Latest · ' : ''}{fmtDate(c.uploadedAt)}</span>
            </a>
            <button type="button" onClick={() => updateSubcontractor(sub.id, { cois: cois.filter(x => x.id !== c.id) })} className="text-gray-300 hover:text-red-500" aria-label={`Remove ${c.name}`}><X size={14} /></button>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-gray-200 p-3 space-y-2">
        <p className="text-sm font-semibold text-gray-800">Incidents</p>
        <div className="flex gap-2">
          <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addIncident() } }}
            placeholder="Missed schedule, rework, no-show…" className={inputCls} />
          <button type="button" onClick={addIncident} disabled={!text.trim()} className={btnPrimary}>Add</button>
        </div>
        {incidents.map(inc => (
          <div key={inc.id} className="flex items-start justify-between gap-2 bg-gray-50 rounded-lg px-2.5 py-1.5">
            <div className="min-w-0"><p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{inc.text}</p><p className="text-xs text-gray-400">{fmtDate(inc.date)}</p></div>
            <button type="button" onClick={() => updateSubcontractor(sub.id, { incidents: incidents.filter(x => x.id !== inc.id) })} className="text-gray-300 hover:text-red-500" aria-label="Remove incident"><X size={14} /></button>
          </div>
        ))}
      </div>
    </>
  )
}
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

function VendorModal({ entry, onClose, onMoved, subsOnly }) {
  const addVendor = useStore(s => s.addVendor)
  const updateVendor = useStore(s => s.updateVendor)
  const deleteVendor = useStore(s => s.deleteVendor)
  const addSubcontractor = useStore(s => s.addSubcontractor)
  const updateSubcontractor = useStore(s => s.updateSubcontractor)
  const deleteSubcontractor = useStore(s => s.deleteSubcontractor)
  const wasSub = entry?.source === 'sub'
  const rec = entry?.rec || {}
  const [f, setF] = useState(() => ({
    name: rec.name || '', type: wasSub || subsOnly ? 'sub' : (rec.type || 'supplier'), contact: rec.contact || '', email: rec.email || '', phone: rec.phone || '',
    address: rec.address || '', notes: (wasSub ? [rec.notes, rec.vendorNotes].filter(Boolean).join('\n') : rec.notes) || '', active: rec.active !== false,
    trade: rec.trade || '', rating: rec.rating || 0, startDate: rec.startDate || '', endDate: rec.endDate || '',
    docs: { gl: { ...(rec.docs?.gl || {}) }, wc: { ...(rec.docs?.wc || {}) }, w9: { ...(rec.docs?.w9 || {}) } },
  }))
  const set = (patch) => setF(x => ({ ...x, ...patch }))
  const setDoc = (k, patch) => setF(x => ({ ...x, docs: { ...x.docs, [k]: { ...x.docs[k], ...patch } } }))
  const isSub = f.type === 'sub'

  const save = () => {
    const docs = Object.fromEntries(Object.entries(f.docs).filter(([, d]) => d.expires || d.onFile))
    const base = { name: f.name.trim(), contact: f.contact, email: f.email, phone: f.phone, address: f.address, notes: f.notes, active: f.active, docs }
    // Subs live with the subcontractors (project managers see them); everyone else is a vendor
    const subFields = { ...base, trade: f.trade, rating: f.rating, startDate: f.startDate, endDate: f.endDate, vendorNotes: '' }
    if (wasSub) updateSubcontractor(rec.id, subFields)
    else if (entry) updateVendor(rec.id, { ...base, type: f.type, ...(isSub ? { trade: f.trade, rating: f.rating, startDate: f.startDate, endDate: f.endDate } : {}) })
    else if (isSub) addSubcontractor(subFields)
    else addVendor({ ...base, type: f.type })
    onClose()
  }
  const remove = () => {
    if (!window.confirm(`Delete ${f.name || 'this vendor'}? Past POs and bills keep its name.`)) return
    if (wasSub) deleteSubcontractor(rec.id); else deleteVendor(rec.id)
    onClose()
  }

  return (
    <Modal title={entry ? f.name || 'Vendor' : 'New vendor'} onClose={onClose}
      footer={<>
        {entry && <button onClick={remove} className="mr-auto text-sm text-red-600 hover:underline">Delete</button>}
        <button onClick={save} disabled={!f.name.trim()} className={btnPrimary}>Save</button>
      </>}>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Name *" className="sm:col-span-2"><input value={f.name} onChange={e => set({ name: e.target.value })} className={inputCls} /></Field>
        <Field label="Type">
          <select value={f.type} disabled={wasSub || subsOnly} onChange={e => set({ type: e.target.value })} className={inputCls}>
            {VENDOR_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </Field>
        {isSub
          ? <Field label="Trade"><select value={f.trade} onChange={e => set({ trade: e.target.value })} className={inputCls}><option value="">Pick a trade…</option>{TRADES.map(t => <option key={t} value={t}>{t}</option>)}</select></Field>
          : <Field label="Contact person"><input value={f.contact} onChange={e => set({ contact: e.target.value })} className={inputCls} /></Field>}
        <Field label="Email (POs are sent here)"><input type="email" value={f.email} onChange={e => set({ email: e.target.value })} className={inputCls} /></Field>
        <Field label="Phone"><input value={f.phone} onChange={e => set({ phone: e.target.value })} className={inputCls} /></Field>
        <Field label="Address" className="sm:col-span-2"><input value={f.address} onChange={e => set({ address: e.target.value })} className={inputCls} /></Field>
        {isSub && <>
          <Field label="Working with us since"><input type="date" value={f.startDate} onChange={e => set({ startDate: e.target.value })} className={inputCls} /></Field>
          <Field label="Until (blank if still active)"><input type="date" value={f.endDate} onChange={e => set({ endDate: e.target.value })} className={inputCls} /></Field>
          <Field label="Rating"><StarRating value={f.rating} onChange={n => set({ rating: n })} size={18} /></Field>
        </>}
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
      {wasSub && <SubAppAccess sub={rec} />}
      {entry && !wasSub && rec.type === 'sub' && <SubAppSetUp vendor={rec} onMoved={onMoved} />}
      {wasSub && <SubExtras sub={rec} />}
      <Field label="Notes"><textarea rows={2} value={f.notes} onChange={e => set({ notes: e.target.value })} className={inputCls} /></Field>
      <label className="flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={f.active} onChange={e => set({ active: e.target.checked })} /> Active</label>
    </Modal>
  )
}

export default function Vendors() {
  const { can } = useNav()
  const jobMoney = useJobMoney()
  // Project managers: subs only, no money columns
  const office = can('/finance')
  const showMoney = office && jobMoney
  const subsOnly = !office
  const all = useVendorList()
  const list = useMemo(() => (subsOnly ? all.filter(v => v.type === 'sub') : all), [all, subsOnly])
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

  // Every sub's latest COI plus a manifest, zipped, for an insurance audit
  const subs = list.filter(v => v.type === 'sub')
  const coiCount = subs.filter(v => (v.rec.cois || []).length).length
  const auditPack = () => {
    const files = [], used = new Set()
    const rows = [['Subcontractor', 'Trade', 'Start', 'End', 'Rating', 'Latest COI', 'COI uploaded']]
    for (const v of subs) {
      const latest = (v.rec.cois || [])[0]
      let label = 'MISSING'
      if (latest) {
        let base = `${safeName(v.name)} - COI${extOf(latest.name)}`, n = 2
        while (used.has(base)) base = `${safeName(v.name)} - COI (${n++})${extOf(latest.name)}`
        used.add(base); label = base
        files.push({ name: base, bytes: dataUrlToBytes(latest.dataUrl) })
      }
      rows.push([v.name, v.rec.trade || '', v.rec.startDate || '', v.rec.endDate || '', v.rec.rating ? `${v.rec.rating}/5` : '', label, latest ? fmtDate(latest.uploadedAt) : ''])
    }
    files.push({ name: 'manifest.csv', bytes: new TextEncoder().encode(rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n')) })
    downloadZip(`COI-Audit-Pack-${todayISO()}.zip`, files)
  }

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
              {!subsOnly && <FilterGroup title="Type" options={[['all', 'All types'], ...VENDOR_TYPES.map(t => [t.key, t.label])]} value={type} onChange={setType} />}
              <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={problemsOnly} onChange={e => setProblemsOnly(e.target.checked)} /> Paperwork problems only <span className="text-gray-400">({problemCount})</span></label>
              <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} /> Show inactive</label>
            </PopButton>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={auditPack} disabled={!coiCount} title={coiCount ? 'Every sub\'s latest COI in one .zip' : 'Upload a sub\'s COI first'} className={`${btnHead} h-[42px] py-0 disabled:opacity-40`}><Package size={17} /> COI audit pack</button>
          <button onClick={exportCsv} title="Export to Excel" aria-label="Export to Excel" className={`${btnHead} h-[42px] px-3 py-0`}><Download size={18} /></button>
          <button onClick={() => setEditing('new')} className={`${btnHead} h-[42px] py-0`}><Plus size={17} /> {subsOnly ? 'Add a sub' : 'Add new vendor'}</button>
          {pager}
        </div>
      </div>

      {shown.length === 0 ? <Empty>{list.length ? 'No vendors match.' : 'No vendors yet.'}</Empty> : (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-x-auto">
          <table className={`w-full text-[15px] ${showMoney ? 'min-w-[860px]' : 'min-w-[560px]'}`}>
            <thead className="border-b border-gray-200 text-left">
              <tr>
                <Th sortKey="name" sort={sort} setSort={setSort}>Vendor</Th>
                <Th sortKey="type" sort={sort} setSort={setSort}>Type</Th>
                <Th>Documentation</Th>
                {showMoney && <Th sortKey="spent" sort={sort} setSort={setSort} className="text-right">Approved to be spent</Th>}
                {showMoney && <Th sortKey="owed" sort={sort} setSort={setSort} className="text-right">Outstanding bills</Th>}
                <Th>&nbsp;</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {slice.map(r => (
                <tr key={r.v.ref} className={`hover:bg-gray-50 ${r.v.active ? '' : 'opacity-50'}`}>
                  <td className="px-3 py-5"><p className="text-gray-900">{r.v.name}</p>
                    {(r.v.trade || r.v.rec.rating > 0) && <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">{r.v.trade}{r.v.rec.rating > 0 && <StarRating value={r.v.rec.rating} size={11} />}</div>}</td>
                  <td className="px-3"><span className="text-[15px] bg-gray-100 border border-gray-200 text-gray-700 rounded px-2 py-1 whitespace-nowrap">{vendorTypeLabel(r.v.type)}</span></td>
                  <td className="px-3"><DocBadges v={r.v} /></td>
                  {showMoney && <td className="px-3 text-right">
                    {r.spent > 0
                      ? <button onClick={() => navigate(`/money?tab=purchases&q=${encodeURIComponent(r.v.name)}`)} className="underline underline-offset-2 text-gray-900 hover:text-[var(--brand-700)]" title={`Purchases from ${r.v.name}`}>{money(r.spent)}</button>
                      : <span className="text-gray-900">{money(0)}</span>}
                  </td>}
                  {showMoney && <td className={`px-3 text-right ${r.owed > 0 ? 'font-semibold text-amber-700' : 'text-gray-900'}`}>{money(r.owed)}</td>}
                  <td className="px-3 text-right"><button onClick={() => setEditing(r.v)} title={`Edit ${r.v.name}`} aria-label={`Edit ${r.v.name}`} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"><Pencil size={20} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {/* Just set up for the sub app: reopen it as the sub it now is, with the Invite box */}
      {editing && <VendorModal key={editing === 'new' ? 'new' : editing.ref} entry={editing === 'new' ? null : editing} subsOnly={subsOnly} onClose={() => setEditing(null)}
        onMoved={(id) => setEditing(allVendors([], useStore.getState().subcontractors).find(v => v.ref === `s:${id}`) || null)} />}
    </div>
  )
}
