// ── JIC ("Just in case") ─────────────────────────────────────────────────────
// A cushion at the bottom of every builder tool. The rep enters a dollar
// amount or a percent of the tool's total, and it is built into the price of
// the tool's quote line — the customer never sees it as its own item. (The
// input lives in components/Jic.jsx.)

export const JIC_DEFAULT = { mode: '$', amount: '' }

export function jicAmount(jic, base) {
  const a = Number(jic?.amount) || 0
  if (a <= 0) return 0
  return Math.round(jic?.mode === '%' ? (Number(base) || 0) * a / 100 : a)
}
