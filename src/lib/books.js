// ── Books: invoices, bills, purchase orders and vendors ──────────────────────
// The office's day-to-day money records (the Knowify side of the house), and
// the rules every screen uses to add them up, so a job's numbers agree on the
// job page, the Money pages, the jobs list and the office home.
//
//   invoice   what we bill a customer. Payments against it are NOT stored on
//             the invoice: they are the job's own payments received
//             (jobData.paymentsReceived) tagged with invoiceId, so "collected"
//             on the job and "paid" on the invoice are always the same money.
//   purchase  a purchase order (PO) — money we've committed to spend. Split
//             across jobs with `allocations`; with no job it's company spend
//             (operating / inventory). Sales commissions are POs too
//             (type 'commission', vendor = the rep).
//   bill      what a vendor bills us. Optional PO and job; payments are kept
//             on the bill. A bill with no job is overhead (bucket).
//   vendor    a supplier / service company. Subcontractors stay in their own
//             list (Projects › Subcontractors) and show on Vendors too, so a
//             sub is never entered twice; vendor refs are 'v:<id>' / 's:<id>'.
import { contractTotalOf, approvedChangeOrderTotal } from '../contractTotal'

const n = (v) => Number(v) || 0
const round2 = (v) => Math.round(n(v) * 100) / 100
export const todayISO = () => new Date().toISOString().slice(0, 10)
export const newId = () => Date.now() * 1000 + Math.floor(Math.random() * 1000)

export const money = (v) => {
  const x = n(v)
  return (x < 0 ? '-$' : '$') + Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
export const money0 = (v) => {
  const x = n(v)
  return (x < 0 ? '-$' : '$') + Math.abs(x).toLocaleString('en-US', { maximumFractionDigits: 0 })
}
export const shortDate = (iso) => {
  if (!iso) return '—'
  const d = new Date(String(iso).length <= 10 ? `${iso}T00:00:00` : iso)
  return isNaN(d) ? '—' : d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' })
}
export const addDays = (iso, days) => {
  const d = new Date(`${iso || todayISO()}T00:00:00`)
  d.setDate(d.getDate() + n(days))
  return d.toISOString().slice(0, 10)
}
const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 86400000)

// ── Kinds ────────────────────────────────────────────────────────────────────
export const PO_TYPES = [
  { key: 'materials',  label: 'Materials',     color: '#f59e0b' },
  { key: 'sub',        label: 'Subcontractor', color: '#db2777' },
  { key: 'labor',      label: 'Labor',         color: '#dc2626' },
  { key: 'equipment',  label: 'Equipment',     color: '#0891b2' },
  { key: 'commission', label: 'Commission',    color: '#7c3aed' },
  { key: 'misc',       label: 'Miscellaneous', color: '#6b7280' },
]
export const poTypeLabel = (k) => PO_TYPES.find(t => t.key === k)?.label || 'Miscellaneous'

export const VENDOR_TYPES = [
  { key: 'supplier', label: 'Materials supplier' },
  { key: 'sub',      label: 'Subcontractor' },
  { key: 'service',  label: 'Services / other' },
]
export const vendorTypeLabel = (k) => VENDOR_TYPES.find(t => t.key === k)?.label || 'Services / other'

// Company spend that isn't a job (same buckets as Insights › Expenses).
export const OVERHEAD_BUCKETS = [
  { key: 'operating',    label: 'Operating / fixed cost' },
  { key: 'subscription', label: 'Subscription' },
  { key: 'inventory',    label: 'Inventory' },
]

export const INVOICE_KINDS = [
  { key: 'progress', label: 'Progress / deposit' },
  { key: 'final',    label: 'Final' },
  { key: 'change',   label: 'Change order' },
  { key: 'credit',   label: 'Credit' },
]

// ── Jobs ─────────────────────────────────────────────────────────────────────
// A job is a won (or imported) proposal; the name is the client.
export const isBooksJob = (p) => p && (p.status === 'Won' || p.status === 'Imported')
export const jobLabel = (p) => (p ? (p.client || p.name || `Job ${p.id}`) : '—')
export function jobIndex(proposals = []) {
  const m = new Map()
  for (const p of proposals) m.set(String(p.id), p)
  return m
}

