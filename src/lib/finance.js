// ── Finance rules — one place for how money is sorted and added up ───────────
// Every expense lands in exactly one bucket:
//   job          — tied to a project (jobId)
//   operating    — running the company (rent, insurance, vehicles, office…)
//   subscription — recurring software / services
//   inventory    — stock bought ahead of a job (decking, lumber, hardware…)
//   misc         — no project and no bucket: the money nobody has accounted for
// Inventory later used on a job is logged as an *allocation* (kind:
// 'allocation'): it adds to that job's cost and lowers inventory on hand, but
// it is not new cash out — the purchase was already counted.
import { contractTotalOf, approvedChangeOrderTotal } from '../contractTotal'

export const BUCKETS = [
  { key: 'job',          label: 'Job costs',     color: '#2563eb' },
  { key: 'operating',    label: 'Operating',     color: '#0f766e' },
  { key: 'subscription', label: 'Subscriptions', color: '#7c3aed' },
  { key: 'inventory',    label: 'Inventory',     color: '#b45309' },
  { key: 'misc',         label: 'Miscellaneous (unaccounted)', color: '#dc2626' },
]
export const bucketLabel = (k) => BUCKETS.find(b => b.key === k)?.label || k

export const CATEGORIES = {
  job:          ['Materials', 'Labor', 'Subcontractor', 'Permits', 'Equipment rental', 'Dumpster / disposal', 'Fuel', 'Other job cost'],
  operating:    ['Rent / office', 'Utilities', 'Insurance', 'Vehicles & fuel', 'Office payroll', 'Marketing', 'Professional fees', 'Tools & equipment', 'Office supplies', 'Taxes & licenses', 'Other operating'],
  subscription: ['Software', 'Phone / internet', 'Memberships', 'Other subscription'],
  inventory:    ['Decking', 'Lumber / framing', 'Railing', 'Hardware / fasteners', 'Pavers / stone', 'Windows / doors', 'Other stock'],
  misc:         ['Uncategorized'],
}

const n = (v) => Number(v) || 0
export const isAllocation = (e) => e?.kind === 'allocation'

// The bucket an expense counts in. A project number wins; then the bucket the
// office chose; anything else is unaccounted.
export function bucketOf(e) {
  if (!e) return 'misc'
  if (e.jobId) return 'job'
  if (['operating', 'subscription', 'inventory'].includes(e.bucket)) return e.bucket
  return 'misc'
}

export const inPeriod = (date, period) => {
  if (!period || period.key === 'all') return true
  const d = String(date || '').slice(0, 10)
  if (!d) return false
  return (!period.from || d >= period.from) && (!period.to || d <= period.to)
}

const iso = (d) => d.toISOString().slice(0, 10)
export function periodFor(key, now = new Date()) {
  const y = now.getFullYear(), m = now.getMonth()
  switch (key) {
    case 'month':     return { key, label: 'This month', from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) }
    case 'lastmonth': return { key, label: 'Last month', from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) }
    case 'quarter': { const q = Math.floor(m / 3) * 3; return { key, label: 'This quarter', from: iso(new Date(y, q, 1)), to: iso(new Date(y, q + 3, 0)) } }
    case 'year':      return { key, label: 'This year', from: `${y}-01-01`, to: `${y}-12-31` }
    case 'lastyear':  return { key, label: 'Last year', from: `${y - 1}-01-01`, to: `${y - 1}-12-31` }
    default:          return { key: 'all', label: 'All time' }
  }
}

// ── Subscriptions ────────────────────────────────────────────────────────────
export const monthlyCostOf = (s) => (s?.active === false ? 0 : s?.cycle === 'yearly' ? n(s.amount) / 12 : n(s.amount))
export const yearlyCostOf  = (s) => monthlyCostOf(s) * 12

