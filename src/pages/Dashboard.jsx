import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, FileCheck } from 'lucide-react'
import { openProposal as showProposal } from '../lib/openProposal'
import { useStore } from '../store'
import { wonRevenueOf } from '../contractTotal'
import { TodoCard } from '../components/TodoPanel'
import { getPeriodRange, shiftPeriod } from '../periodUtils'
import NeedsAttention from '../components/NeedsAttention'
import { MenuChip } from '../components/FilterBar'
import { attentionItems, nextReminderDate, isJobClosed } from '../lib/attention'
import { useNav } from '../nav'

// ── Home ─────────────────────────────────────────────────────────────────────
// Read top to bottom: what needs you today, how the numbers look, what's
// coming up, and the latest quotes. Deeper charts live in Insights.

const fmt   = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const money = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('en-US')
const short = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

function buildGroups(proposals) {
  const ids = new Set(proposals.map(p => p.id))
  const roots = proposals.filter(p => !p.parentId || !ids.has(p.parentId))
  return roots.map(root => ({
    root,
    revisions: proposals.filter(p => p.parentId === root.id).sort((a, b) => (a.version || 2) - (b.version || 2)),
  }))
}

const STATUS_DOT = {
  Won: 'bg-emerald-500', Lost: 'bg-red-400', Draft: 'bg-gray-300', Sent: 'bg-sky-500',
  'Followed Up': 'bg-violet-500', Negotiating: 'bg-amber-500', MIA: 'bg-slate-400', Archived: 'bg-slate-300',
}

// The one period choice for the numbers row → [period, steps back from today]
const PERIODS = [
  { value: 'month',        label: 'This month',   p: 'month',   back: 0 },
  { value: 'last-month',   label: 'Last month',   p: 'month',   back: -1 },
  { value: 'quarter',      label: 'This quarter', p: 'quarter', back: 0 },
  { value: 'year',         label: 'This year',    p: 'year',    back: 0 },
  { value: 'last-year',    label: 'Last year',    p: 'year',    back: -1 },
]

function Stat({ label, value, sub, onClick }) {
  return (
    <button onClick={onClick} className="group text-left bg-white px-5 py-4 hover:bg-gray-50 transition-colors min-w-0">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1 leading-none tabular-nums truncate">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1.5 truncate">{sub}</p>}
    </button>
  )
}

function Card({ title, action, children }) {
  return (
    <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3.5 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        {action}
      </div>
      {children}
    </section>
  )
}

const LinkBtn = ({ onClick, children }) => (
  <button onClick={onClick} className="flex items-center gap-1 text-xs font-medium text-[var(--brand-700)] hover:underline">
    {children} <ArrowRight size={12} />
  </button>
)