// ── Vendors (vendor records + subcontractors, one list) ──────────────────────
export function allVendors(vendors = [], subcontractors = []) {
  const out = []
  for (const v of vendors) {
    if (!v) continue
    out.push({ ref: `v:${v.id}`, source: 'vendor', id: v.id, name: v.name || 'Unnamed vendor', type: v.type || 'supplier',
      email: v.email || '', phone: v.phone || '', docs: v.docs || {}, active: v.active !== false, rec: v })
  }
  for (const s of subcontractors) {
    if (!s) continue
    out.push({ ref: `s:${s.id}`, source: 'sub', id: s.id, name: s.name || 'Unnamed sub', type: 'sub',
      email: s.email || '', phone: s.phone || '', docs: s.docs || {}, active: s.active !== false, trade: s.trade || '',
      hasCoiFile: (s.cois || []).length > 0, rec: s })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}
export const vendorName = (ref, list, fallback = '') => list.find(v => v.ref === ref)?.name || fallback || '—'

// GL (general liability), WC (workers' comp): an expiry date; W9: on file.
export const DOC_KEYS = [
  { key: 'gl', label: 'GL', name: 'General liability', dated: true },
  { key: 'wc', label: 'WC', name: "Workers' comp", dated: true },
  { key: 'w9', label: 'W9', name: 'W-9 on file', dated: false },
]
// 'ok' | 'expiring' (within 30 days) | 'expired' | 'missing'
export function docStatus(doc, dated, today = todayISO()) {
  if (!doc) return 'missing'
  if (!dated) return doc.onFile ? 'ok' : 'missing'
  if (!doc.expires) return doc.onFile ? 'ok' : 'missing'
  const left = daysBetween(today, doc.expires)
  if (left < 0) return 'expired'
  if (left <= 30) return 'expiring'
  return 'ok'
}
// Subs must carry GL + WC + W9; a supplier only needs a W9 if it's set.
export function vendorDocProblems(v, today = todayISO()) {
  const keys = v.type === 'sub' ? DOC_KEYS : DOC_KEYS.filter(d => v.docs?.[d.key])
  return keys.filter(d => docStatus(v.docs?.[d.key], d.dated, today) !== 'ok').map(d => ({ ...d, status: docStatus(v.docs?.[d.key], d.dated, today) }))
}

// ── Purchase orders ──────────────────────────────────────────────────────────
// Where a PO's money goes: [{ jobId, amount }]. No allocations = company spend.
export function poAllocations(po) {
  if (Array.isArray(po?.allocations) && po.allocations.length) return po.allocations.filter(a => a && a.jobId != null)
  if (po?.jobId != null && po.jobId !== '') return [{ jobId: po.jobId, amount: n(po.amount) }]
  return []
}
export const poToJob = (po, jobId) => poAllocations(po).filter(a => String(a.jobId) === String(jobId)).reduce((s, a) => s + n(a.amount), 0)
export const poIsLive = (po) => po && po.status !== 'void'
export const poBilled = (po, bills = []) => bills.filter(b => b.poId != null && String(b.poId) === String(po.id) && b.status !== 'void').reduce((s, b) => s + n(b.total), 0)
// A job's name is the client's last name in capitals (how Deck Plus labels
// its supplier orders): "Clay Woodring" → WOODRING, "WOODRING, Clay" →
// WOODRING, "Keith & Amy Allen" → ALLEN.
export function jobLastName(job) {
  const c = String(job?.client || job?.name || '').trim()
  if (!c) return ''
  if (c.includes(',')) return c.split(',')[0].trim().toUpperCase()
  const words = c.replace(/[()]/g, ' ').split(/\s+/).filter(w => w && !/^(jr|sr|ii|iii|iv)\.?$/i.test(w))
  return (words[words.length - 1] || c).replace(/[.,;]+$/, '').toUpperCase()
}
// The street part of the job's address ("1502 Old Tara Lane, Fort Mill, SC" →
// "1502 Old Tara Lane") and its house number ("1502").
export const jobStreet = (job) => String(job?.address || '').split(',')[0].trim()
export const jobHouseNumber = (job) => (/^\s*(\d+[A-Za-z]?)\b/.exec(String(job?.address || '')) || [])[1] || ''
// The job PO: last name + street address, so two Joneses never share one
// ("WOODRING 1502 Old Tara Lane"). No address on file → just the last name.
export function jobPoName(job) {
  const last = jobLastName(job)
  const street = jobStreet(job)
  return last && street ? `${last} ${street}` : last
}
export function nextPoNumber(purchases = []) {
  const nums = purchases.map(p => parseInt(String(p.number || '').replace(/\D/g, ''), 10)).filter(x => Number.isFinite(x) && x < 1e7)
  return String((nums.length ? Math.max(...nums) : 1000) + 1)
}

// ── Bills ────────────────────────────────────────────────────────────────────
export const billPaid = (b) => (b?.payments || []).reduce((s, p) => s + n(p.amount), 0)
export const billBalance = (b) => round2(n(b?.total) - billPaid(b))
// 'void' | 'paid' | 'overdue' | 'outstanding'
export function billStatus(b, today = todayISO()) {
  if (!b) return 'outstanding'
  if (b.status === 'void') return 'void'
  if (billBalance(b) <= 0.004) return 'paid'
  if (b.dueDate && b.dueDate < today) return 'overdue'
  return 'outstanding'
}

// ── Invoices ─────────────────────────────────────────────────────────────────
export const invoiceTotal = (inv) => round2((inv?.lines || []).length
  ? inv.lines.reduce((s, l) => s + n(l.amount), 0)
  : n(inv?.total))
// Payments are the job's payments received tagged with this invoice.
export function invoicePayments(inv, job) {
  return (job?.jobData?.paymentsReceived || []).filter(p => p.invoiceId != null && String(p.invoiceId) === String(inv.id))
}
export const invoicePaid = (inv, job) => invoicePayments(inv, job).reduce((s, p) => s + n(p.amount), 0)
export const invoiceBalance = (inv, job) => round2(invoiceTotal(inv) - invoicePaid(inv, job))
// 'draft' | 'void' | 'paid' | 'overdue' | 'outstanding'. A credit (≤ 0) is paid.
export function invoiceStatus(inv, job, today = todayISO()) {
  if (!inv) return 'outstanding'
  if (inv.status === 'void') return 'void'
  if (inv.status === 'draft') return 'draft'
  if (invoiceBalance(inv, job) <= 0.004) return 'paid'
  if (inv.dueDate && inv.dueDate < today) return 'overdue'
  return 'outstanding'
}
// Contract invoices count up (4989, 4990…); change-order invoices get an 'A'.
export function nextInvoiceNumber(invoices = [], kind = 'progress') {
  const nums = invoices.map(i => parseInt(String(i.number || '').replace(/\D/g, ''), 10)).filter(Number.isFinite)
  const next = (nums.length ? Math.max(...nums) : 1000) + 1
  return kind === 'change' ? `A${next}` : String(next)
}

export const STATUS_STYLE = {
  outstanding: { label: 'Outstanding', cls: 'bg-amber-500 text-white' },
  overdue:     { label: 'Overdue',     cls: 'bg-red-600 text-white' },
  paid:        { label: 'Paid',        cls: 'bg-gray-400 text-white' },
  draft:       { label: 'Draft',       cls: 'bg-gray-100 text-gray-600' },
  void:        { label: 'Void',        cls: 'bg-gray-100 text-gray-400 line-through' },
  open:        { label: 'Open',        cls: 'bg-green-600 text-white' },
  active:      { label: 'Active',      cls: 'bg-green-500 text-white' },   // an open PO, as Knowify shows it
  closed:      { label: 'Closed',      cls: 'bg-gray-400 text-white' },
}

// Banner totals: outstanding, due within N days, overdue (amount + count).
export function dueSummary(rows, days, today = todayISO()) {
  const soon = addDays(today, days)
  const out = { outstanding: 0, outstandingCount: 0, dueSoon: 0, dueSoonCount: 0, overdue: 0, overdueCount: 0 }
  for (const r of rows) {
    if (r.status !== 'outstanding' && r.status !== 'overdue') continue
    out.outstanding += r.balance; out.outstandingCount++
    if (r.status === 'overdue') { out.overdue += r.balance; out.overdueCount++ }
    else if (r.dueDate && r.dueDate <= soon) { out.dueSoon += r.balance; out.dueSoonCount++ }
  }
  return out
}

// ── One job, all its books ───────────────────────────────────────────────────
// revenue    contract + approved change orders
// invoiced   live invoices (not draft / void), credits net in
// unbilled   revenue not yet invoiced (what's left to bill)
// committed  live PO money to this job, by type
// actual     bills paid against this job's POs or billed to the job directly
export function jobBooks(job, { invoices = [], purchases = [], bills = [] } = {}) {
  const id = String(job?.id)
  const revenue = contractTotalOf(job) + approvedChangeOrderTotal(job)
  const myInv = invoices.filter(i => String(i.jobId) === id && i.status !== 'void' && i.status !== 'draft')
  const invoiced = round2(myInv.reduce((s, i) => s + invoiceTotal(i), 0))
  const invoicePaidTotal = round2(myInv.reduce((s, i) => s + invoicePaid(i, job), 0))
  const committedByType = Object.fromEntries(PO_TYPES.map(t => [t.key, 0]))
  const myPos = []
  for (const po of purchases) {
    if (!poIsLive(po)) continue
    const amt = poToJob(po, id)
    if (!amt) continue
    myPos.push(po)
    committedByType[po.type in committedByType ? po.type : 'misc'] += amt
  }
  // A bill straight to the job (no PO) is cost too — there's no PO to commit it.
  for (const b of bills) {
    if (b.status === 'void' || b.poId != null || String(b.jobId) !== id) continue
    committedByType[b.type in committedByType ? b.type : 'misc'] += n(b.total)
  }
  const committed = round2(Object.values(committedByType).reduce((s, v) => s + v, 0))
  const poIds = new Set(myPos.map(p => String(p.id)))
  const myBills = bills.filter(b => b.status !== 'void' && (String(b.jobId) === id || (b.poId != null && poIds.has(String(b.poId)))))
  const billed = round2(myBills.reduce((s, b) => s + n(b.total), 0))
  const paidOut = round2(myBills.reduce((s, b) => s + billPaid(b), 0))
  const collected = (job?.jobData?.paymentsReceived || []).reduce((s, p) => s + n(p.amount), 0)
  const profit = round2(revenue - committed)
  return {
    revenue: round2(revenue), invoiced, invoicePaid: invoicePaidTotal, unbilled: round2(Math.max(0, revenue - invoiced)),
    collected: round2(collected), contractBalance: round2(revenue - invoiced),
    committedByType, committed, billed, paidOut, profit,
    margin: revenue > 0 ? (profit / revenue) * 100 : null,
    invoices: myInv, purchases: myPos, bills: myBills,
  }
}

// The jobs list needs every job's totals at once: one pass over the records
// instead of one pass per job (1,000 jobs × 18,000 POs would crawl).
export function booksIndex({ invoices = [], purchases = [], bills = [] } = {}) {
  const idx = new Map()
  const row = (id) => {
    const k = String(id)
    if (!idx.has(k)) idx.set(k, { invoiced: 0, committed: 0, committedByType: Object.fromEntries(PO_TYPES.map(t => [t.key, 0])) })
    return idx.get(k)
  }
  for (const inv of invoices) {
    if (inv.jobId == null || inv.status === 'void' || inv.status === 'draft') continue
    row(inv.jobId).invoiced += invoiceTotal(inv)
  }
  for (const po of purchases) {
    if (!poIsLive(po)) continue
    for (const a of poAllocations(po)) {
      const r = row(a.jobId)
      r.committed += n(a.amount)
      r.committedByType[po.type in r.committedByType ? po.type : 'misc'] += n(a.amount)
    }
  }
  for (const b of bills) {
    if (b.status === 'void' || b.poId != null || b.jobId == null) continue
    const r = row(b.jobId)
    r.committed += n(b.total)
    r.committedByType[b.type in r.committedByType ? b.type : 'misc'] += n(b.total)
  }
  return idx
}
export function jobMoneyFromIndex(job, idx) {
  const r = idx.get(String(job.id)) || { invoiced: 0, committed: 0, committedByType: {} }
  const revenue = contractTotalOf(job) + approvedChangeOrderTotal(job)
  const profit = revenue - r.committed
  return { revenue, invoiced: round2(r.invoiced), committed: round2(r.committed), committedByType: r.committedByType,
    unbilled: Math.max(0, round2(revenue - r.invoiced)), profit: round2(profit), margin: revenue > 0 ? (profit / revenue) * 100 : null }
}

// Every transaction that touches a job, newest first (Job › Transactions).
export function jobTransactions(job, { invoices = [], purchases = [], bills = [] } = {}) {
  const id = String(job?.id)
  const rows = []
  for (const inv of invoices) {
    if (String(inv.jobId) !== id) continue
    rows.push({ key: `i${inv.id}`, date: inv.date, kind: 'invoice', type: 'Invoice', status: invoiceStatus(inv, job),
      details: `#${inv.number || '—'}${inv.memo ? ` · ${inv.memo}` : ''}`, total: invoiceTotal(inv), toJob: invoiceTotal(inv), rec: inv })
  }
  for (const po of purchases) {
    const amt = poToJob(po, id)
    if (!amt) continue
    rows.push({ key: `p${po.id}`, date: po.date, kind: 'purchase', type: `${poTypeLabel(po.type)} purchase`, status: po.status === 'void' ? 'void' : (po.status || 'open'),
      details: `PO#${po.number || '—'}${po.vendorName ? ` for ${po.vendorName}` : ''}`, total: n(po.amount), toJob: amt, split: poAllocations(po).length > 1, rec: po })
  }
  for (const b of bills) {
    if (String(b.jobId) !== id) continue
    // A bill against a PO is already counted on the PO, so it adds nothing here.
    rows.push({ key: `b${b.id}`, date: b.date, kind: 'bill', type: 'Bill', status: billStatus(b),
      details: `${b.vendorName || 'Vendor'}${b.number ? ` · #${b.number}` : ''}${b.poNumber ? ` · on PO#${b.poNumber}` : ''}`,
      total: n(b.total), toJob: b.poId != null ? null : n(b.total), rec: b })
  }
  return rows.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
}

// Company-wide totals for the office home.
export function officeOverview({ proposals = [], invoices = [], purchases = [], bills = [] }, today = todayISO()) {
  const jobs = proposals.filter(p => p.status === 'Won' && !(p.jobData?.completedStages || []).includes('closed'))
  const idx = booksIndex({ invoices, purchases, bills })
  let unbilled = 0
  for (const j of jobs) unbilled += jobMoneyFromIndex(j, idx).unbilled
  const bids = proposals.filter(p => p.status === 'Sent' || p.status === 'Draft')
  const pendingCos = []
  for (const p of proposals) for (const co of p.jobData?.changeOrders || []) {
    if (co.status === 'Pending' || co.status === 'Sent for Signature' || co.status === 'Draft') pendingCos.push(co)
  }
  const opportunity = bids.filter(p => p.status === 'Sent').reduce((s, p) => s + n(p.total), 0) + pendingCos.reduce((s, c) => s + n(c.amount), 0)
  const byId = jobIndex(proposals)
  const overdueInvoices = invoices.filter(i => invoiceStatus(i, byId.get(String(i.jobId)), today) === 'overdue').length
  const overdueBills = bills.filter(b => billStatus(b, today) === 'overdue').length
  return {
    activeJobs: jobs.length, unbilled: round2(unbilled),
    bidsAndCos: bids.filter(p => p.status === 'Sent').length + pendingCos.length, opportunity: round2(opportunity),
    overdueInvoices, overdueBills, openPos: purchases.filter(p => (p.status || 'open') === 'open').length,
  }
}

// Every change order on every job, for the company-wide list.
export function allChangeOrders(proposals = []) {
  const out = []
  for (const p of proposals) {
    for (const co of p.jobData?.changeOrders || []) {
      out.push({ ...co, job: p, jobId: p.id, updated: co.signedAt || co.updatedAt || co.sentAt || co.createdAt || (typeof co.id === 'number' && co.id > 1e12 && co.id < 1e13 ? new Date(co.id).toISOString() : '') })
    }
  }
  return out.sort((a, b) => String(b.updated || '').localeCompare(String(a.updated || '')))
}

// CSV export (opens in Excel). rows: array of plain objects; cols: [[header, fn]]
export function downloadCsv(filename, cols, rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const text = [cols.map(c => esc(c[0])).join(','), ...rows.map(r => cols.map(c => esc(c[1](r))).join(','))].join('\n')
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