// Next renewal on or after today, from the start date and billing cycle.
export function nextRenewal(s, today = new Date()) {
  if (!s?.startDate) return null
  const start = new Date(`${s.startDate}T00:00:00`)
  if (Number.isNaN(start.getTime())) return null
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const d = new Date(start)
  const step = s.cycle === 'yearly' ? 12 : 1
  let guard = 0
  while (d < t && guard++ < 1200) d.setMonth(d.getMonth() + step)
  return iso(d)
}

// A statement line that looks like one of the saved subscriptions.
export function matchSubscription(description, subscriptions = []) {
  const d = String(description || '').toLowerCase()
  return subscriptions.find(s => {
    const keys = [s.vendor, s.name].map(x => String(x || '').toLowerCase().trim()).filter(x => x.length >= 3)
    return keys.some(k => d.includes(k))
  }) || null
}

// Common merchants → a suggested bucket for imported statement lines.
const VENDOR_HINTS = [
  [/home depot|lowe'?s|84 lumber|menards|abc supply|trex|timbertech|azek|fastenmaster|simpson|lumber|builders firstsource/i, 'inventory'],
  [/shell|exxon|bp\b|chevron|speedway|quiktrip|qt\b|circle k|marathon|sunoco|wawa|racetrac|sheetz/i, 'operating'],
  [/adobe|google|microsoft|quickbooks|intuit|dropbox|zoom|slack|canva|verizon|at&t|t-mobile|comcast|spectrum|openai|anthropic|apple\.com|icloud|hubspot|jobber|buildertrend|companycam/i, 'subscription'],
  [/insurance|geico|progressive|state farm|allstate|liberty mutual/i, 'operating'],
]
export function suggestBucket(description, subscriptions = []) {
  if (matchSubscription(description, subscriptions)) return 'subscription'
  const hit = VENDOR_HINTS.find(([re]) => re.test(String(description || '')))
  return hit ? hit[1] : ''
}

// ── Inventory ────────────────────────────────────────────────────────────────
export function inventorySummary(expenses = []) {
  const bought = expenses.filter(e => !isAllocation(e) && bucketOf(e) === 'inventory').reduce((s, e) => s + n(e.amount), 0)
  const used   = expenses.filter(isAllocation).reduce((s, e) => s + n(e.amount), 0)
  return { bought, used, onHand: bought - used }
}

// ── One job ──────────────────────────────────────────────────────────────────
// Estimated cost = the cost the proposal was priced with (line cost × qty).
export function estimatedCostOf(proposal) {
  return (proposal?.lines || []).reduce((s, l) => s + (n(l.costMaterials) + n(l.costSub)) * (n(l.qty) || 1), 0)
}

export function jobFinancials(proposal, expenses = [], legacyCosts = null) {
  const contract = contractTotalOf(proposal)
  const changeOrders = approvedChangeOrderTotal(proposal)
  const revenue = contract + changeOrders
  const mine = expenses.filter(e => e.jobId === proposal.id)
  const byCategory = {}
  for (const e of mine) {
    const c = isAllocation(e) ? 'Materials (from inventory)' : (e.category || 'Other job cost')
    byCategory[c] = (byCategory[c] || 0) + n(e.amount)
  }
  // Older manual totals from the Profitability tracker still count.
  const legacy = legacyCosts || {}
  for (const [k, label] of [['materials', 'Materials'], ['labor', 'Labor'], ['subcontractors', 'Subcontractor'], ['other', 'Other job cost']]) {
    if (n(legacy[k])) byCategory[label] = (byCategory[label] || 0) + n(legacy[k])
  }
  const actualCost = Object.values(byCategory).reduce((s, v) => s + v, 0)
  const estimatedCost = estimatedCostOf(proposal)
  const profit = revenue - actualCost
  const received = (proposal?.jobData?.paymentsReceived || []).reduce((s, p) => s + n(p.amount), 0)
  const milestones = proposal?.contractDraft?.payments || []
  return {
    contract, changeOrders, revenue, estimatedCost, actualCost,
    costVariance: estimatedCost ? actualCost - estimatedCost : null,
    profit, margin: revenue > 0 ? (profit / revenue) * 100 : null,
    estimatedProfit: revenue - estimatedCost,
    received, balanceDue: Math.max(0, revenue - received),
    percentCollected: revenue > 0 ? Math.min(100, (received / revenue) * 100) : 0,
    byCategory, entries: mine, milestones,
  }
}

// ── The whole company for a period ───────────────────────────────────────────
export function companySummary({ expenses = [], proposals = [], subscriptions = [], jobCosts = {}, period }) {
  const cash = expenses.filter(e => !isAllocation(e) && inPeriod(e.date, period))
  const byBucket = Object.fromEntries(BUCKETS.map(b => [b.key, 0]))
  const countBy = Object.fromEntries(BUCKETS.map(b => [b.key, 0]))
  for (const e of cash) { const b = bucketOf(e); byBucket[b] += n(e.amount); countBy[b]++ }
  const spend = Object.values(byBucket).reduce((s, v) => s + v, 0)

  const jobs = proposals.filter(p => p.status === 'Won')
  const collected = jobs.reduce((s, p) => s + (p.jobData?.paymentsReceived || [])
    .filter(x => inPeriod(x.date, period)).reduce((a, x) => a + n(x.amount), 0), 0)
  const sold = jobs.filter(p => inPeriod(p.closedAt || p.sentAt || p.createdAt, period))
    .reduce((s, p) => s + contractTotalOf(p) + approvedChangeOrderTotal(p), 0)
  const outstanding = jobs.reduce((s, p) => {
    const rev = contractTotalOf(p) + approvedChangeOrderTotal(p)
    const got = (p.jobData?.paymentsReceived || []).reduce((a, x) => a + n(x.amount), 0)
    return s + Math.max(0, rev - got)
  }, 0)

  // Job profit for jobs sold in the period, and the same profit once the
  // unaccounted (misc) spend is assumed to be project cost spread over them.
  const soldJobs = jobs.filter(p => inPeriod(p.closedAt || p.sentAt || p.createdAt, period))
  const jobProfit = soldJobs.reduce((s, p) => s + jobFinancials(p, expenses, jobCosts?.[p.id]).profit, 0)
  const unaccountedRate = sold > 0 ? (byBucket.misc / sold) * 100 : 0
  const adjustedJobProfit = jobProfit - byBucket.misc

  return {
    byBucket, countBy, spend, collected, sold, outstanding,
    jobProfit, jobMargin: sold > 0 ? (jobProfit / sold) * 100 : null,
    unaccountedRate, adjustedJobProfit, adjustedJobMargin: sold > 0 ? (adjustedJobProfit / sold) * 100 : null,
    net: collected - spend,
    unaccounted: byBucket.misc, unaccountedCount: countBy.misc,
    unaccountedPct: spend > 0 ? (byBucket.misc / spend) * 100 : 0,
    subscriptionsMonthly: subscriptions.reduce((s, x) => s + monthlyCostOf(x), 0),
    inventory: inventorySummary(expenses),
  }
}

// Unaccounted (misc) spend as a % of job revenue sold in the period — the share
// to take off every job's profit if those costs really were project costs.
export function unaccountedRate({ expenses = [], proposals = [], period }) {
  const misc = expenses.filter(e => !isAllocation(e) && inPeriod(e.date, period) && bucketOf(e) === 'misc').reduce((s, e) => s + n(e.amount), 0)
  const sold = proposals.filter(p => p.status === 'Won' && inPeriod(p.closedAt || p.sentAt || p.createdAt, period))
    .reduce((s, p) => s + contractTotalOf(p) + approvedChangeOrderTotal(p), 0)
  return { misc, sold, rate: sold > 0 ? (misc / sold) * 100 : 0 }
}

// A job's profit and margin after taking the unaccounted rate off its revenue.
export function adjustedForUnaccounted(fin, ratePct) {
  const deduction = fin.revenue * (n(ratePct) / 100)
  const profit = fin.profit - deduction
  return { deduction, profit, margin: fin.revenue > 0 ? (profit / fin.revenue) * 100 : null }
}
