import { useState, useRef } from 'react'
import { useStore } from '../store'
import { Plus, X, Mail, Wrench, Star, Edit2, AlertTriangle, ShieldCheck, Upload, Download, FileText, Package, Calendar } from 'lucide-react'
import { dataUrlToBytes, downloadZip } from '../lib/zip'

const TRADES = ['Electrical', 'Plumbing', 'HVAC', 'Concrete / Footings', 'Roofing', 'Framing', 'Painting', 'Landscaping', 'General Labor', 'Other']

const MAX_COI_BYTES = 8 * 1024 * 1024 // 8 MB per file — keeps persisted store sane

const safeName = (s) => (s || 'sub').replace(/[^a-z0-9 ._-]/gi, '_').trim()
const initials = (name) => (name || '?').trim().split(/\s+/).filter(w => !/^(&|and)$/i.test(w)).map(w => w[0]).slice(0, 2).join('').toUpperCase()
const extOf = (filename) => {
  const m = /\.([a-z0-9]+)$/i.exec(filename || '')
  return m ? `.${m[1].toLowerCase()}` : ''
}
const fmtDate = (iso, opts = { month: 'short', day: 'numeric', year: 'numeric' }) =>
  iso ? new Date(iso).toLocaleDateString('en-US', opts) : '—'
const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = (e) => resolve(e.target.result)
    r.onerror = reject
    r.readAsDataURL(file)
  })

function StarRating({ value, onChange }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" onClick={() => onChange(n)}
          className={`w-5 h-5 rounded-sm transition-colors ${n <= value ? 'text-amber-400' : 'text-gray-200'}`}>
          <Star size={14} fill={n <= value ? 'currentColor' : 'none'} />
        </button>
      ))}
    </div>
  )
}

function SubForm({ initial = {}, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: initial.name || '',
    trade: initial.trade || '',
    phone: initial.phone || '',
    email: initial.email || '',
    rating: initial.rating || 0,
    startDate: initial.startDate || '',
    endDate: initial.endDate || '',
    notes: initial.notes || '',
  })
  const f = (k) => (e) => setForm(s => ({ ...s, [k]: e.target.value }))

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Name / Company</label>
          <input autoFocus value={form.name} onChange={f('name')} placeholder="e.g. John's Electric"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Trade</label>
          <select value={form.trade} onChange={f('trade')}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300">
            <option value="">Select trade…</option>
            {TRADES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
          <input value={form.phone} onChange={f('phone')} placeholder="(555) 000-0000" type="tel"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
          <input value={form.email} onChange={f('email')} placeholder="sub@example.com" type="email"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Start date</label>
          <input value={form.startDate} onChange={f('startDate')} type="date"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">End date</label>
          <input value={form.endDate} onChange={f('endDate')} type="date"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Rating</label>
        <StarRating value={form.rating} onChange={r => setForm(s => ({ ...s, rating: r }))} />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
        <textarea value={form.notes} onChange={f('notes')} rows={2}
          placeholder="License #, insurance expiry, strengths/weaknesses…"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none" />
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={() => onSave(form)} disabled={!form.name.trim()}
          className="flex-1 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors">
          Save
        </button>
        <button onClick={onCancel}
          className="flex-1 py-2 border border-gray-200 text-gray-600 text-xs rounded-lg hover:bg-gray-50 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  )
}

