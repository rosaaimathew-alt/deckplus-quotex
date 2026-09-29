// Single source of truth for a proposal's *contract* total.
//
// For an à la carte proposal the signed contract covers only the items the
// client selected, so the real contract value is the sum of the saved
// contract-draft scope-line prices — NOT proposal.total (which is the sum of
// every proposal line, including ones the client declined).
//
// Every money view that talks about the CONTRACT (Contracts list, Jobs budget,
// change-order running total, payment reminders) must use this so they agree
// with the signed document. Falls back to proposal.total before a contract
// draft exists.
export function contractTotalOf(proposal) {
  const sl = proposal?.contractDraft?.scopeLines
  if (Array.isArray(sl) && sl.length) {
    const sum = sl.reduce((s, l) => s + (Number(l.price) || 0), 0)
    if (sum > 0) return sum
  }
  return Number(proposal?.total || 0)
}

// Sum of every SIGNED change order (addendum) on a job. When a customer signs a
// CO it's marked 'Approved' with a signedAt; its amount may be negative (a
// deduction) and nets in accordingly.
export function approvedChangeOrderTotal(proposal) {
  const cos = proposal?.jobData?.changeOrders || []
  return cos
    .filter((co) => co.status === 'Approved')
    .reduce((s, co) => s + (Number(co.amount) || 0), 0)
}

// THE won-revenue number for a deal: the sold contract value PLUS every signed
// change order. This is what "Won Revenue" must show everywhere — the same
// figure on the Dashboard, Proposal Tracker, Analytics, and per-client views —
// so a signed addendum raises revenue in place instead of hiding in a separate
// bucket.
export function wonRevenueOf(proposal) {
  return contractTotalOf(proposal) + approvedChangeOrderTotal(proposal)
}
