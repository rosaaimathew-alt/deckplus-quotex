// ── The headline numbers ─────────────────────────────────────────────────────
// Won revenue, win rate, average job and open pipeline are shown on Home,
// Insights › Overview and Insights › Win / loss. They all come from here, so
// the same period always shows the same numbers everywhere.
//
//   Won revenue  every Won deal whose win (close / signing) falls in the
//                period: the sold value plus signed change orders.
//   Win rate     of the clients we estimated in the period (their first
//                estimate is in the period and at least one version was
//                actually sent), how many have signed. Every version of a
//                deal is one client; drafts and archived revisions are
//                neutral.
//   Average job  won revenue ÷ won deals.
//   Pipeline     right now, not tied to the period: each client's latest
//                version that's Sent, Followed Up or Negotiating.
//
// Sales made in Knowify before the app (imported jobs that carry their sold
// value and date) count toward won revenue, jobs sold and average job, so the
// organization's totals are everything actually sold. They were never
// estimated here, so they stay out of win rate and pipeline.
import { clientGroups, latestIterations } from './proposalGroups'
import { wonRevenueOf } from '../contractTotal'

export const OPEN_STATUSES = ['Sent', 'Followed Up', 'Negotiating']
// A deal counts as won once the client commits: tagged Won or contract signed
export const isWonDeal = (p) => p.status === 'Won' || p.contractDraft?.signed === true
export const wonDateOf = (p) => p.closedAt || p.contractDraft?.signedAt || p.sentAt || p.createdAt

// A job sold in Knowify (not a cancelled one): value and sale date are known.
export const isImportedSale = (p) => p?.status === 'Imported' && p.knowify?.source === 'jobs report'
  && !p.knowify.cancelled && !!p.knowify.proposalDate && Number(p.knowify.contractValue) > 0
// Any sale: won in the app, or sold in Knowify.
export const isSale = (p) => p?.status === 'Won' || isImportedSale(p)
export const saleDateOf = (p) => (isImportedSale(p) ? `${p.knowify.proposalDate}T12:00:00` : wonDateOf(p))
export const saleValueOf = (p) => (isImportedSale(p) ? Number(p.knowify.contractValue) || 0 : wonRevenueOf(p))

// start / end: Dates, or null for all time. `sales`: imported sales to count
// when `proposals` has had the imported jobs filtered out (Home, Sales).
export function headlineNumbers(proposals = [], start = null, end = null, sales = []) {
  const seen = new Set()
  const importedSales = [...proposals, ...sales].filter(p => isImportedSale(p) && !seen.has(p.id) && seen.add(p.id))
  // Imported jobs were never estimated here: as clients they'd count as never
  // signed. Leave them out of everything but the sales totals.
  proposals = proposals.filter(p => p.status !== 'Imported')
  const inRange = (s) => {
    if (!start) return true
    const d = new Date(s)
    return !Number.isNaN(d.getTime()) && d >= start && d <= end
  }
  const groups = clientGroups(proposals).filter(g => g.all.some(p => p.status !== 'Archived'))
  const clients = groups.filter(g => inRange(g.root.createdAt || g.root.sentAt || g.root.closedAt)
    && g.all.some(p => p.status !== 'Archived' && p.status !== 'Draft'))
  const wonClients = clients.filter(g => g.all.some(p => p.status !== 'Archived' && isWonDeal(p)))
  const won = [
    ...proposals.filter(p => p.status === 'Won' && inRange(wonDateOf(p))),
    ...importedSales.filter(p => inRange(saleDateOf(p))),
  ]
  const wonRevenue = won.reduce((s, p) => s + saleValueOf(p), 0)
  const open = latestIterations(proposals).filter(p => OPEN_STATUSES.includes(p.status))
  return {
    won, wonRevenue,
    avgJob: won.length ? wonRevenue / won.length : null,
    clients, wonClients,
    winRate: clients.length ? (wonClients.length / clients.length) * 100 : null,
    open, pipeline: open.reduce((s, p) => s + (Number(p.total) || 0), 0),
  }
}
