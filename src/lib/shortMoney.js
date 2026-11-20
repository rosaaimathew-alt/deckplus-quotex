// ── Short money for charts and tight spots ──────────────────────────────────
// Under $1,000 in full ($840); thousands as k ($315k, or $12.5k with
// kDecimals: 1); $1,000,000 and up as M with up to two decimals: $1M, $1.01M.
export function shortMoney(n, { kDecimals = 0 } = {}) {
  const v = Number(n) || 0, sign = v < 0 ? '-' : '', a = Math.abs(v)
  const k = Number((a / 1_000).toFixed(kDecimals))
  if (a >= 999_500 || k >= 1_000) return `${sign}$${Number((a / 1_000_000).toFixed(2))}M`
  if (a >= 1_000) return `${sign}$${k}k`
  return `${sign}$${Math.round(a).toLocaleString('en-US')}`
}