export default function Dashboard() {
  const navigate   = useNavigate()
  const proposals  = useStore(s => s.proposals)
  const jobCosts   = useStore(s => s.jobCosts) || {}
  const { can, role } = useNav()
  const attention  = attentionItems({ proposals, jobCosts, can, role })

  const [periodKey, setPeriodKey] = useState('year')
  const pick = PERIODS.find(x => x.value === periodKey) || PERIODS[3]
  const { start: pStart, end: pEnd } = getPeriodRange(pick.p, shiftPeriod(pick.p, new Date(), pick.back))
  const pLabel = pick.label.toLowerCase()

  // ── Numbers (same rules as before / as Insights) ─────────────────────────
  const inRange = (dateStr) => { const d = new Date(dateStr); return !Number.isNaN(d.getTime()) && d >= pStart && d <= pEnd }
  const periodProps = proposals.filter(p => p.createdAt && inRange(p.createdAt))
  // Win rate: opportunities estimated in the period (archived and drafts are neutral)
  const outcomes   = buildGroups(periodProps.filter(p => p.status !== 'Archived' && p.status !== 'Draft'))
  // A deal counts as won once the client commits — tagged Won or contract signed
  const isWon      = (p) => p.status === 'Won' || p.contractDraft?.signed === true
  const wonDate    = (p) => p.closedAt || p.contractDraft?.signedAt || p.sentAt || p.createdAt
  const wonClients = buildGroups(proposals.filter(p => p.status !== 'Archived'))
    .filter(({ root, revisions }) => [root, ...revisions].some(p => isWon(p) && inRange(wonDate(p))))
  // Revenue counts realized Won contracts only, matching the Insights cards
  const won        = proposals.filter(p => p.status === 'Won' && inRange(p.closedAt || p.sentAt || p.createdAt))
  const active     = proposals.filter(p => ['Sent', 'Followed Up', 'Negotiating'].includes(p.status))
  const wonRevenue = won.reduce((s, p) => s + wonRevenueOf(p), 0)
  const pipeline   = active.reduce((s, p) => s + (p.total || 0), 0)
  const winRate    = outcomes.length > 0 ? Math.round(wonClients.length / outcomes.length * 100) : null
  const insights   = can('/analytics')

  // ── Coming up: follow-ups and job starts in the next two weeks ───────────
  const upcoming = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const horizon = new Date(today); horizon.setDate(horizon.getDate() + 14)
    const inWindow = (ds) => { const d = new Date(ds + 'T00:00:00'); return d > today && d <= horizon }
    const out = []
    if (can('/tracker')) {
      for (const p of proposals) {
        if (p.status === 'Archived') continue
        for (const r of p.reminders || []) {
          const nd = nextReminderDate(r)
          // Due-today/overdue follow-ups already sit in "Needs your attention"
          if (nd && inWindow(nd)) out.push({ key: `r-${p.id}-${r.id}-${nd}`, date: nd, who: p.client || 'Unnamed', what: r.note || 'Follow up', to: '/sales?tab=proposals' })
        }
      }
    }
    if (can('/jobs')) {
      for (const p of proposals) {
        const sd = p.jobData?.startDate
        if (p.status === 'Won' && !isJobClosed(p) && sd && inWindow(sd)) out.push({ key: `s-${p.id}`, date: sd, who: p.client || 'Unnamed', what: 'Job starts', to: '/projects?tab=jobs' })
      }
    }
    return out.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6)
  }, [proposals, can])

  const recent = useMemo(() => [...proposals]
    .filter(p => p.status !== 'Archived')
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, 5), [proposals])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const summary = attention.length
    ? `${attention.length} thing${attention.length !== 1 ? 's' : ''} need${attention.length === 1 ? 's' : ''} you today`
    : 'You’re all caught up'

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">{greeting}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{dateStr} · {summary}</p>
      </header>

      {/* Numbers — one quiet strip with a single period choice */}
      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden" aria-label="Your numbers">
        <div className="px-5 pt-3.5 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-gray-900">Your numbers</p>
          <div className="flex items-center gap-3">
            {insights && <span className="hidden sm:block"><LinkBtn onClick={() => navigate('/insights')}>All insights</LinkBtn></span>}
            <MenuChip value={periodKey} onChange={setPeriodKey} align="right" options={PERIODS.map(({ value, label }) => ({ value, label }))} />
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 lg:grid-cols-4 gap-px bg-gray-100 border-t border-gray-100">
          <Stat label="Won revenue" value={money(wonRevenue)}
            sub={`${won.length} job${won.length !== 1 ? 's' : ''} · ${pLabel}`}
            onClick={() => navigate(insights ? '/insights?tab=overview' : '/sales?tab=proposals&status=Won')} />
          <Stat label="Open pipeline" value={money(pipeline)}
            sub={`${active.length} open quote${active.length !== 1 ? 's' : ''}`}
            onClick={() => navigate('/sales?tab=pipeline')} />
          <Stat label="Win rate" value={winRate !== null ? `${winRate}%` : '—'}
            sub={`${wonClients.length} of ${outcomes.length} · ${pLabel}`}
            onClick={() => navigate(insights ? '/insights?tab=winloss' : '/sales?tab=proposals')} />
          <Stat label="Average job" value={won.length ? money(wonRevenue / won.length) : '—'}
            sub={`per won job · ${pLabel}`}
            onClick={() => navigate(insights ? '/insights?tab=overview' : '/sales?tab=proposals&status=Won')} />
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        {/* Left: today's work, then the latest quotes */}
        <div className="lg:col-span-2 space-y-5 min-w-0">
          <NeedsAttention items={attention} />

          <Card title="Latest quotes" action={<LinkBtn onClick={() => navigate('/sales?tab=proposals')}>All quotes</LinkBtn>}>
            {recent.length === 0 ? (
              <div className="px-5 pb-8 pt-4 text-center text-gray-400">
                <FileCheck size={26} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">No quotes yet.</p>
                {can('/quote') && <button onClick={() => navigate('/quote')} className="mt-2 text-xs font-medium text-[var(--brand-700)] hover:underline">Build your first quote →</button>}
              </div>
            ) : (
              <ul className="border-t border-gray-100 divide-y divide-gray-100">
                {recent.map(p => (
                  <li key={p.id}>
                    <button onClick={() => showProposal(p, navigate)} className="w-full flex items-center gap-3 px-5 py-2.5 text-left hover:bg-gray-50 transition-colors">
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-gray-900 truncate">{p.client || <span className="italic text-gray-400">Unnamed</span>}</span>
                        <span className="flex items-center gap-1.5 text-xs text-gray-500">
                          <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[p.status] || 'bg-gray-300'}`} />
                          {p.status || 'Draft'}{p.createdAt ? ` · ${short(p.createdAt)}` : ''}
                        </span>
                      </span>
                      <span className="text-sm font-semibold text-gray-900 tabular-nums shrink-0">${fmt(p.total || 0)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* Right: what's next on the calendar, and the team to-do */}
        <div className="space-y-5 min-w-0">
          <Card title="Coming up">
            {upcoming.length === 0 ? (
              <p className="px-5 pb-4 text-sm text-gray-400">Nothing scheduled in the next two weeks.</p>
            ) : (
              <ul className="border-t border-gray-100 divide-y divide-gray-100">
                {upcoming.map(u => {
                  const d = new Date(u.date + 'T00:00:00')
                  return (
                    <li key={u.key}>
                      <button onClick={() => navigate(u.to)} className="w-full flex items-center gap-3 px-5 py-2.5 text-left hover:bg-gray-50 transition-colors">
                        <span className="w-10 shrink-0 text-center leading-tight">
                          <span className="block text-[10px] font-semibold uppercase text-gray-400">{d.toLocaleDateString('en-US', { month: 'short' })}</span>
                          <span className="block text-base font-bold text-gray-900">{d.getDate()}</span>
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-gray-900 truncate">{u.who}</span>
                          <span className="block text-xs text-gray-500 truncate">{u.what}</span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
          <TodoCard />
        </div>
      </div>
    </div>
  )
}
