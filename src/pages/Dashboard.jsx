import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FileText, BookOpen, ClipboardList, FileCheck, BarChart2, Inbox,
  MessageSquareMore, DollarSign, TrendingUp, Award, Package,
  Plus, ArrowRight, AlertCircle, Clock, ChevronRight, CalendarDays,
  ChevronLeft,
} from 'lucide-react'
import { useStore } from '../store'
import { wonRevenueOf } from '../contractTotal'
import { TodoCard } from '../components/TodoPanel'
import { getPeriodRange, shiftPeriod, getPeriodSegments, isCurrentPeriod } from '../periodUtils'

const fmt   = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtSh = (n) => { const v = Number(n); if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`; if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}k`; return `$${v.toFixed(0)}` }

function buildGroups(proposals) {
  const ids = new Set(proposals.map(p => p.id))
  const roots = proposals.filter(p => !p.parentId || !ids.has(p.parentId))
  return roots.map(root => ({
    root,
    revisions: proposals.filter(p => p.parentId === root.id).sort((a, b) => (a.version || 2) - (b.version || 2)),
  }))
}
function clientOutcomes(proposals) {
  return buildGroups(proposals).map(({ root, revisions }) => {
    const all = [root, ...revisions]
    const isWon = all.some(p => p.status === 'Won')
    return { all, isWon }
  })
}

const STATUS_BADGE = {
  Won:           'bg-green-100 text-green-700',
  Lost:          'bg-red-100 text-red-700',
  Draft:         'bg-gray-100 text-gray-600',
  Sent:          'bg-blue-100 text-blue-700',
  'Followed Up': 'bg-purple-100 text-purple-700',
  Negotiating:   'bg-amber-100 text-amber-700',
}

const STATUS_BAR = {
  Won:           'bg-green-400',
  Lost:          'bg-red-400',
  Draft:         'bg-gray-300',
  Sent:          'bg-blue-400',
  'Followed Up': 'bg-purple-400',
  Negotiating:   'bg-amber-400',
}

const PROPOSAL_STATUSES = ['Draft', 'Sent', 'Followed Up', 'Negotiating', 'Won', 'Lost', 'MIA']

function nextReminderDate(r) {
  if (r.dismissed) return null
  const base = new Date(r.date + 'T00:00:00')
  const today = new Date(); today.setHours(0, 0, 0, 0)
  if (base >= today || r.frequency === 'once') return r.date
  const step = { '3d': 3, weekly: 7, biweekly: 14, monthly: 30 }[r.frequency] || 0
  if (!step) return r.date
  let next = new Date(base)
  while (next < today) next.setDate(next.getDate() + step)
  return next.toISOString().split('T')[0]
}

// ── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sub, color, onClick }) {
  return (
    <button
      onClick={onClick}
      className="bg-white rounded-xl border border-gray-200 p-4 text-left hover:border-gray-300 hover:shadow-md transition-all group w-full"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-gray-100">
          <Icon size={17} className="text-gray-500" />
        </div>
        <ChevronRight size={14} className="text-gray-300 group-hover:text-[var(--brand-500)] mt-1 transition-colors" />
      </div>
      <p className="text-2xl font-bold text-gray-900 leading-none mb-1">{value}</p>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </button>
  )
}

