// ── Owner's Today ────────────────────────────────────────────────────────────
// A synopsis for the owner (picked per person in Settings › Team › Access):
// the organization's numbers for all sales reps combined, then each rep, then
// the same days last year, then where open sales and open jobs stand.
// Headline numbers come from lib/headline.js and job money from lib/books.js,
// the same as Insights and Projects, so every page agrees.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { useNav } from '../nav'
import { useScopedProposals } from '../lib/proposalScope'
import { headlineNumbers, isImportedSale, wonDateOf } from '../lib/headline'
import { latestIterations } from '../lib/proposalGroups'
import { getPeriodRange, shiftPeriod } from '../periodUtils'
import { MenuChip } from '../components/FilterBar'
import { attentionItems, isJob, isJobClosed, contractStatusOf } from '../lib/attention'
import { useJobCostOf } from '../lib/jobCost'
import { booksIndex, jobMoneyFromIndex, jobIndex, invoiceStatus, invoiceBalance } from '../lib/books'
import { jobPhaseOf, subStartedIds } from '../lib/jobPhase'

const money = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('en-US')
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`
const DAY = 86400000

const PERIODS = [
  { value: 'month',      label: 'This month',   p: 'month',   back: 0 },
  { value: 'last-month', label: 'Last month',   p: 'month',   back: -1 },
  { value: 'quarter',    label: 'This quarter', p: 'quarter', back: 0 },
  { value: 'year',       label: 'This year',    p: 'year',    back: 0 },
  { value: 'last-year',  label: 'Last year',    p: 'year',    back: -1 },
]

const SALES_STAGES = [
  ['Draft', 'Draft'], ['Sent', 'Sent'], ['Followed Up', 'Followed up'], ['Negotiating', 'Negotiating'],
]
const JOB_PHASES = [['permitting', 'Permitting'], ['ready', 'Ready to start'], ['active', 'Active']]

const minusYear = (d) => { const x = new Date(d); x.setFullYear(x.getFullYear() - 1); return x }

// The numbers compared with last year, for one stretch of days.
function yearNumbers(props, sales, jobs, start, end) {
  const h = headlineNumbers(props, start, end, sales)
  const inRange = (s) => { if (!s) return false; const d = new Date(s); return d >= start && d <= end }
  const signed = h.won.filter(p => !isImportedSale(p) && p.sentAt)
  const days = signed.map(p => (new Date(wonDateOf(p)) - new Date(p.sentAt)) / DAY).filter(d => Number.isFinite(d) && d >= 0)
  let collected = 0
  for (const j of jobs) for (const pay of j.jobData?.paymentsReceived || []) {
    if (inRange(pay.date && `${pay.date}T12:00:00`)) collected += Number(pay.amount) || 0
  }
  return {
    wonRevenue: h.wonRevenue, jobsWon: h.won.length, winRate: h.winRate, avgJob: h.avgJob,
    clients: h.clients.length,
    quotesSent: props.filter(p => p.status !== 'Archived' && inRange(p.sentAt)).length,
    daysToSign: days.length ? days.reduce((s, d) => s + d, 0) / days.length : null,
    collected,
  }
}

function Panel({ title, note, link, onLink, children }) {
  return (
    <section className="min-w-0">
      <div className="flex items-baseline gap-2 mb-2">
        <h2 className="text-[15px] font-semibold text-gray-900">{title}</h2>
        {note && <span className="text-xs text-gray-500">{note}</span>}
        {link && <button onClick={onLink} className="ml-auto text-sm text-[var(--brand-700)] hover:underline">{link}</button>}
      </div>
      {children}
    </section>
  )
}

function Table({ cols, rows, foot }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            {cols.map(([label, right], i) => <th key={i} className={`px-4 py-2.5 text-xs font-semibold text-gray-500 whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}>{label}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r, i) => (
            <tr key={i} className={r.onClick ? 'cursor-pointer hover:bg-gray-50' : ''} onClick={r.onClick}>
              {r.cells.map((c, j) => <td key={j} className={`px-4 py-2.5 whitespace-nowrap ${cols[j][1] ? 'text-right' : ''} ${r.className || ''}`}>{c}</td>)}
            </tr>
          ))}
          {foot && (
            <tr className="font-semibold text-gray-900 border-t border-gray-200">
              {foot.map((c, j) => <td key={j} className={`px-4 py-2.5 whitespace-nowrap ${cols[j][1] ? 'text-right' : ''}`}>{c}</td>)}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// "+18%", "+4", "+4 pts", "5 days faster" — green when better, red when worse.
function Change({ now, then, kind }) {
  if (now == null || then == null) return <span className="text-gray-400">—</span>
  const d = now - then
  let text, good
  if (kind === 'days') { if (Math.round(d) === 0) return <span className="text-gray-500">same</span>; text = `${Math.abs(Math.round(d))} day${Math.abs(Math.round(d)) === 1 ? '' : 's'} ${d < 0 ? 'faster' : 'slower'}`; good = d < 0 }
  else if (kind === 'pts') { const r = Math.round(d); if (r === 0) return <span className="text-gray-500">same</span>; text = `${r > 0 ? '+' : '−'}${Math.abs(r)} pts`; good = r > 0 }
  else if (kind === 'count') { if (d === 0) return <span className="text-gray-500">same</span>; text = `${d > 0 ? '+' : '−'}${Math.abs(d)}`; good = d > 0 }
  else { if (!then) return <span className="text-gray-400">—</span>; const pc = Math.round((d / then) * 100); if (pc === 0) return <span className="text-gray-500">same</span>; text = `${pc > 0 ? '+' : '−'}${Math.abs(pc)}%`; good = pc > 0 }
  return <span className={`font-semibold ${good ? 'text-emerald-700' : 'text-red-700'}`}>{text}</span>
}

export default function OwnerHome() {
  const navigate = useNavigate()
  const { can, role } = useNav()
  const me = useStore(s => s.me)
  const all = useStore(s => s.proposals)
  const invoices = useStore(s => s.invoices)
  const purchases = useStore(s => s.purchases)
  const bills = useStore(s => s.bills)
  const subTasks = useStore(s => s.subTasks)
  const jobCosts = useStore(s => s.jobCosts) || {}
  const permitPulse = useStore(s => s.permitPulse)
  const costOf = useJobCostOf()
  const { reps } = useScopedProposals()
  const [periodKey, setPeriodKey] = useState('year')
  const pick = PERIODS.find(x => x.value === periodKey) || PERIODS[3]
  const { start, end: periodEnd } = getPeriodRange(pick.p, shiftPeriod(pick.p, new Date(), pick.back))
  const now = new Date()
  const end = periodEnd > now ? now : periodEnd
  const pLabel = pick.label.toLowerCase()

  const props = useMemo(() => all.filter(p => p.status !== 'Imported'), [all])
  const sales = useMemo(() => all.filter(isImportedSale), [all])
  const jobs = useMemo(() => all.filter(isJob), [all])

  // ── Organization and each rep ──────────────────────────────────────────────
  const h = headlineNumbers(props, start, end, sales)
  const byRep = reps.map(r => ({ r, h: headlineNumbers(props.filter(p => p.ownerId === r.id), start, end, sales.filter(p => p.ownerId === r.id)) }))
    .filter(x => x.h.won.length || x.h.open.length || x.h.clients.length)
    .sort((a, b) => b.h.wonRevenue - a.h.wonRevenue)

  // ── Open jobs and what customers owe ───────────────────────────────────────
  const idx = useMemo(() => booksIndex({ invoices, purchases, bills }), [invoices, purchases, bills])
  const started = useMemo(() => subStartedIds(subTasks), [subTasks])
  const openJobs = jobs.filter(p => !isJobClosed(p))
  const phases = Object.fromEntries(JOB_PHASES.map(([k]) => [k, { n: 0, revenue: 0, unbilled: 0 }]))
  let openRevenue = 0, toBill = 0
  for (const j of openJobs) {
    const m = jobMoneyFromIndex(j, idx)
    openRevenue += m.revenue; toBill += m.unbilled
    const ph = phases[jobPhaseOf(j, started)]
    if (ph) { ph.n++; ph.revenue += m.revenue; ph.unbilled += m.unbilled }
  }
  const byId = useMemo(() => jobIndex(all), [all])
  let owed = 0, overdue = 0
  for (const inv of invoices || []) {
    const job = byId.get(String(inv.jobId))
    const st = invoiceStatus(inv, job)
    if (st !== 'outstanding' && st !== 'overdue') continue
    const bal = invoiceBalance(inv, job)
    owed += bal; if (st === 'overdue') overdue += bal
  }

  // ── Open sales by stage ────────────────────────────────────────────────────
  const latest = latestIterations(props)
  const stageRows = SALES_STAGES.map(([status, label]) => {
    const list = latest.filter(p => p.status === status)
    return { label, status, n: list.length, value: list.reduce((s, p) => s + (Number(p.total) || 0), 0) }
  })
  const signing = props.filter(p => p.status === 'Won' && contractStatusOf(p) === 'in-progress')
  stageRows.push({ label: 'Contract out to sign', n: signing.length, value: signing.reduce((s, p) => s + (Number(p.total) || 0), 0), to: '/sales?tab=contracts&filter=In+Progress' })

  // ── Same days last year ────────────────────────────────────────────────────
  const thisYear = yearNumbers(props, sales, jobs, start, end)
  const lastYear = yearNumbers(props, sales, jobs, minusYear(start), minusYear(end))
  const fmtDate = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const ty = end.getFullYear(), ly = ty - 1
  const yoy = [
    ['Won revenue', 'wonRevenue', money, 'pct'],
    ['Jobs won', 'jobsWon', String, 'count'],
    ['Win rate', 'winRate', (v) => (v == null ? '—' : `${Math.round(v)}%`), 'pts'],
    ['Average job', 'avgJob', (v) => (v == null ? '—' : money(v)), 'pct'],
    ['Clients quoted', 'clients', String, 'count'],
    ['Quotes sent', 'quotesSent', String, 'count'],
    ['Days to sign', 'daysToSign', (v) => (v == null ? '—' : String(Math.round(v))), 'days'],
    ['Collected', 'collected', money, 'pct'],
  ]

  // Job items that need someone (the same list as the regular Today page)
  const jobAlerts = attentionItems({ proposals: props, jobCosts, costOf, can, role, permitPulse })
    .filter(a => ['inspections', 'contracts', 'signing', 'unscheduled', 'setup', 'warranty'].some(k => a.key.startsWith(k)))

  const hour = now.getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const first = (me?.displayName || '').trim().split(/\s+/)[0]
  const winRate = h.winRate !== null ? `${Math.round(h.winRate)}%` : '—'

  const cells = [
    ['Won revenue', money(h.wonRevenue), `${plural(h.won.length, 'job')} · ${pLabel}`, '/insights?tab=overview'],
    ['Open pipeline', money(h.pipeline), plural(h.open.length, 'open quote'), '/sales?tab=pipeline'],
    ['Win rate', winRate, `${h.wonClients.length} of ${h.clients.length} clients`, '/insights?tab=winloss'],
    ['Average job', h.avgJob != null ? money(h.avgJob) : '—', 'per won job', '/insights?tab=overview'],
    ['Open jobs', money(openRevenue), `${plural(openJobs.length, 'job')} · ${money(toBill)} to bill`, '/projects?tab=jobs'],
    ['Owed to us', money(owed), overdue ? `${money(overdue)} overdue` : 'nothing overdue', '/money?tab=invoices'],
  ]

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      <header className="flex items-center gap-3 flex-wrap">
        <h1 className="qx-greeting text-2xl font-bold text-gray-900">{greeting}{first ? `, ${first}` : ''}</h1>
        <p className="text-sm text-gray-500">{now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        <div className="ml-auto"><MenuChip label="Period" value={periodKey} onChange={setPeriodKey} align="right" options={PERIODS.map(({ value, label }) => ({ value, label }))} /></div>
      </header>

      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden" aria-label="Organization numbers">
        <div className="px-5 py-3 flex items-baseline gap-2 border-b border-gray-100">
          <h2 className="text-[15px] font-semibold text-gray-900">Organization numbers</h2>
          <span className="text-xs text-gray-500">all sales reps combined</span>
          {can('/analytics') && <button onClick={() => navigate('/insights')} className="ml-auto text-sm text-[var(--brand-700)] hover:underline">All insights</button>}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-px bg-gray-100">
          {cells.map(([label, value, sub, to]) => (
            <button key={label} onClick={() => navigate(to)} className="text-left bg-white px-5 py-4 hover:bg-gray-50 min-w-0">
              <p className="text-xs font-medium text-gray-500">{label}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1 leading-none tabular-nums truncate">{value}</p>
              <p className="text-xs text-gray-500 mt-1.5">{sub}</p>
            </button>
          ))}
        </div>
      </section>

      {byRep.length > 0 && (
        <Panel title="By sales rep">
          <Table
            cols={[['Rep'], ['Won revenue', 1], ['Jobs won', 1], ['Open pipeline', 1], ['Win rate', 1], ['Average job', 1]]}
            rows={byRep.map(({ r, h: x }) => ({ cells: [
              <span key="n" className="font-semibold text-gray-900">{r.name}</span>, money(x.wonRevenue), x.won.length, money(x.pipeline),
              x.winRate != null ? `${Math.round(x.winRate)}%` : '—', x.avgJob != null ? money(x.avgJob) : '—'] }))}
            foot={['Organization', money(h.wonRevenue), h.won.length, money(h.pipeline), winRate, h.avgJob != null ? money(h.avgJob) : '—']} />
          {sales.length > 0 && <p className="text-xs text-gray-500 mt-1.5">Organization includes jobs sold in Knowify, which have no sales rep.</p>}
        </Panel>
      )}

      <Panel title="Compared to this time last year" link={can('/analytics') ? 'Win / loss' : null} onLink={() => navigate('/insights?tab=winloss')}>
        <Table
          cols={[[''], ...yoy.map(([label]) => [label, 1])]}
          rows={[
            { cells: [<span key="y" className="font-semibold text-gray-900">{ty}</span>, ...yoy.map(([, k, f]) => f(thisYear[k]))], className: 'text-gray-900' },
            { cells: [ly, ...yoy.map(([, k, f]) => f(lastYear[k]))], className: 'text-gray-500' },
          ]}
          foot={['Change', ...yoy.map(([, k, , kind]) => <Change key={k} now={thisYear[k]} then={lastYear[k]} kind={kind} />)]} />
        <p className="text-xs text-gray-500 mt-1.5">{fmtDate(start)} – {fmtDate(end)}, against the same days in {ly}</p>
      </Panel>

      <div className="grid lg:grid-cols-[1fr_1.3fr] gap-5 items-start">
        <Panel title="Sales" link="Open sales" onLink={() => navigate('/sales?tab=pipeline')}>
          <Table cols={[['Stage'], ['Quotes', 1], ['Value', 1]]}
            rows={stageRows.map(r => ({ cells: [r.label, r.n, money(r.value)], onClick: () => navigate(r.to || `/sales?tab=proposals&status=${encodeURIComponent(r.status)}`) }))}
            foot={['Open', stageRows.reduce((s, r) => s + r.n, 0), money(stageRows.reduce((s, r) => s + r.value, 0))]} />
        </Panel>
        <Panel title="Open jobs" link="Open projects" onLink={() => navigate('/projects?tab=jobs')}>
          <Table cols={[['Stage'], ['Jobs', 1], ['Contract', 1], ['To bill', 1]]}
            rows={JOB_PHASES.map(([k, label]) => ({ cells: [label, phases[k].n, money(phases[k].revenue), money(phases[k].unbilled)], onClick: () => navigate('/projects?tab=jobs') }))}
            foot={['Open', openJobs.length, money(openRevenue), money(toBill)]} />
          {jobAlerts.length > 0 && (
            <ul className="mt-3 bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {jobAlerts.map(a => (
                <li key={a.key}>
                  <button onClick={() => navigate(a.to)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${a.tone === 'alert' ? 'bg-red-500' : a.tone === 'warn' ? 'bg-amber-500' : 'bg-[var(--brand-500)]'}`} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-gray-900">{a.title}</span>
                      {(a.people?.length > 0 || a.detail) && <span className="block text-xs text-gray-500 truncate">{a.people?.length ? a.people.slice(0, 3).map(n => n.name).join(', ') + (a.people.length > 3 ? ` +${a.people.length - 3} more` : '') : a.detail}</span>}
                    </span>
                    <span className="text-xs font-medium text-[var(--brand-700)] shrink-0">{a.cta}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}
