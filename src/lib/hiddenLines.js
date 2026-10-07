// ── Lines hidden from the customer ───────────────────────────────────────────
// On a lump-sum ("summed") proposal the rep can hide a line: it still counts
// in the total, but the customer never sees its name, scope or price. Hiding
// only applies to summed proposals — itemized and à la carte proposals show
// every line, since each one carries its own price there.

export const isSummed = (data = {}) => data.showBreakdown === false && !data.isAlaCarte

// The lines the customer may see (all of them unless the proposal is summed).
export function customerLines(lines = [], data = {}) {
  return isSummed(data) ? (lines || []).filter(l => !l?.hidden) : (lines || [])
}
