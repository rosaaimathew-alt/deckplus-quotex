import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore, contractNumberFor } from '../store'
import { contractTotalOf, approvedChangeOrderTotal } from '../contractTotal'
import {
  CheckCircle2, Circle, ChevronDown, ChevronUp, CalendarDays,
  FileSignature, ClipboardList, MapPin, DollarSign, X, Plus,
  AlertTriangle, CheckCheck, Clock, Wrench, FileText, Mail, Send,
  Search, Trash2, Link2, ExternalLink, PenLine, RefreshCw,
  HardHat, CloudSun, MoreHorizontal, Loader, Store,
} from 'lucide-react'

const fmt    = n => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const fmtDol = n => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
const today = () => new Date().toISOString().split('T')[0]

const STAGE_TEMPLATES = {
  porch_conversion: [
    { key: 'hoa',               label: 'HOA Approval' },
    { key: 'precon',            label: 'Pre-Con Scheduled' },
    { key: 'start',             label: 'Start Date Given' },
    { key: 'demo',              label: 'Demo' },
    { key: 'materials',         label: 'Material Ordered' },
    { key: 'framing',           label: 'Framing Complete' },
    { key: 'measurements',      label: 'Measurements Received' },
    { key: 'paint',             label: 'Paint Completed' },
    { key: 'windows_delivered', label: 'Windows Delivered' },
    { key: 'windows_installed', label: 'Windows Installed' },
    { key: 'punch',             label: 'Punch List' },
    { key: 'closed',            label: 'Job Closed' },
  ],
  deck_resurface: [
    { key: 'hoa',                 label: 'HOA Approval' },
    { key: 'precon',              label: 'Pre-Con Scheduled' },
    { key: 'start',               label: 'Start Date Given' },
    { key: 'demo',                label: 'Demo' },
    { key: 'materials',           label: 'Material Ordered' },
    { key: 'framing_restructure', label: 'Framing/Restructuring Complete' },
    { key: 'decking_railings',    label: 'Decking and Railings Installed' },
    { key: 'paint',               label: 'Paint Completed' },
    { key: 'punch',               label: 'Punch List' },
    { key: 'closed',              label: 'Job Closed' },
  ],
  deck_new: [
    { key: 'hoa',               label: 'HOA Approval' },
    { key: 'zoning',            label: 'Zoning Permit' },
    { key: 'building',          label: 'Building Permit' },
    { key: 'precon',            label: 'Pre-Con Scheduled' },
    { key: 'start',             label: 'Start Date Given' },
    { key: 'demo_footings',     label: 'Demo and Footings' },
    { key: 'footing_insp',      label: 'Footing Inspection Completed' },
    { key: 'materials',         label: 'Material Ordered' },
    { key: 'framing',           label: 'Framing Complete' },
    { key: 'floor_framing_insp',label: 'Floor Framing Inspection' },
    { key: 'decking_railings',  label: 'Decking and Railings Installed' },
    { key: 'paint',             label: 'Paint Completed' },
    { key: 'final_insp',        label: 'Final Inspection' },
    { key: 'punch',             label: 'Punch List' },
    { key: 'closed',            label: 'Job Closed' },
  ],
  porch_ground: [
    { key: 'hoa',                 label: 'HOA Approval' },
    { key: 'zoning',              label: 'Zoning Permit' },
    { key: 'building',            label: 'Building Permit' },
    { key: 'precon',              label: 'Pre-Con Scheduled' },
    { key: 'start',               label: 'Start Date Given' },
    { key: 'demo_footings',       label: 'Demo and Footings' },
    { key: 'footing_insp',        label: 'Footing Inspection Completed' },
    { key: 'materials',           label: 'Material Ordered' },
    { key: 'roof',                label: 'Roof Complete' },
    { key: 'rough_electrical',    label: 'Rough Electrical Complete' },
    { key: 'rough_building_insp', label: 'Rough Building Inspection' },
    { key: 'rough_elec_insp',     label: 'Rough Electrical Inspection' },
    { key: 'carpentry',           label: 'Carpentry Finish' },
    { key: 'paint',               label: 'Paint Completed' },
    { key: 'electrical_finish',   label: 'Electrical Finish' },
    { key: 'final_insp',          label: 'Final Inspection' },
    { key: 'punch',               label: 'Punch List' },
    { key: 'closed',              label: 'Job Closed' },
  ],
  porch_ground_windows: [
    { key: 'hoa',                 label: 'HOA Approval' },
    { key: 'zoning',              label: 'Zoning Permit' },
    { key: 'building',            label: 'Building Permit' },
    { key: 'precon',              label: 'Pre-Con Scheduled' },
    { key: 'start',               label: 'Start Date Given' },
    { key: 'demo_footings',       label: 'Demo and Footings' },
    { key: 'footing_insp',        label: 'Footing Inspection Completed' },
    { key: 'materials',           label: 'Material Ordered' },
    { key: 'roof',                label: 'Roof Complete' },
    { key: 'rough_electrical',    label: 'Rough Electrical Complete' },
    { key: 'rough_building_insp', label: 'Rough Building Inspection' },
    { key: 'rough_elec_insp',     label: 'Rough Electrical Inspection' },
    { key: 'carpentry',           label: 'Carpentry Finish' },
    { key: 'paint',               label: 'Paint Completed' },
    { key: 'electrical_finish',   label: 'Electrical Finish' },
    { key: 'window_delivery',     label: 'Window Delivery' },
    { key: 'windows_glass',       label: 'Windows, Doors and Glass Installed' },
    { key: 'final_insp',          label: 'Final Inspection' },
    { key: 'punch',               label: 'Punch List' },
    { key: 'closed',              label: 'Job Closed' },
  ],
  porch_over_deck: [
    { key: 'hoa',                 label: 'HOA Approval' },
    { key: 'zoning',              label: 'Zoning Permit' },
    { key: 'building',            label: 'Building Permit' },
    { key: 'precon',              label: 'Pre-Con Scheduled' },
    { key: 'start',               label: 'Start Date Given' },
    { key: 'demo_footings',       label: 'Demo and Footings' },
    { key: 'footing_insp',        label: 'Footing Inspection Completed' },
    { key: 'floor_framing_insp',  label: 'Floor Framing Inspection' },
    { key: 'install_decking',     label: 'Install Decking' },
    { key: 'roof_framing',        label: 'Roof Framing Complete' },
    { key: 'rough_electrical',    label: 'Rough Electrical Complete' },
    { key: 'rough_building_insp', label: 'Rough Building Inspection' },
    { key: 'rough_elec_insp',     label: 'Rough Electrical Inspection' },
    { key: 'carpentry',           label: 'Carpentry Finish' },
    { key: 'paint',               label: 'Paint Completed' },
    { key: 'electrical_finish',   label: 'Electrical Finish' },
    { key: 'final_insp',          label: 'Final Inspection' },
    { key: 'punch',               label: 'Punch List' },
    { key: 'closed',              label: 'Job Closed' },
  ],
  porch_over_deck_windows: [
    { key: 'hoa',                 label: 'HOA Approval' },
    { key: 'zoning',              label: 'Zoning Permit' },
    { key: 'building',            label: 'Building Permit' },
    { key: 'precon',              label: 'Pre-Con Scheduled' },
    { key: 'start',               label: 'Start Date Given' },
    { key: 'demo_footings',       label: 'Demo and Footings' },
    { key: 'footing_insp',        label: 'Footing Inspection Completed' },
    { key: 'floor_framing_insp',  label: 'Floor Framing Inspection' },
    { key: 'install_decking',     label: 'Install Decking' },
    { key: 'roof_framing',        label: 'Roof Framing Complete' },
    { key: 'rough_electrical',    label: 'Rough Electrical Complete' },
    { key: 'rough_building_insp', label: 'Rough Building Inspection' },
    { key: 'rough_elec_insp',     label: 'Rough Electrical Inspection' },
    { key: 'carpentry',           label: 'Carpentry Finish' },
    { key: 'paint',               label: 'Paint Completed' },
    { key: 'electrical_finish',   label: 'Electrical Finish' },
    { key: 'window_delivery',     label: 'Window Delivery' },
    { key: 'windows_glass',       label: 'Windows, Doors and Glass Installed' },
    { key: 'final_insp',          label: 'Final Inspection' },
    { key: 'punch',               label: 'Punch List' },
    { key: 'closed',              label: 'Job Closed' },
  ],
  pergola: [
    { key: 'hoa',       label: 'HOA Approval' },
    { key: 'precon',    label: 'Pre-Con Scheduled' },
    { key: 'start',     label: 'Start Date Given' },
    { key: 'materials', label: 'Materials Ordered' },
    { key: 'demo',      label: 'Demo / Site Prep' },
    { key: 'footing',   label: 'Posts & Footings' },
    { key: 'framing',   label: 'Beam & Rafter Install' },
    { key: 'finish',    label: 'Stain / Seal' },
    { key: 'punch',     label: 'Punch List' },
    { key: 'closed',    label: 'Job Closed' },
  ],
  gazebo: [
    { key: 'hoa',        label: 'HOA Approval' },
    { key: 'building',   label: 'Building Permit' },
    { key: 'precon',     label: 'Pre-Con Scheduled' },
    { key: 'start',      label: 'Start Date Given' },
    { key: 'materials',  label: 'Materials Ordered' },
    { key: 'footing',    label: 'Foundation / Footings' },
    { key: 'framing',    label: 'Structure Complete' },
    { key: 'roof',       label: 'Roof Installed' },
    { key: 'finish',     label: 'Stain / Seal / Finish' },
    { key: 'final_insp', label: 'Final Inspection' },
    { key: 'punch',      label: 'Punch List' },
    { key: 'closed',     label: 'Job Closed' },
  ],
}

const JOB_TYPE_OPTIONS = [
  'Porch Conversion',
  'Deck (New)',
  'Deck (Resurface / Rebuild)',
  'Ground Level Porch',
  'Ground Level Porch + Windows',
  'Porch Over Deck',
  'Porch Over Deck + Windows',
  'Pergola',
  'Gazebo',
]

