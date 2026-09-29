import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DollarSign, TrendingUp, TrendingDown, Target, ChevronDown, ChevronUp, ChevronRight,
  Edit3, Check, X, Trash2, Eye, AlertCircle, BarChart2, ArrowUpRight,
  Package, Users, Hammer, MoreHorizontal,
} from 'lucide-react'
import { useStore } from '../store'
import { wonRevenueOf } from '../contractTotal'

const fmt   = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtSh = (n) => {
  const v = Number(n)
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(1)}k`
  return `$${v.toFixed(0)}`
}
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

// ── Cost Editor ───────────────────────────────────────────────────────────────
function CostEditor({ proposal, existing, onSave, onDelete, onClose }) {
  const [form, setForm] = useState({
    materials:     existing?.materials     ?? '',
    labor:         existing?.labor         ?? '',
    subcontractors:existing?.subcontractors ?? '',
    other:         existing?.other         ?? '',
    notes:         existing?.notes         ?? '',
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const totalCost = ['materials', 'labor', 'subcontractors', 'other']
    .reduce((s, k) => s + (Number(form[k]) || 0), 0)
  const revenue = wonRevenueOf(proposal)
  const profit  = revenue - totalCost
  const margin  = revenue > 0 ? (profit / revenue) * 100 : 0

  const FIELDS = [
    { key: 'materials',      label: 'Materials',       icon: Package },
    { key: 'labor',          label: 'Labor',           icon: Hammer  },
    { key: 'subcontractors', label: 'Subcontractors',  icon: Users   },
    { key: 'other',          label: 'Other / Overhead',icon: MoreHorizontal },
  ]

  return (
    <div className="bg-gray-50 border-t border-gray-200 px-5 py-4">
      <div className="max-w-2xl">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
            Actual Job Costs — {proposal.client}
          </p>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={15} /></button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          {FIELDS.map(({ key, label, icon: Icon }) => (
            <div key={key}>
              <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-1">
                <Icon size={11} /> {label}
              </label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full pl-6 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                  placeholder="0.00"
                  value={form[key]}
                  onChange={e => set(key, e.target.value)}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="mb-3">
          <label className="text-xs font-medium text-gray-500 block mb-1">Notes</label>
          <textarea
            rows={2}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
            placeholder="e.g. permit delays added labor; material overage on decking"
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
          />
        </div>

        {/* Live preview */}
        <div className="flex items-center gap-6 py-2.5 px-3 bg-white rounded-lg border border-gray-200 mb-3 text-sm">
          <div>
            <p className="text-xs text-gray-400">Revenue</p>
            <p className="font-semibold text-gray-900">${fmt(revenue)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Total Cost</p>
            <p className="font-semibold text-gray-900">${fmt(totalCost)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Gross Profit</p>
            <p className={`font-semibold ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>${fmt(profit)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Margin</p>
            <p className={`font-bold ${MARGIN_COLOR(margin)}`}>{pct(margin)}</p>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div>
            {existing && (
              <button
                onClick={onDelete}
                className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700"
              >
                <Trash2 size={11} /> Clear costs
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
            <button
              onClick={() => onSave(form)}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              <Check size={13} /> Save Costs
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Monthly Trend Chart ───────────────────────────────────────────────────────
function MonthlyChart({ jobs, jobCosts }) {
  const months = useMemo(() => {
    const map = {}
    jobs.forEach(p => {
      const d = new Date(p.closedAt || p.createdAt)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (!map[key]) map[key] = { label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), revenue: 0, cost: 0, profit: 0 }
      const rev  = wonRevenueOf(p)
      const cost = jobCosts[p.id]
        ? ['materials', 'labor', 'subcontractors', 'other'].reduce((s, k) => s + (Number(jobCosts[p.id][k]) || 0), 0)
        : 0
      map[key].revenue += rev
      map[key].cost    += cost
      map[key].profit  += (rev - cost)
    })
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([, v]) => v)
  }, [jobs, jobCosts])

  if (months.length === 0) return null

  const maxRev = Math.max(...months.map(m => m.revenue), 1)

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-end gap-2 h-28 overflow-x-auto">
        {months.map((m, i) => (
          <div key={i} className="flex flex-col items-center gap-1 min-w-[40px] flex-1">
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
export default function ProfitabilityTracker() {
  const proposals  = useStore(s => s.proposals)
  const jobCosts   = useStore(s => s.jobCosts)
  const saveJobCosts   = useStore(s => s.saveJobCosts)
  const deleteJobCosts = useStore(s => s.deleteJobCosts)
  const navigate   = useNavigate()

  const [editingId, setEditingId] = useState(null)
  const [sortField, setSortField] = useState('closedAt')
  const [sortDir, setSortDir]     = useState('desc')
  const [filterHasCosts, setFilterHasCosts] = useState('all')
  const [showMonthly, setShowMonthly] = useState(false)

  // Profit is attributed to the month the job was SOLD (won), not closed out —
  // "pay yourself first." Period scopes every metric; defaults to this year.
  const CURRENT_YEAR = new Date().getFullYear()
  const [statsYear, setStatsYear] = useState(CURRENT_YEAR)
  const saleYearOf = (p) => new Date(p.closedAt || p.sentAt || p.createdAt || Date.now()).getFullYear()

  const wonJobs = useMemo(
    () => proposals.filter(p => p.status === 'Won'),
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
    const rev  = wonRevenueOf(p)
    const costs = jobCosts[p.id]
    const totalCost = costs
      ? ['materials', 'labor', 'subcontractors', 'other'].reduce((s, k) => s + (Number(costs[k]) || 0), 0)
      : null
    const profit = totalCost !== null ? rev - totalCost : null
    const margin = (totalCost !== null && rev > 0) ? (profit / rev) * 100 : null
    return { ...p, rev, totalCost, profit, margin, hasCosts: totalCost !== null }
  }), [wonJobs, jobCosts])

  // Everything below is scoped to the selected period, by SALE (won) month.
  const periodJobs = useMemo(
    () => statsYear === 'all' ? jobs : jobs.filter(j => saleYearOf(j) === statsYear),
    [jobs, statsYear]
  )

  // Summary stats (period-scoped)
  const stats = useMemo(() => {
    const withCosts = periodJobs.filter(j => j.hasCosts)
    const totalRev     = periodJobs.reduce((s, j) => s + j.rev, 0)
    const totalCost    = withCosts.reduce((s, j) => s + j.totalCost, 0)
    const totalProfit  = withCosts.reduce((s, j) => s + j.profit, 0)
    const avgMargin    = withCosts.length > 0
      ? withCosts.reduce((s, j) => s + j.margin, 0) / withCosts.length
      : null
    const jobsEntered  = withCosts.length
    const jobsPending  = periodJobs.length - withCosts.length
    return { totalRev, totalCost, totalProfit, avgMargin, jobsEntered, jobsPending, withCosts: withCosts.length, jobCount: periodJobs.length }
  }, [periodJobs])

  // Close rate overall + monthly breakdown
  const closeStats = useMemo(() => {
    const total = proposals.length
    const won   = proposals.filter(p => p.status === 'Won').length
    const rate  = total > 0 ? (won / total) * 100 : null

    // Group by month of createdAt
    const map = {}
    proposals.forEach(p => {
      const d = new Date(p.createdAt || Date.now())
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

  const SortIcon = ({ field }) =>
    sortField !== field ? null
      : sortDir === 'asc' ? <ChevronUp size={11} className="ml-0.5" />
      : <ChevronDown size={11} className="ml-0.5" />

  const openProposal = (p) => {
    sessionStorage.setItem('proposal', JSON.stringify({
      client: p.client, email: p.email, phone: p.phone,
      address: p.address, expiration: p.expiration,
      lines: p.lines || [], margin: 0, proposalId: p.id,
    }))
    navigate('/proposal')
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Profitability Tracker</h2>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">Enter actual job costs to see your real margins.</p>
        </div>
        {stats.jobsPending > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
            <AlertCircle size={15} />
            {stats.jobsPending} job{stats.jobsPending !== 1 ? 's' : ''} need costs entered
          </div>
        )}
      </div>

      {/* Period selector — scopes every metric below, by sale (won) month */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Performance · {periodLabel}</p>
        <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5 flex-wrap">
          {statsYears.map(y => (
            <button key={y} onClick={() => setStatsYear(y)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${statsYear === y ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
              {y}{y === CURRENT_YEAR ? ' (YTD)' : ''}
            </button>
          ))}
          <button onClick={() => setStatsYear('all')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${statsYear === 'all' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
            All time
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-8 h-8 rounded-lg bg-gray-100 text-gray-500 flex items-center justify-center shrink-0"><DollarSign size={16} /></span>
            <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">Won Revenue</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{fmtSh(stats.totalRev)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{stats.jobCount} won job{stats.jobCount !== 1 ? 's' : ''} · {periodLabel}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-8 h-8 rounded-lg bg-gray-100 text-gray-500 flex items-center justify-center shrink-0"><TrendingDown size={16} /></span>
            <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">Total Costs</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.withCosts > 0 ? fmtSh(stats.totalCost) : '—'}</p>
          <p className="text-xs text-gray-400 mt-0.5">{stats.withCosts} job{stats.withCosts !== 1 ? 's' : ''} with costs</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-8 h-8 rounded-lg bg-gray-100 text-gray-500 flex items-center justify-center shrink-0"><TrendingUp size={16} /></span>
            <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">Gross Profit</span>
          </div>
          <p className={`text-2xl font-bold ${stats.withCosts > 0 ? (stats.totalProfit >= 0 ? 'text-green-600' : 'text-red-600') : 'text-gray-900'}`}>
            {stats.withCosts > 0 ? fmtSh(stats.totalProfit) : '—'}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {stats.withCosts > 0 && stats.totalRev > 0
              ? `${pct((stats.totalProfit / stats.totalRev) * 100)} overall margin`
              : 'enter costs to see margin'}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-8 h-8 rounded-lg bg-gray-100 text-gray-500 flex items-center justify-center shrink-0"><Target size={16} /></span>
            <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">Avg Margin</span>
          </div>
          <p className={`text-2xl font-bold ${stats.avgMargin !== null ? MARGIN_COLOR(stats.avgMargin) : 'text-gray-900'}`}>
            {stats.avgMargin !== null ? pct(stats.avgMargin) : '—'}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">per-job average</p>
        </div>
      </div>

      {/* Monthly Revenue vs Profit — collapsible */}
      {jobs.length > 0 && (
        <div className="mb-6">
          <button onClick={() => setShowMonthly(v => !v)}
            className="flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-gray-900 mb-2">
            {showMonthly ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
            Monthly Revenue vs Profit (Won Jobs)
          </button>
          {showMonthly && <MonthlyChart jobs={periodJobs} jobCosts={jobCosts} />}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Table header row with filters */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
            Won Jobs
          </p>
          <div className="flex gap-1">
            {[
              { value: 'all',      label: 'All' },
              { value: 'entered',  label: 'Costs entered' },
              { value: 'pending',  label: 'Pending' },
            ].map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setFilterHasCosts(value)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  filterHasCosts === value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {jobs.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <BarChart2 size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No won jobs yet.</p>
            <p className="text-xs mt-1">Mark a proposal as Won in the Proposal Tracker to see it here.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Client</th>
                <th
                  className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider w-28 cursor-pointer hover:text-gray-700"
                  onClick={() => toggleSort('rev')}
                >
                  <span className="flex items-center justify-end">Revenue <SortIcon field="rev" /></span>
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">
                  Actual Cost
                </th>
                <th
                  className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider w-28 cursor-pointer hover:text-gray-700"
                  onClick={() => toggleSort('profit')}
                >
                  <span className="flex items-center justify-end">Profit <SortIcon field="profit" /></span>
                </th>
                <th
                  className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider w-24 cursor-pointer hover:text-gray-700"
                  onClick={() => toggleSort('margin')}
                >
                  <span className="flex items-center justify-end">Margin <SortIcon field="margin" /></span>
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-24 cursor-pointer hover:text-gray-700"
                  onClick={() => toggleSort('closedAt')}
                >
                  <span className="flex items-center">Date <SortIcon field="closedAt" /></span>
                </th>
                <th className="px-4 py-3 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(job => (
                <>
                  <tr
                    key={job.id}
                    className={`border-t border-gray-50 hover:bg-gray-50 align-top ${editingId === job.id ? 'bg-blue-50/30' : ''}`}
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
                        ? <span className="font-semibold text-gray-700">${fmt(job.totalCost)}</span>
                        : <span className="text-gray-300 italic text-xs">not entered</span>}
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
                        <button
                          onClick={() => setEditingId(editingId === job.id ? null : job.id)}
                          className={`p-1.5 rounded transition-colors ${
                            editingId === job.id
                              ? 'text-blue-600 bg-blue-100'
                              : 'text-gray-300 hover:text-blue-600 hover:bg-blue-50'
                          }`}
                          title={job.hasCosts ? 'Edit costs' : 'Enter costs'}
                        >
                          <Edit3 size={13} />
                        </button>
                        {job.hasCosts && editingId !== job.id && (
                          <button
                            onClick={() => { deleteJobCosts(job.id); setEditingId(null) }}
                            className="p-1.5 rounded text-gray-300 hover:text-red-500 hover:bg-red-50"
                            title="Clear costs"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {editingId === job.id && (
                    <tr key={`${job.id}-editor`} className="border-t border-blue-100">
                      <td colSpan={7} className="p-0">
                        <CostEditor
                          proposal={job}
                          existing={jobCosts[job.id] || null}
                          onSave={(costs) => {
                            saveJobCosts(job.id, costs)
                            setEditingId(null)
                          }}
                          onDelete={() => {
                            deleteJobCosts(job.id)
                            setEditingId(null)
                          }}
                          onClose={() => setEditingId(null)}
                        />
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Legend */}
      {jobs.length > 0 && (
        <div className="mt-3 flex items-center gap-4 text-xs text-gray-400">
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-green-400 inline-block" /> ≥35% (strong)</div>
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block" /> 20–34% (ok)</div>
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-400 inline-block" /> &lt;20% (low)</div>
          <span className="ml-auto">Click <Edit3 size={11} className="inline" /> to enter actual costs per job</span>
        </div>
      )}
    </div>
  )
}
