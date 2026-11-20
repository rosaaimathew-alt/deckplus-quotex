import FitTable from '../components/FitTable'
import { Fragment, useState, useMemo } from 'react'
import StatCard from '../components/StatCard'
import { useNavigate } from 'react-router-dom'
import {
  DollarSign, TrendingUp, TrendingDown, Target, ChevronDown, ChevronUp, ChevronRight,
  Edit3, Check, X, Trash2, Eye, AlertCircle, BarChart2, ArrowUpRight, Package, Users, Hammer, MoreHorizontal,
} from 'lucide-react'
import { openProposal as showProposal } from '../lib/openProposal'
import { useStore } from '../store'
import { isSale, saleDateOf, saleValueOf } from '../lib/headline'
import { MenuChip, QuickPicks } from '../components/FilterBar'
import { useJobCostOf } from '../lib/jobCost'
import { shortMoney } from '../lib/shortMoney'

const fmt   = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtSh = (n) => shortMoney(n, { kDecimals: 1 })
const pct = (n) => `${Number(n).toFixed(1)}%`

const MARGIN_COLOR = (m) => {
  if (m >= 35) return 'text-green-600'
  if (m >= 20) return 'text-amber-600'
  return 'text-red-600'
}

const MARGIN_BAR = (m) => {
  if (m >= 35) return 'bg-green-400'
  if (m >= 20) return 'bg-amber-400'
  return 'bg-red-400'
}


// ── Monthly Trend Chart ───────────────────────────────────────────────────────
function MonthlyChart({ jobs }) {
  const months = useMemo(() => {
    const map = {}
    jobs.forEach(p => {
      const d = new Date(p.closedAt || p.createdAt)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (!map[key]) map[key] = { label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), revenue: 0, cost: 0, profit: 0 }
      const rev  = p.rev
      const cost = p.totalCost || 0
      map[key].revenue += rev
      map[key].cost    += cost
      map[key].profit  += (rev - cost)
    })
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([, v]) => v)
  }, [jobs])

  if (months.length === 0) return null

  const maxRev = Math.max(...months.map(m => m.revenue), 1)

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-end gap-1 sm:gap-2 h-28">
        {months.map((m, i) => (
          <div key={i} className="flex flex-col items-center gap-1 min-w-0 flex-1">
            <div className="w-full flex items-end justify-center gap-0.5" style={{ height: 90 }}>
              {/* Revenue bar */}
              <div
                className="flex-1 bg-blue-100 rounded-t"
                style={{ height: `${(m.revenue / maxRev) * 90}px`, minHeight: m.revenue > 0 ? 4 : 0 }}
                title={`Revenue: $${fmt(m.revenue)}`}
              />
              {/* Profit bar */}
              <div
                className={`flex-1 rounded-t ${m.profit >= 0 ? 'bg-green-400' : 'bg-red-400'}`}
                style={{ height: `${(Math.abs(m.profit) / maxRev) * 90}px`, minHeight: Math.abs(m.profit) > 0 ? 4 : 0 }}
                title={`Profit: $${fmt(m.profit)}`}
              />
            </div>
            <p className="text-xs text-gray-400 leading-tight text-center">{m.label}</p>
          </div>
        ))}
      </div>
      <div className="flex gap-4 mt-3">
        <div className="flex items-center gap-1.5 text-xs text-gray-500"><span className="w-3 h-3 rounded-sm bg-blue-100 inline-block" /> Revenue</div>
        <div className="flex items-center gap-1.5 text-xs text-gray-500"><span className="w-3 h-3 rounded-sm bg-green-400 inline-block" /> Gross Profit</div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
// When the page loaded: the date a deal with no dates of its own counts under
const LOADED_AT = Date.now()

