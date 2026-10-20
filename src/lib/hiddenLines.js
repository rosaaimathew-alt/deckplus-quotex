// ── What the customer sees of a quote's lines ────────────────────────────────
// Two internal-only tools, decided here for every customer-facing output
// (proposal preview/PDF, shared link, email, copied text):
//
// • Merge: a line merged into another (line.mergeInto = that line's id) is
//   folded into it — the customer sees one line whose price includes both.
//   Works on itemized, lump-sum and à la carte proposals.
// • Hide: on a lump-sum ("summed") proposal a line can be hidden — it still
//   counts in the total but its name/scope never appear. Itemized and à la
//   carte proposals show every line, since each carries its own price there.
//
// The builder and the tracker keep every line as entered; the contract folds
// merged lines (mergeLines) but keeps hidden ones listed.

export const isSummed = (data = {}) => data.showBreakdown === false && !data.isAlaCarte

const lineTotal = (l) => (Number(l.qty) || 0) * (Number(l.unitPrice) || 0)

// Follow mergeInto to the line that is actually shown (guards against loops
// and merges into lines that no longer exist).
function mergeTarget(line, byId) {
  let cur = line
  const seen = new Set()
  while (cur?.mergeInto != null && byId.has(String(cur.mergeInto)) && !seen.has(String(cur.id))) {
    seen.add(String(cur.id))
    cur = byId.get(String(cur.mergeInto))
  }
  return cur && cur !== line ? cur : null
}

// Fold merged lines into the line they were merged into (no hiding). Used by
// the contract too, so a merged item never shows there on its own.
export function mergeLines(lines = []) {
  const all = (lines || []).filter(Boolean)
  const byId = new Map(all.map(l => [String(l.id), l]))
  const extra = new Map()      // shown line id → merged-in amount
  const kept = []
  for (const l of all) {
    const target = mergeTarget(l, byId)
    if (target) extra.set(String(target.id), (extra.get(String(target.id)) || 0) + lineTotal(l))
    else kept.push(l)
  }
  const merged = kept.map(l => {
    const add = extra.get(String(l.id))
    return add ? { ...l, qty: 1, unitPrice: lineTotal(l) + add } : l
  })
  return merged
}

// The discount is shown under the items (Project Total → Discount → Total),
// never as an item of its own.
export function customerLines(lines = [], data = {}) {
  const merged = mergeLines(lines).filter(l => !isDiscountLine(l))
  return isSummed(data) ? merged.filter(l => !l.hidden) : merged
}

// ── Discount ─────────────────────────────────────────────────────────────────
// A discount is one quote line ({ isDiscount: true }) with a negative price, so
// every total (proposal, shared link, email, contract, payments, tracker)
// already includes it.
export const isDiscountLine = (l) => !!l?.isDiscount
// { label, amount } (amount positive, e.g. 1500 for $1,500 off) or null.
export function discountOf(lines = []) {
  const d = (lines || []).filter(isDiscountLine)
  if (!d.length) return null
  return { label: d[0].name || 'Discount', amount: -d.reduce((s, l) => s + lineTotal(l), 0) }
}
