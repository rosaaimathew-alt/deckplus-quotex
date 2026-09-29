import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { buildProposalSnapshot } from '../proposalSnapshot'
import {
  useStore, PROPOSAL_STATUSES, WIN_REASONS, LOSS_REASONS, ACTIVITY_TYPES,
  contractNumberFor,
} from '../store'
import {
  Bell, Trash2, X, CheckCircle, AlertCircle, Clock, TrendingUp,
  DollarSign, FileText, Plus, ChevronDown, ChevronUp, MessageSquare,
  Phone, Mail, Send, Users, BarChart2, Columns, List, Award, ThumbsDown,
  Eye, Copy, GitBranch, FileSignature, ChevronLeft, ChevronRight, ShoppingCart,
  GitMerge, Unlink, Search, MoreHorizontal, Link2, UserCheck,
} from 'lucide-react'
import { getPeriodRange, shiftPeriod, isCurrentPeriod } from '../periodUtils'
import { wonRevenueOf } from '../contractTotal'

// Group proposals into root → revisions trees
function buildGroups(proposals) {
  const ids = new Set(proposals.map(p => p.id))
  const roots = proposals.filter(p => !p.parentId || !ids.has(p.parentId))
  return roots.map(root => ({
    root,
    revisions: proposals
      .filter(p => p.parentId === root.id)
      .sort((a, b) => (a.version || 2) - (b.version || 2)),
  }))
}

// Label a proposal by its role in the group: the root is "Proposal", revisions
// are "Alt <version>". Used by the activity feeds so each open says which version.
function versionLabelFor(p, group) {
  const ids = new Set(group.map(x => x.id))
  const isRoot = !p.parentId || !ids.has(p.parentId)
  return isRoot ? 'Proposal' : `Alt ${p.version || '—'}`
}

// Fetch and flatten open events for a set of proposals that have tracked links.
// Each event: { at, proposalId, client, versionLabel, contractNum }. Only hits
// proposals that were actually shared (have a viewToken), so it stays light.
async function gatherOpenEvents(proposals, groupProposals) {
  const tracked = proposals.filter(p => p.viewToken)
  const lists = await Promise.all(tracked.map(async (p) => {
    try {
      const r = await fetch(`/api/sign/pdata-${p.viewToken}`)
      if (!r.ok) return []
      const d = await r.json()
      const contractNum = p.contractDraft?.contractNum || contractNumberFor(p.id)
      return (d.opens || []).map(o => ({
        at: o.at,
        proposalId: p.id,
        client: p.client || 'No name',
        versionLabel: versionLabelFor(p, groupProposals || proposals),
        contractNum,
      }))
    } catch { return [] }
  }))
  return lists.flat().sort((a, b) => b.at - a.at)
}

// A single vertical open-event row, shared by both the global feed and the
// per-customer log: date/time, then client · contract#, then which version.
function OpenEventRow({ e, showClient = true }) {
  const d = new Date(e.at)
  return (
    <div className="flex gap-3 py-2.5 border-b border-gray-50 last:border-b-0">
      <Eye size={13} className="text-blue-500 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-xs font-semibold text-gray-700">
          {d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}, {d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
        </p>
        {showClient && <p className="text-xs text-gray-600">{e.client}{e.contractNum ? ` · ${e.contractNum}` : ''}</p>}
        <p className="text-xs text-gray-500">Opened {e.versionLabel}</p>
      </div>
    </div>
  )
}

// Global chronological feed of every proposal open across all customers.
function ActivityView({ proposals }) {
  const [events, setEvents] = useState(null)
  useEffect(() => {
    let alive = true
    gatherOpenEvents(proposals).then(ev => { if (alive) setEvents(ev) })
    return () => { alive = false }
  }, [proposals])

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-6 max-w-2xl">
      <p className="text-sm font-semibold text-gray-800 mb-1">Proposal Activity</p>
      <p className="text-xs text-gray-400 mb-4">Every time a customer opens a proposal — newest first.</p>
      {events === null ? (
        <p className="text-xs text-gray-400 italic py-6 text-center">Loading activity…</p>
      ) : events.length === 0 ? (
        <p className="text-xs text-gray-400 italic py-6 text-center">No opens yet. Once customers open the links you send, they'll show here.</p>
      ) : (
        <div>{events.map((e, i) => <OpenEventRow key={i} e={e} />)}</div>
      )}
    </div>
  )
}

// Collapse proposal groups to client-level outcomes for analytics
function clientOutcomes(proposals) {
  const groups = buildGroups(proposals)
  return groups.map(({ root, revisions }) => {
    const all = [root, ...revisions]
    const isWon = all.some(p => p.status === 'Won')
    // Archived = superseded revision of a won deal; neutral, not a loss.
    const live = all.filter(p => p.status !== 'Archived')
    const isLost = !isWon && live.length > 0 && live.every(p => p.status === 'Lost')
    return { all, isWon, isLost }
  })
}

const fmt = (n) =>
  Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtShort = (n) => { const v = Number(n); if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`; if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}k`; return `$${v.toFixed(0)}` }

// One soft pill system: bg-<sem>-100 text-<sem>-700 across the board.
const STATUS_STYLES = {
  Draft:         'bg-gray-100 text-gray-700',
  Sent:          'bg-blue-100 text-blue-700',
  'Followed Up': 'bg-purple-100 text-purple-700',
  Negotiating:   'bg-amber-100 text-amber-700',
  Won:           'bg-green-100 text-green-700',
  Lost:          'bg-red-100 text-red-700',
  MIA:           'bg-slate-100 text-slate-700',
  Archived:      'bg-zinc-100 text-zinc-700',
}

const STATUS_COLORS = {
  Draft:         'border-gray-200 bg-gray-50',
  Sent:          'border-blue-200 bg-blue-50',
  'Followed Up': 'border-purple-200 bg-purple-50',
  Negotiating:   'border-amber-200 bg-amber-50',
  Won:           'border-green-200 bg-green-50',
  Lost:          'border-red-200 bg-red-50',
  MIA:           'border-slate-200 bg-slate-50',
  Archived:      'border-zinc-200 bg-zinc-50',
}

const STATUS_DOT = {
  Draft:         'bg-gray-400',
  Sent:          'bg-blue-500',
  'Followed Up': 'bg-purple-500',
  Negotiating:   'bg-amber-500',
  Won:           'bg-green-500',
  Lost:          'bg-red-500',
  MIA:           'bg-slate-400',
  Archived:      'bg-zinc-400',
}

const STATUS_TEXT = {
  Draft:         'text-gray-500',
  Sent:          'text-blue-600',
  'Followed Up': 'text-purple-600',
  Negotiating:   'text-amber-600',
  Won:           'text-green-600',
  Lost:          'text-red-600',
  MIA:           'text-slate-500',
  Archived:      'text-zinc-500',
}