export default function ProfitabilityTracker() {
  const proposals  = useStore(s => s.proposals)
  const jobCosts   = useStore(s => s.jobCosts)
  const navigate   = useNavigate()
  // Job cost = Money's POs and bills + job receipts + older hand-entered
  // totals — the same figure as Projects › Jobs (lib/jobCost.js)
  const costOf     = useJobCostOf()

  const [sortField, setSortField] = useState('closedAt')
  const [sortDir, setSortDir]     = useState('desc')
  const [filterHasCosts, setFilterHasCosts] = useState('all')
  const [showMonthly, setShowMonthly] = useState(false)

  // Profit is attributed to the month the job was SOLD (won), not closed out —
  // "pay yourself first." Period scopes every metric; defaults to this year.
  const CURRENT_YEAR = new Date().getFullYear()
  const [statsYear, setStatsYear] = useState(CURRENT_YEAR)
  // Sold here or in Knowify, on its sale date (lib/headline.js)
  const saleYearOf = (p) => new Date(saleDateOf(p) || LOADED_AT).getFullYear()

  const wonJobs = useMemo(
    () => proposals.filter(isSale),
    [proposals]
  )

  const statsYears = useMemo(() => {
    const ys = new Set([CURRENT_YEAR])
    wonJobs.forEach(p => { const y = saleYearOf(p); if (!Number.isNaN(y)) ys.add(y) })
    return [...ys].sort((a, b) => b - a)
  }, [wonJobs])
  const periodLabel = statsYear === 'all' ? 'all time' : statsYear === CURRENT_YEAR ? `${statsYear} YTD` : String(statsYear)

  // Derived per-job metrics
  const jobs = useMemo(() => wonJobs.map(p => {
    const fin  = costOf(p)
    const rev  = saleValueOf(p)
    const totalCost = fin.hasCosts ? fin.actualCost : null
    const profit = totalCost !== null ? rev - totalCost : null
    const margin = (totalCost !== null && rev > 0) ? (profit / rev) * 100 : null
    // closedAt here = the sale date (a Knowify sale has no close date in the app)
    return { ...p, closedAt: p.status === 'Won' ? p.closedAt : saleDateOf(p), rev, totalCost, profit, margin, hasCosts: totalCost !== null, fromBooks: fin.fromBooks }
  }), [wonJobs, costOf])

  // Everything below is scoped to the selected period, by SALE (won) month.
  const periodJobs = useMemo(
    () => statsYear === 'all' ? jobs : jobs.filter(j => saleYearOf(j) === statsYear),
    [jobs, statsYear]
  )

  // Summary stats (period-scoped)
  const stats = useMemo(() => {
    const withCosts = periodJobs.filter(j => j.hasCosts)
    const totalRev     = periodJobs.reduce((s, j) => s + j.rev, 0)
    // margin over the jobs that have costs (the others would count as 100%)
    const costedRev    = withCosts.reduce((s, j) => s + j.rev, 0)
    const totalCost    = withCosts.reduce((s, j) => s + j.totalCost, 0)
    const totalProfit  = withCosts.reduce((s, j) => s + j.profit, 0)
    // The middle job's margin: one job with a tiny sold value (a $1 Knowify
    // placeholder) can't drag it to -8,000% the way an average does.
    const margins = withCosts.map(j => j.margin).filter(Number.isFinite).sort((a, b) => a - b)
    const mid = Math.floor(margins.length / 2)
    const avgMargin = margins.length ? (margins.length % 2 ? margins[mid] : (margins[mid - 1] + margins[mid]) / 2) : null
    const jobsEntered  = withCosts.length
    const jobsPending  = periodJobs.length - withCosts.length
    return { totalRev, costedRev, totalCost, totalProfit, avgMargin, jobsEntered, jobsPending, withCosts: withCosts.length, jobCount: periodJobs.length }
  }, [periodJobs])

  // Close rate overall + monthly breakdown
  const closeStats = useMemo(() => {
    const total = proposals.length
    const won   = proposals.filter(p => p.status === 'Won').length
    const rate  = total > 0 ? (won / total) * 100 : null

    // Group by month of createdAt
    const map = {}
    proposals.forEach(p => {
      const d = new Date(p.createdAt || LOADED_AT)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (!map[key]) map[key] = { label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), total: 0, won: 0 }
      map[key].total++
      if (p.status === 'Won') map[key].won++
    })
    const monthly = Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([, v]) => ({ ...v, rate: v.total > 0 ? Math.round((v.won / v.total) * 100) : 0 }))

    return { total, won, rate, monthly }
  }, [proposals])

  // Sort
  const sorted = useMemo(() => {
    const list = filterHasCosts === 'entered'
      ? periodJobs.filter(j => j.hasCosts)
      : filterHasCosts === 'pending'
      ? periodJobs.filter(j => !j.hasCosts)
      : [...periodJobs]
    return list.sort((a, b) => {
      let av = a[sortField], bv = b[sortField]
      if (sortField === 'closedAt' || sortField === 'createdAt') {
        av = av ? new Date(av).getTime() : 0
        bv = bv ? new Date(bv).getTime() : 0
      }
      if (av == null) return 1
      if (bv == null) return -1
      return sortDir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1)
    })
  }, [periodJobs, sortField, sortDir, filterHasCosts])

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
  }

  // the sort arrow beside a column heading (a plain call, not a component made during render)
  const sortIcon = (field) =>
    sortField !== field ? null
      : sortDir === 'asc' ? <ChevronUp size={11} className="ml-0.5" />
      : <ChevronDown size={11} className="ml-0.5" />

  const openProposal = (p) => showProposal(p, navigate)

  return (
    <div className="p-4 sm:p-6 max-w-7xl">
      {/* One flat line: which jobs, what's missing, and the period */}
      <div className="flex items-center gap-x-5 gap-y-1 flex-wrap border-b border-gray-200 mb-4">
        <QuickPicks value={filterHasCosts} onChange={setFilterHasCosts} options={[
          { value: 'all', label: 'All won jobs' },
          { value: 'entered', label: 'With costs' },
          { value: 'pending', label: 'No costs yet', count: stats.jobsPending || null },
        ]} />
        <div className="ml-auto flex items-center gap-x-5">
          <MenuChip label="Period" value={statsYear} onChange={setStatsYear} align="right"
            options={[...statsYears.map(y => ({ value: y, label: y === CURRENT_YEAR ? `${y} (so far)` : String(y) })), { value: 'all', label: 'All time' }]} />
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="Won revenue" value={fmtSh(stats.totalRev)} sub={`${stats.jobCount} won job${stats.jobCount !== 1 ? 's' : ''} · ${periodLabel}`} />
        <StatCard label="Total costs" value={stats.withCosts > 0 ? fmtSh(stats.totalCost) : '—'} sub={`${stats.withCosts} job${stats.withCosts !== 1 ? 's' : ''} with costs`} />
        <StatCard label="Gross profit" value={stats.withCosts > 0 ? fmtSh(stats.totalProfit) : '—'}
          tone={stats.withCosts > 0 ? (stats.totalProfit >= 0 ? 'text-green-600' : 'text-red-600') : 'text-gray-900'}
          sub={stats.withCosts > 0 && stats.costedRev > 0 ? `${pct((stats.totalProfit / stats.costedRev) * 100)} overall margin` : 'add POs or bills in Money'} />
        <StatCard label="Typical margin" value={stats.avgMargin !== null ? pct(stats.avgMargin) : '—'}
          tone={stats.avgMargin !== null ? MARGIN_COLOR(stats.avgMargin) : 'text-gray-900'} sub="the middle job" />
      </div>

      {/* Monthly Revenue vs Profit — collapsible */}
      {jobs.length > 0 && (
        <div className="mb-6">
          <button onClick={() => setShowMonthly(v => !v)}
            className="flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-gray-900 mb-2">
            {showMonthly ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
            Monthly Revenue vs Profit (Won Jobs)
          </button>
          {showMonthly && <MonthlyChart jobs={periodJobs} />}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {jobs.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <BarChart2 size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No won jobs yet.</p>
            <p className="text-xs mt-1">Mark a proposal as Won in the Proposal Tracker to see it here.</p>
          </div>
        ) : (
          <FitTable><table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Client</th>
                <th
                  className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider w-28 cursor-pointer hover:text-gray-700"
                  onClick={() => toggleSort('rev')}
                >
                  <span className="flex items-center justify-end">Revenue {sortIcon('rev')}</span>
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">
                  Cost
                </th>
                <th
                  className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider w-28 cursor-pointer hover:text-gray-700"
                  onClick={() => toggleSort('profit')}
                >
                  <span className="flex items-center justify-end">Profit {sortIcon('profit')}</span>
                </th>
                <th
                  className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider w-24 cursor-pointer hover:text-gray-700"
                  onClick={() => toggleSort('margin')}
                >
                  <span className="flex items-center justify-end">Margin {sortIcon('margin')}</span>
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-24 cursor-pointer hover:text-gray-700"
                  onClick={() => toggleSort('closedAt')}
                >
                  <span className="flex items-center">Date {sortIcon('closedAt')}</span>
                </th>
                <th className="px-4 py-3 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(job => (
                <Fragment key={job.id}>
                  <tr
                    key={job.id}
                    className="border-t border-gray-50 hover:bg-gray-50 align-top"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{job.client || <span className="text-gray-400 italic">Unnamed</span>}</p>
                      {job.address && <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[200px]">{job.address}</p>}
                      {jobCosts[job.id]?.notes && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[200px] italic">{jobCosts[job.id].notes}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900 whitespace-nowrap">
                      ${fmt(job.rev)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {job.hasCosts
                        ? <span className="font-semibold text-gray-700" title={job.fromBooks ? `$${fmt(job.fromBooks)} from POs and bills in Money` : 'Entered by hand'}>${fmt(job.totalCost)}</span>
                        : <span className="text-gray-300 italic text-xs">none yet</span>}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {job.profit !== null
                        ? <span className={`font-semibold ${job.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {job.profit >= 0 ? '+' : ''}${fmt(job.profit)}
                          </span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {job.margin !== null ? (
                        <div className="flex flex-col items-end gap-1">
                          <span className={`font-bold ${MARGIN_COLOR(job.margin)}`}>{pct(job.margin)}</span>
                          <div className="w-16 h-1 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${MARGIN_BAR(job.margin)}`}
                              style={{ width: `${Math.min(Math.max(job.margin, 0), 100)}%` }}
                            />
                          </div>
                        </div>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                      {job.closedAt
                        ? new Date(job.closedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
                        : job.createdAt
                        ? new Date(job.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openProposal(job)}
                          className="p-1.5 rounded text-gray-300 hover:text-blue-600 hover:bg-blue-50"
                          title="View proposal"
                        >
                          <Eye size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table></FitTable>
        )}
      </div>

      {/* Legend */}
      {jobs.length > 0 && (
        <div className="mt-3 flex items-center gap-4 text-xs text-gray-400">
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-green-400 inline-block" /> ≥35% (strong)</div>
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block" /> 20–34% (ok)</div>
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-400 inline-block" /> &lt;20% (low)</div>
        </div>
      )}
    </div>
  )
}
