import { customerLines, discountOf } from './lib/hiddenLines'
import { priceRangeOf, depositPctOf } from './lib/priceRange'
import { customerUpgrades } from './lib/upgrades'
// The single source of truth for the display-only snapshot sent to the public
// proposal page (/p/:token). Used by every "get link" / send path so the shared
// link always renders the proposal exactly the way the app does — including
// descriptions and à-la-carte vs. summed pricing. No costs/margins are included.
export function buildProposalSnapshot(data = {}, branding = {}) {
  const all = (data.lines || []).filter(l => (l.name || '').trim() || Number(l.unitPrice) > 0)
  // Hidden lines count in the total but never reach the customer's copy.
  const subtotal = all.reduce((s, l) => s + (Number(l.qty) || 1) * (Number(l.unitPrice) || 0), 0)
  // Price range: the customer's copy carries the range only — no line prices,
  // discount or total, so the exact price can't be read from the page either.
  const range = data.isAlaCarte ? null : priceRangeOf(Number(data.total) || subtotal, data.priceRange)
  const lines = customerLines(all, data)
    .map(l => ({
      name:        l.name || '',
      description: l.description || '',
      qty:         Number(l.qty) || 1,
      ...(range ? {} : { unitPrice: Number(l.unitPrice) || 0 }),
    }))
  return {
    client:         data.client || '',
    email:          data.email || '',
    phone:          data.phone || '',
    address:        data.address || '',
    // Estimate date = when the proposal was sent, else created, else today.
    estimateDate:   data.sentAt || data.createdAt || new Date().toISOString(),
    expiration:     data.expiration || '',
    // À la carte: options priced individually, customer selects, NO grand total.
    isAlaCarte:     !!data.isAlaCarte,
    // Matches ProposalView's default (true when unset): itemized price breakdown.
    showBreakdown:  range ? false : data.showBreakdown !== false,
    lines,
    ...(range ? { priceRange: range } : {
      subtotal,
      // { label, amount } — shown under the items as Project Total → Discount → Total
      discount:     data.isAlaCarte ? null : discountOf(all),
      total:        Number(data.total) || subtotal,
    }),
    depositPct:     depositPctOf(Number(data.total) || subtotal),
    // Optional upgrades: priced under the total, not part of it.
    upgrades:       data.isAlaCarte ? [] : customerUpgrades(data.upgrades),
    projectSummary: data.projectSummary || data.contractDraft?.projectSummary || '',
    contractNum:    data.contractDraft?.contractNum || '',
    companyName:    branding?.companyName || '',
    logo:           branding?.logo || null,
    primaryColor:   branding?.primaryColor || null,
  }
}
