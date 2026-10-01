// ── JIC ("Just in case") ─────────────────────────────────────────────────────
// A cushion at the bottom of every builder tool. The rep enters a dollar
// amount or a percent of the tool's total, and it goes on the quote as its own
// "JIC" line under the tool's lines. (The input lives in components/Jic.jsx.)

export const JIC_DEFAULT = { mode: '$', amount: '' }

export function jicAmount(jic, base) {
  const a = Number(jic?.amount) || 0
  if (a <= 0) return 0
  return Math.round(jic?.mode === '%' ? (Number(base) || 0) * a / 100 : a)
}

// The quote line for a JIC amount (null when there's nothing to add)
export function jicLine(jic, base, { section = '', category = 'General', label = '' } = {}) {
  const amt = jicAmount(jic, base)
  if (!amt) return null
  return {
    id: Date.now() + Math.random(),
    catalogId: null,
    name: `JIC — Just in case${label ? ` (${label})` : ''}`,
    section,
    description: '',
    unit: 'LS',
    qty: 1,
    unitPrice: amt,
    category,
    costMaterials: 0,
    costSub: 0,
    jic: true,
  }
}
