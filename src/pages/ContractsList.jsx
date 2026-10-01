import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileSignature, FilePen, CheckCircle2, Clock, Search, X, FileX, ExternalLink, Eye, Loader2, Copy, MoreHorizontal } from 'lucide-react'
import { useStore, contractNumberFor } from '../store'
import { contractTotalOf } from '../contractTotal'

const fmt = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtDate = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const initials = (name) => (name || '?').trim().split(/\s+/).filter(w => !/^(&|and)$/i.test(w)).map(w => w[0]).slice(0, 2).join('').toUpperCase()

// Row overflow menu — secondary contract actions (Signatures, Links, Mark signed…)
function RowMenu({ items }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  if (!items.length) return null
  return (
    <div ref={ref} className="relative shrink-0">
      <button onClick={() => setOpen(o => !o)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors" title="More actions">
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-30 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[180px]">
          {items.map((it, i) => (
            <button key={i} onClick={() => { setOpen(false); it.onClick() }} disabled={it.disabled}
              className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              {it.icon} {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const FILTERS = ['All', 'In Progress', 'Signed', 'Not Started']

// ── Signatures Viewer Modal ─────────────────────────────────────────────────
function SignaturesModal({ recordId, onClose }) {
  const [loading, setLoading] = useState(true)
  const [record, setRecord]   = useState(null)
  const [error, setError]     = useState('')

  useEffect(() => {
    if (!recordId) return
    setLoading(true)
    fetch(`/api/sign/record-${recordId}`)
      .then(async r => {
        const text = await r.text()
        let parsed
        try { parsed = JSON.parse(text) } catch { throw new Error(text.slice(0, 200)) }
        if (!r.ok || parsed.error) throw new Error(parsed.error || `HTTP ${r.status}`)
        return parsed
      })
      .then(d => { setRecord(d); setLoading(false) })
      .catch(err => { setError(err.message); setLoading(false) })
  }, [recordId])

  const ROLE_LABEL = { client: 'Client', builder: 'Builder', gc: 'GC' }
  const sigs = record?.signatures || {}

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">Signatures & Audit Trail</h2>
          <div className="flex items-center gap-3">
            <a href={`/view/${recordId}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white rounded-lg text-xs font-medium hover:bg-gray-700 transition-colors">
              <ExternalLink size={11} /> View Full Document
            </a>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading && (
            <div className="flex items-center gap-2 text-gray-500 py-12 justify-center">
              <Loader2 size={16} className="animate-spin" /> Loading signatures…
            </div>
          )}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
              <p className="font-semibold mb-1">Could not load record</p>
              <p className="font-mono text-xs">{error}</p>
            </div>
          )}
          {record && (
            <>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm mb-5 bg-gray-50 rounded-xl p-4">
                <div><span className="text-gray-400 text-xs">Client</span><p className="font-semibold">{record.contractData?.client}</p></div>
                <div><span className="text-gray-400 text-xs">Contract #</span><p className="font-mono text-sm">{record.contractNum}</p></div>
                <div className="col-span-2"><span className="text-gray-400 text-xs">Address</span><p className="font-semibold">{record.contractData?.address}</p></div>
                <div>
                  <span className="text-gray-400 text-xs">Status</span>
                  <p className={`font-semibold ${record.status === 'signed' ? 'text-green-600' : 'text-amber-600'}`}>
                    {record.status === 'signed' ? 'Fully Signed' : record.status === 'partial' ? 'Partially Signed' : 'Pending'}
                  </p>
                </div>
                <div><span className="text-gray-400 text-xs">Created</span><p className="text-sm">{record.createdAt ? new Date(record.createdAt).toLocaleString() : '—'}</p></div>
              </div>

              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Signatures</p>
              <div className="space-y-3">
                {['client', 'builder', 'gc'].map(role => {
                  const sig = sigs[role]
                  if (!sig) return (
                    <div key={role} className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-4 flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-gray-500 text-sm">{ROLE_LABEL[role]}</p>
                        <p className="text-xs text-gray-400 mt-0.5">Not signed yet</p>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Pending</span>
                    </div>
                  )
                  return (
                    <div key={role} className="bg-white border border-emerald-200 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="font-semibold text-gray-900 text-sm">{ROLE_LABEL[role]}</p>
                          <p className="text-xs text-gray-500">{sig.printedName}</p>
                        </div>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold flex items-center gap-1">
                          <CheckCircle2 size={10} /> Signed
                        </span>
                      </div>
                      {sig.signatureDataUrl && (
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-2">
                          <img src={sig.signatureDataUrl} alt={`${role} signature`} className="max-h-20 object-contain mx-auto" />
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 font-mono">
                        <div><span className="text-gray-400">Signed:</span> {new Date(sig.signedAt).toLocaleString()}</div>
                        <div><span className="text-gray-400">IP:</span> {sig.ip}</div>
                        <div className="col-span-2 truncate"><span className="text-gray-400">UA:</span> {sig.userAgent}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Signing Links Modal ─────────────────────────────────────────────────────
function LinksModal({ links, onClose }) {
  const [copied, setCopied] = useState('')
  const ROLE = [
    { role: 'client',  label: 'Client',                color: 'bg-blue-50 border-blue-200' },
    { role: 'builder', label: 'Builder',       color: 'bg-emerald-50 border-emerald-200' },
    { role: 'gc',      label: 'GC',       color: 'bg-amber-50 border-amber-200' },
  ]
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">Signing Links</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 space-y-3">
          {ROLE.map(({ role, label, color }) => (
            <div key={role} className={`border rounded-xl p-3 ${color}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-600">{label}</span>
                <button
                  onClick={() => { navigator.clipboard.writeText(links[role]); setCopied(role); setTimeout(() => setCopied(''), 2000) }}
                  className="flex items-center gap-1 px-2.5 py-1 bg-gray-900 text-white rounded-md text-[11px] font-semibold hover:bg-gray-700"
                >
                  <Copy size={10} /> {copied === role ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <div className="text-[11px] text-gray-600 break-all bg-white/50 rounded px-2 py-1 select-all">{links[role]}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function ContractsList({ initialFilter } = {}) {
  const navigate             = useNavigate()
  const proposals            = useStore(s => s.proposals)
  const markContractSigned   = useStore(s => s.markContractSigned)
  const saveContractDraft    = useStore(s => s.saveContractDraft)
  const markSignedOffPlatform = useStore(s => s.markContractsSignedOffPlatform)

  const [filter, setFilter]  = useState(FILTERS.includes(initialFilter) ? initialFilter : 'All')
  const [query,  setQuery]   = useState('')
  const [viewingRecordId, setViewingRecordId] = useState(null)
  const [viewingLinks,    setViewingLinks]    = useState(null)
  const [recovering,      setRecovering]      = useState(null)
  const [remote,          setRemote]          = useState({})   // proposalId -> { status, clientSigned, recordId }

  const handleRecoverLinks = async (p) => {
    const draft = p.contractDraft || {}
    setRecovering(p.id)
    try {
      let url
      if (draft.signRecordId) {
        url = `/api/sign/recover-${draft.signRecordId}`
      } else {
        const contractNum = draft.contractNum || contractNumberFor(p.id)
        url = `/api/sign/lookup-${encodeURIComponent(contractNum)}`
      }
      const res  = await fetch(url)
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`)
      saveContractDraft(p.id, {
        signRecordId: data.recordId,
        signLinks:    data.links,
      })
      setViewingLinks(data.links)
    } catch (err) {
      alert(`Could not recover links: ${err.message}`)
    } finally {
      setRecovering(null)
    }
  }

  // Only Won proposals are relevant to contracts
  const wonProposals = proposals.filter(p => p.status === 'Won')

  // Auto-detect signatures made remotely. When a customer signs from their own
  // device the signature only lands on the server — this app is never told. On
  // load, check each not-yet-signed contract's signing record and reflect it:
  // fully signed → mark signed; client-signed (awaiting your countersignature)
  // → flag it so a signed deal stops looking untouched.
  useEffect(() => {
    const pending = proposals.filter(p => p.status === 'Won' && p.contractDraft && !p.contractDraft.signed)
    if (pending.length === 0) return
    let cancelled = false
    // Fetch one endpoint and normalize the fields we care about.
    const probe = async (url) => {
      try {
        const r = await fetch(url)
        if (!r.ok) return null
        const d = await r.json()
        if (!d || d.error) return null
        return { status: d.status, clientSigned: !!(d.signatures && d.signatures.client), recordId: d.recordId || null }
      } catch { return null }
    }
    ;(async () => {
      for (const p of pending) {
        const draft = p.contractDraft || {}
        const contractNum = draft.contractNum || contractNumberFor(p.id)
        // Self-healing: don't trust a single stored id. Probe every path that can
        // reach the record and take whichever actually holds the client's
        // signature — so a stale/missing id or contract-number can't hide it.
        const candidates = []
        // 1) The signing links the customer actually used — the SAME path a
        //    working "already signed" link uses, so if the link sees the
        //    signature, this does too. Read the record id straight off it.
        const linkUrl = draft.signLinks?.client || draft.signLinks?.builder || draft.signLinks?.gc
        if (linkUrl) {
          const tok = String(linkUrl).split('/sign/').pop()
          if (tok) {
            const viaLink = await probe(`/api/sign/${tok}`)
            if (viaLink) candidates.push(viaLink)
          }
        }
        // 2) The stored record id.
        if (draft.signRecordId) {
          const byId = await probe(`/api/sign/record-${draft.signRecordId}`)
          if (byId) candidates.push({ ...byId, recordId: byId.recordId || draft.signRecordId })
        }
        // 3) A fresh lookup by contract number.
        const byNum = await probe(`/api/sign/lookup-${encodeURIComponent(contractNum)}`)
        if (byNum) candidates.push(byNum)
        if (cancelled) return
        // Prefer a fully-signed record, then a client-signed one, then anything.
        const best = candidates.find(c => c.status === 'signed')
                  || candidates.find(c => c.clientSigned)
                  || candidates[0]
        if (!best) continue
        if (best.status === 'signed' || best.clientSigned) {
          setRemote(prev => ({ ...prev, [p.id]: best }))
          if (best.recordId && best.recordId !== draft.signRecordId) saveContractDraft(p.id, { signRecordId: best.recordId })
          if (best.status === 'signed') markContractSigned(p.id, true)
        }
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposals.length])

  const getContractStatus = (p) => {
    if (!p.contractDraft) return 'not-started'
    if (p.contractDraft.signed || remote[p.id]?.status === 'signed') return 'signed'
    return 'in-progress'
  }

  const filtered = wonProposals
    .filter(p => {
      const status = getContractStatus(p)
      if (filter === 'In Progress')  return status === 'in-progress'
      if (filter === 'Signed')       return status === 'signed'
      if (filter === 'Not Started')  return status === 'not-started'
      return true
    })
    .filter(p => {
      if (!query.trim()) return true
      const q = query.toLowerCase()
      const contractNum = p.contractDraft?.contractNum || ''
      return [p.client, p.address, p.email, contractNum]
        .some(v => v?.toLowerCase().includes(q))
    })
    .sort((a, b) => {
      // Signed last, then by most recently saved/created
      const sa = getContractStatus(a), sb = getContractStatus(b)
      if (sa === 'signed' && sb !== 'signed') return 1
      if (sb === 'signed' && sa !== 'signed') return -1
      const dateA = a.contractDraft?.savedAt || a.closedAt || a.createdAt || ''
      const dateB = b.contractDraft?.savedAt || b.closedAt || b.createdAt || ''
      return dateB.localeCompare(dateA)
    })

  const counts = {
    All:         wonProposals.length,
    'In Progress': wonProposals.filter(p => getContractStatus(p) === 'in-progress').length,
    Signed:      wonProposals.filter(p => getContractStatus(p) === 'signed').length,
    'Not Started': wonProposals.filter(p => getContractStatus(p) === 'not-started').length,
  }

  // Contracts that have never been started — these are the pre-existing deals
  // signed outside the software that were imported as won proposals.
  const notStartedProposals = wonProposals.filter(p => getContractStatus(p) === 'not-started')

  const handleBulkSignOffPlatform = () => {
    const ids = notStartedProposals.map(p => p.id)
    if (ids.length === 0) return
    const ok = window.confirm(
      `Mark ${ids.length} contract${ids.length !== 1 ? 's' : ''} as already signed (signed off-platform)?\n\n` +
      `Use this only for deals that were signed on paper or before the software. ` +
      `They'll move to the Signed section, tagged as signed off-platform.`
    )
    if (!ok) return
    markSignedOffPlatform(ids)
  }

  const openContract = (p) => {
    const contractNumber = p.contractDraft?.contractNum
      || contractNumberFor(p.id)
    sessionStorage.setItem('contract', JSON.stringify({
      proposalId:     p.id,
      client:         p.client,
      email:          p.email,
      phone:          p.phone,
      address:        p.address,
      total:          contractTotalOf(p),
      lines:          p.lines || [],
      isAlaCarte:     !!p.isAlaCarte,
      projectTypes:   p.projectTypes || [],
      projectSummary: p.projectSummary || '',
      contractNumber,
      salesperson:    p.salesperson || '',
    }))
    navigate('/contract')
  }

  const StatusBadge = ({ status }) => {
    if (status === 'signed') return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
        <CheckCircle2 size={10} /> Signed
      </span>
    )
    if (status === 'in-progress') return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
        <Clock size={10} /> In Progress
      </span>
    )
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500">
        <FileX size={10} /> Not Started
      </span>
    )
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-5 gap-3">
        <div className="qx-hide-embedded">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Contracts</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">All contracts from won proposals</p>
        </div>
        <div className="text-xs sm:text-sm text-gray-400 shrink-0">
          {wonProposals.length} won
        </div>
      </div>

      {/* Filter tabs + search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-5 gap-3">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 self-start">
          {FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                filter === f
                  ? 'bg-white shadow-sm text-gray-900'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {f}
              <span className={`ml-1 sm:ml-1.5 text-xs ${filter === f ? 'text-[var(--brand-600)]' : 'text-gray-400'}`}>
                {counts[f]}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-1.5 bg-white w-full sm:w-56">
          <Search size={14} className="text-gray-400 shrink-0" />
          <input
            className="flex-1 text-sm bg-transparent outline-none placeholder:text-gray-400"
            placeholder="Search contracts…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-gray-300 hover:text-gray-500">
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* One-time backfill: mark pre-existing (off-platform) signed deals.
          Self-removes once nothing is left in Not Started. */}
      {notStartedProposals.length > 0 && (
        <div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <div className="flex items-start gap-2 text-sm text-amber-800">
            <FileSignature size={16} className="shrink-0 mt-0.5" />
            <span>
              <span className="font-semibold">{notStartedProposals.length}</span> contract{notStartedProposals.length !== 1 ? 's' : ''} not started.
              Already signed off-platform? Move {notStartedProposals.length !== 1 ? 'them' : 'it'} straight to Signed.
            </span>
          </div>
          <button
            onClick={handleBulkSignOffPlatform}
            className="shrink-0 self-start sm:self-auto px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 transition-colors whitespace-nowrap"
          >
            Mark all as signed (off-platform)
          </button>
        </div>
      )}

      {/* Empty state */}
      {wonProposals.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col items-center justify-center py-20 text-center">
          <FileSignature size={40} className="text-gray-200 mb-4" />
          <p className="text-gray-500 font-medium mb-1">No won proposals yet</p>
          <p className="text-sm text-gray-400">Mark a proposal as Won in the Proposal Tracker to generate a contract.</p>
          <button
            onClick={() => navigate('/tracker')}
            className="mt-5 px-4 py-2 bg-[var(--brand-600)] text-white rounded-lg text-sm font-medium hover:bg-[var(--brand-700)] transition-colors"
          >
            Go to Proposal Tracker
          </button>
        </div>
      )}

      {wonProposals.length > 0 && filtered.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col items-center justify-center py-16 text-center">
          <Search size={32} className="text-gray-200 mb-3" />
          <p className="text-gray-400 text-sm">No contracts match your filter.</p>
        </div>
      )}

      {/* Contract list — one card, clean rows, primary button + overflow menu */}
      {filtered.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          {filtered.map(p => {
            const status      = getContractStatus(p)
            const draft       = p.contractDraft || {}
            const contractNum = draft.contractNum || contractNumberFor(p.id)
            const signedAt    = draft.signedAt
            const primaryLabel = status === 'not-started' ? 'Start' : status === 'signed' ? 'View' : 'Open'

            // Secondary actions live in the ⋯ menu.
            const recId = draft.signRecordId || remote[p.id]?.recordId
            const clientSignedPending = remote[p.id]?.clientSigned && status !== 'signed'
            const menu = []
            if (recId) menu.push({ icon: <Eye size={14} className="text-gray-400" />, label: 'Signatures', onClick: () => setViewingRecordId(recId) })
            if (draft.signLinks)    menu.push({ icon: <Copy size={14} className="text-gray-400" />, label: 'Signing links', onClick: () => setViewingLinks(draft.signLinks) })
            if (status === 'in-progress' && !draft.signLinks) menu.push({ icon: <Copy size={14} className="text-gray-400" />, label: recovering === p.id ? 'Finding…' : 'Find links', onClick: () => handleRecoverLinks(p), disabled: recovering === p.id })
            if (status === 'in-progress') menu.push({ icon: <CheckCircle2 size={14} className="text-gray-400" />, label: 'Mark signed', onClick: () => markContractSigned(p.id, true) })
            if (status === 'signed')      menu.push({ icon: <FileX size={14} className="text-gray-400" />, label: 'Undo signed', onClick: () => markContractSigned(p.id, false) })

            return (
              <div key={p.id} className="flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3.5 border-b border-gray-100 last:border-b-0">
                {/* Avatar */}
                <div className="w-10 h-10 rounded-xl bg-[var(--brand-100)] text-[var(--brand-700)] flex items-center justify-center shrink-0 font-bold text-sm">
                  {initials(p.client)}
                </div>
                {/* Name + contract # · value */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm truncate">{p.client}</p>
                  <p className="text-xs text-gray-400 truncate">
                    <span className="font-mono">{contractNum}</span> · ${fmt(contractTotalOf(p))}
                    {status === 'signed' && (draft.signedOffPlatform
                      ? ' · off-platform'
                      : signedAt ? ` · Signed ${fmtDate(signedAt)}` : '')}
                  </p>
                </div>
                {clientSignedPending ? (
                  <button onClick={() => recId && setViewingRecordId(recId)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 shrink-0 hover:bg-blue-200 transition-colors"
                    title="Your customer signed — click to view and countersign">
                    <CheckCircle2 size={10} /> Client signed
                  </button>
                ) : (
                  <StatusBadge status={status} />
                )}
                <button
                  onClick={() => openContract(p)}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-[var(--brand-600)] text-white rounded-lg text-xs font-medium hover:bg-[var(--brand-700)] transition-colors shrink-0"
                >
                  {primaryLabel}
                </button>
                <RowMenu items={menu} />
              </div>
            )
          })}
        </div>
      )}

      {viewingRecordId && (
        <SignaturesModal recordId={viewingRecordId} onClose={() => setViewingRecordId(null)} />
      )}
      {viewingLinks && (
        <LinksModal links={viewingLinks} onClose={() => setViewingLinks(null)} />
      )}

      {/* Summary footer */}
      {wonProposals.length > 0 && (
        <div className="mt-6 grid grid-cols-3 gap-4">
          {[
            { label: 'Not Started', value: counts['Not Started'], color: 'bg-gray-50 text-gray-600' },
            { label: 'In Progress', value: counts['In Progress'], color: 'bg-amber-50 text-amber-700' },
            { label: 'Signed',      value: counts['Signed'],      color: 'bg-emerald-50 text-emerald-700' },
          ].map(({ label, value, color }) => (
            <div key={label} className={`${color} rounded-xl px-5 py-4 flex items-center justify-between`}>
              <span className="text-sm font-medium">{label}</span>
              <span className="text-2xl font-bold">{value}</span>
            </div>
          ))}
        </div>
      )}

    </div>
  )
}