// ── Quick Action Card ─────────────────────────────────────────────────────────
function ActionCard({ icon: Icon, label, description, color, action, actionLabel, secondaryAction, secondaryLabel, primary }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-3 hover:border-gray-300 hover:shadow-sm transition-all">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-gray-100">
          <Icon size={17} className="text-gray-500" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">{label}</p>
          <p className="text-xs text-gray-400 leading-snug truncate">{description}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={action}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            primary
              ? 'bg-[var(--brand-600)] text-white border border-[var(--brand-600)] hover:bg-[var(--brand-700)]'
              : 'border border-gray-200 text-gray-700 hover:bg-gray-50'
          }`}
        >
          {actionLabel} <ArrowRight size={11} />
        </button>
        {secondaryAction && (
          <button
            onClick={secondaryAction}
            className="px-3 py-1.5 border border-gray-200 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            {secondaryLabel}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate   = useNavigate()
  const proposals  = useStore(s => s.proposals)
  const catalog    = useStore(s => s.catalog)
  const templates  = useStore(s => s.templates)

  // ── Period filter state ───────────────────────────────────────────────────
  const [period,  setPeriod]  = useState('year')
  const [refDate, setRefDate] = useState(new Date())
  const [showMore, setShowMore] = useState(false)   // "More insights" collapse toggle
  const { start: pStart, end: pEnd, label: pLabel } = getPeriodRange(period, refDate)
  const isCurrent = isCurrentPeriod(period, refDate)

  const inPeriod = (p) => {
    if (!p.createdAt) return false
    const d = new Date(p.createdAt)
    return d >= pStart && d <= pEnd
  }

  // Period-filtered proposals
  const periodProps = proposals.filter(inPeriod)

  // Win rate scoped to the selected period (defaults to this year), matching the
  // other tiles. Archived proposals are neutral (superseded revisions), so they're
  // excluded — they must not count as "not won."
  // Denominator = appointments (opportunities) whose ESTIMATE was done in the period.
  const outcomes     = clientOutcomes(periodProps.filter(p => p.status !== 'Archived' && p.status !== 'Draft'))
  // A deal counts as WON the moment the client commits — tagged 'Won' OR contract
  // signed (even if the status wasn't manually flipped). Numerator = deals won in the
  // period by win date, once per opportunity, independent of when the estimate happened.
  const isWon        = (p) => p.status === 'Won' || p.contractDraft?.signed === true
  const wonDate      = (p) => p.closedAt || p.contractDraft?.signedAt || p.sentAt || p.createdAt
  const inPeriodByClose = (dateStr) => { const d = new Date(dateStr); return !Number.isNaN(d.getTime()) && d >= pStart && d <= pEnd }
  const wonClients   = buildGroups(proposals.filter(p => p.status !== 'Archived'))
    .filter(({ root, revisions }) => [root, ...revisions]
      .some(p => isWon(p) && inPeriodByClose(wonDate(p))))
  // Revenue counts realized Won contracts only (a signed-but-untagged deal is a win,
  // not recognized revenue yet) so the $ total matches the Analytics cards.
  const won          = proposals.filter(p => p.status === 'Won' && inPeriodByClose(p.closedAt || p.sentAt || p.createdAt))
  const active       = proposals.filter(p => ['Sent', 'Followed Up', 'Negotiating'].includes(p.status))
  const wonRevenue   = won.reduce((s, p) => s + wonRevenueOf(p), 0)
  const pipeline     = active.reduce((s, p) => s + (p.total || 0), 0)
  const winRate      = outcomes.length > 0 ? Math.round(wonClients.length / outcomes.length * 100) : null
  const periodTotal = periodProps.reduce((s, p) => s + (p.total || 0), 0)

  // Bar chart segments
  const segments   = getPeriodSegments(period, refDate)
  const segData    = segments.map(seg => {
    const sps = periodProps.filter(p => {
      const d = new Date(p.createdAt)
      return d >= seg.start && d <= seg.end
    })
    return {
      label:     seg.label,
      isCurrent: seg.isCurrent,
      total:     sps.reduce((s, p) => s + (p.total || 0), 0),
      won:       sps.filter(p => p.status === 'Won').reduce((s, p) => s + wonRevenueOf(p), 0),
      count:     sps.length,
    }
  })
  const segMax = Math.max(...segData.map(s => s.total), 1)

  // Recent proposals (latest 6)
  const recent = [...proposals]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 6)

  // Pipeline breakdown
  const statusCounts = PROPOSAL_STATUSES.map(s => ({
    status: s,
    count: proposals.filter(p => p.status === s).length,
    // Won bucket = true won revenue (sold + signed COs) to match the KPI;
    // other statuses show proposal face value.
    value: proposals.filter(p => p.status === s).reduce((sum, p) => sum + (s === 'Won' ? wonRevenueOf(p) : (p.total || 0)), 0),
  })).filter(s => s.count > 0)
  const maxCount = Math.max(...statusCounts.map(s => s.count), 1)

  // Upcoming reminders (next 5, sorted)
  const reminders = proposals
    .flatMap(p => (p.reminders || [])
      .map(r => ({ ...r, client: p.client, proposalId: p.id, nextDate: nextReminderDate(r) }))
    )
    .filter(r => r.nextDate)
    .sort((a, b) => new Date(a.nextDate) - new Date(b.nextDate))
    .slice(0, 5)

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const isOverdue = (d) => d && new Date(d + 'T00:00:00') <= today

  // Greeting
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  const openProposal = (p) => {
    sessionStorage.setItem('proposal', JSON.stringify({
      client: p.client, email: p.email, phone: p.phone,
      address: p.address, expiration: p.expiration,
      lines: p.lines || [], margin: 0, proposalId: p.id,
    }))
    navigate('/proposal')
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl space-y-4 sm:space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{greeting}!</h1>
          <p className="text-sm text-gray-400 mt-0.5">{dateStr}</p>
        </div>
        <button
          onClick={() => navigate('/quote')}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--brand-600)] text-white text-sm font-medium rounded-lg hover:bg-[var(--brand-700)] transition-colors shadow-sm"
        >
          <Plus size={15} /> New Quote
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <KpiCard
          icon={DollarSign} label="Won Revenue" color="bg-green-500"
          value={`$${fmt(wonRevenue)}`}
          sub={`${won.length} job${won.length !== 1 ? 's' : ''} won · ${pLabel}`}
          onClick={() => navigate('/tracker')}
        />
        <KpiCard
          icon={TrendingUp} label="Open Pipeline" color="bg-green-600"
          value={fmtSh(pipeline)}
          sub={`${active.length} active proposal${active.length !== 1 ? 's' : ''} · all time`}
          onClick={() => navigate('/tracker')}
        />
        <KpiCard
          icon={Award} label="Win Rate" color="bg-[var(--brand-500)]"
          value={winRate !== null ? `${winRate}%` : '—'}
          sub={`${wonClients.length} won of ${outcomes.length} · ${pLabel}`}
          onClick={() => navigate('/tracker')}
        />
        <KpiCard
          icon={Award} label="Avg Deal" color="bg-[var(--brand-400)]"
          value={won.length ? `$${Math.round(wonRevenue / won.length).toLocaleString('en-US')}` : '—'}
          sub="per won job"
          onClick={() => navigate('/tracker')}
        />
      </div>

      {/* Main grid — Recent Proposals (wide) | Upcoming Follow-ups */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Recent Proposals — compact list */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-800">Recent Proposals</p>
            <button onClick={() => navigate('/tracker')} className="text-xs text-[var(--brand-600)] hover:underline font-medium">
              View all →
            </button>
          </div>
          {recent.length === 0 ? (
            <div className="py-12 text-center text-gray-400">
              <FileCheck size={28} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No proposals yet.</p>
              <button onClick={() => navigate('/quote')} className="mt-3 text-xs text-[var(--brand-600)] hover:underline">
                Build your first quote →
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {recent.map(p => (
                <button key={p.id} onClick={() => openProposal(p)}
                  className="w-full flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-gray-50 text-left transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{p.client || <span className="italic text-gray-400">Unnamed</span>}</p>
                    <p className="text-xs text-gray-400">{p.createdAt ? new Date(p.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-semibold text-gray-900">${fmt(p.total || 0)}</p>
                    <span className={`inline-block mt-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${STATUS_BADGE[p.status] || 'bg-gray-100 text-gray-600'}`}>{p.status}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Notes / daily to-do */}
        <TodoCard />

        {/* Upcoming Follow-ups */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm font-semibold text-gray-800 mb-3">Upcoming Follow-ups</p>
            {reminders.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-xs text-gray-400 italic">No reminders set.</p>
                <button onClick={() => navigate('/tracker')} className="mt-2 text-xs text-sky-600 hover:underline">
                  Add one in the tracker →
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {reminders.map(r => {
                  const overdue = isOverdue(r.nextDate)
                  return (
                    <div
                      key={r.id}
                      onClick={() => navigate('/tracker')}
                      className={`flex items-start gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                        overdue ? 'bg-red-50 hover:bg-red-100' : 'bg-gray-50 hover:bg-sky-50'
                      }`}
                    >
                      {overdue
                        ? <AlertCircle size={13} className="text-[var(--brand-500)] mt-0.5 shrink-0" />
                        : <Clock size={13} className="text-gray-400 mt-0.5 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-800 truncate">{r.client || 'Unnamed client'}</p>
                        {r.note && <p className="text-xs text-gray-400 truncate">{r.note}</p>}
                      </div>
                      <span className={`text-xs font-semibold shrink-0 ${overdue ? 'text-red-600' : 'text-gray-500'}`}>
                        {new Date(r.nextDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <p className="text-sm font-semibold text-gray-700 mb-3">Quick Actions</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <ActionCard
            icon={ClipboardList}
            label="New Quote"
            description="Build a new proposal from your catalog"
            actionLabel="Start"
            primary
            action={() => navigate('/quote')}
          />
          <ActionCard
            icon={BookOpen}
            label="Item Catalog"
            description={`${catalog.length} items across ${new Set(catalog.map(c => c.category)).size} categories`}
            actionLabel="Open"
            action={() => navigate('/catalog')}
          />
          <ActionCard
            icon={BarChart2}
            label="Proposal Tracker"
            description="Manage your pipeline from quote to close"
            actionLabel="Open"
            action={() => navigate('/tracker')}
          />
          <ActionCard
            icon={FileCheck}
            label="Contracts"
            description="View and send contracts from won deals"
            actionLabel="Open"
            action={() => navigate('/contracts')}
          />
        </div>
      </div>

      {/* More insights — collapsible secondary panels */}
      <div>
        <button
          onClick={() => setShowMore(v => !v)}
          className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 hover:text-gray-900 transition-colors"
        >
          <ChevronRight size={16} className={`text-gray-400 transition-transform ${showMore ? 'rotate-90' : ''}`} />
          More insights
        </button>

        {showMore && (
          <div className="mt-4 space-y-4 sm:space-y-6">

            {/* Aging quote alerts */}
            {(() => {
              const now = Date.now()
              const aging = proposals
                .filter(p => ['Sent', 'Followed Up'].includes(p.status) && p.sentAt)
                .map(p => ({ ...p, daysSince: Math.floor((now - new Date(p.sentAt)) / 86400000) }))
                .filter(p => p.daysSince >= 7)
                .sort((a, b) => b.daysSince - a.daysSince)
                .slice(0, 5)
              if (!aging.length) return null
              return (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertCircle size={15} className="text-amber-600 shrink-0" />
                    <p className="text-sm font-semibold text-amber-800">Quotes Awaiting Response</p>
                  </div>
                  <div className="space-y-2">
                    {aging.map(p => (
                      <div key={p.id} onClick={() => navigate('/tracker')}
                        className="flex items-center justify-between gap-3 bg-white rounded-lg px-3 py-2 cursor-pointer hover:bg-amber-50 transition-colors border border-amber-100">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{p.client || 'Unnamed'}</p>
                          <p className="text-xs text-gray-400">${fmt(p.total || 0)} · Sent {new Date(p.sentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                        </div>
                        <span className={`text-xs font-bold shrink-0 px-2 py-0.5 rounded-full ${
                          p.daysSince >= 30 ? 'bg-red-100 text-red-700' :
                          p.daysSince >= 14 ? 'bg-amber-100 text-amber-700' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>
                          {p.daysSince}d ago
                        </span>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => navigate('/tracker')} className="mt-3 text-xs text-amber-700 hover:underline font-medium">
                    View all in tracker →
                  </button>
                </div>
              )
            })()}

            {/* Period Chart */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{pLabel} — Activity</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Total bid: <span className="font-semibold text-indigo-600">${fmt(periodTotal)}</span> across {periodProps.length} proposal{periodProps.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {/* Period toggle */}
                  <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
                    {['month', 'quarter', 'year'].map(p => (
                      <button
                        key={p}
                        onClick={() => { setPeriod(p); setRefDate(new Date()) }}
                        className={`px-3 py-1.5 capitalize transition-colors ${period === p ? 'bg-[var(--brand-600)] text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                      >
                        {p === 'month' ? 'Mo' : p === 'quarter' ? 'Qtr' : 'Yr'}
                      </button>
                    ))}
                  </div>
                  {/* Prev / Next */}
                  <div className="flex items-center gap-1">
                    <button onClick={() => setRefDate(shiftPeriod(period, refDate, -1))}
                      className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
                      <ChevronLeft size={15} />
                    </button>
                    <button
                      onClick={() => setRefDate(new Date())}
                      disabled={isCurrent}
                      className="text-xs text-indigo-600 hover:underline disabled:text-gray-300 disabled:no-underline px-1"
                    >
                      Today
                    </button>
                    <button onClick={() => setRefDate(shiftPeriod(period, refDate, 1))}
                      className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
                      <ChevronRight size={15} />
                    </button>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[var(--brand-300)] inline-block" /> Bid</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-green-400 inline-block" /> Won</span>
                  </div>
                </div>
              </div>
              <div className="flex items-end gap-1.5 h-28">
                {segData.map((seg) => {
                  const bidH = segMax > 0 ? (seg.total / segMax) * 100 : 0
                  const wonH = segMax > 0 ? (seg.won   / segMax) * 100 : 0
                  return (
                    <div key={seg.label} className="flex-1 flex flex-col items-center gap-1 group relative">
                      {seg.count > 0 && (
                        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs rounded-lg px-2.5 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10 shadow-lg">
                          <p className="font-semibold">{seg.label}</p>
                          <p>Bid: ${fmt(seg.total)}</p>
                          <p>Won: ${fmt(seg.won)}</p>
                          <p>{seg.count} proposal{seg.count !== 1 ? 's' : ''}</p>
                        </div>
                      )}
                      <div className="w-full flex flex-col justify-end relative" style={{ height: '88px' }}>
                        {seg.total > 0 ? (
                          <>
                            <div
                              className={`w-full rounded-t-sm transition-all ${seg.isCurrent ? 'bg-[var(--brand-400)]' : 'bg-[var(--brand-200)]'}`}
                              style={{ height: `${bidH}%` }}
                            />
                            {seg.won > 0 && (
                              <div className="w-full bg-green-400 absolute bottom-0 rounded-t-sm" style={{ height: `${wonH}%` }} />
                            )}
                          </>
                        ) : (
                          <div className="w-full bg-gray-50 rounded-sm" style={{ height: '100%' }} />
                        )}
                      </div>
                      <p className={`text-xs ${seg.isCurrent ? 'font-bold text-indigo-600' : 'text-gray-400'}`}>{seg.label}</p>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Pipeline by status */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-semibold text-gray-800">Pipeline</p>
                <button onClick={() => navigate('/tracker')} className="text-xs text-sky-600 hover:underline font-medium">
                  Kanban →
                </button>
              </div>
              {statusCounts.length === 0 ? (
                <p className="text-xs text-gray-400 italic text-center py-3">No proposals yet.</p>
              ) : (
                <div className="space-y-2.5">
                  {statusCounts.map(({ status, count, value }) => (
                    <div key={status}>
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[status]}`}>{status}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-gray-700">{count}</span>
                          <span className="text-xs text-gray-400">{fmtSh(value)}</span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${STATUS_BAR[status]}`}
                          style={{ width: `${(count / maxCount) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