function SubCard({ sub }) {
  const { updateSubcontractor, deleteSubcontractor } = useStore()
  const [editing, setEditing] = useState(false)
  const [open, setOpen] = useState(false)
  const [incidentText, setIncidentText] = useState('')
  const fileRef = useRef(null)

  const incidents = sub.incidents || []
  const cois = sub.cois || []

  const addIncident = () => {
    if (!incidentText.trim()) return
    updateSubcontractor(sub.id, { incidents: [{ id: Date.now(), date: new Date().toISOString(), text: incidentText.trim() }, ...incidents] })
    setIncidentText('')
  }
  const removeIncident = (id) => updateSubcontractor(sub.id, { incidents: incidents.filter(i => i.id !== id) })

  const uploadCoi = async (file) => {
    if (!file) return
    if (file.size > MAX_COI_BYTES) {
      window.alert(`"${file.name}" is ${(file.size / 1048576).toFixed(1)} MB. Please upload a COI under 8 MB.`)
      return
    }
    const dataUrl = await readFileAsDataUrl(file)
    const coi = { id: Date.now(), name: file.name, type: file.type, size: file.size, dataUrl, uploadedAt: new Date().toISOString() }
    updateSubcontractor(sub.id, { cois: [coi, ...cois] })
  }
  const removeCoi = (id) => updateSubcontractor(sub.id, { cois: cois.filter(c => c.id !== id) })

  if (editing) return (
    <SubForm
      initial={sub}
      onSave={form => { updateSubcontractor(sub.id, form); setEditing(false) }}
      onCancel={() => setEditing(false)}
    />
  )

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 hover:border-gray-300 transition-colors">
      {/* Card face — avatar + name/phone (left), trade pill + rating (right) */}
      <div className="flex items-start justify-between gap-3">
        <button onClick={() => setOpen(o => !o)} className="flex items-start gap-3 min-w-0 text-left flex-1">
          <div className="w-11 h-11 rounded-xl bg-[var(--brand-100)] text-[var(--brand-700)] flex items-center justify-center shrink-0 font-bold">
            {initials(sub.name)}
          </div>
          <div className="min-w-0 pt-0.5">
            <p className="font-semibold text-gray-900 text-sm leading-snug">{sub.name}</p>
            {sub.phone && <p className="text-xs text-gray-400 mt-1">{sub.phone}</p>}
          </div>
        </button>
        <div className="flex flex-col items-end gap-2 shrink-0">
          {sub.trade && (
            <span className="text-[11px] bg-gray-100 text-gray-500 px-2.5 py-1 rounded-full font-medium whitespace-nowrap">{sub.trade}</span>
          )}
          <StarRating value={sub.rating || 0} onChange={r => updateSubcontractor(sub.id, { rating: r })} />
        </div>
      </div>

      {/* Profile detail — details, Insurance + Incidents, only when the profile is open */}
      {open && (
        <>
          {/* Extra details + actions */}
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-start justify-between gap-3">
            <div className="space-y-1.5 min-w-0">
              {(sub.startDate || sub.endDate) && (
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Calendar size={12} className="shrink-0 text-gray-400" />
                  <span>{fmtDate(sub.startDate)}<span className="text-gray-300"> → </span>{sub.endDate ? fmtDate(sub.endDate) : 'Active'}</span>
                </div>
              )}
              {sub.email && (
                <a href={`mailto:${sub.email}`} className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-[var(--brand-700)] transition-colors">
                  <Mail size={12} className="shrink-0 text-gray-400" /> <span className="truncate">{sub.email}</span>
                </a>
              )}
              {sub.notes && <p className="text-xs text-gray-500 whitespace-pre-wrap">{sub.notes}</p>}
              {!sub.startDate && !sub.endDate && !sub.email && !sub.notes && (
                <span className="text-xs text-gray-400 italic">No additional details.</span>
              )}
            </div>
            <div className="flex items-center gap-0.5 shrink-0 -mr-1">
              <button onClick={() => setEditing(true)} className="p-1.5 rounded-lg text-gray-400 hover:text-[var(--brand-700)] hover:bg-[var(--brand-50)] transition-colors" title="Edit">
                <Edit2 size={13} />
              </button>
              <button onClick={() => { if (window.confirm(`Remove ${sub.name}?`)) deleteSubcontractor(sub.id) }}
                className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Remove">
                <X size={13} />
              </button>
            </div>
          </div>

          {/* Certificates of Insurance */}
          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">
                <ShieldCheck size={12} className={cois.length > 0 ? 'text-green-500' : 'text-gray-400'} />
                Insurance (COI){cois.length > 0 && <span className="text-gray-400 font-normal">({cois.length})</span>}
              </span>
              <button onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1 text-xs font-medium text-[var(--brand-700)] hover:text-[var(--brand-800)] transition-colors">
                <Upload size={12} /> Upload
              </button>
              <input ref={fileRef} type="file" accept=".pdf,image/*" className="hidden"
                onChange={e => { uploadCoi(e.target.files?.[0]); e.target.value = '' }} />
            </div>
            <div className="mt-2 space-y-1.5">
              {cois.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No COI on file. Upload the latest certificate.</p>
              ) : (
                cois.map((coi, idx) => (
                  <div key={coi.id} className="flex items-center justify-between gap-2 bg-gray-50 rounded-lg px-2.5 py-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText size={13} className="text-gray-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs text-gray-700 truncate">{coi.name}</p>
                        <p className="text-[10px] text-gray-400">
                          {idx === 0 && <span className="text-green-600 font-medium">Latest · </span>}
                          {fmtDate(coi.uploadedAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <a href={coi.dataUrl} download={coi.name} className="p-1 rounded text-gray-400 hover:text-[var(--brand-700)]" title="Download">
                        <Download size={13} />
                      </a>
                      <button onClick={() => removeCoi(coi.id)} className="p-1 rounded text-gray-300 hover:text-red-500" title="Remove"><X size={13} /></button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Incidents — office logs incidents to justify the rating */}
          <div className="mt-3 pt-3 border-t border-gray-100">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">
              <AlertTriangle size={12} className="text-gray-400" />
              Incidents{incidents.length > 0 && <span className="text-gray-400 font-normal">({incidents.length})</span>}
            </span>
            <div className="mt-2 space-y-2">
              <div className="flex gap-2">
                <input value={incidentText} onChange={e => setIncidentText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addIncident() }}
                  placeholder="Log an incident (missed schedule, rework, no-show…)"
                  className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[var(--brand-300)]" />
                <button onClick={addIncident} disabled={!incidentText.trim()}
                  className="px-3 py-1.5 bg-[var(--brand-600)] text-white text-xs font-medium rounded-lg hover:bg-[var(--brand-700)] disabled:opacity-40 transition-colors shrink-0">
                  Add
                </button>
              </div>
              {incidents.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No incidents logged.</p>
              ) : (
                <div className="space-y-1.5">
                  {incidents.map(inc => (
                    <div key={inc.id} className="flex items-start justify-between gap-2 bg-gray-50 rounded-lg px-2.5 py-1.5">
                      <div className="min-w-0">
                        <p className="text-xs text-gray-700 whitespace-pre-wrap break-words">{inc.text}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{fmtDate(inc.date)}</p>
                      </div>
                      <button onClick={() => removeIncident(inc.id)} className="text-gray-300 hover:text-red-500 shrink-0" title="Remove incident"><X size={12} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default function Subcontractors() {
  const { subcontractors, addSubcontractor } = useStore()
  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState('')
  const [tradeFilter, setTradeFilter] = useState('All')

  const trades = ['All', ...Array.from(new Set(subcontractors.map(s => s.trade).filter(Boolean)))]

  const coiCount = subcontractors.filter(s => (s.cois || []).length > 0).length

  const filtered = subcontractors.filter(s => {
    if (tradeFilter !== 'All' && s.trade !== tradeFilter) return false
    if (query) {
      const q = query.toLowerCase()
      return [s.name, s.trade, s.phone, s.email, s.notes].some(v => v?.toLowerCase().includes(q))
    }
    return true
  })

  // Bundle every sub's LATEST COI + a manifest into a single .zip for audits.
  const buildAuditPack = () => {
    const today = new Date().toISOString().slice(0, 10)
    const files = []
    const rows = [['Subcontractor', 'Trade', 'Start', 'End', 'Rating', 'Latest COI', 'COI Uploaded']]
    const usedNames = new Set()

    subcontractors.forEach(sub => {
      const latest = (sub.cois || [])[0]
      let coiLabel = 'MISSING'
      if (latest) {
        let base = `${safeName(sub.name)} - COI${extOf(latest.name)}`
        let n = 2
        while (usedNames.has(base)) { base = `${safeName(sub.name)} - COI (${n})${extOf(latest.name)}`; n++ }
        usedNames.add(base)
        coiLabel = base
        files.push({ name: base, bytes: dataUrlToBytes(latest.dataUrl) })
      }
      rows.push([
        sub.name || '',
        sub.trade || '',
        sub.startDate || '',
        sub.endDate || '',
        sub.rating ? `${sub.rating}/5` : '',
        coiLabel,
        latest ? fmtDate(latest.uploadedAt) : '',
      ])
    })

    const csv = rows
      .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\r\n')
    files.push({ name: 'manifest.csv', bytes: new TextEncoder().encode(csv) })

    downloadZip(`COI-Audit-Pack-${today}.zip`, files)
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6 gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Subcontractors</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            {subcontractors.length} subs in directory
            {subcontractors.length > 0 && <span className="text-gray-400"> · {coiCount} with COI on file</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={buildAuditPack} disabled={coiCount === 0} title={coiCount === 0 ? 'Upload a COI first' : 'Download all latest COIs as a .zip'}
            className="flex items-center gap-2 px-3.5 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm">
            <Package size={15} /> Audit Pack
          </button>
          <button onClick={() => setAdding(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm">
            <Plus size={15} /> Add Sub
          </button>
        </div>
      </div>

      {/* Filters */}
      {subcontractors.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="flex gap-1 overflow-x-auto pb-1">
            {trades.map(t => (
              <button key={t} onClick={() => setTradeFilter(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  tradeFilter === t ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>
                {t}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-1.5 bg-white w-full sm:w-52">
            <Wrench size={13} className="text-gray-400 shrink-0" />
            <input className="flex-1 text-sm bg-transparent outline-none placeholder:text-gray-400"
              placeholder="Search subs…" value={query} onChange={e => setQuery(e.target.value)} />
            {query && <button onClick={() => setQuery('')} className="text-gray-300 hover:text-gray-500"><X size={12} /></button>}
          </div>
        </div>
      )}

      {adding && (
        <div className="mb-4">
          <SubForm
            onSave={form => { addSubcontractor(form); setAdding(false) }}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}

      {subcontractors.length === 0 && !adding && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm py-16 text-center">
          <Wrench size={36} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No subcontractors yet</p>
          <p className="text-sm text-gray-400 mt-1">Add your electricians, concrete crews, and other subs.</p>
          <button onClick={() => setAdding(true)}
            className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
            Add first sub
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {filtered.map(sub => <SubCard key={sub.id} sub={sub} />)}
      </div>
    </div>
  )
}