export function getStages(proposal) {
  // Manual override set in the job card takes priority
  const override = proposal.jobData?.projectTypeOverride
  if (override) {
    if (override === 'Porch Conversion')              return STAGE_TEMPLATES.porch_conversion
    if (override === 'Deck (Resurface / Rebuild)')    return STAGE_TEMPLATES.deck_resurface
    if (override === 'Deck (New)')                    return STAGE_TEMPLATES.deck_new
    if (override === 'Ground Level Porch')            return STAGE_TEMPLATES.porch_ground
    if (override === 'Ground Level Porch + Windows')  return STAGE_TEMPLATES.porch_ground_windows
    if (override === 'Porch Over Deck')               return STAGE_TEMPLATES.porch_over_deck
    if (override === 'Porch Over Deck + Windows')     return STAGE_TEMPLATES.porch_over_deck_windows
    if (override === 'Pergola')                       return STAGE_TEMPLATES.pergola
    if (override === 'Gazebo')                        return STAGE_TEMPLATES.gazebo
  }

  const types = proposal.contractDraft?.projectTypes || []
  const scope = [
    ...(proposal.contractDraft?.scopeBullets || []),
    ...(proposal.contractDraft?.scopeLines   || []),
  ].join(' ')
  const hasWindows = /window|glass|enclos/i.test(scope)

  const isDeckType  = types.some(t => ['Deck', 'Deck (New)', 'Deck (Resurface / Rebuild)'].includes(t))
  const isPorchType = types.some(t => ['Screened Porch', 'Open Porch', 'Ground Level Porch', 'Porch Over Deck'].includes(t))

  if (types.includes('Porch Conversion') || types.includes('Sunroom'))
    return STAGE_TEMPLATES.porch_conversion
  if (types.includes('Deck (Resurface / Rebuild)'))
    return STAGE_TEMPLATES.deck_resurface
  if (types.includes('Porch Over Deck') || (isDeckType && isPorchType))
    return hasWindows ? STAGE_TEMPLATES.porch_over_deck_windows : STAGE_TEMPLATES.porch_over_deck
  if (types.includes('Deck (New)') || types.includes('Deck'))
    return STAGE_TEMPLATES.deck_new
  if (types.includes('Ground Level Porch') || types.includes('Screened Porch') || types.includes('Open Porch'))
    return hasWindows ? STAGE_TEMPLATES.porch_ground_windows : STAGE_TEMPLATES.porch_ground
  if (types.includes('Pergola')) return STAGE_TEMPLATES.pergola
  if (types.includes('Gazebo'))  return STAGE_TEMPLATES.gazebo

  return null  // no type detected — force manual selection
}

const CO_STATUSES = ['Draft', 'Pending', 'Sent for Signature', 'Approved', 'Rejected']
const CO_STATUS_STYLE = {
  Draft:                'bg-gray-100 text-gray-600',
  Pending:              'bg-amber-100 text-amber-700',
  'Sent for Signature': 'bg-blue-100 text-blue-700',
  Approved:             'bg-green-100 text-green-700',
  Rejected:             'bg-red-100 text-red-700',
}

// Running contract total a new/edited change order builds on: the original
// contract plus every prior (non-rejected) change order — so each CO picks up
// where the last one left off instead of resetting to the original price.
function baseTotalForCO(proposal, existingCo) {
  const base = contractTotalOf(proposal)
  const cos = proposal.jobData?.changeOrders || []
  const prior = existingCo
    ? cos.slice(0, Math.max(0, cos.findIndex(c => c.id === existingCo.id)))
    : cos
  return base + prior
    .filter(c => c.status !== 'Rejected')
    .reduce((s, c) => s + Number(c.amount || 0), 0)
}

