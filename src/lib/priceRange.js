// ── Price range shown to the customer instead of the exact price ─────────────
// A proposal can show the customer a range ($38,000 – $46,000) while the app
// keeps the exact price and its cost. `pr` is the proposal's setting:
// null = off; { low, high } = on, where a blank low / high is worked out from
// the exact price (10% under / over, to the nearest $1,000 outside it).
export const RANGE_PCT = 10
export const RANGE_STEP = 1000

export function priceRangeOf(total, pr) {
  if (!pr) return null
  const t = Number(total) || 0
  const typed = (v) => v != null && v !== '' && Number.isFinite(Number(v))
  const low  = typed(pr.low)  ? Number(pr.low)  : Math.floor((t * (1 - RANGE_PCT / 100)) / RANGE_STEP) * RANGE_STEP
  const high = typed(pr.high) ? Number(pr.high) : Math.ceil((t * (1 + RANGE_PCT / 100)) / RANGE_STEP) * RANGE_STEP
  return { low: Math.max(0, low), high: Math.max(0, high) }
}

const usd = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('en-US')
export const rangeText = (r) => (r ? `${usd(r.low)} – ${usd(r.high)}` : '')

// The deposit wording follows the exact price (10% for $30k–$100k jobs, else 20%).
export const depositPctOf = (total) => (total >= 30000 && total <= 100000 ? 10 : 20)
