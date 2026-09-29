import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore, PROPOSAL_STATUSES, ACTIVITY_TYPES } from '../store'
import { DollarSign, ChevronRight, ChevronDown, UserX, TrendingUp, BarChart3, StickyNote, X, Trash2, Phone, Mail, MapPin, Clock, Plus, FileText } from 'lucide-react'

const fmtDol = (n) => {
  const v = Number(n) || 0
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(1)}k`
  return `$${v.toFixed(0)}`
}

const ACTIVITY_STYLE = {
  Call:        'bg-blue-50 text-blue-700 border-blue-200',
  'Follow-up': 'bg-purple-50 text-purple-700 border-purple-200',
  Meeting:     'bg-teal-50 text-teal-700 border-teal-200',
  Email:       'bg-sky-50 text-sky-700 border-sky-200',
  Objection:   'bg-red-50 text-red-700 border-red-200',
  Note:        'bg-gray-50 text-gray-600 border-gray-200',
}

const relTime = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  const days = Math.floor((Date.now() - d.getTime()) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
}

// ── Customer notes slide-over ────────────────────────────────────────────────
function NotesDrawer({ proposal, onClose, onOpenProposal }) {
  const addActivity    = useStore(s => s.addActivity)
  const deleteActivity = useStore(s => s.deleteActivity)
  // Read the live copy so new notes render immediately
  const live = useStore(s => s.proposals.find(p => p.id === proposal.id)) || proposal
  const activities = live.activities || []

  const [type, setType] = useState('Call')
  const [text, setText] = useState('')

  const submit = () => {
    if (!text.trim()) return
    addActivity(proposal.id, { type, text: text.trim() })
    setText('')
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-gray-900 truncate">{live.client || 'Unnamed customer'}</h3>
              <div className="mt-1 space-y-0.5 text-xs text-gray-500">
                {live.phone   && <p className="flex items-center gap-1.5"><Phone size={11} /> {live.phone}</p>}
                {live.email   && <p className="flex items-center gap-1.5"><Mail size={11} /> {live.email}</p>}
                {live.address && <p className="flex items-center gap-1.5"><MapPin size={11} /> <span className="truncate">{live.address}</span></p>}
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 shrink-0"><X size={18} /></button>
          </div>
          <div className="flex items-center gap-3 mt-3">
            <span className="text-sm font-semibold text-gray-700">{fmtDol(live.total)}</span>
            <span className="text-xs text-gray-300">·</span>
            <span className="text-xs text-gray-500">{live.status}</span>
            <button onClick={() => onOpenProposal(live)} className="ml-auto text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1">
              <FileText size={12} /> Open proposal
            </button>
          </div>
        </div>

        {/* Add note */}
        <div className="px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex flex-wrap gap-1.5 mb-2">
            {ACTIVITY_TYPES.map(t => (
              <button key={t} onClick={() => setType(t)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  type === t ? ACTIVITY_STYLE[t] || 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                }`}>
                {t}
              </button>
            ))}
          </div>
          <textarea
            rows={3}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit() }}
            placeholder="What happened on this call? Objections, next steps, what's holding them back…"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-[11px] text-gray-400">⌘+Enter to log</span>
            <button onClick={submit} disabled={!text.trim()}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-40 transition-colors">
              <Plus size={14} /> Log note
            </button>
          </div>
        </div>

        {/* Timeline */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {activities.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <StickyNote size={26} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm font-medium">No notes yet</p>
              <p className="text-xs mt-1">Log your first call above so next time you're ready.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {activities.map(a => (
                <li key={a.id} className="group flex gap-3">
                  <div className="flex flex-col items-center pt-1">
                    <span className={`w-2 h-2 rounded-full ${(ACTIVITY_STYLE[a.type] || '').split(' ')[0] || 'bg-gray-300'}`} />
                    <span className="flex-1 w-px bg-gray-100 mt-1" />
                  </div>
                  <div className="flex-1 min-w-0 pb-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border ${ACTIVITY_STYLE[a.type] || 'bg-gray-50 text-gray-500 border-gray-200'}`}>{a.type}</span>
                      <span className="text-[11px] text-gray-400 flex items-center gap-1"><Clock size={10} /> {relTime(a.createdAt)}</span>
                      <button onClick={() => deleteActivity(proposal.id, a.id)}
                        className="ml-auto opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-opacity"><Trash2 size={12} /></button>
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap leading-snug">{a.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

const STAGE_META = {
  Draft:         { color: 'bg-gray-100 text-gray-600',    dot: 'bg-gray-400',    border: 'border-gray-200' },
  Sent:          { color: 'bg-blue-100 text-blue-700',    dot: 'bg-blue-400',    border: 'border-blue-200' },
  'Followed Up': { color: 'bg-purple-100 text-purple-700',dot: 'bg-purple-400',  border: 'border-purple-200' },
  Negotiating:   { color: 'bg-amber-100 text-amber-700',  dot: 'bg-amber-400',   border: 'border-amber-200' },
  Won:           { color: 'bg-green-100 text-green-700',  dot: 'bg-green-500',   border: 'border-green-200' },
  Lost:          { color: 'bg-red-100 text-red-700',      dot: 'bg-red-400',     border: 'border-red-200' },
  MIA:           { color: 'bg-slate-100 text-slate-500',  dot: 'bg-slate-400',   border: 'border-slate-200' },
}

const PIPELINE_STAGES = ['Draft', 'Sent', 'Followed Up', 'Negotiating', 'Won', 'MIA', 'Lost']

export default function Pipeline() {
  const proposals  = useStore(s => s.proposals)
  const updateProposalStatus = useStore(s => s.updateProposalStatus)
  const navigate   = useNavigate()

  const [active, setActive] = useState('All')
  const [changing, setChanging] = useState(null)
  const [notesFor, setNotesFor] = useState(null)
  const [showStats, setShowStats] = useState(false)

  const byStatus = useMemo(() => {
    const map = {}
    PIPELINE_STAGES.forEach(s => { map[s] = [] })
    proposals.forEach(p => {
      const bucket = map[p.status] || map['Draft']
      bucket.push(p)
    })
    return map
  }, [proposals])

  const closeStats = useMemo(() => {
    const total = proposals.length
    const won   = proposals.filter(p => p.status === 'Won').length
    const rate  = total > 0 ? (won / total) * 100 : 0
    return { total, won, rate }
  }, [proposals])

  const displayed = active === 'All'
    ? proposals.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    : (byStatus[active] || []).slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))

  const openProposal = (p) => {
    sessionStorage.setItem('proposal', JSON.stringify({
      client: p.client, email: p.email, phone: p.phone,
      address: p.address, expiration: p.expiration,
      lines: p.lines || [], margin: 0, proposalId: p.id,
    }))
    navigate('/proposal')
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Pipeline</h2>
        <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
          All proposals by stage — every non-Won proposal counts against close rate.
        </p>
      </div>

      {/* Win rate bar */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <TrendingUp size={14} className="text-green-500" />
            <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">Close Rate</span>
          </div>
          <span className={`text-sm font-bold ${
            closeStats.rate >= 50 ? 'text-green-600' : closeStats.rate >= 30 ? 'text-amber-600' : 'text-red-600'
          }`}>
            {closeStats.rate.toFixed(1)}% &nbsp;·&nbsp; {closeStats.won} won of {closeStats.total}
          </span>
        </div>
        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all"
            style={{ width: `${Math.min(closeStats.rate, 100)}%` }}
          />
        </div>
      </div>

      {/* Collapsible stats — the 7 stage cards + dot legend live here (counts also shown in filter bar below) */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6 overflow-hidden">
        <button
          onClick={() => setShowStats(v => !v)}
          className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
        >
          <BarChart3 size={15} className="text-gray-400" />
          <span className="text-sm font-semibold text-gray-700">Stats by stage</span>
          <span className="text-xs text-gray-400">{proposals.length} proposals</span>
          {showStats
            ? <ChevronDown size={16} className="text-gray-400 ml-auto" />
            : <ChevronRight size={16} className="text-gray-400 ml-auto" />}
        </button>

        {showStats && (
          <div className="border-t border-gray-100 p-4">
            {/* Stage summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {PIPELINE_STAGES.map(stage => {
                const list  = byStatus[stage] || []
                const value = list.reduce((s, p) => s + (Number(p.total) || 0), 0)
                const meta  = STAGE_META[stage]
                return (
                  <button
                    key={stage}
                    onClick={() => setActive(active === stage ? 'All' : stage)}
                    className={`text-left rounded-xl border p-3 transition-colors bg-white ${
                      active === stage
                        ? 'border-[var(--brand-600)] bg-[var(--brand-50)]'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
                      <span className="text-xs font-semibold text-gray-500 truncate">{stage}</span>
                      {stage === 'MIA' && <UserX size={10} className="text-slate-400 ml-auto" />}
                    </div>
                    <p className="text-xl font-bold text-gray-900">{list.length}</p>
                    <p className="text-xs text-gray-400">{fmtDol(value)}</p>
                  </button>
                )
              })}
            </div>

            {/* Dot legend */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-4 text-xs text-gray-400">
              {PIPELINE_STAGES.filter(s => s !== 'Won').map(s => {
                const n = (byStatus[s] || []).length
                if (!n) return null
                return (
                  <span key={s}><span className={`inline-block w-2 h-2 rounded-full mr-1 ${STAGE_META[s].dot}`} />{s}: {n}</span>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Proposal list */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 flex-wrap">
          {['All', ...PIPELINE_STAGES].map(s => (
            <button
              key={s}
              onClick={() => setActive(s)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                active === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {s} {s !== 'All' && `(${(byStatus[s] || []).length})`}
            </button>
          ))}
        </div>

        {displayed.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">No proposals in this stage.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {displayed.map(p => {
              const meta = STAGE_META[p.status] || STAGE_META['Draft']
              return (
                <div key={p.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <button
                      onClick={() => setNotesFor(p)}
                      title="Open customer notes"
                      className="font-medium text-sm text-gray-900 hover:text-blue-600 truncate block text-left"
                    >
                      {p.client || 'Unnamed'}
                    </button>
                    <p className="text-xs text-gray-400 truncate flex items-center gap-1.5">
                      <span className="truncate">{p.address || p.email || '—'}</span>
                      {(() => {
                        const acts = p.activities || []
                        if (!acts.length) return null
                        return (
                          <span className="inline-flex items-center gap-1 text-gray-400 shrink-0">
                            <span className="text-gray-300">·</span>
                            <StickyNote size={10} /> {acts.length}
                            <span className="text-gray-300">·</span>
                            last {relTime(acts[0].createdAt)}
                          </span>
                        )
                      })()}
                    </p>
                  </div>

                  <button
                    onClick={() => setNotesFor(p)}
                    title="Customer notes"
                    className="shrink-0 p-1.5 rounded-lg text-gray-300 hover:text-blue-600 hover:bg-blue-50 transition-colors relative"
                  >
                    <StickyNote size={15} />
                    {(p.activities || []).length > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-blue-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center">{(p.activities || []).length}</span>
                    )}
                  </button>

                  <span className="text-sm font-semibold text-gray-700 shrink-0">
                    {fmtDol(p.total)}
                  </span>

                  {/* Status selector */}
                  <div className="relative shrink-0">
                    <button
                      onClick={() => setChanging(changing === p.id ? null : p.id)}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${meta.color}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                      {p.status}
                      <ChevronRight size={10} className="ml-0.5" />
                    </button>
                    {changing === p.id && (
                      <div className="absolute right-0 top-6 z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[140px]">
                        {PIPELINE_STAGES.map(s => (
                          <button
                            key={s}
                            onClick={() => {
                              updateProposalStatus(p.id, s)
                              setChanging(null)
                            }}
                            className={`w-full text-left px-3 py-1.5 text-xs font-medium hover:bg-gray-50 flex items-center gap-2 ${
                              p.status === s ? 'text-blue-600' : 'text-gray-700'
                            }`}
                          >
                            <span className={`w-2 h-2 rounded-full ${STAGE_META[s].dot}`} />
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => openProposal(p)}
                    className="text-gray-300 hover:text-gray-500 shrink-0"
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {notesFor && (
        <NotesDrawer
          proposal={notesFor}
          onClose={() => setNotesFor(null)}
          onOpenProposal={(p) => { setNotesFor(null); openProposal(p) }}
        />
      )}
    </div>
  )
}
