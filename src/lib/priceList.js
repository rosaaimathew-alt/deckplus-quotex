// ── Job price list — what the office needs when a job is won ─────────────────
// For every item on the job, the calculator breakdown behind its price: each
// price-list line, quantity, rate and amount, plus the JIC built in. Items
// added from the calculators carry the breakdown saved at the moment they were
// added (`line.breakdown`); older items are recalculated from their saved
// calculator settings (`line.builder`). Plain catalog items list as themselves.
import { jicAmount } from './jic'
import { deckPriceRows } from './deckRows'
import { computePorchBuild, PORCH_BUILD_DEFAULTS, PORCH_BUILD_GROUPS } from '../porchBuild'
import { computeHardscape, HS_GROUPS } from '../hardscape'
import { computeUnderDeck } from '../underDeck'
import { contractTotalOf } from '../contractTotal'

const n = (v) => Number(v) || 0
const r2 = (v) => Math.round(n(v) * 100) / 100

export const TOOL_LABELS = {
  deck: 'Deck Builder', porchbuild: 'Porch Builder', hardscape: 'Hardscape Builder',
  underdeck: 'Under-deck Builder', porch: 'Porch Conversion',
}

// Calculator rows → { items, subtotal, jic, total }. Works for every tool's row
// shape (deck rows use line/lineCost/calc; the others total/costTotal/note).
export function toBreakdown(rows = [], { jic, groups } = {}) {
  const groupLabel = (g) => (groups || []).find(x => x.key === g)?.label || ''
  const items = rows
    .map(r => {
      const qty = n(r.qty), rate = n(r.rate)
      const amount = r.line != null ? n(r.line) : r.total != null ? n(r.total) : qty * rate
      return { label: r.label || r.item || '', qty: r2(qty), unit: r.unit || '', rate: r2(rate), amount: r2(amount),
               cost: r2(r.lineCost ?? r.costTotal ?? 0), note: r.calc || r.note || '', group: groupLabel(r.group) }
    })
    .filter(it => it.qty !== 0 || it.amount !== 0)
  const subtotal = r2(items.reduce((s, it) => s + it.amount, 0))
  const jicAmt = r2(jicAmount(jic, subtotal))
  return { items, subtotal, jic: jicAmt, total: r2(subtotal + jicAmt) }
}

// The breakdown behind one quote line, or null if it wasn't priced in a tool.
// ctx = { catalog, porchRates, deckCustomComponents }
export function lineBreakdown(line, ctx = {}) {
  if (line?.breakdown?.items) return { ...line.breakdown, source: 'saved' }
  const tool = line?.builder?.tool, st = line?.builder?.state || {}
  const catalog = ctx.catalog || []
  try {
    if (tool === 'deck') return { ...toBreakdown(deckPriceRows(st, catalog, ctx.deckCustomComponents || []), { jic: st.jic }), source: 'recalculated' }
    if (tool === 'porchbuild') {
      const rates = Object.fromEntries(Object.keys(PORCH_BUILD_DEFAULTS).map(k => [k, { ...PORCH_BUILD_DEFAULTS[k], ...(ctx.porchRates?.[k] || {}) }]))
      return { ...toBreakdown(computePorchBuild(st.inp, rates).lines, { jic: st.jic, groups: PORCH_BUILD_GROUPS }), source: 'recalculated' }
    }
    if (tool === 'hardscape') return { ...toBreakdown(computeHardscape(st.inp, catalog).lines, { jic: st.jic, groups: HS_GROUPS }), source: 'recalculated' }
    if (tool === 'underdeck') return { ...toBreakdown(computeUnderDeck(st.inp, catalog).lines, { jic: st.jic }), source: 'recalculated' }
  } catch { /* fall through: list the line as itself */ }
  return null
}