// Status control styled like the prototype: a colored dot inside a colored pill,
// with the native <select> overlaid transparently so clicking still changes it.
function StatusSelect({ value, onChange }) {
  return (
    <div className="relative inline-flex items-center">
      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_STYLES[value] || 'bg-gray-100 text-gray-600'}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[value] || 'bg-gray-400'}`} />
        {value}
      </span>
      <select
        value={value}
        onChange={onChange}
        aria-label="Change status"
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      >
        {PROPOSAL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
    </div>
  )
}

const ACTIVITY_ICONS = { Call: Phone, Email: Mail, Meeting: Users, 'Follow-up': Bell, Note: MessageSquare }

const FREQUENCIES = [
  { label: 'One-time', value: 'once' },
  { label: 'Every 3 days', value: '3d' },
  { label: 'Weekly', value: 'weekly' },
  { label: 'Bi-weekly', value: 'biweekly' },
  { label: 'Monthly', value: 'monthly' },
]

function nextReminderDate(reminder) {
  if (reminder.dismissed) return null
  const base = new Date(reminder.date + 'T00:00:00')
  const today = new Date(); today.setHours(0, 0, 0, 0)
  if (base >= today || reminder.frequency === 'once') return reminder.date
  const step = { '3d': 3, weekly: 7, biweekly: 14, monthly: 30 }[reminder.frequency] || 0
  if (!step) return reminder.date
  let next = new Date(base)
  while (next < today) next.setDate(next.getDate() + step)
  return next.toISOString().split('T')[0]
}

function isOverdue(dateStr) {
  return dateStr ? new Date(dateStr + 'T00:00:00') <= new Date() : false
}

function daysBetween(a, b) {
  if (!a || !b) return null
  return Math.round((new Date(b) - new Date(a)) / 86400000)
}

// ── Win/Loss Reason Modal ──────────────────────────────────────────────────
function WinLossModal({ proposal, onSave, onClose }) {
  const isWon = proposal.status === 'Won'
  const reasons = isWon ? WIN_REASONS : LOSS_REASONS
  const [selected, setSelected] = useState('')
  const [note, setNote] = useState('')

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <div className="flex items-center gap-2 mb-4">
          {isWon
            ? <Award size={20} className="text-green-500" />
            : <ThumbsDown size={20} className="text-[var(--brand-400)]" />}
          <h3 className="font-semibold text-gray-900">
            {isWon ? 'Why did you win this job?' : 'Why was this job lost?'}
          </h3>
          <button onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {reasons.map(r => (
            <button
              key={r}
              onClick={() => setSelected(r)}
              className={`px-3 py-2 rounded-lg text-xs font-medium border text-left transition-colors ${
                selected === r
                  ? isWon ? 'bg-green-100 border-green-400 text-green-800' : 'bg-red-100 border-red-400 text-red-800'
                  : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        <textarea
          rows={2}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none mb-3"
          placeholder="Additional notes (optional)..."
          value={note}
          onChange={e => setNote(e.target.value)}
        />
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            Skip
          </button>
          <button
            onClick={() => onSave({ category: selected, note })}
            disabled={!selected}
            className={`px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 ${isWon ? 'bg-green-600 hover:bg-green-700' : 'bg-red-500 hover:bg-red-600'}`}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Activity Log ───────────────────────────────────────────────────────────
function ActivityLog({ proposal, groupProposals }) {
  const { addActivity, deleteActivity, setProposalViewToken } = useStore()
  const branding = useStore(s => s.branding)
  const [type, setType] = useState('Call')
  const [text, setText] = useState('')
  const [events, setEvents] = useState(null)   // group open events, newest first
  const [linkUrl, setLinkUrl] = useState('')
  const [linkBusy, setLinkBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  // Build / fetch the permanent tracked link for pasting into your own email.
  const makeLink = async () => {
    setLinkBusy(true)
    try {
      const snapshot = buildProposalSnapshot(proposal, branding)
      const r = await fetch('/api/sign/pcreate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposalId: proposal.id, snapshot }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.url) throw new Error(d.error || 'Could not create link')
      if (d.token) setProposalViewToken(proposal.id, d.token)
      setLinkUrl(d.url)
      try { await navigator.clipboard.writeText(d.url); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* shown for manual copy */ }
    } catch { /* leave linkUrl empty; user can retry */ }
    finally { setLinkBusy(false) }
  }
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(linkUrl); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch {}
  }

  // Pull open history for the WHOLE customer group (main + every alternative),
  // so this shows which version they opened and when — read-only.
  const group = groupProposals && groupProposals.length ? groupProposals : [proposal]
  const tokensKey = group.map(p => p.viewToken || '').join(',')
  useEffect(() => {
    if (!group.some(p => p.viewToken)) { setEvents([]); return }
    let alive = true
    gatherOpenEvents(group, group).then(ev => { if (alive) setEvents(ev) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokensKey])

  const submit = () => {
    if (!text.trim()) return
    addActivity(proposal.id, { type, text: text.trim() })
    setText('')
  }

  const openCount = events?.length || 0
  const lastOpen  = openCount ? events[0].at : null   // events are newest-first

  return (
    <div className="px-4 pb-4 pt-2 bg-gray-50 border-t border-gray-100">
      {/* Log entry form */}
      <div className="flex gap-2 mb-3">
        <select
          className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-300"
          value={type}
          onChange={e => setType(e.target.value)}
        >
          {ACTIVITY_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
        <input
          className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          placeholder="Log an activity or note..."
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
        />
        <button
          onClick={submit}
          disabled={!text.trim()}
          className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-40"
        >
          Log
        </button>
      </div>
      {/* Open tracking — the whole customer group (main + alternatives), vertical, newest first */}
      {group.some(p => p.viewToken) && (
        <div className="bg-white rounded-lg px-3 py-2.5 border border-blue-100 mb-2">
          <div className="flex items-center gap-2 mb-1">
            <Eye size={13} className="text-blue-500 shrink-0" />
            <span className="text-xs font-semibold text-gray-700">
              {events === null ? 'Checking views…'
                : openCount === 0 ? 'Sent — not opened online yet'
                : `Opened ${openCount} time${openCount !== 1 ? 's' : ''} across all versions`}
            </span>
            {lastOpen && (
              <span className="text-[11px] text-gray-400 ml-auto">
                last {new Date(lastOpen).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} {new Date(lastOpen).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </span>
            )}
          </div>
          {openCount > 0 && (
            <div className="max-h-56 overflow-y-auto">
              {events.map((e, i) => <OpenEventRow key={i} e={e} showClient={false} />)}
            </div>
          )}
        </div>
      )}

      {/* Shareable tracked link — create once, paste into any email */}
      <div className="mb-2">
        {!linkUrl ? (
          <button onClick={makeLink} disabled={linkBusy}
            className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50">
            <Link2 size={13} /> {linkBusy ? 'Creating link…' : 'Get shareable tracked link'}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <input readOnly value={linkUrl} onFocus={e => e.target.select()}
              className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-300" />
            <button onClick={copyLink}
              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 shrink-0">
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        )}
      </div>
      {/* Activity list */}
      <div className="space-y-1.5 max-h-48 overflow-y-auto">
        {(proposal.activities || []).length === 0 && (
          <p className="text-xs text-gray-400 italic">No activity yet.</p>
        )}
        {(proposal.activities || []).map(a => {
          const Icon = ACTIVITY_ICONS[a.type] || MessageSquare
          return (
            <div key={a.id} className="flex items-start gap-2 bg-white rounded-lg px-3 py-2 border border-gray-100 group">
              <Icon size={13} className="text-[var(--brand-400)] mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-xs font-semibold text-gray-500 mr-1.5">{a.type}</span>
                <span className="text-xs text-gray-700">{a.text}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-gray-300">
                  {new Date(a.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
                <button
                  onClick={() => deleteActivity(proposal.id, a.id)}
                  className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500"
                >
                  <X size={11} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Reminder Badge ─────────────────────────────────────────────────────────
function ReminderBadges({ proposal }) {
  const { dismissReminder } = useStore()
  const active = (proposal.reminders || []).filter(r => !r.dismissed)
  if (active.length === 0) return null
  return (
    <div className="space-y-1 mt-1.5">
      {active.map(r => {
        const nd = nextReminderDate(r)
        const overdue = nd && isOverdue(nd)
        return (
          <div key={r.id} className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-md ${overdue ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-500'}`}>
            {overdue ? <AlertCircle size={11} /> : <Clock size={11} />}
            <span>{nd ? new Date(nd + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</span>
            {r.frequency !== 'once' && <span className="opacity-60">· {FREQUENCIES.find(f => f.value === r.frequency)?.label}</span>}
            {r.note && <span className="opacity-70 truncate max-w-[80px]">· {r.note}</span>}
            <button onClick={() => dismissReminder(proposal.id, r.id)} className="ml-auto opacity-50 hover:opacity-100"><X size={10} /></button>
          </div>
        )
      })}
    </div>
  )
}

// ── Follow-Up Email Modal ──────────────────────────────────────────────────
function FollowUpModal({ proposal, onClose }) {
  const { markProposalSent, updateProposalStatus } = useStore()
  const sentDaysAgo = proposal.sentAt
    ? Math.round((Date.now() - new Date(proposal.sentAt)) / 86400000)
    : 0

  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const contractNum = proposal.contractDraft?.contractNum || ''
  const projectTypes = (proposal.contractDraft?.projectTypes || []).join(', ') || ''

  const send = async () => {
    if (!proposal.email) { setError('No email on file for this proposal.'); return }
    setSending(true); setError('')
    try {
      const res = await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'followup',
          toEmail: proposal.email,
          client: proposal.client,
          total: proposal.total,
          address: proposal.address,
          projectType: projectTypes,
          sentAt: proposal.sentAt,
          expiration: proposal.expiration,
          contractNum,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send')
      if (proposal.status === 'Sent') updateProposalStatus(proposal.id, 'Followed Up')
      setSent(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100">
          <div>
            <p className="font-semibold text-gray-900">Send Follow-Up Email</p>
            <p className="text-xs text-gray-500 mt-0.5">{proposal.client} · {proposal.email || 'No email on file'}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={15} /></button>
        </div>

        {sent ? (
          <div className="px-5 py-8 text-center">
            <CheckCircle size={36} className="text-green-500 mx-auto mb-3" />
            <p className="font-semibold text-gray-900">Follow-Up Sent!</p>
            <p className="text-sm text-gray-500 mt-1">Email sent to {proposal.email}{proposal.status === 'Sent' ? ' · Status updated to Followed Up' : ''}.</p>
            <button onClick={onClose} className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">Done</button>
          </div>
        ) : (
          <div className="px-5 py-4 space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-sm text-blue-800 font-medium mb-1">
                {sentDaysAgo >= 14 ? 'Final follow-up (14+ day template)' : 'First follow-up (7-day template)'}
              </p>
              <p className="text-xs text-blue-700">
                Proposal was sent {sentDaysAgo > 0 ? `${sentDaysAgo} day${sentDaysAgo !== 1 ? 's' : ''} ago` : 'recently'}.
                {proposal.status === 'Sent' ? ' Status will update to "Followed Up" automatically.' : ''}
              </p>
            </div>

            <div className="space-y-1 text-sm text-gray-700">
              {proposal.total > 0 && <p><span className="text-gray-400 text-xs">Total:</span> <strong>${Number(proposal.total).toLocaleString()}</strong></p>}
              {proposal.address && <p><span className="text-gray-400 text-xs">Address:</span> {proposal.address}</p>}
              {projectTypes && <p><span className="text-gray-400 text-xs">Project:</span> {projectTypes}</p>}
            </div>

            {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
            {!proposal.email && <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">No email address on file for this proposal.</p>}

            <div className="flex gap-2 pt-1">
              <button onClick={send} disabled={sending || !proposal.email}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors">
                {sending ? 'Sending…' : <><Send size={14} /> Send Follow-Up</>}
              </button>
              <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Merge Client Modal ──────────────────────────────────────────────────────
function MergeModal({ sourceGroup, allGroups, onMerge, onClose }) {
  const [search, setSearch] = useState('')
  const srcRootId = sourceGroup.root.id
  const targets = allGroups.filter(g => g.root.id !== srcRootId)
  const q = search.trim().toLowerCase()
  const filtered = q
    ? targets.filter(g =>
        (g.root.client || '').toLowerCase().includes(q) ||
        (g.root.email || '').toLowerCase().includes(q) ||
        (g.root.address || '').toLowerCase().includes(q))
    : targets
  const srcCount = sourceGroup.revisions.length + 1

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 pt-5 pb-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <GitMerge size={17} className="text-gray-500" /> Merge Client
            </h3>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            All {srcCount} proposal{srcCount !== 1 ? 's' : ''} for{' '}
            <strong className="text-gray-700">{sourceGroup.root.client || 'this client'}</strong>{' '}
            will become alternatives under the client you pick below.
          </p>
        </div>
        <div className="px-5 py-3 border-b border-gray-100">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
            <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search clients…"
              className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-300)]" />
          </div>
        </div>
        <div className="overflow-y-auto flex-1 px-3 py-2">
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-400 italic px-2 py-6 text-center">No other clients found.</p>
          ) : filtered.map(g => {
            const count = g.revisions.length + 1
            return (
              <button key={g.root.id} onClick={() => onMerge(g.root.id)}
                className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-gray-50 border border-transparent hover:border-gray-300 transition-colors mb-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-800">{g.root.client || <span className="italic text-gray-400">No name</span>}</span>
                  <span className="text-xs text-gray-400 shrink-0 ml-2">{count} proposal{count !== 1 ? 's' : ''}</span>
                </div>
                {g.root.email && <p className="text-xs text-gray-400 mt-0.5 truncate">{g.root.email}</p>}
                {g.root.address && <p className="text-xs text-gray-400 truncate">{g.root.address}</p>}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Row Overflow Menu ───────────────────────────────────────────────────────
// A single "⋯" dropdown holding secondary row actions. Fixed-positioned off the
// button's rect so it never gets clipped by the table's overflow containers.
// Click-outside / scroll / resize all close it.
function RowMenu({ items }) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState(null)
  const btnRef = useRef(null)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (btnRef.current?.contains(e.target)) return
      if (menuRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onDismiss = () => setOpen(false)
    document.addEventListener('mousedown', onDown)
    window.addEventListener('resize', onDismiss)
    window.addEventListener('scroll', onDismiss, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('resize', onDismiss)
      window.removeEventListener('scroll', onDismiss, true)
    }
  }, [open])

  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setCoords({ top: r.bottom + 4, right: window.innerWidth - r.right })
    }
    setOpen(o => !o)
  }

  if (!items.length) return null
  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        className="p-1.5 rounded text-gray-300 hover:bg-gray-50 hover:text-gray-700 transition-colors"
        title="More actions"
      >
        <MoreHorizontal size={13} />
      </button>
      {open && coords && (
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: coords.top, right: coords.right, zIndex: 50 }}
          className="w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1"
        >
          {items.map((it, i) => {
            const Icon = it.icon
            return (
              <button
                key={i}
                onClick={() => { setOpen(false); it.onClick() }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-left transition-colors hover:bg-gray-50 ${it.danger ? 'text-red-600 hover:text-red-700' : 'text-gray-600 hover:text-gray-700'}`}
              >
                <Icon size={13} className="shrink-0" /> {it.label}
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}

// ── List View ──────────────────────────────────────────────────────────────
// Rank to pick the "best" proposal to surface as the primary row
const STATUS_RANK = { Won: 6, Negotiating: 5, 'Followed Up': 4, Sent: 3, Draft: 2, Lost: 1 }
function bestInGroup(all) {
  return all.reduce((b, p) => (STATUS_RANK[p.status] || 0) > (STATUS_RANK[b.status] || 0) ? p : b)
}

// Appointment date for a proposal: when the estimate/appointment happened.
const apptDate = (p) => p?.createdAt || p?.sentAt || p?.closedAt || null

function ListView({ proposals, filterStatus, onStatusChange, onReminderOpen, onOpen, onRevise, onGenerateContract }) {
  const { deleteProposal, detachProposal, mergeProposalGroups, members, setProposalPm } = useStore()
  const branding = useStore(s => s.branding)
  const setProposalViewToken = useStore(s => s.setProposalViewToken)

  // Create/refresh a tracked shareable link for ANY proposal (a primary or an
  // alternative) and copy it — each version gets its own link + open history.
  const copyProposalLink = async (p) => {
    try {
      const r = await fetch('/api/sign/pcreate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposalId: p.id, snapshot: buildProposalSnapshot(p, branding) }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.url) throw new Error(d.error || 'Could not create link')
      if (d.token) setProposalViewToken(p.id, d.token)
      try { await navigator.clipboard.writeText(d.url); window.alert('Shareable link copied to your clipboard:\n\n' + d.url) }
      catch { window.prompt('Copy this proposal link:', d.url) }
    } catch (e) { window.alert('Could not create link: ' + e.message) }
  }
  const [expandedLog, setExpandedLog] = useState(null)   // proposal id with activity log open
  const [expandedAlts, setExpandedAlts] = useState(null) // root id with alts expanded
  const [followUpProposal, setFollowUpProposal] = useState(null)
  const [mergeSource, setMergeSource] = useState(null)   // group {root, revisions} being merged
  // Default: most recent appointment first. Any column header can be clicked to re-sort.
  const [sortKey, setSortKey] = useState('date')
  const [sortDir, setSortDir] = useState('desc')

  const handleDetach = (id) => {
    if (window.confirm('Separate this proposal into its own client file? It will no longer be grouped as an alternative.')) {
      detachProposal(id)
    }
  }

  const toggleSort = (key) => {
    if (key === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir(key === 'client' ? 'asc' : 'desc') }
  }

  const allGroups = buildGroups(proposals)
  const filteredGroups = filterStatus === 'All'
    ? allGroups
    : allGroups.filter(({ root, revisions }) =>
        [root, ...revisions].some(p => p.status === filterStatus)
      )

  // Resolve the primary (best-status) proposal per group once, then sort by it.
  const groups = filteredGroups
    .map(g => ({ ...g, primary: bestInGroup([g.root, ...g.revisions]) }))
    .sort((a, b) => {
      let av, bv
      if (sortKey === 'client') { av = (a.primary.client || '').toLowerCase(); bv = (b.primary.client || '').toLowerCase() }
      else if (sortKey === 'total') { av = Number(a.primary.total) || 0; bv = Number(b.primary.total) || 0 }
      else if (sortKey === 'status') { av = STATUS_RANK[a.primary.status] || 0; bv = STATUS_RANK[b.primary.status] || 0 }
      else { av = apptDate(a.primary) ? new Date(apptDate(a.primary)).getTime() : 0; bv = apptDate(b.primary) ? new Date(apptDate(b.primary)).getTime() : 0 }
      const cmp = av < bv ? -1 : av > bv ? 1 : 0
      return sortDir === 'asc' ? cmp : -cmp
    })

  // Render helper (NOT a component): called inline as renderProposalRow(...) so
  // its rows stay part of ListView's own element tree. Defining it as a nested
  // component and mounting it via <ProposalRow/> gave it a new identity on every
  // ListView render, so toggling a row remounted the whole table and threw the
  // scroll position back to the top. It uses no hooks, so calling it is safe.
  const renderProposalRow = ({ p, altCount, showAltToggle, onDetach, onMerge, groupProposals }) => {
    const isAltExpanded = expandedAlts === p.id
    return (
      <>
        <tr className="border-t border-gray-50 hover:bg-gray-50 align-top">
          <td className="px-4 py-3">
            <p className="font-medium text-gray-900">{p.client || <span className="text-gray-400 italic">No name</span>}</p>
            {p.email && <p className="text-xs text-gray-400 mt-0.5">{p.email}</p>}
            {p.winLossReason?.category && (
              <span className={`inline-block mt-1 text-xs px-1.5 py-0.5 rounded font-medium ${p.status === 'Won' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                {p.winLossReason.category}
              </span>
            )}
            <ReminderBadges proposal={p} />
          </td>
          <td className="px-4 py-3 text-right font-semibold text-gray-900 whitespace-nowrap">
            ${fmt(p.total || 0)}
            {altCount > 0 && (
              <div className="mt-0.5">
                <button
                  onClick={() => setExpandedAlts(isAltExpanded ? null : p.id)}
                  className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 font-semibold hover:bg-gray-200 inline-flex items-center gap-1"
                >
                  {altCount} alt{altCount !== 1 ? 's' : ''} {isAltExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                </button>
              </div>
            )}
          </td>
          <td className="px-4 py-3">
            <StatusSelect value={p.status} onChange={e => onStatusChange(p, e.target.value)} />
          </td>
          <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
            {p.sentAt
              ? new Date(p.sentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              : <span className="italic text-gray-300">Not sent</span>}
            {p.closedAt && (
              <p className="text-gray-300 mt-0.5">
                Closed {new Date(p.closedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                {p.sentAt && daysBetween(p.sentAt, p.closedAt) != null && (
                  <span> · {daysBetween(p.sentAt, p.closedAt)}d</span>
                )}
              </p>
            )}
          </td>
          <td className="px-4 py-3 text-right">
            <div className="flex items-center justify-end gap-1">
              {/* Primary inline actions: Open + Activity log */}
              <button onClick={() => onOpen(p)} className="p-1.5 rounded text-gray-300 hover:bg-gray-50 hover:text-gray-700 transition-colors" title="Open proposal">
                <Eye size={13} />
              </button>
              <button onClick={() => setExpandedLog(expandedLog === p.id ? null : p.id)} className="p-1.5 rounded text-gray-300 hover:bg-gray-50 hover:text-gray-700 transition-colors" title="Activity log">
                {expandedLog === p.id ? <ChevronUp size={13} /> : <MessageSquare size={13} />}
              </button>
              {/* Everything else in a single ⋯ overflow menu */}
              <RowMenu items={[
                { label: 'Copy shareable link', icon: Link2, onClick: () => copyProposalLink(p) },
                { label: 'Add reminder', icon: Bell, onClick: () => onReminderOpen(p.id) },
                { label: 'Revise', icon: Copy, onClick: () => onRevise(p) },
                { label: 'Merge into client', icon: GitMerge, onClick: onMerge },
                ...(altCount > 0 ? [{ label: 'Detach', icon: Unlink, onClick: () => onDetach(p.id) }] : []),
                ...(p.status === 'Won' ? [{ label: 'Generate Contract', icon: FileSignature, onClick: () => onGenerateContract(p) }] : []),
                // Assign one of the org's PMs to this deal (the PM then sees the job); pick again to unassign.
                ...(members || []).filter(m => m.role === 'pm').map(m => ({
                  label: `${p.pmId === m.id ? '✓ ' : ''}PM: ${m.displayName || m.email}`,
                  icon: UserCheck,
                  onClick: () => setProposalPm(p.id, p.pmId === m.id ? null : m.id),
                })),
                ...((p.status === 'Sent' || p.status === 'Followed Up') && p.email ? [{ label: 'Send Follow-up', icon: Send, onClick: () => setFollowUpProposal(p) }] : []),
                { label: 'Delete', icon: Trash2, onClick: () => deleteProposal(p.id), danger: true },
              ]} />
            </div>
          </td>
        </tr>
        {expandedLog === p.id && (
          <tr className="border-t border-gray-100">
            <td colSpan={5} className="p-0">
              <ActivityLog proposal={p} groupProposals={groupProposals} />
            </td>
          </tr>
        )}
      </>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {followUpProposal && <FollowUpModal proposal={followUpProposal} onClose={() => setFollowUpProposal(null)} />}
      {mergeSource && (
        <MergeModal
          sourceGroup={mergeSource}
          allGroups={buildGroups(proposals)}
          onMerge={(targetRootId) => { mergeProposalGroups(mergeSource.root.id, targetRootId); setMergeSource(null) }}
          onClose={() => setMergeSource(null)}
        />
      )}
      {groups.length === 0 ? (
        <div className="py-16 text-center text-gray-400">
          <FileText size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No proposals match this filter.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {[
                { key: 'client', label: 'Client', align: 'text-left' },
                { key: 'total', label: 'Total', align: 'text-right', w: 'w-28' },
                { key: 'status', label: 'Status', align: 'text-left', w: 'w-36' },
                { key: 'date', label: 'Date', align: 'text-left', w: 'w-28' },
              ].map(col => (
                <th key={col.key}
                  onClick={() => toggleSort(col.key)}
                  className={`px-4 py-3 ${col.align} text-xs font-semibold text-gray-500 uppercase tracking-wider ${col.w || ''} cursor-pointer select-none hover:text-gray-800 transition-colors`}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {sortKey === col.key && (sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                  </span>
                </th>
              ))}
              <th className="px-4 py-3 w-28"></th>
            </tr>
          </thead>
          <tbody>
            {groups.map(({ root, revisions, primary }) => {
              const all = [root, ...revisions]
              const alts = all.filter(p => p.id !== primary.id)
              const isAltExpanded = expandedAlts === primary.id
              return (
                <React.Fragment key={root.id}>
                  {renderProposalRow({
                    p: primary,
                    altCount: alts.length,
                    onDetach: handleDetach,
                    onMerge: () => setMergeSource({ root, revisions }),
                    groupProposals: all,
                  })}
                  {isAltExpanded && alts.map(alt => (
                    <tr key={alt.id} className="border-t border-gray-100 bg-gray-50 align-top">
                      <td className="px-4 py-2.5 pl-8">
                        <div className="flex items-center gap-2">
                          <GitBranch size={11} className="text-[var(--brand-300)] shrink-0" />
                          <span className="text-xs font-semibold text-gray-600 mr-1">Alt {alt.version || '—'}</span>
                          <span className="text-xs text-gray-500">{alt.client || '—'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs font-semibold text-gray-700">${fmt(alt.total || 0)}</td>
                      <td className="px-4 py-2.5">
                        <StatusSelect value={alt.status} onChange={e => onStatusChange(alt, e.target.value)} />
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-400">
                        {alt.createdAt ? new Date(alt.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => onOpen(alt)} className="p-1 rounded text-gray-300 hover:bg-gray-50 hover:text-gray-700 transition-colors" title="Open"><Eye size={12} /></button>
                          <RowMenu items={[
                            { label: 'Copy shareable link', icon: Link2, onClick: () => copyProposalLink(alt) },
                            { label: 'Revise', icon: Copy, onClick: () => onRevise(alt) },
                            { label: 'Detach', icon: Unlink, onClick: () => handleDetach(alt.id) },
                            { label: 'Delete', icon: Trash2, onClick: () => deleteProposal(alt.id), danger: true },
                          ]} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
        </div>
      )}
    </div>
  )
}

// ── Pipeline / Kanban View ─────────────────────────────────────────────────
function PipelineView({ proposals, onStatusChange }) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {PROPOSAL_STATUSES.map(status => {
        const cards = proposals.filter(p => p.status === status)
        const colTotal = cards.reduce((s, p) => s + (p.total || 0), 0)
        return (
          <div key={status} className="shrink-0 w-56">
            {/* Column header */}
            <div className={`flex items-center justify-between px-3 py-2 rounded-t-lg border border-b-0 border-gray-200 bg-gray-50`}>
              <span className={`text-xs font-bold uppercase tracking-wider ${STATUS_STYLES[status].split(' ')[1]}`}>{status}</span>
              <span className="text-xs text-gray-400 font-medium">{cards.length}</span>
            </div>
            {/* Cards */}
            <div className={`border border-t-0 rounded-b-lg min-h-32 space-y-2 p-2 border-gray-200 bg-gray-50`}>
              {cards.length === 0 && (
                <p className="text-xs text-gray-300 text-center py-4 italic">Empty</p>
              )}
              {cards.map(p => (
                <div key={p.id} className="bg-white rounded-lg border border-gray-100 shadow-sm p-3">
                  <p className="text-sm font-semibold text-gray-800 truncate">{p.client || 'Unnamed'}</p>
                  <p className="text-xs text-[var(--brand-600)] font-medium mt-0.5">${fmt(p.total || 0)}</p>
                  {p.email && <p className="text-xs text-gray-400 truncate mt-0.5">{p.email}</p>}
                  {/* Active reminder indicator */}
                  {(p.reminders || []).some(r => !r.dismissed && isOverdue(nextReminderDate(r))) && (
                    <div className="flex items-center gap-1 mt-1.5 text-xs text-red-600">
                      <AlertCircle size={10} /> Follow-up overdue
                    </div>
                  )}
                  {p.winLossReason?.category && (
                    <p className={`text-xs mt-1 font-medium ${p.status === 'Won' ? 'text-green-600' : 'text-red-500'}`}>
                      {p.winLossReason.category}
                    </p>
                  )}
                  {/* Move status — single dropdown (reuses the status list) */}
                  <div className="mt-2">
                    <select
                      value=""
                      onChange={e => { if (e.target.value) onStatusChange(p, e.target.value) }}
                      className="w-full text-xs bg-white border border-gray-200 rounded-md px-2 py-1 text-gray-600 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--brand-300)]"
                    >
                      <option value="">Move to…</option>
                      {PROPOSAL_STATUSES.filter(s => s !== status).map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
              {cards.length > 0 && (
                <p className="text-xs text-gray-400 text-right font-medium px-1 pt-1">{fmtShort(colTotal)}</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Analytics View ─────────────────────────────────────────────────────────
function AnalyticsView({ proposals: allProposals }) {
  const [period,  setPeriod]  = useState('year')
  const [refDate, setRefDate] = useState(new Date())
  const { start: pStart, end: pEnd, label: pLabel } = getPeriodRange(period, refDate)
  const isCurrent = isCurrentPeriod(period, refDate)

  const proposals = allProposals.filter(p => {
    if (!p.createdAt) return false
    const d = new Date(p.createdAt)
    return d >= pStart && d <= pEnd
  })

  const won    = proposals.filter(p => p.status === 'Won')
  const lost   = proposals.filter(p => p.status === 'Lost')
  const active = allProposals.filter(p => ['Sent', 'Followed Up', 'Negotiating'].includes(p.status))

  // Win rate always all-time so client grouping is never broken by period filter
  const outcomes      = clientOutcomes(allProposals)
  const wonClients    = outcomes.filter(o => o.isWon)
  const notWonClients = outcomes.filter(o => !o.isWon)
  const winRate = outcomes.length > 0
    ? Math.round((wonClients.length / outcomes.length) * 100)
    : null
  const uniqueClients = outcomes.length

  const avgWon = won.length > 0
    ? won.reduce((s, p) => s + wonRevenueOf(p), 0) / won.length
    : null
  const avgLost = lost.length > 0
    ? lost.reduce((s, p) => s + (p.total || 0), 0) / lost.length
    : null

  const closeTimes = won
    .map(p => daysBetween(p.sentAt, p.closedAt))
    .filter(d => d !== null && d >= 0)
  const avgDaysToClose = closeTimes.length > 0
    ? Math.round(closeTimes.reduce((a, b) => a + b, 0) / closeTimes.length)
    : null

  const pipelineValue = active.reduce((s, p) => s + (p.total || 0), 0)
  const wonRevenue = won.reduce((s, p) => s + wonRevenueOf(p), 0)

  // Win/Loss reason breakdown — only count proposals currently in Won or Lost status
  // (a proposal previously marked Lost then changed back to Sent still has winLossReason set)
  const reasonCount = {}
  proposals.forEach(p => {
    if (p.winLossReason?.category && (p.status === 'Won' || p.status === 'Lost')) {
      const key = `${p.status === 'Won' ? '✓' : '✗'} ${p.winLossReason.category}`
      reasonCount[key] = (reasonCount[key] || 0) + 1
    }
  })
  const maxReasonCount = Math.max(...Object.values(reasonCount), 1)

  // Status breakdown
  const statusCounts = PROPOSAL_STATUSES.map(s => ({
    status: s,
    count: proposals.filter(p => p.status === s).length,
    // Won bucket reflects true won revenue (sold value + signed change orders)
    // so it matches the Won Revenue KPI; other statuses use proposal face value.
    value: proposals.filter(p => p.status === s).reduce((sum, p) => sum + (s === 'Won' ? wonRevenueOf(p) : (p.total || 0)), 0),
  }))
  const maxCount = Math.max(...statusCounts.map(s => s.count), 1)

  return (
    <div className="space-y-6">
      {/* Period picker */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
          {['month', 'quarter', 'year'].map(p => (
            <button key={p} onClick={() => { setPeriod(p); setRefDate(new Date()) }}
              className={`px-3 py-1.5 capitalize transition-colors ${period === p ? 'bg-[var(--brand-600)] text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
              {p === 'month' ? 'Month' : p === 'quarter' ? 'Quarter' : 'Year'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setRefDate(shiftPeriod(period, refDate, -1))}
            className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
            <ChevronLeft size={15} />
          </button>
          <span className="text-sm font-semibold text-gray-700 px-1 min-w-[120px] text-center">{pLabel}</span>
          <button onClick={() => setRefDate(shiftPeriod(period, refDate, 1))}
            className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
            <ChevronRight size={15} />
          </button>
        </div>
        {!isCurrent && (
          <button onClick={() => setRefDate(new Date())}
            className="text-xs text-[var(--brand-600)] hover:underline">
            Back to current
          </button>
        )}
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">Win Rate</p>
          <p className="text-3xl font-bold text-gray-900">{winRate !== null ? `${winRate}%` : '—'}</p>
          <p className="text-xs text-gray-400 mt-0.5">{wonClients.length}W / {notWonClients.length} not won · {uniqueClients} clients</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">Avg Deal (Won)</p>
          <p className="text-3xl font-bold text-gray-900">{avgWon !== null ? fmtShort(avgWon) : '—'}</p>
          <p className="text-xs text-gray-400 mt-0.5">vs {avgLost !== null ? fmtShort(avgLost) : '—'} avg lost</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">Avg Days to Close</p>
          <p className="text-3xl font-bold text-gray-900">{avgDaysToClose !== null ? avgDaysToClose : '—'}</p>
          <p className="text-xs text-gray-400 mt-0.5">from sent → won</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">Won Revenue</p>
          <p className="text-3xl font-bold text-green-600">${fmt(wonRevenue)}</p>
          <p className="text-xs text-gray-400 mt-0.5">${fmt(pipelineValue)} open pipeline</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* Pipeline by status */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">Pipeline by Status</p>
          <div className="space-y-3">
            {statusCounts.map(({ status, count, value }) => (
              <div key={status}>
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[status]}`}>{status}</span>
                  <div className="text-right">
                    <span className="text-xs font-semibold text-gray-700">{count}</span>
                    <span className="text-xs text-gray-400 ml-2">{fmtShort(value)}</span>
                  </div>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      status === 'Won' ? 'bg-green-400' :
                      status === 'Lost' ? 'bg-red-400' :
                      status === 'Negotiating' ? 'bg-amber-400' :
                      status === 'Sent' ? 'bg-blue-400' :
                      status === 'Followed Up' ? 'bg-purple-400' : 'bg-gray-300'
                    }`}
                    style={{ width: `${(count / maxCount) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Win / Loss reasons */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">Win / Loss Reasons</p>
          {Object.keys(reasonCount).length === 0 ? (
            <p className="text-sm text-gray-400 italic">
              No reasons logged yet. Update a proposal to Won or Lost to record why.
            </p>
          ) : (
            <div className="space-y-2.5">
              {Object.entries(reasonCount)
                .sort((a, b) => b[1] - a[1])
                .map(([key, count]) => (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-600">{key}</span>
                      <span className="text-xs font-semibold text-gray-700">{count}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${key.startsWith('✓') ? 'bg-green-400' : 'bg-red-400'}`}
                        style={{ width: `${(count / maxReasonCount) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function ProposalTracker() {
  const {
    proposals: allProposals, updateProposalStatus, setWinLossReason,
    addReminder, dismissReminder,
  } = useStore()
  const navigate = useNavigate()

  // Who sees what is decided by the database (a rep's store only ever holds
  // their own deals). The office additionally gets a Mine / Everyone toggle.
  const role       = useStore(s => s.role || 'manager')
  const me         = useStore(s => s.me)
  const officeView = useStore(s => s.officeView || 'everyone')
  const setOfficeView = useStore(s => s.setOfficeView)
  const proposals = (role === 'manager' && officeView === 'mine' && me)
    ? allProposals.filter(p => p.ownerId === me.id)
    : allProposals

  const [tab, setTab] = useState('list')
  const [filterStatus, setFilterStatus] = useState('All')
  const [periodFilter, setPeriodFilter] = useState('this-year')
  const [statsHidden, setStatsHidden] = useState(() => {
    // Collapsed by default — only expanded if the user explicitly chose to show it.
    try { return localStorage.getItem('qx_tracker_stats_hidden') !== '0' } catch { return true }
  })
  const toggleStats = () => setStatsHidden(v => {
    const n = !v
    try { localStorage.setItem('qx_tracker_stats_hidden', n ? '1' : '0') } catch {}
    return n
  })
  const [winLossTarget, setWinLossTarget] = useState(null)
  const [reminderProposalId, setReminderProposalId] = useState(null)
  const [reminderDate, setReminderDate] = useState('')
  const [reminderFreq, setReminderFreq] = useState('once')
  const [reminderNote, setReminderNote] = useState('')

  const today = new Date().toISOString().split('T')[0]

  // Open a proposal in read-only view
  const handleOpen = (proposal) => {
    sessionStorage.setItem('proposal', JSON.stringify({
      client: proposal.client,
      email: proposal.email,
      phone: proposal.phone,
      address: proposal.address,
      expiration: proposal.expiration,
      lines: proposal.lines || [],
      margin: 0,
      proposalId: proposal.id,
    }))
    navigate('/proposal')
  }

  // A la carte item selection modal state
  const [aLaCarteProposal, setALaCarteProposal] = useState(null)
  const [selectedLineIds, setSelectedLineIds] = useState(new Set())

  const toggleLineId = (id) => setSelectedLineIds(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const launchContract = (proposal, lines, freshSelection = false) => {
    const contractNumber = contractNumberFor(proposal.id)
    sessionStorage.setItem('contract', JSON.stringify({
      proposalId: proposal.id,
      client: proposal.client,
      email: proposal.email,
      phone: proposal.phone,
      address: proposal.address,
      total: lines.reduce((s, l) => s + (l.qty || 1) * (l.unitPrice || 0), 0),
      lines,
      projectTypes: proposal.projectTypes || [],
      projectSummary: proposal.projectSummary || '',
      isAlaCarte: false,
      // Signals ContractView to rebuild the scope/pricing from THESE lines even
      // if a stale contract draft exists — so a re-selection of items is honored.
      freshSelection,
      contractNumber,
      salesperson: 'Mathew Rosa',
    }))
    navigate('/contract')
  }

  // Generate contract package for a Won proposal
  const handleGenerateContract = (proposal) => {
    if (proposal.isAlaCarte && (proposal.lines || []).length > 0) {
      setSelectedLineIds(new Set((proposal.lines || []).map(l => l.id)))
      setALaCarteProposal(proposal)
      return
    }
    launchContract(proposal, proposal.lines || [])
  }

  // Open BuildQuote pre-filled to create a new revision
  const handleRevise = (proposal) => {
    const rootId = proposal.parentId || proposal.id
    sessionStorage.setItem('revise-proposal', JSON.stringify({
      client: proposal.client,
      email: proposal.email,
      phone: proposal.phone,
      address: proposal.address,
      expiration: proposal.expiration,
      lines: proposal.lines || [],
      parentId: rootId,
    }))
    navigate('/quote')
  }

  const filtered = proposals.filter(p => filterStatus === 'All' || p.status === filterStatus)

  const dueCount = proposals.reduce((count, p) => {
    const due = (p.reminders || []).filter(r => {
      const nd = nextReminderDate(r)
      return nd && isOverdue(nd)
    })
    return count + due.length
  }, 0)

  const handleStatusChange = (proposal, newStatus) => {
    updateProposalStatus(proposal.id, newStatus)
    if (newStatus === 'Won' || newStatus === 'Lost') {
      setWinLossTarget({ ...proposal, status: newStatus })
    }
  }

  const saveWinLossReason = (reason) => {
    setWinLossReason(winLossTarget.id, reason)
    setWinLossTarget(null)
  }

  const openReminder = (id) => {
    setReminderProposalId(id)
    setReminderDate(today)
    setReminderFreq('once')
    setReminderNote('')
  }

  const saveReminder = () => {
    if (!reminderDate) return
    addReminder(reminderProposalId, { date: reminderDate, frequency: reminderFreq, note: reminderNote })
    setReminderProposalId(null)
  }

  const TABS = [
    { id: 'list', label: 'List', icon: List },
    { id: 'pipeline', label: 'Pipeline', icon: Columns },
    { id: 'activity', label: 'Activity', icon: Eye },
    { id: 'analytics', label: 'Analytics', icon: BarChart2 },
  ]

  return (
    <div className="p-4 sm:p-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Proposal Tracker</h2>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">Manage your pipeline from quote to close.</p>
        </div>
        <div className="flex items-center gap-2">
          {dueCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-300 rounded-lg text-sm font-medium text-amber-800">
              <Bell size={15} className="text-[var(--brand-500)]" />
              {dueCount} follow-up{dueCount !== 1 ? 's' : ''} due
            </div>
          )}
          <button onClick={toggleStats}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors">
            {statsHidden ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
            {statsHidden ? 'Show stats' : 'Hide stats'}
          </button>
        </div>
      </div>

      {/* Stats strip */}
      {!statsHidden && (() => {
        const now = new Date()
        const inPeriod = (p) => {
          const d = new Date(p.closedAt || p.createdAt || p.sentAt || Date.now())
          if (periodFilter === 'this-month')  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
          if (periodFilter === 'last-month') { const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1); return d.getMonth() === lm.getMonth() && d.getFullYear() === lm.getFullYear() }
          if (periodFilter === 'this-quarter') { const q = Math.floor(now.getMonth() / 3); return Math.floor(d.getMonth() / 3) === q && d.getFullYear() === now.getFullYear() }
          if (periodFilter === 'last-quarter') {
            // The quarter before the current one, rolling back a year from Q1.
            const cq = Math.floor(now.getMonth() / 3)
            let lqYear = now.getFullYear(), lq = cq - 1
            if (lq < 0) { lq = 3; lqYear -= 1 }
            return Math.floor(d.getMonth() / 3) === lq && d.getFullYear() === lqYear
          }
          if (periodFilter === 'this-year')   return d.getFullYear() === now.getFullYear()
          return true
        }
        const PERIODS = [
          { id: 'this-month',   label: 'This Month' },
          { id: 'last-month',   label: 'Last Month' },
          { id: 'this-quarter', label: 'This Quarter' },
          { id: 'last-quarter', label: 'Last Quarter' },
          { id: 'this-year',    label: 'This Year' },
          { id: 'all-time',     label: 'All Time' },
        ]
        const periodLabel   = PERIODS.find(x => x.id === periodFilter)?.label || 'All Time'
        const inPeriodAll   = proposals.filter(inPeriod)               // every proposal in the period
        const rootsInPeriod = inPeriodAll.filter(p => !p.parentId)     // unique estimates (no revisions)
        const wonInPeriod = proposals.filter(p => p.status === 'Won' && inPeriod(p))
        // Same won-revenue basis as everywhere else: sold contract value (à la
        // carte = items chosen) plus signed change orders — not the full menu.
        const wonRevenue  = wonInPeriod.reduce((s, p) => s + wonRevenueOf(p), 0)
        const pipeline    = proposals.filter(p => ['Sent','Followed Up','Negotiating'].includes(p.status)).reduce((s, p) => s + (p.total || 0), 0)
        const stats = [
          { label: 'Won Revenue', value: `$${fmt(wonRevenue)}`, icon: DollarSign, color: 'text-green-500' },
          { label: 'Open Pipeline', value: `$${fmt(pipeline)}`, icon: TrendingUp, color: 'text-green-600' },
          { label: 'Jobs Won', value: wonInPeriod.length, icon: CheckCircle, color: 'text-[var(--brand-400)]' },
        ]
        return (
          <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-2">
            {/* Total Proposals — shows unique clients, total proposals as sub */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <FileText size={14} className="text-[var(--brand-500)]" />
                <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">Total Proposals</span>
              </div>
              <p className="text-xl font-bold text-gray-900">{rootsInPeriod.length}</p>
              <p className="text-xs text-gray-400 mt-0.5">{inPeriodAll.length} incl. revisions · {periodLabel}</p>
            </div>
            {stats.map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon size={14} className={color} />
                  <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">{label}</span>
                </div>
                <p className="text-xl font-bold text-gray-900">{value}</p>
              </div>
            ))}
          </div>
          {/* Period filter buttons */}
          <div className="flex gap-1.5 flex-wrap mb-4">
            {PERIODS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setPeriodFilter(id)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  periodFilter === id
                    ? 'bg-[var(--brand-600)] text-white'
                    : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          </>
        )
      })()}

      {/* Tabs + Filter */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === id ? 'bg-white text-[var(--brand-700)] shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
        {role === 'manager' && me && (
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium" title="Office view: everyone's deals or only the ones you own">
            {[['everyone', 'Everyone'], ['mine', 'Mine']].map(([id, label]) => (
              <button key={id} onClick={() => setOfficeView(id)}
                className={`px-3 py-1.5 transition-colors ${officeView === id ? 'bg-[var(--brand-600)] text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                {label}
              </button>
            ))}
          </div>
        )}
        {tab !== 'analytics' && (
          <div className="flex gap-1 flex-wrap">
            {['All', ...PROPOSAL_STATUSES].map(s => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  filterStatus === s ? 'bg-[var(--brand-600)] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tab content */}
      {tab === 'list' && (
        <ListView
          proposals={proposals}
          filterStatus={filterStatus}
          onStatusChange={handleStatusChange}
          onReminderOpen={openReminder}
          onOpen={handleOpen}
          onRevise={handleRevise}
          onGenerateContract={handleGenerateContract}
        />
      )}
      {tab === 'pipeline' && (
        <PipelineView
          proposals={filtered}
          onStatusChange={handleStatusChange}
        />
      )}
      {tab === 'activity' && (
        <ActivityView proposals={proposals} />
      )}
      {tab === 'analytics' && (
        <AnalyticsView proposals={proposals} />
      )}

      {/* A la Carte Item Selection Modal */}
      {aLaCarteProposal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-gray-900 text-base flex items-center gap-2">
                  <ShoppingCart size={16} className="text-blue-600" /> Select Items for Contract
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">{aLaCarteProposal.client} · check which items the client is moving forward with</p>
              </div>
              <button onClick={() => setALaCarteProposal(null)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
                <X size={16} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-2">
              {(aLaCarteProposal.lines || []).map(line => {
                const checked = selectedLineIds.has(line.id)
                const lineTotal = (line.qty || 1) * (line.unitPrice || 0)
                return (
                  <label key={line.id} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${checked ? 'border-blue-300 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <input type="checkbox" className="mt-0.5 accent-blue-600" checked={checked} onChange={() => toggleLineId(line.id)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800">{line.name}</p>
                      {line.description && <p className="text-xs text-gray-400 mt-0.5 truncate">{line.description}</p>}
                    </div>
                    <span className="text-sm font-bold text-gray-700 whitespace-nowrap">${lineTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </label>
                )
              })}
            </div>

            <div className="px-6 py-4 border-t border-gray-100">
              <div className="flex items-center justify-between mb-3 text-sm">
                <span className="text-gray-500">{selectedLineIds.size} of {(aLaCarteProposal.lines || []).length} items selected</span>
                <span className="font-bold text-gray-800">
                  Total: ${(aLaCarteProposal.lines || [])
                    .filter(l => selectedLineIds.has(l.id))
                    .reduce((s, l) => s + (l.qty || 1) * (l.unitPrice || 0), 0)
                    .toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setALaCarteProposal(null)} className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
                  Cancel
                </button>
                <button
                  disabled={selectedLineIds.size === 0}
                  onClick={() => {
                    const selected = (aLaCarteProposal.lines || []).filter(l => selectedLineIds.has(l.id))
                    setALaCarteProposal(null)
                    launchContract(aLaCarteProposal, selected, true)
                  }}
                  className="flex-1 py-2 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700 disabled:opacity-40 transition-colors"
                >
                  Build Contract →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Win/Loss Reason Modal */}
      {winLossTarget && (
        <WinLossModal
          proposal={winLossTarget}
          onSave={saveWinLossReason}
          onClose={() => setWinLossTarget(null)}
        />
      )}

      {/* Reminder Modal */}
      {reminderProposalId !== null && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Bell size={16} className="text-[var(--brand-500)]" /> Set Follow-up Reminder
              </h3>
              <button onClick={() => setReminderProposalId(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Reminder Date</label>
                <input type="date" min={today}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                  value={reminderDate} onChange={e => setReminderDate(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Repeat</label>
                <select
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                  value={reminderFreq} onChange={e => setReminderFreq(e.target.value)}>
                  {FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Note (optional)</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                  placeholder="e.g. Check on permit status"
                  value={reminderNote} onChange={e => setReminderNote(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button onClick={() => setReminderProposalId(null)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={saveReminder} disabled={!reminderDate}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                Save Reminder
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