// ── CO Builder Modal ──────────────────────────────────────────────────────────
function COBuilderModal({ proposal, existingCo, onClose, onSave }) {
  const catalog  = useStore(s => s.catalog)
  const branding = useStore(s => s.branding)
  const contractNum = proposal.contractDraft?.contractNum || contractNumberFor(proposal.id)
  const coIndex = existingCo
    ? (proposal.jobData?.changeOrders || []).findIndex(c => c.id === existingCo.id) + 1
    : (proposal.jobData?.changeOrders || []).length + 1
  const coNumber = `${contractNum}-CO-${String(coIndex).padStart(3,'0')}`

  // Flatten scope lines into a single newline-separated string for editing
  const initScopeText = () => {
    const src = existingCo?.scopeLines || proposal.contractDraft?.scopeLines || []
    return src.map(l => typeof l === 'string' ? l : (l?.text || l?.name || '')).filter(Boolean).join('\n')
  }
  // Pre-fill the payment schedule so you don't rebuild it: use this CO's own
  // schedule when editing, otherwise the most recent (non-rejected) change
  // order's schedule, falling back to the original contract's.
  const initPayments = () => {
    if (existingCo?.payments?.length) return existingCo.payments.map(p => ({ ...p }))
    const cos = proposal.jobData?.changeOrders || []
    const scope = existingCo
      ? cos.slice(0, Math.max(0, cos.findIndex(c => c.id === existingCo.id)))
      : cos
    const withPay = scope.filter(c => c.status !== 'Rejected' && c.payments?.length)
    const latest = withPay.length ? withPay[withPay.length - 1] : null
    const src = latest?.payments?.length ? latest.payments : (proposal.contractDraft?.payments || [])
    return src.map(p => ({ ...p }))
  }

  const [description, setDescription] = useState(existingCo?.description || '')
  const [lines, setLines]             = useState(existingCo?.lines || [])
  const [notes, setNotes]             = useState(existingCo?.notes || '')
  const [search, setSearch]           = useState('')
  const [sending, setSending]         = useState(false)
  const [scopeText, setScopeText]     = useState(initScopeText)
  const [coPayments, setCoPayments]   = useState(initPayments)
  // Scope + payment sections collapse so the modal opens compact; auto-expanded
  // only when they already carry data. All fields are preserved either way.
  const [scopeOpen, setScopeOpen]     = useState(() => initScopeText().trim().length > 0)
  const [payOpen, setPayOpen]         = useState(() => initPayments().length > 0)

  const categories = [...new Set(catalog.map(i => i.category).filter(Boolean))]
  const [catFilter, setCatFilter] = useState('All')

  const filtered = catalog.filter(item => {
    const matchSearch = !search || item.name.toLowerCase().includes(search.toLowerCase()) ||
      (item.description || '').toLowerCase().includes(search.toLowerCase())
    const matchCat = catFilter === 'All' || item.category === catFilter
    return matchSearch && matchCat
  })

  const total = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unitPrice) || 0), 0)
  const baseTotal = baseTotalForCO(proposal, existingCo)  // original + prior change orders
  const newTotal = baseTotal + total
  const paymentSum = coPayments.reduce((s, p) => s + Number(p.amount || 0), 0)

  const addFromCatalog = (item) => {
    setLines(prev => [...prev, { id: Date.now(), desc: item.name, qty: 1, unit: item.unit || 'EA', unitPrice: item.unitPrice || 0 }])
    setSearch('')
  }

  const addCustom = () =>
    setLines(prev => [...prev, { id: Date.now(), desc: '', qty: 1, unit: 'EA', unitPrice: 0 }])

  const updateLine = (id, field, val) =>
    setLines(prev => prev.map(l => l.id === id ? { ...l, [field]: val } : l))

  const removeLine = (id) =>
    setLines(prev => prev.filter(l => l.id !== id))

  // Payment schedule helpers
  const updatePayment = (i, field, val) =>
    setCoPayments(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: val } : p))
  const addPayment = () =>
    setCoPayments(prev => [...prev, { label: '', pct: 0, amount: 0 }])
  const removePayment = (i) =>
    setCoPayments(prev => prev.filter((_, idx) => idx !== i))

  const handleSave = async (sendForSig) => {
    if (sendForSig && !description.trim()) return   // a draft can be nameless
    setSending(true)
    try {
    // Convert text block back to bullet array
    const scopeLines = scopeText.split('\n').map(s => s.trim()).filter(Boolean).map(text => ({ text }))
    // Recalculate pct for each payment based on total contract value
    const paymentsWithPct = coPayments.map(p => ({
      ...p,
      pct: newTotal > 0 ? Number(p.amount || 0) / newTotal : 0,
    }))
    await onSave({
      // Saving without sending = a Draft; sending flips to 'Sent for Signature'.
      status: sendForSig ? 'Pending' : 'Draft',
      description: description.trim() || 'Untitled change order',
      lines,
      amount: total,
      notes,
      coNumber,
      scopeLines,
      payments: paymentsWithPct,
      originalTotal: baseTotal,   // running total this CO builds on
      newTotal,
      branding: {
        logo:        branding?.logo || null,
        companyName: branding?.companyName || 'Your Company',
      },
    }, sendForSig)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-4xl max-h-[95vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <p className="font-semibold text-gray-900">Change Order Builder</p>
            <p className="text-xs text-gray-400">{coNumber} · {proposal.client}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-5 space-y-5">

            {/* Description */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Change Description *</label>
              <textarea rows={2} value={description} onChange={e => setDescription(e.target.value)}
                placeholder="Describe the scope change — e.g. Add ceiling fan rough-in and outlet on screened porch…"
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none" />
            </div>

            {/* Catalog search */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Add Items from Catalog</label>
              <div className="flex gap-2 mb-2">
                <div className="relative flex-1">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Search catalog…"
                    className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
                  className="text-xs border border-gray-200 rounded-xl px-2.5 py-2 focus:outline-none">
                  <option value="All">All</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              {(search || catFilter !== 'All') && (
                <div className="border border-gray-200 rounded-xl max-h-48 overflow-y-auto divide-y divide-gray-100">
                  {filtered.length === 0 && <p className="text-xs text-gray-400 px-3 py-2">No items found.</p>}
                  {filtered.map(item => (
                    <button key={item.id} onClick={() => addFromCatalog(item)}
                      className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                        <p className="text-xs text-gray-400">{item.category} · {item.unit}</p>
                      </div>
                      <span className="text-sm font-semibold text-blue-600 shrink-0">${fmtDol(item.unitPrice)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Line items */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Line Items</label>
                <button onClick={addCustom} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
                  <Plus size={12} /> Custom item
                </button>
              </div>
              {lines.length === 0 && (
                <p className="text-xs text-gray-400 italic py-2">No items yet — search the catalog above or add a custom item.</p>
              )}
              {lines.length > 0 && (
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="grid grid-cols-[1fr_60px_80px_80px_32px] gap-2 px-3 py-2 bg-gray-50 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                    <span>Description</span><span>Qty</span><span>Unit $</span><span>Subtotal</span><span />
                  </div>
                  {lines.map(l => (
                    <div key={l.id} className="grid grid-cols-[1fr_60px_80px_80px_32px] gap-2 px-3 py-2 border-t border-gray-100 items-center">
                      <input value={l.desc} onChange={e => updateLine(l.id, 'desc', e.target.value)}
                        placeholder="Item description"
                        className="text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300 w-full" />
                      <input type="number" min="0" value={l.qty} onChange={e => updateLine(l.id, 'qty', e.target.value)}
                        className="text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300 w-full" />
                      <input type="number" step="0.01" value={l.unitPrice} onChange={e => updateLine(l.id, 'unitPrice', e.target.value)}
                        placeholder="0.00 (use − to credit)"
                        className="text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300 w-full" />
                      <span className="text-sm font-medium text-gray-700 text-right">${fmtDol((Number(l.qty)||0)*(Number(l.unitPrice)||0))}</span>
                      <button onClick={() => removeLine(l.id)} className="text-gray-300 hover:text-red-500 flex justify-center"><Trash2 size={13} /></button>
                    </div>
                  ))}
                  <div className="grid grid-cols-[1fr_60px_80px_80px_32px] gap-2 px-3 py-2.5 bg-gray-50 border-t border-gray-200">
                    <span className="text-xs font-semibold text-gray-500 col-span-3 text-right">CO Total</span>
                    <span className="text-sm font-bold text-gray-900">${fmtDol(total)}</span>
                    <span />
                  </div>
                </div>
              )}
            </div>

            {/* Financial summary */}
            {total !== 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">Current Total</p>
                  <p className="text-sm font-bold text-gray-800">${fmtDol(baseTotal)}</p>
                  {baseTotal !== contractTotalOf(proposal) && (
                    <p className="text-[9px] text-gray-400 mt-0.5">incl. prior change orders</p>
                  )}
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">This Change Order</p>
                  <p className={`text-sm font-bold ${total < 0 ? 'text-red-600' : 'text-blue-700'}`}>
                    {total < 0 ? '−' : '+'}${fmtDol(Math.abs(total))}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">New Contract Total</p>
                  <p className="text-sm font-bold text-green-700">${fmtDol(newTotal)}</p>
                </div>
              </div>
            )}

            {/* Updated Scope of Work */}
            <div className="border border-gray-200 rounded-xl">
              <button type="button" onClick={() => setScopeOpen(o => !o)}
                className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <span>Updated Scope of Work</span>
                {scopeOpen ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
              </button>
              {scopeOpen && (
                <div className="px-4 pb-4">
                  <p className="text-[10px] text-gray-400 mb-2">Start a line with <strong>--</strong> to make it a bullet. Plain lines print as text. Enter = new line.</p>
                  <textarea
                    value={scopeText}
                    onChange={e => setScopeText(e.target.value)}
                    placeholder={"-- Line 1 becomes a bullet\n-- Line 2 becomes a bullet\nPlain text line (no bullet)"}
                    className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-300"
                    style={{ minHeight: '10rem', resize: 'vertical' }}
                  />
                </div>
              )}
            </div>

            {/* Updated Payment Schedule */}
            <div className="border border-gray-200 rounded-xl">
              <div className="flex items-center justify-between px-4 py-3">
                <button type="button" onClick={() => setPayOpen(o => !o)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {payOpen ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                  Updated Payment Schedule
                </button>
                {payOpen && (
                  <button onClick={addPayment} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
                    <Plus size={12} /> Add milestone
                  </button>
                )}
              </div>
              {payOpen && (
              <div className="px-4 pb-4">
              <p className="text-[10px] text-gray-400 mb-2">Pre-filled from contract. Adjust amounts to match new contract total.</p>
              {coPayments.length === 0 && (
                <p className="text-xs text-gray-400 italic py-1">No milestones — click "Add milestone" to start.</p>
              )}
              {coPayments.length > 0 && (
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="grid grid-cols-[1fr_100px_32px] gap-2 px-3 py-2 bg-gray-50 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                    <span>Milestone</span><span className="text-right">Amount</span><span />
                  </div>
                  {coPayments.map((p, i) => (
                    <div key={i} className="grid grid-cols-[1fr_100px_32px] gap-2 px-3 py-2 border-t border-gray-100 items-center">
                      <input value={p.label} onChange={e => updatePayment(i, 'label', e.target.value)}
                        placeholder="Milestone label"
                        className="text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300 w-full" />
                      <input type="number" min="0" step="0.01" value={p.amount} onChange={e => updatePayment(i, 'amount', e.target.value)}
                        className="text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300 w-full text-right" />
                      <button onClick={() => removePayment(i)} className="text-gray-300 hover:text-red-500 flex justify-center">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                  <div className="grid grid-cols-[1fr_100px_32px] gap-2 px-3 py-2.5 bg-gray-50 border-t border-gray-200">
                    <span className="text-xs font-semibold text-gray-500 text-right">Schedule Total</span>
                    <span className={`text-sm font-bold text-right ${Math.abs(paymentSum - newTotal) > 1 ? 'text-red-600' : 'text-green-700'}`}>
                      ${fmtDol(paymentSum)}
                    </span>
                    <span />
                  </div>
                </div>
              )}
              {coPayments.length > 0 && Math.abs(paymentSum - newTotal) > 1 && (
                <p className="text-xs text-amber-600 mt-1">Schedule total (${fmtDol(paymentSum)}) doesn't match new contract total (${fmtDol(newTotal)})</p>
              )}
              </div>
              )}
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Internal Notes</label>
              <input value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="e.g. customer requested at pre-con, materials already ordered"
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300" />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 shrink-0">
          {(!description.trim() || !proposal.email) && (
            <p className="text-xs text-gray-400 mb-2">
              {!description.trim() && 'Add a description to send for signature. '}
              {!proposal.email && 'No customer email on file — you can still Save Draft.'}
            </p>
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
            <button onClick={() => handleSave(false)} disabled={sending}
              className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40">
              Save Draft
            </button>
            <button onClick={() => handleSave(true)} disabled={!description.trim() || sending || !proposal.email}
              className="flex-1 flex items-center justify-center gap-2 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors">
              <PenLine size={14} />
              {sending ? 'Sending…' : 'Save & Send for Signature'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Budget tab ────────────────────────────────────────────────────────────────
function BudgetTab({ proposal }) {
  const [showBreakdown, setShowBreakdown] = useState(false)
  const fmtD = n => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  // Budget/P&L must reflect only the items actually in the contract. For an à la
  // carte job the contract covers a subset of the proposal lines, so filter down
  // to the lines whose ids are in the signed scope (cost data lives on the
  // proposal lines, which the scope entries don't carry). Falls back to all
  // lines when there's no contract draft yet, or if ids don't line up.
  const allLines = proposal.lines || []
  const scopeIds = Array.isArray(proposal.contractDraft?.scopeLines) && proposal.contractDraft.scopeLines.length
    ? new Set(proposal.contractDraft.scopeLines.map(l => String(l.id)))
    : null
  const scoped = scopeIds ? allLines.filter(l => scopeIds.has(String(l.id))) : allLines
  const lines = scoped.length ? scoped : allLines
  const hasCostData = lines.some(l => (l.costMaterials || 0) + (l.costSub || 0) > 0)

  const rows = lines.map(l => {
    const qty        = Number(l.qty) || 1
    const revenue    = qty * (Number(l.unitPrice) || 0)
    const matCost    = qty * (Number(l.costMaterials) || 0)
    const subCost    = qty * (Number(l.costSub) || 0)
    const totalCost  = matCost + subCost
    const margin     = revenue - totalCost
    const marginPct  = revenue > 0 ? Math.round(margin / revenue * 100) : null
    return { ...l, qty, revenue, matCost, subCost, totalCost, margin, marginPct }
  })

  const totals = rows.reduce((acc, r) => ({
    revenue:   acc.revenue   + r.revenue,
    matCost:   acc.matCost   + r.matCost,
    subCost:   acc.subCost   + r.subCost,
    totalCost: acc.totalCost + r.totalCost,
    margin:    acc.margin    + r.margin,
  }), { revenue: 0, matCost: 0, subCost: 0, totalCost: 0, margin: 0 })

  const overallMarginPct = totals.revenue > 0
    ? Math.round(totals.margin / totals.revenue * 100)
    : null

  if (lines.length === 0) {
    return (
      <div className="p-6 text-center text-gray-400 text-sm">
        No line items found. Budget is generated from the proposal's line items.
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      {!hasCostData && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700">
          No cost data found on these line items. Add material and subcontractor costs in the Item Catalog to populate this budget.
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Contract Value',    value: `$${fmtD(totals.revenue)}`,   color: 'text-gray-900' },
          { label: 'Materials Budget',  value: `$${fmtD(totals.matCost)}`,   color: 'text-blue-700' },
          { label: 'Sub Budget',        value: `$${fmtD(totals.subCost)}`,   color: 'text-gray-700' },
          { label: 'Gross Profit',      value: `$${fmtD(totals.margin)}${overallMarginPct !== null ? ` (${overallMarginPct}%)` : ''}`,
            color: totals.margin >= 0 ? 'text-green-700' : 'text-red-600' },
        ].map(c => (
          <div key={c.label} className="bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
            <p className="text-xs text-gray-400 mb-0.5">{c.label}</p>
            <p className={`text-base font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Line-item breakdown (collapsed by default to keep the tiles front-and-center) */}
      <button onClick={() => setShowBreakdown(o => !o)}
        className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800">
        {showBreakdown ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        {showBreakdown ? 'Hide line-item breakdown' : 'Show line-item breakdown'}
      </button>

      {showBreakdown && (
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Item', 'Qty', 'Client Price', 'Materials', 'Sub', 'Total Cost', 'Margin'].map(h => (
                <th key={h} className="px-3 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((r, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-3 py-2.5 font-medium text-gray-800 max-w-[160px]">
                  <p className="truncate">{r.name}</p>
                  {r.description && <p className="text-gray-400 italic truncate">{r.description}</p>}
                </td>
                <td className="px-3 py-2.5 text-gray-500">{r.qty}</td>
                <td className="px-3 py-2.5 font-semibold text-gray-900">${fmtD(r.revenue)}</td>
                <td className="px-3 py-2.5 text-blue-700">{r.matCost > 0 ? `$${fmtD(r.matCost)}` : <span className="text-gray-300">—</span>}</td>
                <td className="px-3 py-2.5 text-gray-700">{r.subCost > 0 ? `$${fmtD(r.subCost)}` : <span className="text-gray-300">—</span>}</td>
                <td className="px-3 py-2.5 text-gray-700">{r.totalCost > 0 ? `$${fmtD(r.totalCost)}` : <span className="text-gray-300">—</span>}</td>
                <td className="px-3 py-2.5">
                  {r.totalCost > 0 ? (
                    <span className={`font-semibold ${r.margin >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      ${fmtD(r.margin)}{r.marginPct !== null ? ` (${r.marginPct}%)` : ''}
                    </span>
                  ) : <span className="text-gray-300">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 border-t-2 border-gray-300">
            <tr>
              <td colSpan={2} className="px-3 py-2.5 font-bold text-gray-700 uppercase text-xs tracking-wider">TOTAL</td>
              <td className="px-3 py-2.5 font-bold text-gray-900">${fmtD(totals.revenue)}</td>
              <td className="px-3 py-2.5 font-bold text-blue-700">${fmtD(totals.matCost)}</td>
              <td className="px-3 py-2.5 font-bold text-gray-700">${fmtD(totals.subCost)}</td>
              <td className="px-3 py-2.5 font-bold text-gray-700">${fmtD(totals.totalCost)}</td>
              <td className="px-3 py-2.5 font-bold text-green-700">
                ${fmtD(totals.margin)}{overallMarginPct !== null ? ` (${overallMarginPct}%)` : ''}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      )}
    </div>
  )
}

// ── Change Orders tab ──────────────────────────────────────────────────────────
function ChangeOrdersTab({ proposal }) {
  const { addChangeOrder, updateChangeOrder, deleteChangeOrder } = useStore()
  const branding = useStore(s => s.branding)
  const [builderOpen, setBuilderOpen] = useState(false)
  const [editingCo, setEditingCo]     = useState(null)
  const [checking, setChecking]       = useState(null)
  const [sendingId, setSendingId]     = useState(null)
  const cos   = proposal.jobData?.changeOrders || []
  const approved = cos.filter(c => c.status === 'Approved').reduce((s, c) => s + Number(c.amount || 0), 0)
  const contractNum = proposal.contractDraft?.contractNum || contractNumberFor(proposal.id)

  // Auto-check signature status for any CO awaiting sig
  useEffect(() => {
    const pending = cos.filter(c => c.signRecordId && c.status === 'Sent for Signature')
    pending.forEach(async co => {
      try {
        const res = await fetch(`/api/co/record-${co.signRecordId}`)
        if (!res.ok) return
        const rec = await res.json()
        if (rec.signatures?.client) {
          updateChangeOrder(proposal.id, co.id, {
            status: 'Approved',
            signedAt: rec.signatures.client.signedAt,
          })
        }
      } catch {}
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async (coData, sendForSig) => {
    let coId
    if (editingCo) {
      updateChangeOrder(proposal.id, editingCo.id, coData)
      coId = editingCo.id
    } else {
      const id = Date.now()
      addChangeOrder(proposal.id, { ...coData, id })
      coId = id
    }

    if (sendForSig) {
      try {
        const coBase = coData.originalTotal != null ? Number(coData.originalTotal) : contractTotalOf(proposal)
        const coPayload = {
          coNumber:      coData.coNumber,
          contractNum,
          description:   coData.description,
          lines:         coData.lines,
          scopeLines:    coData.scopeLines || [],
          payments:      coData.payments   || [],
          originalTotal: coBase,
          newTotal:      coData.newTotal != null ? Number(coData.newTotal) : coBase + Number(coData.amount),
          client:        proposal.client,
          address:       proposal.address,
          branding:      coData.branding || {},
        }
        const res = await fetch('/api/co/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ coData: coPayload }),
        })
        const { recordId, links } = await res.json()
        updateChangeOrder(proposal.id, editingCo?.id || coId, {
          signRecordId:   recordId,
          signLink:       links.client,
          builderSignLink: links.builder,
          status:         'Sent for Signature',
        })
        await fetch('/api/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action:      'co-signature-request',
            to:          proposal.email,
            client:      proposal.client,
            coNumber:    coData.coNumber,
            description: coData.description,
            amount:      coData.amount,
            signLink:    links.client,
          }),
        })
      } catch (err) {
        console.error('CO sign/email error:', err)
      }
    }
    setBuilderOpen(false)
    setEditingCo(null)
  }

  // Generate a signing link for an already-drafted CO and send it — no rebuild.
  const sendForSignature = async (co) => {
    setSendingId(co.id)
    try {
      const coBase = co.originalTotal != null ? Number(co.originalTotal) : baseTotalForCO(proposal, co)
      const coPayload = {
        coNumber:      co.coNumber,
        contractNum,
        description:   co.description,
        lines:         co.lines || [],
        scopeLines:    co.scopeLines || [],
        payments:      co.payments  || [],
        originalTotal: coBase,
        newTotal:      co.newTotal != null ? Number(co.newTotal) : coBase + Number(co.amount || 0),
        client:        proposal.client,
        address:       proposal.address,
        branding:      { logo: branding?.logo || null, companyName: branding?.companyName || 'Your Company' },
      }
      const res = await fetch('/api/co/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coData: coPayload }),
      })
      if (!res.ok) throw new Error('link')
      const { recordId, links } = await res.json()
      updateChangeOrder(proposal.id, co.id, {
        signRecordId:    recordId,
        signLink:        links.client,
        builderSignLink: links.builder,
        status:          'Sent for Signature',
      })
      if (proposal.email) {
        await fetch('/api/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action:      'co-signature-request',
            to:          proposal.email,
            client:      proposal.client,
            coNumber:    co.coNumber,
            description: co.description,
            amount:      co.amount,
            signLink:    links.client,
          }),
        })
      }
    } catch {
      alert('Could not generate the signing link. Check your connection and try again.')
    }
    setSendingId(null)
  }

  const checkStatus = async (co) => {
    setChecking(co.id)
    try {
      const res = await fetch(`/api/co/record-${co.signRecordId}`)
      const rec = await res.json()
      const clientSigned  = !!rec.signatures?.client
      const builderSigned = !!rec.signatures?.builder
      if (clientSigned) {
        updateChangeOrder(proposal.id, co.id, {
          status:   builderSigned ? 'Approved' : 'Sent for Signature',
          signedAt: rec.signatures.client.signedAt,
        })
        if (!builderSigned) alert('Client has signed. Waiting for builder signature.')
      } else {
        alert('Not yet signed by client.')
      }
    } catch { alert('Could not reach server.') }
    setChecking(null)
  }

  const copyLink = (link) => {
    navigator.clipboard.writeText(link)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-gray-500">Change Orders</p>
          {approved > 0 && <p className="text-xs text-green-700 font-medium mt-0.5">+${fmtDol(approved)} approved</p>}
        </div>
        <button onClick={() => { setEditingCo(null); setBuilderOpen(true) }}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
          <Plus size={13} /> New CO
        </button>
      </div>

      {cos.length === 0 && (
        <p className="text-xs text-gray-400 italic">No change orders yet.</p>
      )}

      {cos.map(co => (
        <div key={co.id} className="border border-gray-200 rounded-xl p-3 bg-white">
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-mono text-gray-400">{co.coNumber || '—'}</p>
              <p className="text-sm font-medium text-gray-900">{co.description}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => { setEditingCo(co); setBuilderOpen(true) }}
                className="p-1 rounded text-gray-300 hover:text-blue-600" title="Edit"><FileText size={13} /></button>
              <button onClick={() => { if (window.confirm('Delete this change order?')) deleteChangeOrder(proposal.id, co.id) }}
                className="p-1 rounded text-gray-300 hover:text-red-500" title="Delete"><Trash2 size={13} /></button>
            </div>
          </div>

          {/* Line items summary */}
          {co.lines?.length > 0 && (
            <div className="mb-2 text-xs text-gray-500 space-y-0.5">
              {co.lines.map((l, i) => (
                <div key={i} className="flex justify-between">
                  <span className="truncate flex-1">{l.desc}</span>
                  <span className="ml-2 shrink-0">{l.qty} × ${fmtDol(l.unitPrice)} = ${fmtDol((Number(l.qty)||0)*(Number(l.unitPrice)||0))}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-bold text-gray-800">${fmtDol(co.amount)}</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CO_STATUS_STYLE[co.status] || CO_STATUS_STYLE.Pending}`}>
              {co.status}
            </span>
            <span className="text-xs text-gray-400">{fmtDate(co.createdAt)}</span>
          </div>

          {/* Not sent yet — one tap to generate the link and send it */}
          {!co.signLink && co.status !== 'Approved' && (
            <div className="mt-2">
              <button onClick={() => sendForSignature(co)} disabled={sendingId === co.id}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
                <Send size={12} />
                {sendingId === co.id ? 'Generating…' : (proposal.email ? 'Generate link & send to client' : 'Generate signing link')}
              </button>
              {!proposal.email && (
                <p className="text-[11px] text-gray-400 mt-1">No email on file for this customer — the link will be created for you to copy and send.</p>
              )}
            </div>
          )}

          {/* Signing actions */}
          {co.signLink && co.status === 'Sent for Signature' && (
            <div className="mt-2 space-y-1.5">
              <div className="flex gap-2 flex-wrap">
                <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider self-center">Client:</span>
                <button onClick={() => copyLink(co.signLink)}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
                  <Link2 size={11} /> Copy
                </button>
                <a href={co.signLink} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
                  <ExternalLink size={11} /> Preview
                </a>
              </div>
              {co.builderSignLink && (
                <div className="flex gap-2 flex-wrap">
                  <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider self-center">Builder:</span>
                  <button onClick={() => copyLink(co.builderSignLink)}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
                    <Link2 size={11} /> Copy
                  </button>
                  <a href={co.builderSignLink} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
                    <ExternalLink size={11} /> Preview
                  </a>
                </div>
              )}
              <button onClick={() => checkStatus(co)} disabled={checking === co.id}
                className="flex items-center gap-1 text-xs text-green-700 hover:text-green-900 font-medium disabled:opacity-50">
                <RefreshCw size={11} className={checking === co.id ? 'animate-spin' : ''} />
                {checking === co.id ? 'Checking…' : 'Check Signatures'}
              </button>
            </div>
          )}
          {co.status === 'Approved' && (
            <div className="mt-1.5 flex items-center gap-3 flex-wrap">
              {co.signedAt && (
                <span className="text-xs text-green-700 flex items-center gap-1">
                  <CheckCircle2 size={11} /> Signed {fmtDate(co.signedAt)}
                </span>
              )}
              {co.signLink && (
                <a href={co.signLink} target="_blank" rel="noreferrer"
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1">
                  <ExternalLink size={11} /> View signed copy
                </a>
              )}
            </div>
          )}
          {co.notes && <p className="text-xs text-gray-500 mt-1">{co.notes}</p>}
        </div>
      ))}

      {builderOpen && (
        <COBuilderModal
          proposal={proposal}
          existingCo={editingCo}
          onClose={() => { setBuilderOpen(false); setEditingCo(null) }}
          onSave={handleSave}
        />
      )}
    </div>
  )
}

// ── Daily Log tab ────────────────────────────────────────────────────────────
function DailyLogTab({ proposal }) {
  const { addDailyLog, deleteDailyLog } = useStore()
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ date: today(), crew: '', weather: '', notes: '' })
  const logs = proposal.jobData?.dailyLogs || []

  const save = () => {
    if (!form.notes.trim()) return
    addDailyLog(proposal.id, { date: form.date, crew: form.crew, weather: form.weather, notes: form.notes })
    setForm({ date: today(), crew: '', weather: '', notes: '' })
    setAdding(false)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-500">{logs.length} log{logs.length !== 1 ? 's' : ''}</p>
        <button onClick={() => setAdding(true)}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
          <Plus size={13} /> Add log
        </button>
      </div>

      {adding && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Crew Size</label>
              <input value={form.crew} onChange={e => setForm(f => ({ ...f, crew: e.target.value }))}
                placeholder="e.g. 3 men"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Weather</label>
            <input value={form.weather} onChange={e => setForm(f => ({ ...f, weather: e.target.value }))}
              placeholder="e.g. Sunny 78°F"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Progress Notes</label>
            <textarea rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="What was accomplished today…"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none" />
          </div>
          <div className="flex gap-2">
            <button onClick={save} className="flex-1 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors">Save</button>
            <button onClick={() => setAdding(false)} className="flex-1 py-1.5 border border-gray-200 text-gray-600 text-xs rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {logs.length === 0 && !adding && <p className="text-xs text-gray-400 italic">No daily logs yet.</p>}

      {logs.map(log => (
        <div key={log.id} className="border border-gray-100 rounded-xl p-3">
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs font-semibold text-gray-700">{fmtDate(log.date)}</span>
              {log.crew && <span className="text-xs text-gray-500 flex items-center gap-1"><HardHat size={11} /> {log.crew}</span>}
              {log.weather && <span className="text-xs text-gray-500 flex items-center gap-1"><CloudSun size={11} /> {log.weather}</span>}
            </div>
            <button onClick={() => deleteDailyLog(proposal.id, log.id)}
              className="text-gray-300 hover:text-red-500 shrink-0"><X size={13} /></button>
          </div>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{log.notes}</p>
        </div>
      ))}
    </div>
  )
}

// ── Warranty tab ─────────────────────────────────────────────────────────────
function WarrantyTab({ proposal }) {
  const { addWarrantyItem, updateWarrantyItem } = useStore()
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ description: '', reportedDate: today() })
  const items = proposal.jobData?.warrantyItems || []

  const save = () => {
    if (!form.description.trim()) return
    addWarrantyItem(proposal.id, { description: form.description, reportedDate: form.reportedDate })
    setForm({ description: '', reportedDate: today() })
    setAdding(false)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-gray-500">Warranty / Callbacks</p>
          {items.filter(i => i.status === 'Open').length > 0 && (
            <p className="text-xs text-amber-600 font-medium mt-0.5">
              {items.filter(i => i.status === 'Open').length} open
            </p>
          )}
        </div>
        <button onClick={() => setAdding(true)}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
          <Plus size={13} /> Log issue
        </button>
      </div>

      {adding && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Issue Description</label>
            <textarea rows={2} value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Describe the client's issue…"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date Reported</label>
            <input type="date" value={form.reportedDate}
              onChange={e => setForm(f => ({ ...f, reportedDate: e.target.value }))}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-300" />
          </div>
          <div className="flex gap-2">
            <button onClick={save} className="flex-1 py-1.5 bg-amber-600 text-white text-xs font-medium rounded-lg hover:bg-amber-700 transition-colors">Save</button>
            <button onClick={() => setAdding(false)} className="flex-1 py-1.5 border border-gray-200 text-gray-600 text-xs rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {items.length === 0 && !adding && <p className="text-xs text-gray-400 italic">No warranty items logged.</p>}

      {items.map(item => (
        <div key={item.id} className="border border-gray-200 rounded-xl p-3 bg-white">
          <div className="flex items-start justify-between gap-2 mb-1">
            <p className="text-sm text-gray-900 flex-1">{item.description}</p>
            <select value={item.status}
              onChange={e => updateWarrantyItem(proposal.id, item.id, { status: e.target.value })}
              className={`text-xs font-medium px-2 py-0.5 rounded-full border-0 focus:outline-none shrink-0 ${
                item.status === 'Open' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
              }`}>
              <option value="Open">Open</option>
              <option value="Resolved">Resolved</option>
            </select>
          </div>
          <p className="text-xs text-gray-400">Reported {fmtDate(item.reportedDate)}</p>
          {item.status === 'Open' && (
            <div className="mt-2">
              <input
                value={item.resolutionNotes || ''}
                onChange={e => updateWarrantyItem(proposal.id, item.id, { resolutionNotes: e.target.value })}
                placeholder="Resolution notes…"
                className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-300"
              />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// Default payment milestone templates (mirrors ContractView.jsx)
const PM_STANDARD = [
  { label: 'Schedule deposit — @ sign contract',            pct: 0.20 },
  { label: 'Start payment — Material drop / Framing Start', pct: 0.30 },
  { label: 'Roof Completion',                               pct: 0.40 },
  { label: 'Paint Applied',                                 pct: 0.05 },
  { label: 'Substantial completion payment',                pct: 0.05 },
]
const PM_UNDER20K = [
  { label: 'Schedule deposit — @ sign contract', pct: 0.20 },
  { label: 'Material drop / Framing Start',      pct: 0.40 },
  { label: 'Substantial completion payment',     pct: 0.40 },
]

function getPaymentSchedule(proposal) {
  const saved = proposal.contractDraft?.payments
  if (Array.isArray(saved) && saved.length > 0) return saved
  const base = contractTotalOf(proposal)
  return (base < 20000 ? PM_UNDER20K : PM_STANDARD).map(m => ({ ...m, amount: base * m.pct }))
}

// ── Payment Reminder Modal ───────────────────────────────────────────────────
function PaymentReminderModal({ proposal, onClose }) {
  const draft        = proposal.contractDraft || {}
  const contractNum  = draft.contractNum || contractNumberFor(proposal.id)
  const projectTypes = (draft.projectTypes || []).join(', ') || ''

  const schedule       = getPaymentSchedule(proposal)
  const contractBase   = contractTotalOf(proposal)
  const approvedCOs    = (proposal.jobData?.changeOrders || []).filter(co => co.status === 'Approved')
  const approvedCOTotal = approvedChangeOrderTotal(proposal)  // single source of truth
  const pendingCOs     = (proposal.jobData?.changeOrders || []).filter(co => co.status === 'Pending')

  const [selectedIdx, setSelectedIdx] = useState(null)
  const [includeCOs,  setIncludeCOs]  = useState(false)
  const [customAmt,   setCustomAmt]   = useState('')
  const [isCustom,    setIsCustom]    = useState(false)
  const [dueDate,     setDueDate]     = useState('')
  const [sending,     setSending]     = useState(false)
  const [sent,        setSent]        = useState(false)
  const [error,       setError]       = useState('')

  const milestoneAmt   = selectedIdx !== null ? (schedule[selectedIdx]?.amount ?? 0) : 0
  const coAddon        = includeCOs ? approvedCOTotal : 0
  const suggestedAmt   = milestoneAmt + coAddon
  const finalAmt       = isCustom ? Number(customAmt || 0) : suggestedAmt
  const milestoneLabel = selectedIdx !== null ? schedule[selectedIdx]?.label : null

  const selectMilestone = (i) => { setSelectedIdx(i); setIsCustom(false) }

  const send = async () => {
    if (!proposal.email) { setError('No email on file for this client.'); return }
    if (finalAmt <= 0)   { setError('Please select a payment milestone or enter an amount.'); return }
    setSending(true); setError('')
    try {
      const res = await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action:      'payment-reminder',
          toEmail:     proposal.email,
          client:      proposal.client,
          amount:      finalAmt,
          milestone:   milestoneLabel || 'Payment Due',
          dueDate,
          contractNum,
          address:     proposal.address,
          projectType: projectTypes,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send')
      setSent(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
          <div>
            <p className="font-semibold text-gray-900">Send Payment Reminder</p>
            <p className="text-xs text-gray-500 mt-0.5">{proposal.client} · {contractNum}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={15} /></button>
        </div>

        {sent ? (
          <div className="px-5 py-10 text-center">
            <CheckCircle2 size={36} className="text-green-500 mx-auto mb-3" />
            <p className="font-semibold text-gray-900">Reminder Sent!</p>
            <p className="text-sm text-gray-500 mt-1">
              Payment reminder for <strong>${fmtDol(finalAmt)}</strong> emailed to {proposal.email}
            </p>
            <button onClick={onClose} className="mt-5 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">Done</button>
          </div>
        ) : (
          <div className="px-5 py-4 space-y-5">

            {/* Contract totals summary */}
            <div className={`grid gap-3 bg-gray-50 rounded-xl px-4 py-3 ${approvedCOTotal > 0 ? 'grid-cols-3' : 'grid-cols-2'}`}>
              <div>
                <p className="text-xs text-gray-400 font-medium">Contract Total</p>
                <p className="text-base font-bold text-gray-900">${fmtDol(contractBase)}</p>
              </div>
              {approvedCOTotal > 0 && (
                <div>
                  <p className="text-xs text-gray-400 font-medium">Approved COs</p>
                  <p className="text-base font-bold text-green-600">+${fmtDol(approvedCOTotal)}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-gray-400 font-medium">Grand Total</p>
                <p className="text-base font-bold text-blue-700">${fmtDol(contractBase + approvedCOTotal)}</p>
              </div>
            </div>

            {/* Milestone selector */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Select Payment Milestone
              </p>
              <div className="space-y-1.5">
                {schedule.map((m, i) => {
                  const isSelected = selectedIdx === i
                  return (
                    <button key={i} onClick={() => selectMilestone(i)}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-left transition-all ${
                        isSelected
                          ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-300'
                          : 'border-gray-100 bg-gray-50 hover:border-gray-200 hover:bg-gray-100'
                      }`}>
                      <div className="flex items-center gap-2.5">
                        <div className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 flex items-center justify-center ${
                          isSelected ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                        }`}>
                          {isSelected && <div className="w-1 h-1 rounded-full bg-white" />}
                        </div>
                        <div>
                          <p className={`text-sm font-medium leading-snug ${isSelected ? 'text-blue-900' : 'text-gray-700'}`}>{m.label}</p>
                          <p className="text-xs text-gray-400">{Math.round(m.pct * 100)}% of contract</p>
                        </div>
                      </div>
                      <p className={`text-sm font-bold shrink-0 ml-3 ${isSelected ? 'text-blue-700' : 'text-gray-600'}`}>
                        ${fmtDol(m.amount)}
                      </p>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Approved CO add-on toggle */}
            {approvedCOTotal > 0 && selectedIdx !== null && (
              <label className="flex items-start gap-3 cursor-pointer bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                <input type="checkbox" checked={includeCOs}
                  onChange={e => { setIncludeCOs(e.target.checked); setIsCustom(false) }}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-300" />
                <div>
                  <p className="text-sm font-semibold text-green-800">Add approved change orders to this payment</p>
                  <p className="text-xs text-green-700 mt-0.5">
                    {approvedCOs.length} CO{approvedCOs.length !== 1 ? 's' : ''} · <strong>${fmtDol(approvedCOTotal)}</strong> total
                  </p>
                  {approvedCOs.map(co => (
                    <p key={co.id} className="text-xs text-green-600 mt-0.5">· {co.description} — ${fmtDol(co.amount)}</p>
                  ))}
                </div>
              </label>
            )}

            {pendingCOs.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
                <p className="text-xs font-semibold text-amber-700">
                  {pendingCOs.length} pending CO{pendingCOs.length !== 1 ? 's' : ''} not included
                </p>
                <p className="text-xs text-amber-600 mt-0.5">Approve them in the Change Orders tab first to add them here.</p>
              </div>
            )}

            {/* Amount summary + override */}
            {selectedIdx !== null && (
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 space-y-1.5 text-sm bg-white">
                  <div className="flex justify-between text-gray-600">
                    <span>Milestone amount</span>
                    <span className="font-medium">${fmtDol(milestoneAmt)}</span>
                  </div>
                  {includeCOs && approvedCOTotal > 0 && (
                    <div className="flex justify-between text-green-700">
                      <span>+ Approved change orders</span>
                      <span className="font-medium">${fmtDol(approvedCOTotal)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-gray-900 border-t border-gray-100 pt-2 mt-1">
                    <span>Suggested total</span>
                    <span className="text-blue-700 text-base">${fmtDol(suggestedAmt)}</span>
                  </div>
                </div>
                <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
                  <label className="flex items-center gap-2 cursor-pointer mb-2">
                    <input type="checkbox" checked={isCustom} onChange={e => setIsCustom(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-300" />
                    <span className="text-xs text-gray-600 font-medium">Override — enter a different amount</span>
                  </label>
                  {isCustom && (
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                      <input autoFocus type="number" value={customAmt}
                        onChange={e => setCustomAmt(e.target.value)}
                        placeholder={fmtDol(suggestedAmt)}
                        className="w-full pl-7 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300" />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Due date */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Due Date (optional)</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300" />
            </div>

            {/* Final callout */}
            {finalAmt > 0 && (
              <div className="bg-blue-600 rounded-xl px-4 py-3 flex items-center justify-between">
                <p className="text-sm text-blue-100 font-medium">Amount to bill client</p>
                <p className="text-xl font-bold text-white">${fmtDol(finalAmt)}</p>
              </div>
            )}

            {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
            {!proposal.email && <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">No email address on file — add one to the original proposal first.</p>}

            <div className="flex gap-2 pb-2">
              <button onClick={send} disabled={sending || !proposal.email || finalAmt <= 0}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors">
                {sending ? 'Sending…' : <><Send size={14} /> Send Reminder</>}
              </button>
              <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Close-Out Modal ──────────────────────────────────────────────────────────
function CloseOutModal({ proposal, onClose }) {
  const { toggleJobStage, updateJobData, saveJobCosts } = useStore()
  const draft = proposal.contractDraft || {}
  const contractNum = draft.contractNum || contractNumberFor(proposal.id)
  const projectTypes = (draft.projectTypes || []).join(', ') || ''

  // Job revenue (signed contract + approved change orders) — the base for margin.
  const revenue = contractTotalOf(proposal) + approvedChangeOrderTotal(proposal)

  const [completionDate, setCompletionDate] = useState(today())
  const [profit, setProfit] = useState('')   // total profit $ achieved (optional, manual)
  const [sendEmail, setSendEmail] = useState(true)
  const [closing, setClosing] = useState(false)
  const [error, setError] = useState('')

  // Two-way link between profit $ and margin %, both derived from revenue.
  const marginVal = (revenue > 0 && profit !== '' && !Number.isNaN(Number(profit)))
    ? +((Number(profit) / revenue) * 100).toFixed(1) : ''
  const onMargin = (v) => setProfit(revenue > 0 && v !== '' ? String(Math.round(revenue * (Number(v) || 0) / 100)) : '')

  const closeOut = async () => {
    setClosing(true); setError('')
    try {
      updateJobData(proposal.id, { completionDate, closedAt: new Date().toISOString() })
      // If a profit was entered, record it so it flows to the Profitability tracker.
      // The tracker computes profit as revenue − costs, so we store cost = revenue − profit.
      if (profit !== '' && !Number.isNaN(Number(profit))) {
        const p = Number(profit)
        saveJobCosts(proposal.id, { other: Math.max(0, revenue - p), enteredProfit: p, source: 'manual-closeout' })
      }
      toggleJobStage(proposal.id, 'payment')
      toggleJobStage(proposal.id, 'closed')

      if (sendEmail && proposal.email) {
        await fetch('/api/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'closeout',
            toEmail: proposal.email,
            client: proposal.client,
            contractNum,
            address: proposal.address,
            projectType: projectTypes,
            completionDate,
          }),
        })
      }
      onClose(true)
    } catch (e) {
      setError(e.message)
      setClosing(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => onClose(false)}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100">
          <div>
            <p className="font-semibold text-gray-900">Close Out Job</p>
            <p className="text-xs text-gray-500 mt-0.5">{proposal.client} · {contractNum}</p>
          </div>
          <button onClick={() => onClose(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={15} /></button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-green-800 mb-1">Ready to close this job?</p>
            <p className="text-xs text-green-700">This will mark the job as complete and check off the Final Payment and Job Closed stages.</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Completion Date</label>
            <input type="date" value={completionDate} onChange={e => setCompletionDate(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300" />
          </div>

          {/* Profit achieved — optional, feeds the Profitability tracker */}
          <div className="border border-gray-200 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-700">Profit on this job <span className="font-normal text-gray-400">(optional)</span></label>
              <span className="text-xs text-gray-400">Revenue ${fmtDol(revenue)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="block text-[11px] text-gray-500 mb-0.5">Profit $</span>
                <input type="number" value={profit} onChange={e => setProfit(e.target.value)} placeholder="0"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>
              <div>
                <span className="block text-[11px] text-gray-500 mb-0.5">Margin %</span>
                <input type="number" value={marginVal} onChange={e => onMargin(e.target.value)} placeholder="0"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>
            </div>
            <p className="text-[11px] text-gray-400 mt-1.5">Enter either one — it logs to your Profitability metrics. Leave blank to skip.</p>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-300" />
            <span className="text-sm text-gray-700">
              Send close-out email to client
              {!proposal.email && <span className="text-xs text-amber-600 ml-1">(no email on file)</span>}
            </span>
          </label>

          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button onClick={closeOut} disabled={closing}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors">
              {closing ? 'Closing…' : <><CheckCheck size={15} /> Close Job</>}
            </button>
            <button onClick={() => onClose(false)} className="flex-1 py-2.5 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function buildCloseOutHtml({ client, contractNum, address, projectType, completionDate }) {
  const company = useStore.getState().branding?.companyName || 'Your Company'
  const completionFormatted = completionDate
    ? new Date(completionDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : 'recently'

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">
      <tr><td style="background:#064e3b;padding:28px 40px;">
        <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">${company}</p>
        <p style="margin:6px 0 0;font-size:13px;color:#6ee7b7;">Project Complete</p>
      </td></tr>
      <tr><td style="padding:32px 40px 24px;">
        <p style="margin:0 0 16px;font-size:15px;color:#1e293b;">Hi ${client || 'there'},</p>
        <p style="margin:0 0 16px;font-size:14px;color:#475569;line-height:1.7;">
          We're thrilled to let you know that your project has been completed on <strong>${completionFormatted}</strong>.
          It was a pleasure working with you, and we hope you love the final result!
        </p>
        ${address ? `<p style="margin:0 0 16px;font-size:13px;color:#64748b;">Project at: ${address}</p>` : ''}
        <p style="margin:0;font-size:14px;color:#475569;line-height:1.7;">
          If you have any questions or need anything in the future, please don't hesitate to reach out.
          We'd also love it if you could share your experience — referrals mean the world to us!
        </p>
      </td></tr>
      <tr><td style="background:#f0fdf4;padding:20px 40px;border-top:1px solid #d1fae5;">
        <p style="margin:0;font-size:12px;color:#6b7280;">
          <strong style="color:#374151;">${company}</strong> · Thank you for choosing us!
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`
}

// ── Receipts tab — per-job receipt files, stored in Google Drive ────────────
// ── Costs / Job P&L tab ────────────────────────────────────────────────────────
// Log actual out-of-pocket costs against this job — amount, what it was for, and the
// merchant — exactly like the Finance tab. Writes to the shared `expenses` store
// tagged with this job's id, so these same costs also feed the Finance per-job P&L.
const COST_CATEGORIES = ['Materials', 'Labor', 'Subcontractor', 'Fuel', 'Tools', 'Equipment', 'Permits', 'Office', 'Insurance', 'Other']

function CostsTab({ proposal }) {
  const { expenses, addExpense, deleteExpense } = useStore()
  const jobCosts = (expenses || [])
    .filter(e => e.jobId === proposal.id)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))

  const revenue   = contractTotalOf(proposal) + approvedChangeOrderTotal(proposal)
  const totalCost = jobCosts.reduce((s, e) => s + (Number(e.amount) || 0), 0)
  const profit    = revenue - totalCost
  const marginPct = revenue > 0 ? Math.round(profit / revenue * 100) : null

  const empty = { date: new Date().toISOString().slice(0, 10), description: '', merchant: '', amount: '', category: 'Materials' }
  const [f, setF] = useState(empty)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const save = () => {
    if (!Number(f.amount)) return
    addExpense({
      date: f.date,
      description: f.description.trim(),
      merchant: f.merchant.trim(),
      amount: Number(f.amount),
      category: f.category,
      jobId: proposal.id,
      cardId: null,
    })
    setF(empty)
  }

  return (
    <div className="space-y-4">
      {/* P&L summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Revenue',      value: `$${fmtDol(revenue)}`,   color: 'text-gray-900' },
          { label: 'Total Costs',  value: `$${fmtDol(totalCost)}`, color: 'text-red-600' },
          { label: 'Net Profit',   value: `$${fmtDol(profit)}${marginPct !== null ? ` (${marginPct}%)` : ''}`, color: profit >= 0 ? 'text-green-700' : 'text-red-600' },
          { label: 'Logged Costs', value: String(jobCosts.length), color: 'text-gray-900' },
        ].map(c => (
          <div key={c.label} className="bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
            <p className="text-xs text-gray-400 mb-0.5">{c.label}</p>
            <p className={`text-base font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Add a cost */}
      <div className="border border-gray-200 rounded-xl p-4 space-y-3">
        <p className="text-sm font-semibold text-gray-800 flex items-center gap-1.5"><DollarSign size={15} className="text-gray-400" /> Add a cost</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input value={f.description} onChange={e => set('description', e.target.value)} placeholder="What it was for (e.g. deck boards)"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300" />
          <div className="flex items-center gap-1.5 border border-gray-200 rounded-lg px-2.5">
            <Store size={14} className="text-gray-400 shrink-0" />
            <input value={f.merchant} onChange={e => set('merchant', e.target.value)} placeholder="Merchant / vendor (e.g. Home Depot)"
              className="w-full text-sm py-2 focus:outline-none" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="flex items-center gap-1 border border-gray-200 rounded-lg px-2.5">
            <span className="text-gray-400">$</span>
            <input type="number" value={f.amount} onChange={e => set('amount', e.target.value)} placeholder="0.00"
              onKeyDown={e => { if (e.key === 'Enter') save() }}
              className="w-full text-sm py-2 focus:outline-none" />
          </div>
          <select value={f.category} onChange={e => set('category', e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300">
            {COST_CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
          <input type="date" value={f.date} onChange={e => set('date', e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300" />
        </div>
        <div className="flex justify-end">
          <button onClick={save} disabled={!Number(f.amount)}
            className="flex items-center gap-1.5 px-4 py-2 bg-[var(--brand-600)] text-white text-sm font-medium rounded-lg hover:bg-[var(--brand-700)] disabled:opacity-40 transition-colors">
            <Plus size={14} /> Add cost
          </button>
        </div>
      </div>

      {/* Cost list */}
      {jobCosts.length === 0 ? (
        <div className="text-center py-8 text-sm text-gray-400 border border-dashed border-gray-200 rounded-xl">
          No costs logged yet. Add materials, labor, subs, fuel and more to see this job's real profit.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Date', 'Description', 'Merchant', 'Category', 'Amount', ''].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {jobCosts.map(e => (
                <tr key={e.id} className="hover:bg-gray-50 group">
                  <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{fmtDate(e.date)}</td>
                  <td className="px-3 py-2.5 text-gray-800">{e.description || <span className="text-gray-300">—</span>}</td>
                  <td className="px-3 py-2.5 text-gray-600">{e.merchant || <span className="text-gray-300">—</span>}</td>
                  <td className="px-3 py-2.5"><span className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-600">{e.category || 'Other'}</span></td>
                  <td className="px-3 py-2.5 font-semibold text-gray-900 whitespace-nowrap">${fmtDol(e.amount)}</td>
                  <td className="px-3 py-2.5 text-right">
                    <button onClick={() => deleteExpense(e.id)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t-2 border-gray-300">
              <tr>
                <td colSpan={4} className="px-3 py-2.5 font-bold text-gray-700 uppercase text-xs tracking-wider">Total Costs</td>
                <td className="px-3 py-2.5 font-bold text-red-600 whitespace-nowrap">${fmtDol(totalCost)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

function ReceiptsTab({ proposal }) {
  const { updateJobData } = useStore()
  const receipts = proposal.jobData?.receipts || []
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef(null)
  const contractNum = proposal.contractDraft?.contractNum || contractNumberFor(proposal.id)

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
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pdfBase64: base64,
            fileName: `Receipt-${contractNum}-${Date.now()}-${file.name}`,
            mimeType: file.type || 'application/octet-stream',
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Upload failed')
        added.push({ id: data.fileId || `${Date.now()}${Math.random()}`, name: file.name, link: data.driveLink, mimeType: file.type, uploadedAt: new Date().toISOString() })
      }
      updateJobData(proposal.id, { receipts: [...receipts, ...added] })
    } catch (err) {
      setError(/token|auth|not connected|401|drive/i.test(err.message) ? 'Connect Google Drive in Settings first, then try again.' : err.message)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const remove = (id) => updateJobData(proposal.id, { receipts: receipts.filter(r => r.id !== id) })

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-gray-800">Receipts</p>
          <p className="text-xs text-gray-400">{receipts.length} file{receipts.length !== 1 ? 's' : ''} · stored in your Google Drive</p>
        </div>
        <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple onChange={onFiles} className="hidden" />
        <button onClick={() => fileRef.current?.click()} disabled={uploading}
          className="flex items-center gap-1.5 px-3 py-2 bg-[var(--brand-600)] text-white text-sm font-medium rounded-lg hover:bg-[var(--brand-700)] disabled:opacity-50 transition-colors">
          {uploading ? <Loader size={14} className="animate-spin" /> : <Plus size={14} />}
          {uploading ? 'Uploading…' : 'Add receipt'}
        </button>
      </div>

      {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      {receipts.length === 0 ? (
        <div className="text-center py-8 text-sm text-gray-400 border border-dashed border-gray-200 rounded-xl">
          No receipts yet. Add photos or PDFs of receipts for this job.
        </div>
      ) : (
        <div className="space-y-1.5">
          {receipts.map(r => (
            <div key={r.id} className="flex items-center gap-3 px-3 py-2 bg-gray-50 rounded-lg group">
              <FileText size={15} className="text-gray-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800 truncate">{r.name}</p>
                <p className="text-[11px] text-gray-400">{fmtDate(r.uploadedAt)}</p>
              </div>
              {r.link && <a href={r.link} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--brand-600)] hover:underline shrink-0">View</a>}
              <button onClick={() => { if (window.confirm('Remove this receipt from the job? (The file stays in your Drive.)')) remove(r.id) }}
                className="text-gray-300 hover:text-red-500 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Job Card ────────────────────────────────────────────────────────────────
function JobCard({ proposal }) {
  const { toggleJobStage, updateJobData } = useStore()
  const allExpenses = useStore(s => s.expenses)
  const [expanded, setExpanded] = useState(false)
  const [tab, setTab] = useState('stages')
  const [editingNote, setEditingNote] = useState(false)
  const [noteText, setNoteText] = useState(proposal.jobData?.notes || '')
  const [showReminder, setShowReminder] = useState(false)
  const [showCloseOut, setShowCloseOut] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const jobData = proposal.jobData || {}
  const completedStages = jobData.completedStages || []
  const stages = getStages(proposal) || []
  const noType = stages.length === 0
  const done = stages.filter(s => completedStages.includes(s.key)).length
  const pct  = stages.length > 0 ? Math.round((done / stages.length) * 100) : 0
  const isClosed = completedStages.includes('closed')

  const draft = proposal.contractDraft || {}
  const contractNum   = draft.contractNum || contractNumberFor(proposal.id)
  const projectTypes  = (draft.projectTypes || []).join(', ') || 'Not specified'
  const coCount       = (jobData.changeOrders || []).length
  const openWarranty  = (jobData.warrantyItems || []).filter(w => w.status === 'Open').length
  const logCount      = (jobData.dailyLogs || []).length
  const receiptCount  = (jobData.receipts || []).length
  const costCount     = (allExpenses || []).filter(e => e.jobId === proposal.id).length

  const saveNote = () => { updateJobData(proposal.id, { notes: noteText }); setEditingNote(false) }

  const TABS = [
    { key: 'stages',  label: 'Stages' },
    { key: 'budget',  label: 'Budget' },
    { key: 'costs',   label: `Costs${costCount ? ` (${costCount})` : ''}` },
    { key: 'co',      label: `Change Orders${coCount ? ` (${coCount})` : ''}` },
    { key: 'log',     label: `Daily Log${logCount ? ` (${logCount})` : ''}` },
    { key: 'warranty',label: `Warranty${openWarranty ? ` (${openWarranty})` : ''}` },
    { key: 'receipts',label: `Receipts${receiptCount ? ` (${receiptCount})` : ''}` },
  ]

  // One soft-pill status system for the card badge.
  const statusPill = isClosed
    ? { label: 'Closed', cls: 'bg-green-100 text-green-700' }
    : noType
      ? { label: 'Needs setup', cls: 'bg-amber-100 text-amber-700' }
      : pct > 0
        ? { label: 'In Progress', cls: 'bg-blue-100 text-blue-700' }
        : { label: 'Not Started', cls: 'bg-gray-100 text-gray-600' }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden transition-all">
      {/* Header — click anywhere on the row (e.g. the name) to expand the full job */}
      <div className="flex items-center gap-3 px-4 sm:px-5 py-3.5 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(e => !e)}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 text-sm">{proposal.client}</span>
            {openWarranty > 0 && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1"><AlertTriangle size={11} /> {openWarranty} warranty</span>}
          </div>
          <p className="text-xs text-gray-400 mt-0.5 truncate">
            {projectTypes} · ${fmt(contractTotalOf(proposal))} · <span className="font-mono">{contractNum}</span>
          </p>
        </div>

        <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${statusPill.cls}`}>{statusPill.label}</span>

        <div className="relative w-10 h-10 shrink-0">
          <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5e7eb" strokeWidth="3" />
            <circle cx="18" cy="18" r="15.9" fill="none"
              stroke={isClosed ? '#10b981' : pct > 0 ? '#3b82f6' : '#d1d5db'}
              strokeWidth="3" strokeDasharray={`${pct} ${100 - pct}`} strokeLinecap="round" />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-gray-600">{pct}%</span>
        </div>

        {!isClosed && (
          <div className="relative shrink-0" onClick={e => e.stopPropagation()}>
            <button onClick={() => setMenuOpen(o => !o)} title="More actions"
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
              <MoreHorizontal size={16} />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-xl shadow-lg py-1 z-20">
                  <button onClick={() => { setMenuOpen(false); setShowReminder(true) }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                    <Mail size={14} className="text-gray-400 shrink-0" /> Send payment reminder
                  </button>
                  <button onClick={() => { setMenuOpen(false); setShowCloseOut(true) }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                    <CheckCheck size={14} className="text-gray-400 shrink-0" /> Close out job
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {showReminder && <PaymentReminderModal proposal={proposal} onClose={() => setShowReminder(false)} />}
      {showCloseOut && <CloseOutModal proposal={proposal} onClose={(closed) => { setShowCloseOut(false); if (closed) setExpanded(false) }} />}

      {/* Expanded */}
      {expanded && (
        <div className="border-t border-gray-100">
          {/* Full-width progress bar + stage caption — moved here from the card header */}
          <div className="px-4 pt-4">
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden w-full">
              <div className={`h-full rounded-full transition-all ${isClosed ? 'bg-green-500' : 'bg-blue-500'}`}
                style={{ width: `${pct}%` }} />
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              {noType
                ? <span className="text-amber-500 font-medium inline-flex items-center gap-1"><AlertTriangle size={10} /> Set job type to load stages</span>
                : `${done} of ${stages.length} stages complete`}
            </p>
          </div>
          {/* Dates */}
          <div className="flex flex-wrap gap-4 px-4 pt-4 pb-2">
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Start Date</label>
              <input type="date" value={jobData.startDate || ''}
                onChange={e => updateJobData(proposal.id, { startDate: e.target.value })}
                className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-300" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Target Complete</label>
              <input type="date" value={jobData.targetDate || ''}
                onChange={e => updateJobData(proposal.id, { targetDate: e.target.value })}
                className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-300" />
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-0 border-b border-gray-100 px-4 overflow-x-auto">
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                  tab === t.key
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="px-4 py-4">
            {tab === 'stages' && (
              <div className="space-y-3">
                {/* Job type selector */}
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider shrink-0">Job Type</label>
                  <select
                    value={jobData.projectTypeOverride || ''}
                    onChange={e => updateJobData(proposal.id, { projectTypeOverride: e.target.value || null })}
                    className={`text-xs border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-300 ${
                      noType ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-700'
                    }`}
                  >
                    <option value="">
                      {(proposal.contractDraft?.projectTypes || []).join(', ') || '— auto-detect from contract —'}
                    </option>
                    {JOB_TYPE_OPTIONS.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  {jobData.projectTypeOverride && (
                    <button
                      onClick={() => updateJobData(proposal.id, { projectTypeOverride: null })}
                      className="text-xs text-gray-400 hover:text-red-500"
                    >reset</button>
                  )}
                </div>

                {noType ? (
                  <p className="text-sm text-amber-600 bg-amber-50 rounded-lg px-3 py-3 border border-amber-200">
                    Select the job type above to load the correct stage checklist.
                  </p>
                ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {stages.map(stage => {
                    const done = completedStages.includes(stage.key)
                    return (
                      <button key={stage.key} onClick={() => toggleJobStage(proposal.id, stage.key)}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left transition-all ${
                          done
                            ? 'bg-green-50 text-green-800 border border-green-200'
                            : 'bg-gray-50 text-gray-600 border border-gray-100 hover:border-blue-200 hover:bg-blue-50'
                        }`}>
                        {done
                          ? <CheckCircle2 size={15} className="text-green-500 shrink-0" />
                          : <Circle size={15} className="text-gray-300 shrink-0" />}
                        <span className={done ? 'line-through opacity-60' : ''}>{stage.label}</span>
                      </button>
                    )
                  })}
                </div>
                )}
                {/* Notes */}
                <div className="pt-2 border-t border-gray-100">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Job Notes</p>
                    {!editingNote && (
                      <button onClick={() => setEditingNote(true)} className="text-xs text-blue-600 hover:underline">
                        {jobData.notes ? 'Edit' : 'Add note'}
                      </button>
                    )}
                  </div>
                  {editingNote ? (
                    <div>
                      <textarea autoFocus value={noteText} onChange={e => setNoteText(e.target.value)} rows={3}
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
                        placeholder="Add job notes, special instructions, sub contacts…" />
                      <div className="flex gap-2 mt-1.5">
                        <button onClick={saveNote} className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors">Save</button>
                        <button onClick={() => { setNoteText(jobData.notes || ''); setEditingNote(false) }}
                          className="px-3 py-1.5 border border-gray-200 text-gray-600 text-xs rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
                      </div>
                    </div>
                  ) : jobData.notes ? (
                    <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2 whitespace-pre-wrap">{jobData.notes}</p>
                  ) : (
                    <p className="text-xs text-gray-400 italic">No notes yet.</p>
                  )}
                </div>
              </div>
            )}
            {tab === 'budget'  && <BudgetTab proposal={proposal} />}
            {tab === 'costs'   && <CostsTab proposal={proposal} />}
            {tab === 'co'      && <ChangeOrdersTab proposal={proposal} />}
            {tab === 'log'     && <DailyLogTab proposal={proposal} />}
            {tab === 'warranty'&& <WarrantyTab proposal={proposal} />}
            {tab === 'receipts'&& <ReceiptsTab proposal={proposal} />}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function Jobs() {
  const proposals = useStore(s => s.proposals)
  const [filter, setFilter] = useState('active')
  const [query,  setQuery]  = useState('')
  const [stageFilter, setStageFilter] = useState(null)   // current-stage chip (from the old Scheduler view)

  // A job's phase: closed, in-progress (≥1 stage done, not closed), or not-started.
  const phaseOf = (p) => {
    const cs = p.jobData?.completedStages || []
    if (cs.includes('closed')) return 'closed'
    const stages = getStages(p) || []
    const done = stages.filter(s => cs.includes(s.key)).length
    return done > 0 ? 'in-progress' : 'not-started'
  }

  // Where each open job is right now: its first unfinished stage
  const currentStageOf = (p) => {
    const stages = getStages(p) || []
    const done = p.jobData?.completedStages || []
    // Only the close-out left counts as "Ready to close", not as a stage of its own
    return stages.length === 0 ? 'Needs setup' : (stages.find(s => !done.includes(s.key) && s.key !== 'closed')?.label || 'Ready to close')
  }

  const wonJobs = proposals.filter(p => p.status === 'Won')
  const stageGroups = (() => {
    const map = new Map()
    wonJobs.filter(p => phaseOf(p) !== 'closed').forEach(p => {
      const label = currentStageOf(p)
      map.set(label, (map.get(label) || 0) + 1)
    })
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  })()
  const filtered = wonJobs.filter(p => {
    const phase = phaseOf(p)
    if (stageFilter && (phase === 'closed' || currentStageOf(p) !== stageFilter)) return false
    if (filter === 'active'      && phase === 'closed')        return false
    if (filter === 'in-progress' && phase !== 'in-progress')   return false
    if (filter === 'not-started' && phase !== 'not-started')   return false
    if (filter === 'closed'      && phase !== 'closed')        return false
    if (query) {
      const q = query.toLowerCase()
      const contractNum = p.contractDraft?.contractNum || contractNumberFor(p.id)
      return [p.client, p.address, p.email, contractNum].some(v => v?.toLowerCase().includes(q))
    }
    return true
  }).sort((a, b) => {
    const aDate = a.jobData?.startDate || a.closedAt || ''
    const bDate = b.jobData?.startDate || b.closedAt || ''
    return aDate < bDate ? 1 : -1
  })

  const counts = { all: wonJobs.length, active: 0, 'in-progress': 0, 'not-started': 0, closed: 0 }
  wonJobs.forEach(p => { const ph = phaseOf(p); counts[ph] += 1; if (ph !== 'closed') counts.active += 1 })

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="qx-hide-embedded flex items-center justify-between mb-5 gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Job Management</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">Stages · Change orders · Daily logs · Warranty</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 self-start">
          {[
            { key: 'all',         label: 'All',         count: counts.all },
            { key: 'active',      label: 'Active',      count: counts.active },
            { key: 'in-progress', label: 'In Progress', count: counts['in-progress'] },
            { key: 'not-started', label: 'Not Started', count: counts['not-started'] },
            { key: 'closed',      label: 'Closed',      count: counts.closed },
          ].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === f.key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {f.label} <span className="ml-1 text-gray-400">{f.count}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-1.5 bg-white w-full sm:w-52">
          <Search size={13} className="text-gray-400 shrink-0" />
          <input className="flex-1 text-sm bg-transparent outline-none placeholder:text-gray-400"
            placeholder="Search name or contract #…" value={query} onChange={e => setQuery(e.target.value)} />
          {query && <button onClick={() => setQuery('')} className="text-gray-300 hover:text-gray-500"><X size={12} /></button>}
        </div>
      </div>

      {stageGroups.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap mb-4 -mt-1">
          <span className="text-xs font-medium text-gray-500 mr-1">Current stage:</span>
          {stageGroups.map(([label, n]) => (
            <button key={label} onClick={() => setStageFilter(stageFilter === label ? null : label)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${stageFilter === label
                ? 'bg-[var(--brand-600)] border-[var(--brand-600)] text-white'
                : label === 'Needs setup' ? 'bg-amber-50 border-amber-200 text-amber-800 hover:border-amber-300' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}>
              {label} <span className="opacity-70">{n}</span>
            </button>
          ))}
          {stageFilter && <button onClick={() => setStageFilter(null)} className="text-xs text-gray-400 hover:text-gray-600 underline ml-1">clear</button>}
        </div>
      )}

      {wonJobs.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center">
          <FileSignature size={36} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No won jobs yet</p>
          <p className="text-sm text-gray-400 mt-1">Mark a proposal as Won in Sales → Proposals and it shows up here.</p>
        </div>
      )}

      {wonJobs.length > 0 && filtered.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 py-12 text-center">
          <p className="text-gray-400 text-sm">No jobs match your filter.</p>
        </div>
      )}

      <div className="space-y-3">
        {filtered.map(p => <JobCard key={p.id} proposal={p} />)}
      </div>
    </div>
  )
}