// The whole job: one section per quote line, then the discount and totals.
export function jobPriceList(proposal, ctx = {}) {
  const lines = (proposal?.lines || []).filter(Boolean)
  const sections = []
  let discount = null
  for (const l of lines) {
    const sold = r2(n(l.qty || 1) * n(l.unitPrice))
    if (l.isDiscount) { discount = { label: l.name || 'Discount', amount: -sold }; continue }
    const base = { name: l.name || 'Item', sold, tool: l.builder?.tool || null, hidden: !!l.hidden, mergedInto: l.mergeInto ?? null }
    // Permits & fees: each fee as a row.
    if (l.autoFee && Array.isArray(l.feeParts) && l.feeParts.length) {
      const items = l.feeParts.map(p => ({ label: p.name, qty: 1, unit: 'LS', rate: r2(p.unitPrice), amount: r2(p.unitPrice), cost: 0, note: '', group: '' }))
      sections.push({ ...base, breakdown: { items, subtotal: sold, jic: 0, total: sold, source: 'saved' } })
      continue
    }
    const bd = lineBreakdown(l, ctx)
    if (bd) {
      // Recalculated with today's rates and it no longer matches what was sold?
      const drift = bd.source === 'recalculated' && Math.abs(bd.total - sold) > 1 ? r2(bd.total - sold) : 0
      sections.push({ ...base, breakdown: bd, drift })
    } else {
      sections.push({ ...base, breakdown: { items: [{ label: l.name || 'Item', qty: r2(l.qty || 1), unit: l.unit || 'EA', rate: r2(l.unitPrice), amount: sold, cost: 0, note: '', group: '' }],
        subtotal: sold, jic: 0, total: sold, source: 'item' } })
    }
  }
  const itemsTotal = r2(sections.reduce((s, x) => s + x.sold, 0))
  const changeOrders = (proposal?.jobData?.changeOrders || []).filter(co => co.status === 'Approved')
    .map(co => ({ label: [co.coNumber, co.description].filter(Boolean).join(' — ') || 'Change order', amount: r2(co.amount) }))
  const contract = r2(contractTotalOf(proposal))
  return {
    client: proposal?.client || '', address: proposal?.address || '', contractNum: proposal?.contractDraft?.contractNum || '',
    sections, discount, itemsTotal, contract, changeOrders,
    grandTotal: r2(contract + changeOrders.reduce((s, c) => s + c.amount, 0)),
    jicTotal: r2(sections.reduce((s, x) => s + n(x.breakdown?.jic), 0)),
  }
}

// Flat rows for the spreadsheet download (one row per price-list line).
export function priceListRows(pl) {
  const out = []
  for (const s of pl.sections) {
    out.push({ Item: s.name.toUpperCase(), Qty: '', Unit: '', Rate: '', Amount: s.sold, Note: s.tool ? TOOL_LABELS[s.tool] || '' : '' })
    for (const it of s.breakdown.items) out.push({ Item: `   ${it.label}`, Qty: it.qty, Unit: it.unit, Rate: it.rate, Amount: it.amount, Note: [it.group, it.note].filter(Boolean).join(' · ') })
    if (s.breakdown.jic) out.push({ Item: '   JIC (built into price)', Qty: '', Unit: '', Rate: '', Amount: s.breakdown.jic, Note: '' })
    out.push({ Item: '', Qty: '', Unit: '', Rate: '', Amount: '', Note: '' })
  }
  if (pl.discount) out.push({ Item: pl.discount.label, Qty: '', Unit: '', Rate: '', Amount: -pl.discount.amount, Note: 'Discount' })
  out.push({ Item: 'CONTRACT TOTAL', Qty: '', Unit: '', Rate: '', Amount: pl.contract, Note: '' })
  if (pl.jicTotal > 0) out.push({ Item: 'TOTAL JIC BUILT INTO THIS JOB', Qty: '', Unit: '', Rate: '', Amount: pl.jicTotal, Note: 'Included in the contract total' })
  for (const co of pl.changeOrders) out.push({ Item: co.label, Qty: '', Unit: '', Rate: '', Amount: co.amount, Note: 'Signed change order' })
  if (pl.changeOrders.length) out.push({ Item: 'TOTAL WITH CHANGE ORDERS', Qty: '', Unit: '', Rate: '', Amount: pl.grandTotal, Note: '' })
  return out
}
