// ── Scope of Work learning ───────────────────────────────────────────────────
// Every scope line remembers which quote item it belongs to (`item`). The
// scope a contract STARTED with (from the proposal, AI, past contracts or a
// template) is kept as its `scopeDraft`; when the contract is saved, each
// item's final lines are compared with its starting lines, so the library
// learns what the rep took out and what they put in — not just the result.
//
// Learned edits come back two ways:
//  • a new contract's starting scope drops lines reps keep removing for that
//    item and adds lines they keep adding (applyLearned), and
//  • AI Suggest is told the same (learnedHints).

const n = (v) => Number(v) || 0

// "-- Install 4x4 posts." → "install 4x4 posts" (for comparing lines).
export const normUnit = (s) => String(s || '').replace(/^\s*(--|[-•*●]|\d+[.)])\s*/, '').toLowerCase().replace(/[“”"]/g, '"').replace(/\s+/g, ' ').replace(/[.;,:\s]+$/, '').trim()

// One key per kind of item, the same across contracts: its catalog item, or
// its name without sizes and counts ("Trex Enhance deck 16x14" → "trex enhance deck").
const UNIT_WORDS = new Set(['x', 'sf', 'lf', 'ft', 'in', 'sq', 'ea', 'qty'])
export const nameKey = (name) => String(name || '').toLowerCase()
  .replace(/\S*\d\S*/g, ' ').replace(/[^a-z ]+/g, ' ')
  .split(' ').filter(w => w && !UNIT_WORDS.has(w)).join(' ')
export const itemKeyOf = (line) => (line?.catalogId ? `cat:${line.catalogId}` : `name:${nameKey(line?.name)}`)

// A quote line → its scope lines: the first carries the item's name and price,
// the rest of its description follows one line each.
export function scopeLinesFor(l, i) {
  const id = l.id ?? i
  const text = l.description ? `${l.name} — ${l.description}` : (l.name || '')
  const item = itemKeyOf(l)
  const rows = text.split('\n')
  return rows.map((t, k) => k === 0
    ? { id, name: l.name, price: linePrice(l), text: t, item, head: true, ...(l.isDiscount ? { isDiscount: true } : {}) }
    : { id: `${id}~${k}`, name: '', price: 0, text: t, item })
}
export const linePrice = (l) => {
  const byUnit = (n(l.qty) || 1) * n(l.unitPrice)
  if (byUnit) return byUnit
  return n(l.price) || n(l.amount) || n(l.total) || 0
}

// Older drafts kept a whole description in one scope line and no item keys:
// split them one line each and give every line the item of the head above it.
export function normalizeScope(lines = [], quoteLines = []) {
  const keyByName = new Map((quoteLines || []).map(l => [String(l.name || '').trim().toLowerCase(), itemKeyOf(l)]))
  const keyById = new Map((quoteLines || []).map((l, i) => [String(l.id ?? i), itemKeyOf(l)]))
  const out = []
  let item = null
  for (const l of lines || []) {
    if (l.isDiscount) { out.push(l); continue }
    if (l.item) item = l.item
    else if ((l.name || '').trim() || n(l.price)) item = keyById.get(String(l.id)) || keyByName.get(String(l.name || '').trim().toLowerCase()) || `name:${nameKey(l.name)}`
    const rows = String(l.text ?? '').split('\n')
    rows.forEach((t, k) => out.push(k === 0
      ? { ...l, text: t, item: l.item || item, ...(l.item ? {} : (l.name || '').trim() || n(l.price) ? { head: true } : {}) }
      : { id: `${l.id}~${k}`, name: '', price: 0, text: t, item }))
  }
  return out
}

// The text box was edited: line up the old lines with the new text so every
// line keeps its own item, name and price. A deleted line that carried an
// item's price stays (with no text) so the price never silently leaves the
// contract total; new lines belong to the item above them.
export function remapEdit(cur = [], newTexts = []) {
  const kept = cur.filter(l => !l.textless)
  const textless = cur.filter(l => l.textless)
  const a = kept.map(l => l.text), b = newTexts
  // Longest common subsequence of the old and new lines.
  const m = a.length, k = b.length
  const dp = Array.from({ length: m + 1 }, () => new Int32Array(k + 1))
  for (let i = m - 1; i >= 0; i--) for (let j = k - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const out = []
  let i = 0, j = 0, seq = 0
  const fresh = () => `${Date.now()}-${seq++}`
  const lastItem = () => { for (let x = out.length - 1; x >= 0; x--) if (out[x].item) return out[x].item; return kept[0]?.item || null }
  const flush = (olds, news) => {
    const pairs = Math.min(olds.length, news.length)
    for (let p = 0; p < pairs; p++) out.push({ ...olds[p], text: news[p] })
    for (let p = pairs; p < news.length; p++) out.push({ id: fresh(), name: '', price: 0, text: news[p], item: lastItem() })
    for (let p = pairs; p < olds.length; p++) {
      const o = olds[p]
      if ((o.name || '').trim() || n(o.price)) out.push({ ...o, text: '', textless: true })
    }
  }
  let olds = [], news = []
  while (i < m || j < k) {
    if (i < m && j < k && a[i] === b[j]) { flush(olds, news); olds = []; news = []; out.push(kept[i]); i++; j++ }
    else if (j < k && (i >= m || dp[i][j + 1] >= dp[i + 1][j])) { news.push(b[j]); j++ }
    else { olds.push(kept[i]); i++ }
  }
  flush(olds, news)
  return [...out, ...textless]
}

// The scope as it stands, for comparing later: [{ item, text }].
export const draftOf = (lines = []) => lines.filter(l => !l.isDiscount && !l.textless && String(l.text || '').trim()).map(l => ({ item: l.item || null, text: l.text }))

// What changed per item between the starting scope and the saved one.
export function scopeEdits(draft = [], lines = [], source = 'proposal') {
  const final = draftOf(lines)
  const items = new Map()
  const slot = (item) => { if (!items.has(item)) items.set(item, { item, draft: [], final: [] }); return items.get(item) }
  for (const d of draft) if (d.item) slot(d.item).draft.push(d.text)
  for (const f of final) if (f.item) slot(f.item).final.push(f.text)
  const nameOf = new Map(lines.filter(l => l.head && l.item).map(l => [l.item, l.name]))
  return [...items.values()].map(({ item, draft: dr, final: fi }) => {
    const dn = new Set(dr.map(normUnit)), fn = new Set(fi.map(normUnit))
    return {
      itemKey: item,
      itemName: nameOf.get(item) || item.replace(/^(cat|name):/, ''),
      bulletText: fi.join('\n'),
      draftText: dr.join('\n'),
      draftSource: source,
      removed: dr.filter(t => normUnit(t) && !fn.has(normUnit(t))),
      added: fi.filter(t => normUnit(t) && !dn.has(normUnit(t))),
    }
  })
}

// Edits reps make to an item again and again: removed in at least 2 past
// contracts and in most of the contracts that started with that line; added in
// at least 2 and in at least half of that item's contracts.
export function learnedFor(examples = [], itemKey) {
  const exs = (examples || []).filter(e => e.itemKey === itemKey && e.draftSource === 'proposal')
  const removed = new Map(), present = new Map(), added = new Map()
  for (const e of exs) {
    for (const t of String(e.draftText || '').split('\n')) { const u = normUnit(t); if (u) present.set(u, (present.get(u) || 0) + 1) }
    for (const t of e.removed || []) { const u = normUnit(t); if (u) removed.set(u, (removed.get(u) || 0) + 1) }
    for (const t of e.added || []) { const u = normUnit(t); if (!u) continue; const cur = added.get(u); added.set(u, { text: cur?.text || t, count: (cur?.count || 0) + 1 }) }
  }
  const remove = [...removed].filter(([u, c]) => c >= 2 && c / Math.max(present.get(u) || c, 1) >= 0.6).map(([u]) => u)
  const add = [...added.values()].filter(a => a.count >= 2 && a.count / Math.max(exs.length, 1) >= 0.5).map(a => a.text)
  return { remove, add, contracts: exs.length }
}

// A new contract's starting scope with the learned edits made.
// Returns { lines, applied: [{ itemName, removed: [...], added: [...] }] }.
export function applyLearned(lines = [], examples = []) {
  const applied = []
  const record = (item) => {
    let r = applied.find(a => a.item === item)
    if (!r) { r = { item, itemName: lines.find(x => x.item === item && x.head)?.name || '', removed: [], added: [] }; applied.push(r) }
    return r
  }
  const items = [...new Set(lines.filter(l => l.item && !l.isDiscount).map(l => l.item))]
  const learned = new Map(items.map(k => [k, learnedFor(examples, k)]))
  // Lines reps keep taking out (never an item's first line — it carries the price).
  const kept = lines.filter(l => {
    const lr = l.item && learned.get(l.item)
    if (lr && !l.head && lr.remove.includes(normUnit(l.text))) { record(l.item).removed.push(l.text); return false }
    return true
  })
  // Lines reps keep putting in, after the item's last line.
  const out = []
  kept.forEach((l, idx) => {
    out.push(l)
    const lr = l.item && learned.get(l.item)
    if (!lr?.add.length || kept.slice(idx + 1).some(x => x.item === l.item)) return
    const have = new Set(kept.filter(x => x.item === l.item).map(x => normUnit(x.text)))
    lr.add.filter(t => !have.has(normUnit(t))).forEach((t, k) => {
      out.push({ id: `${l.id}+${k}`, name: '', price: 0, text: t, item: l.item })
      record(l.item).added.push(t)
    })
  })
  return { lines: out, applied }
}

// For AI Suggest: what reps change on these items, in words.
export function learnedHints(examples = [], itemKeys = []) {
  const out = []
  for (const key of new Set(itemKeys)) {
    const exs = (examples || []).filter(e => e.itemKey === key)
    if (!exs.length) continue
    const count = (list) => { const m = new Map(); list.flat().forEach(t => { const u = normUnit(t); if (u) m.set(u, { text: m.get(u)?.text || t, c: (m.get(u)?.c || 0) + 1 }) }); return [...m.values()].filter(x => x.c >= 2).sort((a, b) => b.c - a.c).slice(0, 5) }
    const rem = count(exs.map(e => e.removed || [])), add = count(exs.map(e => e.added || []))
    if (!rem.length && !add.length) continue
    out.push(`[${exs[exs.length - 1].itemName}] — over ${exs.length} past contracts, reps` +
      (rem.length ? ` usually REMOVE: ${rem.map(r => `"${r.text.trim()}"`).join('; ')}` : '') +
      (rem.length && add.length ? ' and' : '') +
      (add.length ? ` usually ADD: ${add.map(a => `"${a.text.trim()}"`).join('; ')}` : ''))
  }
  return out
}
