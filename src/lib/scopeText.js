// ── Scope text from the catalog ──────────────────────────────────────────────
// The catalog descriptions are Deck Plus's own scope-of-work wording. Every
// builder tool writes its scope from those same descriptions, filling in the
// blanks it knows (size, count, square feet) and leaving the rest (colors,
// styles) as blanks for the rep, exactly like adding the catalog item by hand.

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()

export function catalogDesc(catalog, name) {
  if (!name) return ''
  const hit = (catalog || []).find(c => norm(c.name) === norm(name))
  return (hit?.description || '').trim()
}

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty']
// 5 → "05 (five)" — the count style the scopes use
export function countWords(n) {
  const v = Math.round(Number(n) || 0)
  return v <= 20 ? `${String(v).padStart(2, '0')} (${WORDS[v]})` : String(v)
}

const ft = (v) => `${Math.round((Number(v) || 0) * 100) / 100}’`

// Fill the blanks a tool knows. Anything it doesn't know stays a blank.
//   size: [w, d] ft · count · sqft · lf (linear feet) · width (step width ft)
export function fillScope(text, { size, count, sqft, lf, width } = {}) {
  let t = String(text || '')
  if (size && Number(size[0]) > 0 && Number(size[1]) > 0) t = t.replace(/__’x__’/g, `${ft(size[0])}x${ft(size[1])}`)
  if (sqft != null && Number(sqft) > 0) t = t.replace(/_{3} ?(square feet|sqft)/g, (_, u) => `${Math.round(Number(sqft))} ${u}`)
  if (lf != null && Number(lf) > 0) t = t.replace(/__’ long/g, `${ft(lf)} long`)
  if (count != null && Number(count) > 0) {
    t = t.replace(/__ \(__\)/g, countWords(count)).replace(/__ \(one\)/g, countWords(count))
         .replace(/Install __ /g, `Install ${countWords(count)} `)
  }
  if (width && Number(width) > 0) t = t.replace(/4’ wide/g, `${ft(width)} wide`)
  return t
}

// Catalog description, filled; falls back to `fallback` when the item has none.
export function scopeFor(catalog, name, fill, fallback = '') {
  const d = catalogDesc(catalog, name)
  return d ? fillScope(d, fill) : fallback
}
